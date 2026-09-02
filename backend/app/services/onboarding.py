"""Primeiros passos — what a company still has to do before the numbers mean
anything.

A company registered five minutes ago sees a forecast saying *"sem apertos à
vista: 0,00 €"*, alerts saying *"tudo em dia"* and collections saying *"nada
vencido, continue assim"*. All three are technically true and all three are
lies of omission: there is nothing to worry about because there is nothing at
all. Reassurance built on an empty database is the fastest way to lose a small
company's trust, because the first time it matters the screen will have been
wrong for weeks.

So two things live here:

**The checklist.** What is missing, in the order that unlocks the most. The
opening balance comes first, not because it is the hardest but because every
cash figure in the product is wrong without it — a forecast that starts from a
balance of zero is not conservative, it is fictional.

**The readiness signal.** ``has_data`` per area, so a screen can say "ainda não
há dados" instead of "está tudo bem". The distinction costs one boolean and is
the difference between an honest product and a comfortable one.

Everything is derived from what exists. No flags to set, nothing to keep in
step, and a step that stops being true (the only bank account deleted) simply
reappears.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from sqlalchemy.orm import Session

from app.models.models import (
    PLACEHOLDER_NIF, BankAccount, Company, Entity, Payment, Recurrence, Transaction,
    UserMembership,
)


def _d(value) -> Decimal:
    return Decimal(str(value or 0))


def _step(key: str, title: str, why: str, done: bool, href: str,
          action: Optional[str] = None, essential: bool = False) -> dict:
    return {
        "chave": key,
        "titulo": title,
        # Why it matters, not what it is: a checklist without reasons gets
        # clicked through without being understood.
        "porque": why,
        "feito": done,
        "onde": href,
        "accao": action,
        # Essential steps are the ones without which figures are wrong rather
        # than merely absent.
        "essencial": essential,
    }


def _has_opening_balance(db: Session, company_id: str) -> bool:
    """A balance was actually declared — not the zero every account starts at.

    A real company with a genuinely empty account is rare enough that asking
    once is cheaper than silently forecasting from a fictional zero. Any
    movement already booked also settles the question.
    """
    accounts = (
        db.query(BankAccount)
        .filter(BankAccount.company_id == company_id, BankAccount.active.isnot(False))
        .all()
    )
    if any(_d(a.opening_balance) != 0 for a in accounts):
        return True
    return db.query(Payment).filter(Payment.company_id == company_id).first() is not None


def status(db: Session, company_id: str) -> dict:
    """The checklist, and whether the company is past its first day."""
    company = db.query(Company).filter(Company.id == company_id).first()

    documents = db.query(Transaction).filter(Transaction.company_id == company_id).count()
    payments = db.query(Payment).filter(Payment.company_id == company_id).count()
    recurrences = (
        db.query(Recurrence)
        .filter(Recurrence.company_id == company_id, Recurrence.active.isnot(False))
        .count()
    )
    entities = db.query(Entity).filter(Entity.company_id == company_id).count()
    members = db.query(UserMembership).filter(UserMembership.company_id == company_id).count()
    accounts = (
        db.query(BankAccount)
        .filter(BankAccount.company_id == company_id, BankAccount.active.isnot(False))
        .count()
    )

    steps = [
        _step(
            "saldo_inicial", "Diga quanto tem em conta",
            "Sem o saldo de abertura, a previsão de tesouraria parte do zero e "
            "todos os números de caixa ficam errados.",
            _has_opening_balance(db, company_id),
            "/settings", "Definir saldo", essential=True,
        ),
        _step(
            "regime_iva", "Confirme o NIF e o regime de IVA",
            "Decide se liquida IVA e se entrega trimestral ou mensalmente — e "
            "com isso a data em que o IVA sai da conta.",
            # A company is created with a placeholder NIF, so having one is not
            # the same as someone having confirmed it. A step that ticks itself
            # is the same lie as a screen that congratulates an empty company.
            bool(company and company.nif and company.nif != PLACEHOLDER_NIF
                 and company.vat_regime),
            "/settings", "Rever regime", essential=True,
        ),
        _step(
            "primeiro_documento", "Registe o primeiro documento",
            "Uma fatura ou uma despesa. É a partir daqui que há resultado, "
            "IVA e contas a receber.",
            documents > 0,
            "/financial/cash-flow", "Novo lançamento", essential=True,
        ),
        _step(
            "primeiro_pagamento", "Registe o primeiro pagamento",
            "Aprovar não é pagar. Só um pagamento move dinheiro e o saldo de "
            "caixa só conta pagamentos.",
            payments > 0,
            "/financial/cash-flow", "Liquidar",
        ),
        _step(
            "recorrencias", "Configure o que se repete",
            "Renda, salários, avenças. Uma previsão que ignora a renda do mês "
            "que vem não é uma previsão.",
            recurrences > 0,
            "/financial/recurrences", "Criar recorrência",
        ),
        _step(
            "entidades", "Registe clientes e fornecedores",
            "Com entidades, o sistema aprende quanto tempo cada cliente "
            "costuma demorar a pagar.",
            entities > 0,
            "/registry/customers", "Adicionar",
        ),
        _step(
            "equipa", "Convide quem trabalha consigo",
            "Cada pessoa com o seu acesso, e o registo de quem lançou o quê.",
            members > 1,
            "/settings", "Convidar",
        ),
    ]

    done = [s for s in steps if s["feito"]]
    missing = [s for s in steps if not s["feito"]]
    essential_missing = [s for s in missing if s["essencial"]]

    return {
        "passos": steps,
        "concluidos": len(done),
        "total": len(steps),
        "progresso": round(len(done) / len(steps) * 100),
        "completo": not missing,
        # While an essential step is open, the figures on screen are not to be
        # trusted, and the screens say so.
        "pronto": not essential_missing,
        "proximo": missing[0] if missing else None,
        "mensagem": _message(essential_missing, missing),
        "dados": {
            "documentos": documents,
            "pagamentos": payments,
            "recorrencias": recurrences,
            "entidades": entities,
            "contas": accounts,
            "membros": members,
        },
    }


def _message(essential_missing: list, missing: list) -> str:
    if not missing:
        return "Está tudo configurado. Os números do painel são de confiança."
    if essential_missing:
        first = essential_missing[0]
        return (
            f"Faltam {len(essential_missing)} passo(s) essencial(is) — comece por "
            f"«{first['titulo'].lower()}». Até lá, os valores de caixa e de IVA "
            "ainda não refletem a realidade da empresa."
        )
    return (
        f"O essencial está feito. Faltam {len(missing)} passo(s) que tornam as "
        "previsões mais certeiras."
    )


def readiness(db: Session, company_id: str) -> dict:
    """Per-area "is there anything to say yet", for the screens' empty states.

    Cheap enough to call alongside a payload: three counts and a balance
    check. A screen with ``False`` must not congratulate anybody.
    """
    documents = db.query(Transaction).filter(Transaction.company_id == company_id).count()
    payments = db.query(Payment).filter(Payment.company_id == company_id).count()
    recurrences = (
        db.query(Recurrence)
        .filter(Recurrence.company_id == company_id, Recurrence.active.isnot(False))
        .count()
    )
    return {
        # A forecast needs either something to project or a balance to project from.
        "previsao": bool(documents or recurrences or _has_opening_balance(db, company_id)),
        "cobrancas": documents > 0,
        "alertas": documents > 0,
        "caixa": payments > 0 or _has_opening_balance(db, company_id),
    }
