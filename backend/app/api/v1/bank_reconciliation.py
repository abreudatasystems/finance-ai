"""Bank reconciliation endpoints — upload, matching, and management."""
import uuid
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import get_current_company_id, require_write
from app.models.models import BankStatement, BankStatementEntry, Transaction, User
from app.services.bank_parser import parse_csv, parse_ofx, detect_bank_name

router = APIRouter()


def _fuzzy_match(a: str, b: str) -> float:
    """Simple word-overlap similarity between two strings (0-100)."""
    wa = set(a.lower().split())
    wb = set(b.lower().split())
    if not wa or not wb:
        return 0
    overlap = wa & wb
    return round(len(overlap) / max(len(wa), len(wb)) * 100)


def _auto_match_entries(entries: list, company_id: str, db: Session) -> int:
    """Try to match each bank entry against existing transactions."""
    matched = 0
    for entry in entries:
        # Search transactions with same amount (±0.01) and date ±3 days
        candidates = (
            db.query(Transaction)
            .filter(
                Transaction.company_id == company_id,
                Transaction.amount.between(entry.amount - 0.01, entry.amount + 0.01),
                Transaction.status.notin_(["cancelled"]),
            )
            .all()
        )

        best_match = None
        best_score = 0

        for trx in candidates:
            # Date proximity bonus
            try:
                trx_date = datetime.strptime(trx.date[:10], "%Y-%m-%d").date()
                entry_date = datetime.strptime(entry.date[:10], "%Y-%m-%d").date()
                day_diff = abs((trx_date - entry_date).days)
            except (ValueError, TypeError):
                day_diff = 999

            if day_diff > 5:
                continue

            # Description similarity
            desc_score = _fuzzy_match(entry.description, trx.description)
            entity_score = _fuzzy_match(entry.description, trx.entity_name)

            score = max(desc_score, entity_score)
            # Date proximity bonus
            if day_diff == 0:
                score += 30
            elif day_diff <= 2:
                score += 15
            elif day_diff <= 5:
                score += 5

            if score > best_score:
                best_score = score
                best_match = trx

        db_entry = db.query(BankStatementEntry).filter(BankStatementEntry.id == entry.id).first()
        if db_entry and best_match and best_score >= 50:
            db_entry.matched_transaction_id = best_match.id
            db_entry.match_confidence = min(99, best_score)
            db_entry.status = "matched" if best_score >= 75 else "suggested"
            matched += 1

    db.commit()
    return matched


