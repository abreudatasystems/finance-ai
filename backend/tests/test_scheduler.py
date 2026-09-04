"""O que se repete tem de repetir-se sozinho — e uma vez só.

Uma recorrência que só gera quando alguém carrega num botão não é uma
recorrência: é um lembrete. Estes testes fixam as duas metades disso — que o
varrimento gera sem ninguém à frente, e que gerar duas vezes o mesmo período
continua a dar um lançamento e não dois, mesmo que aconteça em simultâneo.
"""

from datetime import date

import pytest
from sqlalchemy.exc import IntegrityError

from app.db.session import SessionLocal
from app.models.models import Recurrence, RecurrenceOccurrence
from app.services import recurrences, scheduler


def _monthly(tenant, amount: float = 850.00, day: int = 8) -> dict:
    """Uma renda mensal, começada em Janeiro, à espera de ser gerada."""
    category = tenant.category("expense")
    response = tenant.post("/api/v1/recurrences/", {
        "name": "Renda do escritório",
        "type": "expense",
        "description": "Renda do escritório",
        "entity_name": "Senhorio",
        "category_id": category["id"],
        "category_name": category["name"],
        "amount": amount,
        "vat_rate": 0,
        "frequency": "monthly",
        "day_of_month": day,
        "start_date": "2026-01-08",
    })
    assert response.status_code in (200, 201), response.text
    return response.json()


def _booked(tenant) -> list:
    rows = tenant.get("/api/v1/transactions/").json()
    rows = rows if isinstance(rows, list) else rows.get("items", [])
    return [r for r in rows if r.get("source") == "recurring"]


# ---------------------------------------------------------------------------
# Gera sem ninguém à frente
# ---------------------------------------------------------------------------

def test_the_sweep_generates_what_is_due(tenant):
    _monthly(tenant)
    assert _booked(tenant) == []

    result = scheduler.sweep(date(2026, 3, 31))

    assert result["gerados"] >= 3          # Janeiro, Fevereiro e Março
    assert len(_booked(tenant)) >= 3


def test_the_sweep_is_safe_to_run_again(tenant):
    """Chamado de seis em seis horas, não pode acumular lançamentos."""
    _monthly(tenant)

    scheduler.sweep(date(2026, 3, 31))
    first = len(_booked(tenant))
    scheduler.sweep(date(2026, 3, 31))

    assert len(_booked(tenant)) == first


def test_the_sweep_reaches_every_company(tenant, other_tenant):
    _monthly(tenant)
    _monthly(other_tenant)

    scheduler.sweep(date(2026, 2, 28))

    assert _booked(tenant)
    assert _booked(other_tenant)
    # E cada lançamento ficou na empresa a que pertence.
    ours = {r["id"] for r in _booked(tenant)}
    theirs = {r["id"] for r in _booked(other_tenant)}
    assert ours.isdisjoint(theirs)


def test_a_company_that_fails_does_not_stop_the_others(tenant, other_tenant, monkeypatch):
    """Um varrimento é por empresa: uma que rebente não cala as restantes."""
    _monthly(tenant)
    _monthly(other_tenant)

    original = recurrences.run
    broken = {"company": tenant.company_id}

    def explode(db, company_id, *args, **kwargs):
        if company_id == broken["company"]:
            raise RuntimeError("dados impossíveis")
        return original(db, company_id, *args, **kwargs)

    monkeypatch.setattr(recurrences, "run", explode)
    result = scheduler.sweep(date(2026, 2, 28))

    assert broken["company"] in result["falhas"]
    assert result["gerados"] > 0           # a outra empresa correu à mesma
    assert _booked(other_tenant)


def test_a_paused_recurrence_is_left_alone(tenant):
    recurrence = _monthly(tenant)
    tenant.patch(f"/api/v1/recurrences/{recurrence['id']}", {"active": False})

    scheduler.sweep(date(2026, 3, 31))

    assert _booked(tenant) == []


# ---------------------------------------------------------------------------
# A mesma renda não entra duas vezes
# ---------------------------------------------------------------------------

def test_a_period_cannot_be_recorded_twice(tenant):
    """A idempotência era uma convenção em código; passa a ser da base de dados.

    Enquanto a geração era manual, ler os períodos já feitos chegava. A correr
    sozinha, e possivelmente em mais do que um processo, duas leituras
    simultâneas veem ambas "ainda não foi feito" — e a renda entra duas vezes.
    """
    _monthly(tenant)
    scheduler.sweep(date(2026, 1, 31))

    db = SessionLocal()
    try:
        existing = (
            db.query(RecurrenceOccurrence)
            .join(Recurrence, Recurrence.id == RecurrenceOccurrence.recurrence_id)
            .filter(Recurrence.company_id == tenant.company_id)
            .first()
        )
        assert existing is not None

        db.add(RecurrenceOccurrence(
            id="ROC-DUPLICADO",
            company_id=existing.company_id,
            recurrence_id=existing.recurrence_id,
            period=existing.period,
            due_date=existing.due_date,
            amount=existing.amount,
            status="generated",
        ))
        with pytest.raises(IntegrityError):
            db.commit()
    finally:
        db.rollback()
        db.close()


def test_a_racing_generation_produces_one_booking(tenant):
    """Quem perde a corrida desfaz o que ia escrever, em vez de rebentar."""
    recurrence = _monthly(tenant)
    scheduler.sweep(date(2026, 1, 31))
    before = len(_booked(tenant))
    assert before == 1

    # Simula o outro processo: a verificação em memória já não vê o período,
    # mas a base de dados vê. É esse o caso que a restrição apanha.
    db = SessionLocal()
    try:
        rec = db.query(Recurrence).filter(Recurrence.id == recurrence["id"]).first()
        db.query(RecurrenceOccurrence).filter(
            RecurrenceOccurrence.recurrence_id == rec.id
        ).update({RecurrenceOccurrence.status: "generated"}, synchronize_session=False)
        db.commit()

        # Apaga só a memória do serviço, não a linha: força a segunda escrita.
        monkeyed = recurrences._existing_periods
        recurrences._existing_periods = lambda db_, rid: set()
        try:
            recurrences.generate_for(db, tenant.company_id, rec, date(2026, 1, 31))
        finally:
            recurrences._existing_periods = monkeyed
    finally:
        db.close()

    assert len(_booked(tenant)) == before


# ---------------------------------------------------------------------------
# Desligável
# ---------------------------------------------------------------------------

def test_an_empty_install_sweeps_without_complaining():
    result = scheduler.sweep(date(2026, 1, 31))
    assert result["falhas"] == []
    assert result["empresas"] >= 0


def test_the_generated_booking_is_an_obligation_not_a_payment(tenant):
    """Gerado não é pago — a regra vale igual quando é a máquina a lançar."""
    _monthly(tenant)
    scheduler.sweep(date(2026, 1, 31))

    booking = _booked(tenant)[0]
    assert booking["payment_status"] == "pending"
    assert float(booking["paid_amount"]) == 0.0
    assert booking["created_by"] == scheduler.AUTHOR
