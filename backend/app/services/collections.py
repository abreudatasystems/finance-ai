"""Cobranças — quem deve, há quanto tempo, e quando é que costuma pagar.

The forecast assumed every customer pays on the due date. No small company
believes that. The information to do better was already in the database: every
`Payment` carries the day the money actually moved, and the `Transaction` it
settles carries the day it was supposed to. The difference between the two,
across a counterparty's history, is that counterparty's real behaviour.

Three things live here:

**Antiguidade (aging).** What is open, split by how long it has been open — a
document 95 days late is a different problem from one due next week, and a
single "a receber" total hides that completely.

**Comportamento por entidade.** The average delay, weighted by amount, over
that entity's settled history: a client who is 40 days late on 30 000 € is not
the same risk as one 40 days late on 200 €. Only fully settled documents
count, because a half-paid invoice has not finished telling its story.

**Data provável.** Due date plus that entity's habitual delay, never earlier
than today. This is what the forecast should use instead of the due date, and
it is deliberately conservative: with no history, the due date stands.

Nothing here is stored. Behaviour recomputed from payments can never drift out
of step with them.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.models.models import Entity, Payment, Transaction

CENTS = Decimal("0.01")

#: The buckets an accountant reads without being taught them.
BUCKETS = [
    ("a_vencer", "A vencer", None, 0),
    ("d1_30", "1-30 dias", 1, 30),
    ("d31_60", "31-60 dias", 31, 60),
    ("d61_90", "61-90 dias", 61, 90),
    ("d90_mais", "Mais de 90 dias", 91, None),
]

#: Documents whose settlement history means something.
OPEN_STATUSES = ("pending", "partially_paid", "overdue")

#: Below this, an average is an anecdote rather than a habit.
MIN_HISTORY = 2

#: A delay beyond this is a dispute, not a payment habit, and letting it steer
#: the forecast would push real money off the horizon entirely.
MAX_LEARNED_DELAY = 120


def _d(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENTS, rounding=ROUND_HALF_UP)


def _days(later: str, earlier: str) -> Optional[int]:
    """Whole days between two ISO dates, or None if either is unusable."""
    try:
        return (date.fromisoformat(later[:10]) - date.fromisoformat(earlier[:10])).days
    except (TypeError, ValueError, IndexError):
        return None


def bucket_of(days_late: int) -> str:
    for key, _label, lower, upper in BUCKETS:
        if lower is None:
            if days_late <= 0:
                return key
            continue
        if days_late >= lower and (upper is None or days_late <= upper):
            return key
    return BUCKETS[-1][0]


# ---------------------------------------------------------------------------
# Behaviour: what the history says about each counterparty
# ---------------------------------------------------------------------------

def payment_behaviour(db: Session, company_id: str,
                      kind: str = "income") -> dict[str, dict]:
    """Average settlement delay per entity, weighted by amount.

    Keyed by ``entity_id`` when the document has one and by the lowercased
    ``entity_name`` otherwise, because a small company types names long before
    it creates entity records and the history should not be lost for that.
    """
    settled = (
        db.query(Transaction)
        .filter(
            Transaction.company_id == company_id,
            Transaction.type == kind,
            Transaction.payment_status == "paid",
        )
        .all()
    )
    if not settled:
        return {}

    by_trx: dict[str, list[Payment]] = {}
    for payment in (
        db.query(Payment)
        .filter(Payment.company_id == company_id,
                Payment.transaction_id.in_([t.id for t in settled]))
        .all()
    ):
        by_trx.setdefault(payment.transaction_id, []).append(payment)

    stats: dict[str, dict] = {}
    for trx in settled:
        payments = by_trx.get(trx.id)
        if not payments:
            continue
        # The document is only settled when the last payment lands.
        last = max(p.payment_date for p in payments if p.payment_date)
        delay = _days(last, trx.due_date or trx.date)
        if delay is None:
            continue
        delay = max(delay, 0)          # paying early is not negative lateness

        weight = _d(trx.gross_amount if trx.gross_amount is not None else trx.amount)
        if weight <= 0:
            continue

        entry = stats.setdefault(key_for(trx), {
            "entity_id": trx.entity_id,
            "entity_name": trx.entity_name,
            "documentos": 0,
            "_peso": Decimal("0.00"),
            "_soma": Decimal("0.00"),
            "pior_atraso": 0,
            "a_horas": 0,
        })
        entry["documentos"] += 1
        entry["_peso"] += weight
        entry["_soma"] += weight * delay
        entry["pior_atraso"] = max(entry["pior_atraso"], delay)
        if delay <= 0:
            entry["a_horas"] += 1

    result = {}
    for key, entry in stats.items():
        peso = entry.pop("_peso")
        soma = entry.pop("_soma")
        average = int((soma / peso).quantize(Decimal("1"), rounding=ROUND_HALF_UP)) if peso else 0
        entry["atraso_medio"] = average
        entry["pontualidade"] = round(entry["a_horas"] / entry["documentos"] * 100) if entry["documentos"] else 0
        # A habit needs repetition; one late invoice is an accident.
        entry["fiavel"] = entry["documentos"] >= MIN_HISTORY
        result[key] = entry
    return result


def key_for(trx: Transaction) -> str:
    """The identity a document's counterparty is grouped under."""
    return trx.entity_id or (trx.entity_name or "").strip().lower() or "sem-entidade"