@router.post("/upload")
async def upload_bank_statement(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """Upload a CSV or OFX bank statement and auto-match entries."""
    content = await file.read()
    file_name = file.filename or "extrato.csv"
    lower_name = file_name.lower()

    # Parse
    if lower_name.endswith((".ofx", ".qfx")):
        parsed_entries = parse_ofx(content)
    elif lower_name.endswith((".csv", ".txt", ".tsv")):
        # Try utf-8 first, fallback to latin-1
        parsed_entries = parse_csv(content, "utf-8")
        if not parsed_entries:
            parsed_entries = parse_csv(content, "latin-1")
    else:
        raise HTTPException(status_code=400, detail="Formato não suportado. Use CSV ou OFX.")

    if not parsed_entries:
        raise HTTPException(status_code=400, detail="Não foi possível extrair entradas do ficheiro. Verifique o formato.")

    bank_name = detect_bank_name(file_name, content[:500].decode("latin-1", errors="replace"))

    # Create statement record
    statement_id = f"STMT-{uuid.uuid4().hex[:8].upper()}"
    dates = [e.date for e in parsed_entries if e.date]
    statement = BankStatement(
        id=statement_id,
        company_id=company_id,
        bank_name=bank_name,
        file_name=file_name,
        upload_date=datetime.utcnow(),
        period_start=min(dates) if dates else None,
        period_end=max(dates) if dates else None,
        total_entries=len(parsed_entries),
        matched_entries=0,
        status="processing",
    )
    db.add(statement)

    # Create entry records
    db_entries = []
    for pe in parsed_entries:
        entry_id = f"BSE-{uuid.uuid4().hex[:8].upper()}"
        pe.id = entry_id  # attach id for matching
        db_entry = BankStatementEntry(
            id=entry_id,
            statement_id=statement_id,
            company_id=company_id,
            date=pe.date,
            description=pe.description,
            amount=pe.amount,
            type=pe.type,
            balance=pe.balance,
            status="unmatched",
        )
        db.add(db_entry)
        db_entries.append(db_entry)

    db.commit()

    # Auto-match
    matched_count = _auto_match_entries(parsed_entries, company_id, db)
    statement.matched_entries = matched_count
    statement.status = "completed"
    db.commit()

    return {
        "statement_id": statement_id,
        "bank_name": bank_name,
        "file_name": file_name,
        "total_entries": len(parsed_entries),
        "matched_entries": matched_count,
        "status": "completed",
    }


@router.get("/statements")
def list_statements(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    """List all uploaded bank statements."""
    stmts = (
        db.query(BankStatement)
        .filter(BankStatement.company_id == company_id)
        .order_by(BankStatement.upload_date.desc())
        .all()
    )
    return [
        {
            "id": s.id,
            "bank_name": s.bank_name,
            "file_name": s.file_name,
            "upload_date": s.upload_date.isoformat() if s.upload_date else None,
            "period_start": s.period_start,
            "period_end": s.period_end,
            "total_entries": s.total_entries,
            "matched_entries": s.matched_entries,
            "status": s.status,
        }
        for s in stmts
    ]


@router.get("/statements/{statement_id}/entries")
def get_statement_entries(
    statement_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """Get all entries for a specific statement."""
    entries = (
        db.query(BankStatementEntry)
        .filter(
            BankStatementEntry.statement_id == statement_id,
            BankStatementEntry.company_id == company_id,
        )
        .all()
    )

    results = []
    for e in entries:
        matched_trx = None
        if e.matched_transaction_id:
            trx = db.query(Transaction).filter(Transaction.id == e.matched_transaction_id).first()
            if trx:
                matched_trx = {
                    "id": trx.id,
                    "description": trx.description,
                    "entity_name": trx.entity_name,
                    "category_name": trx.category_name,
                    "amount": trx.amount,
                    "date": trx.date,
                }

        results.append({
            "id": e.id,
            "date": e.date,
            "description": e.description,
            "amount": e.amount,
            "type": e.type,
            "balance": e.balance,
            "status": e.status,
            "match_confidence": e.match_confidence,
            "matched_transaction": matched_trx,
        })

    return results


@router.post("/statements/{statement_id}/match")
def confirm_match(
    statement_id: str,
    entry_id: str,
    transaction_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    """Manually confirm a match between a bank entry and a transaction."""
    entry = (
        db.query(BankStatementEntry)
        .filter(
            BankStatementEntry.id == entry_id,
            BankStatementEntry.statement_id == statement_id,
            BankStatementEntry.company_id == company_id,
        )
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Entrada não encontrada.")

    trx = db.query(Transaction).filter(
        Transaction.id == transaction_id,
        Transaction.company_id == company_id,
    ).first()
    if not trx:
        raise HTTPException(status_code=404, detail="Transação não encontrada.")

    was_unmatched = entry.status in ("unmatched", "suggested")
    entry.matched_transaction_id = transaction_id
    entry.match_confidence = 100
    entry.status = "matched"

    # Update statement counter
    if was_unmatched:
        stmt = db.query(BankStatement).filter(BankStatement.id == statement_id).first()
        if stmt:
            stmt.matched_entries = (stmt.matched_entries or 0) + 1

    db.commit()
    return {"status": "ok", "entry_id": entry_id, "transaction_id": transaction_id}
