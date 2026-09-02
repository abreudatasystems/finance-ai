"""Exportar tudo o que é da empresa.

A product that holds a company's accounts and offers no way to take them away
fails on trust before it fails on features — and the right to receive one's own
data in a machine-readable form is not a courtesy, it is article 20 of the
GDPR. A small company choosing where to keep its books should be able to leave
without asking anybody.

Two decisions make this worth having rather than merely present:

**The table list is derived, not written by hand.** Every mapped model that
carries a ``company_id`` is in the export automatically, so a table added next
year cannot silently fall out of it. A hand-kept list is a list that goes stale
the first time someone is in a hurry.

**What is deliberately left out is left out for a reason, and stated.** Other
companies' rows, obviously. Password hashes and reset tokens, because an export
is a file that gets emailed and put on a laptop, and nobody needs the company's
logins in it to move their accounting somewhere else.

The file is a ZIP of CSVs plus a manifest: CSVs because the person receiving it
is as likely to be an accountant with Excel as an engineer with a parser, and a
manifest because a dump nobody can check is a dump nobody should trust.
"""

from __future__ import annotations

import csv
import io
import json
import zipfile
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Iterable, Optional

from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session

from app.db.base import Base
from app.models.models import Company, User, UserMembership

#: Columns never written to an export, whatever table they appear on. An export
#: is a file that travels; the company's logins do not need to travel with it.
SENSITIVE_COLUMNS = frozenset({
    "hashed_password", "password", "password_hash",
    "reset_token", "reset_token_expires",
    "access_token", "refresh_token", "api_key", "secret",
})

#: The column every tenant-scoped table is found by.
TENANT_COLUMN = "company_id"


def _pt(value) -> str:
    """Portuguese decimals, so the CSV opens correctly in Excel here."""
    return f"{value:.2f}".replace(".", ",")


def _cell(value) -> str:
    if value is None:
        return ""
    if isinstance(value, Decimal):
        return _pt(value)
    if isinstance(value, bool):
        return "sim" if value else "não"
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return str(value)


def tenant_models() -> list:
    """Every mapped model that belongs to a company, ordered by table name.

    Derived from the mappers rather than listed, so a model added later is
    exported without anybody remembering to add it here.
    """
    models = []
    for mapper in Base.registry.mappers:
        model = mapper.class_
        if TENANT_COLUMN in mapper.columns:
            models.append(model)
    return sorted(models, key=lambda m: m.__tablename__)


def _columns(model) -> list[str]:
    return [
        column.key for column in sa_inspect(model).columns
        if column.key not in SENSITIVE_COLUMNS
    ]


def _rows_for(db: Session, model, company_id: str) -> list[dict]:
    columns = _columns(model)
    return [
        {name: getattr(row, name, None) for name in columns}
        for row in db.query(model).filter(
            getattr(model, TENANT_COLUMN) == company_id,
        ).all()
    ]


def _table_csv(rows: list[dict], columns: list[str]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";", quoting=csv.QUOTE_MINIMAL)
    writer.writerow(columns)
    for row in rows:
        writer.writerow([_cell(row.get(name)) for name in columns])
    # BOM, like the accounting export: Excel in Portugal wants it.
    return "﻿" + buffer.getvalue()


def _team(db: Session, company_id: str) -> list[dict]:
    """Who has access, by name and role — never with anything that logs in."""
    rows = []
    memberships = (
        db.query(UserMembership)
        .filter(UserMembership.company_id == company_id)
        .all()
    )
    users = {
        u.id: u for u in db.query(User).filter(
            User.id.in_([m.user_id for m in memberships] or [""]),
        ).all()
    }
    for membership in memberships:
        user = users.get(membership.user_id)
        rows.append({
            "user_id": membership.user_id,
            "nome": user.name if user else "",
            "email": user.email if user else "",
            "papel": membership.role,
            "desde": _cell(getattr(membership, "created_at", None)),
        })
    return rows


