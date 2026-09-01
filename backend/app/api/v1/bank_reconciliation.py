"""Bank reconciliation endpoints — upload, matching, and management."""
import uuid
from datetime import datetime, timedelta

from typing import Optional

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.api.deps import get_current_company_id, get_current_user, require_write
from app.models.models import BankStatement, BankStatementEntry, Transaction, User
from app.services.bank_parser import parse_csv, parse_ofx, detect_bank_name
from app.services import reconciliation as recon

router = APIRouter()


def _auto_match_entries(entries: list, company_id: str, db: Session) -> int:
    """Propose a counterpart for each imported bank line.

    Proposals only. A line becomes ``matched`` when a payment is actually
    linked to it (see app/services/reconciliation.py) — marking it matched here
    would claim money was accounted for when nothing had been settled.
    """
    from app.models.models import BankStatementEntry as Entry

    suggested = 0
    for entry in entries:
        db_entry = db.query(Entry).filter(Entry.id == entry.id).first()
        if not db_entry or db_entry.status == "matched":
            continue

        proposals = recon.suggestions(db, company_id, db_entry, limit=1)
        if proposals:
            best = proposals[0]
            db_entry.matched_transaction_id = best["transaction_id"]
            db_entry.match_confidence = best["score"]
            db_entry.status = "suggested"
            suggested += 1

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

    # Propose counterparts. Nothing is reconciled until a payment is linked.
    suggested_count = _auto_match_entries(parsed_entries, company_id, db)
    statement.matched_entries = 0
    statement.status = "completed"
    db.commit()

    return {
        "statement_id": statement_id,
        "bank_name": bank_name,
        "file_name": file_name,
        "total_entries": len(parsed_entries),
        "suggested_entries": suggested_count,
        "matched_entries": 0,
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
    current_user: User = Depends(get_current_user),
    _writer: User = Depends(require_write),
):
    """Confirm a match (kept for older clients).

    Delegates to the reconciliation service, so this path settles the payment
    like every other one instead of only labelling the line.
    """
    entry = recon.scoped_entry(db, company_id, entry_id)
    if entry.statement_id != statement_id:
        raise HTTPException(status_code=404, detail="Entrada não encontrada.")
    return recon.match(db, company_id, current_user, entry_id, transaction_id=transaction_id)


# ---------------------------------------------------------------------------
# Reconciliation — see app/services/reconciliation.py for the rules.
#
# Matching a bank line settles the obligation behind it through the settlement
# layer: it reuses an existing payment of the right amount, or creates the
# payment the bank line describes. The transaction's paid / outstanding /
# payment_status are re-derived, never written here.
# ---------------------------------------------------------------------------

class MatchRequest(BaseModel):
    transaction_id: Optional[str] = None
    payment_id: Optional[str] = None


@router.get("/entries")
def list_entries(
    status: str = Query("all", description="all | unmatched | suggested | matched | ignored"),
    statement_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """Every bank line, with the payment and transaction behind it when matched."""
    return recon.list_entries(db, company_id, status, statement_id)


@router.get("/reconciliation/overview")
def reconciliation_overview(
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    return recon.overview(db, company_id)


@router.get("/entries/{entry_id}/suggestions")
def entry_suggestions(
    entry_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
):
    """Transactions this line could be settling, with why each was proposed."""
    entry = recon.scoped_entry(db, company_id, entry_id)
    return recon.suggestions(db, company_id, entry)


@router.post("/entries/{entry_id}/match")
def match_entry(
    entry_id: str,
    body: MatchRequest,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    current_user: User = Depends(get_current_user),
    _writer: User = Depends(require_write),
):
    return recon.match(db, company_id, current_user, entry_id, body.transaction_id, body.payment_id)


@router.post("/entries/{entry_id}/unmatch")
def unmatch_entry(
    entry_id: str,
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    """Undo a reconciliation — a payment created from the bank line is removed."""
    return recon.unmatch(db, company_id, entry_id)


@router.post("/entries/{entry_id}/ignore")
def ignore_entry(
    entry_id: str,
    ignored: bool = Query(True),
    db: Session = Depends(get_db),
    company_id: str = Depends(get_current_company_id),
    _writer: User = Depends(require_write),
):
    """Park a line with no counterpart in the books (fees, internal transfers)."""
    return recon.ignore(db, company_id, entry_id, ignored)