def learned_delay(behaviour: dict[str, dict], trx: Transaction) -> int:
    """The delay to apply to this document — 0 when there is nothing to learn."""
    entry = behaviour.get(key_for(trx))
    if not entry or not entry.get("fiavel"):
        return 0
    return max(0, min(int(entry.get("atraso_medio") or 0), MAX_LEARNED_DELAY))


def expected_date(trx: Transaction, behaviour: dict[str, dict], today: date) -> date:
    """When the money is realistically expected, never before today."""
    reference = trx.due_date or trx.date
    try:
        due = date.fromisoformat(reference[:10])
    except (TypeError, ValueError, IndexError):
        return today
    expected = due + timedelta(days=learned_delay(behaviour, trx))
    return max(expected, today)


# ---------------------------------------------------------------------------
# Aging: what is open, and for how long
# ---------------------------------------------------------------------------

def _open_documents(db: Session, company_id: str, kind: str) -> list[Transaction]:
    return (
        db.query(Transaction)
        .filter(
            Transaction.company_id == company_id,
            Transaction.type == kind,
            Transaction.status.notin_(("cancelled", "draft")),
            Transaction.payment_status.in_(OPEN_STATUSES),
        )
        .all()
    )


def _empty_buckets() -> dict:
    return {key: {"label": label, "total": Decimal("0.00"), "documentos": 0}
            for key, label, _lower, _upper in BUCKETS}


def aging(db: Session, company_id: str, kind: str = "income",
          today: Optional[date] = None) -> dict:
    """Open documents split by how overdue they are, in total and per entity."""
    today = today or date.today()
    behaviour = payment_behaviour(db, company_id, kind)
    rows = _open_documents(db, company_id, kind)

    totals = _empty_buckets()
    per_entity: dict[str, dict] = {}
    documents = []

    for trx in rows:
        outstanding = _d(trx.outstanding_amount)
        if outstanding <= 0:
            continue

        due = trx.due_date or trx.date
        late = _days(today.isoformat(), due)
        late = 0 if late is None else late
        bucket = bucket_of(late)

        totals[bucket]["total"] += outstanding
        totals[bucket]["documentos"] += 1

        key = key_for(trx)
        entry = per_entity.setdefault(key, {
            "entity_id": trx.entity_id,
            "entity_name": trx.entity_name or "Sem entidade",
            "total": Decimal("0.00"),
            "documentos": 0,
            "vencido": Decimal("0.00"),
            "mais_antigo": 0,
            "buckets": _empty_buckets(),
        })
        entry["total"] += outstanding
        entry["documentos"] += 1
        entry["buckets"][bucket]["total"] += outstanding
        entry["buckets"][bucket]["documentos"] += 1
        if late > 0:
            entry["vencido"] += outstanding
            entry["mais_antigo"] = max(entry["mais_antigo"], late)

        documents.append({
            "id": trx.id,
            "descricao": trx.description,
            "documento": trx.document_number,
            "entity_id": trx.entity_id,
            "entidade": trx.entity_name,
            "data": trx.date,
            "vencimento": trx.due_date,
            "em_falta": float(outstanding),
            "dias_vencido": max(late, 0),
            "escalao": bucket,
            "previsao": expected_date(trx, behaviour, today).isoformat(),
        })

    documents.sort(key=lambda row: (-row["dias_vencido"], -row["em_falta"]))

    entities = []
    for key, entry in per_entity.items():
        stats = behaviour.get(key, {})
        entities.append({
            "chave": key,
            "entity_id": entry["entity_id"],
            "entidade": entry["entity_name"],
            "total": float(entry["total"]),
            "vencido": float(entry["vencido"]),
            "documentos": entry["documentos"],
            "mais_antigo": entry["mais_antigo"],
            "atraso_medio": stats.get("atraso_medio", 0),
            "pontualidade": stats.get("pontualidade"),
            "historico": stats.get("documentos", 0),
            "buckets": {k: {"label": v["label"], "total": float(v["total"]),
                            "documentos": v["documentos"]}
                        for k, v in entry["buckets"].items()},
        })
    entities.sort(key=lambda row: (-row["vencido"], -row["total"]))

    total = sum((b["total"] for b in totals.values()), Decimal("0.00"))
    overdue = sum((b["total"] for key, b in totals.items() if key != "a_vencer"), Decimal("0.00"))

    return {
        "hoje": today.isoformat(),
        "tipo": kind,
        "total": float(total),
        "vencido": float(overdue),
        "peso_vencido": float(round(overdue / total * 100, 1)) if total > 0 else 0.0,
        "escaloes": [
            {"chave": key, "label": totals[key]["label"],
             "total": float(totals[key]["total"]),
             "documentos": totals[key]["documentos"]}
            for key, _label, _lower, _upper in BUCKETS
        ],
        "entidades": entities,
        "documentos": documents,
    }