def build(db: Session, company_id: str,
          generated_by: Optional[str] = None) -> tuple[bytes, dict]:
    """The ZIP and its manifest.

    Returns the bytes and the manifest separately so a caller can report the
    contents without re-reading the archive.
    """
    company = db.query(Company).filter(Company.id == company_id).first()
    generated_at = datetime.now(timezone.utc)

    tables = []
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for model in tenant_models():
            columns = _columns(model)
            rows = _rows_for(db, model, company_id)
            archive.writestr(f"dados/{model.__tablename__}.csv",
                             _table_csv(rows, columns))
            tables.append({
                "tabela": model.__tablename__,
                "registos": len(rows),
                "colunas": len(columns),
            })

        team = _team(db, company_id)
        archive.writestr(
            "dados/equipa.csv",
            _table_csv(team, ["user_id", "nome", "email", "papel", "desde"]),
        )
        tables.append({"tabela": "equipa", "registos": len(team), "colunas": 5})

        manifest = {
            "empresa": {
                "id": company_id,
                "nome": company.name if company else "",
                "nif": company.nif if company else "",
            },
            "gerado_em": generated_at.isoformat(),
            "gerado_por": generated_by,
            "formato": "CSV com ; e decimais com vírgula, codificação UTF-8 com BOM",
            "tabelas": sorted(tables, key=lambda t: t["tabela"]),
            "total_registos": sum(t["registos"] for t in tables),
            "excluido": (
                "Palavras-passe, tokens de sessão e dados de outras empresas "
                "não são exportados."
            ),
        }
        archive.writestr("manifesto.json",
                         json.dumps(manifest, ensure_ascii=False, indent=2))
        archive.writestr("LEIA-ME.txt", _readme(manifest))

    return buffer.getvalue(), manifest


def _readme(manifest: dict) -> str:
    """A page a person can read before opening twenty CSVs."""
    lines = [
        f"Exportação de dados — {manifest['empresa']['nome']}",
        "=" * 60,
        "",
        f"Gerado em: {manifest['gerado_em']}",
        f"Total de registos: {manifest['total_registos']}",
        "",
        "Cada ficheiro em dados/ é uma tabela, em CSV separado por ponto e",
        "vírgula, com decimais à portuguesa e BOM — abre diretamente no Excel.",
        "",
        "Tabelas:",
    ]
    for table in manifest["tabelas"]:
        lines.append(f"  {table['tabela']:<32} {table['registos']:>7} registo(s)")
    lines += [
        "",
        manifest["excluido"],
        "",
        "O manifesto.json traz as mesmas contagens em formato legível por",
        "máquina, para conferir que nada se perdeu na transferência.",
    ]
    return "\n".join(lines) + "\n"


def summary(db: Session, company_id: str) -> dict:
    """What the export would contain, without building it.

    So a screen can say how much there is before someone downloads it, and so
    the size is never a surprise on a slow connection.
    """
    tables = []
    for model in tenant_models():
        count = db.query(model).filter(
            getattr(model, TENANT_COLUMN) == company_id,
        ).count()
        tables.append({"tabela": model.__tablename__, "registos": count})
    return {
        "tabelas": sorted(tables, key=lambda t: -t["registos"]),
        "total_registos": sum(t["registos"] for t in tables),
        "total_tabelas": len(tables),
    }


def filename_for(company: Optional[Company], today: Optional[date] = None) -> str:
    """A name that says whose data it is and when it was taken."""
    stamp = (today or date.today()).isoformat()
    slug = "".join(
        ch if ch.isalnum() else "-"
        for ch in (company.name if company else "empresa").lower()
    ).strip("-")
    while "--" in slug:
        slug = slug.replace("--", "-")
    return f"dados-{slug or 'empresa'}-{stamp}.zip"


def tables_in_export() -> Iterable[str]:
    """The table names an export carries — used by the tests and the screen."""
    return [model.__tablename__ for model in tenant_models()] + ["equipa"]
