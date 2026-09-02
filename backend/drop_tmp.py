from app.db.session import engine
from sqlalchemy import text

with engine.connect() as conn:
    conn.execute(text("DROP TABLE IF EXISTS _alembic_tmp_bank_statement_entries"))
    conn.commit()