# ---------------------------------------------------------------------------
# The collections screen
# ---------------------------------------------------------------------------

def overview(db: Session, company_id: str, today: Optional[date] = None) -> dict:
    """Both directions at once, plus the one sentence worth acting on."""
    today = today or date.today()
    receivable = aging(db, company_id, "income", today)
    payable = aging(db, company_id, "expense", today)

    # Nothing overdue on a company with no documents is not good news; it is
    # no news. The screens must not confuse the two.
    from app.services.onboarding import readiness
    has_data = readiness(db, company_id)["cobrancas"]

    return {
        "hoje": today.isoformat(),
        "a_receber": receivable,
        "a_pagar": payable,
        "sem_dados": not has_data,
        "mensagem": _message(receivable, payable, has_data),
    }


def _message(receivable: dict, payable: dict, has_data: bool = True) -> str:
    overdue_in = receivable["vencido"]
    overdue_out = payable["vencido"]

    if not has_data:
        return (
            "Ainda não há documentos registados, por isso não há nada a cobrar "
            "nem a pagar. Registe a primeira fatura para começar."
        )
    if overdue_in <= 0 and overdue_out <= 0:
        return "Nada vencido dos dois lados. Continue assim."

    parts = []
    if overdue_in > 0:
        worst = next((e for e in receivable["entidades"] if e["vencido"] > 0), None)
        head = f"Tem {overdue_in:,.2f} € por cobrar já vencidos"
        if worst:
            head += (
                f", e {worst['vencido']:,.2f} € deles são de {worst['entidade']}"
                f" (o mais antigo há {worst['mais_antigo']} dias)"
            )
        parts.append(head + ".")
    if overdue_out > 0:
        parts.append(f"Do outro lado, {overdue_out:,.2f} € que devia ter pago.")
    return " ".join(parts)


def contact_details(db: Session, company_id: str, entity_id: Optional[str]) -> dict:
    """Whatever the company knows about how to reach this counterparty."""
    if not entity_id:
        return {}
    entity = (
        db.query(Entity)
        .filter(Entity.id == entity_id, Entity.company_id == company_id)
        .first()
    )
    if not entity:
        return {}
    return {"email": entity.email, "telefone": entity.phone, "nif": entity.nif}


def reminder_message(company_name: str, entity_name: str,
                     documents: Iterable[dict]) -> dict:
    """A ready-to-send chaser, so the person only has to press send.

    Written to be firm and unembarrassing: it states the facts and asks for a
    date, which is what actually gets a small invoice paid.
    """
    rows = list(documents)
    total = sum(Decimal(str(row.get("em_falta") or 0)) for row in rows)
    lines = [
        f"- {row.get('documento') or row.get('descricao') or 'Documento'}"
        f" · vencimento {row.get('vencimento') or '—'}"
        f" · {float(row.get('em_falta') or 0):,.2f} €"
        for row in rows
    ]
    body = (
        f"Exmos. Senhores,\n\n"
        f"Vimos por este meio recordar os seguintes valores em aberto:\n\n"
        + "\n".join(lines)
        + f"\n\nTotal em falta: {float(total):,.2f} €.\n\n"
        "Agradecemos a regularização ou a indicação de uma data prevista de "
        "pagamento.\n\n"
        f"Com os melhores cumprimentos,\n{company_name}"
    )
    return {
        "assunto": f"Valores em aberto — {company_name}",
        "corpo": body,
        "destinatario": entity_name,
        "total": float(total),
        "documentos": len(rows),
    }
