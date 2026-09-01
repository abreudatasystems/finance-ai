"""Migrations — the thing that makes a schema change safe once there are customers.

Each case runs against its own throwaway database, because these tests move a
schema backwards and forwards and must not touch the one the API tests share.
"""

import os
import tempfile

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect, text

BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


@pytest.fixture
def scratch_db(monkeypatch):
    """A fresh database plus an Alembic config pointing at it."""
    path = tempfile.mktemp(suffix=".db")
    url = f"sqlite:///{path}"
    config = Config(os.path.join(BACKEND_ROOT, "alembic.ini"))
    config.set_main_option("script_location", os.path.join(BACKEND_ROOT, "migrations"))
    # env.py reads the URL from the app settings, so point those at the scratch file.
    monkeypatch.setattr("app.core.config.settings.DATABASE_URL", url, raising=False)
    config.set_main_option("sqlalchemy.url", url)
    engine = create_engine(url)
    yield config, engine
    engine.dispose()
    if os.path.exists(path):
        os.remove(path)


def test_an_empty_database_reaches_head(scratch_db):
    config, engine = scratch_db
    command.upgrade(config, "head")
    tables = inspect(engine).get_table_names()
    assert "alembic_version" in tables
    for expected in ("companies", "transactions", "entities", "recurrences",
                     "transaction_lines", "invitations"):
        assert expected in tables


def test_every_revision_can_be_walked_back(scratch_db):
    config, engine = scratch_db
    command.upgrade(config, "head")
    command.downgrade(config, "base")
    assert "companies" not in inspect(engine).get_table_names()


def test_existing_rows_survive_the_team_migration(scratch_db):
    """A user that predates invitations becomes a full, active account."""
    config, engine = scratch_db
    command.upgrade(config, "0001_baseline")
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO companies (id,name,nif) VALUES ('C1','Antiga','PT1')"))
        conn.execute(text(
            "INSERT INTO users (id,name,email,hashed_password) "
            "VALUES ('U1','Zé','ze@x.pt','hash')"))
    command.upgrade(config, "head")
    with engine.connect() as conn:
        row = conn.execute(text("SELECT account_type, active FROM users WHERE id='U1'")).first()
    assert row[0] == "full"
    assert bool(row[1]) is True


def test_statement_amounts_are_rounded_to_cents_on_conversion(scratch_db):
    """Float drift does not survive the move to Numeric."""
    config, engine = scratch_db
    command.upgrade(config, "0002_team")
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO companies (id,name,nif) VALUES ('C1','X','PT1')"))
        conn.execute(text(
            "INSERT INTO bank_statements (id,company_id,bank_name,file_name) "
            "VALUES ('S1','C1','CGD','x.csv')"))
        conn.execute(text(
            "INSERT INTO bank_statement_entries "
            "(id,statement_id,company_id,date,description,amount,type,balance) "
            "VALUES ('E1','S1','C1','2026-08-01','TRF',123.456,'debit',1000.019)"))
    command.upgrade(config, "head")
    with engine.connect() as conn:
        amount, balance = conn.execute(
            text("SELECT amount, balance FROM bank_statement_entries WHERE id='E1'")).first()
    assert float(amount) == 123.46
    assert float(balance) == 1000.02


def test_suppliers_and_customers_are_folded_into_entities(scratch_db):
    """The same NIF on both sides becomes one entity carrying both roles."""
    config, engine = scratch_db
    command.upgrade(config, "0004_invoice_lines")
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO companies (id,name,nif) VALUES ('C1','X','PT1')"))
        conn.execute(text(
            "INSERT INTO suppliers (id,company_id,name,nif,email) "
            "VALUES ('S1','C1','EDP','503504564','geral@edp.pt')"))
        conn.execute(text(
            "INSERT INTO suppliers (id,company_id,name,nif,phone) "
            "VALUES ('S2','C1','Silva Lda','501234567','912345678')"))
        conn.execute(text(
            "INSERT INTO customers (id,company_id,name,nif,email) "
            "VALUES ('K1','C1','Silva Lda','501234567','silva@silva.pt')"))
    command.upgrade(config, "head")
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT name, is_supplier, is_customer, phone, email FROM entities ORDER BY name"
        )).all()
    assert len(rows) == 2, "a Silva Lda estava dos dois lados e devia ficar numa entidade só"
    silva = next(r for r in rows if r[0] == "Silva Lda")
    assert bool(silva[1]) and bool(silva[2])
    assert silva[3] == "912345678" and silva[4] == "silva@silva.pt"
