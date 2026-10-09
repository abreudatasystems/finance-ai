"""As tabelas antigas de fornecedores e clientes saem

Desde a 0005 o registo vive em ``entities``: as duas tabelas foram dobradas
lá dentro e nada as voltou a escrever ou a ler. Ficaram só como peso morto — e
como armadilha, porque o OCR chegou a procurar fornecedores na tabela antiga e
nunca encontrava os que tinham sido criados depois.

Antes de as apagar, qualquer linha que ainda não tenha entidade correspondente
(pela ``source_ref`` que a 0005 deixou) é copiada, para nenhum registo se
perder. O ``downgrade`` recria as tabelas vazias: o conteúdo continua nas
entidades.

Revision ID: 0013_drop_legacy_registry
Revises: 0012_auth_recovery_2fa
"""

import time

from alembic import op
import sqlalchemy as sa

revision = "0013_drop_legacy_registry"
down_revision = "0012_auth_recovery_2fa"
branch_labels = None
depends_on = None


def _rescue(conn, table: str, role: str) -> None:
    """Copia para ``entities`` o que a 0005 não chegou a dobrar."""
    flag = "is_supplier" if role == "supplier" else "is_customer"
    address = "address" if role == "supplier" else "NULL"
    rows = conn.execute(sa.text(
        f"SELECT id, company_id, name, nif, email, phone, {address} AS address, "
        f"default_category_id, default_category_name FROM {table}"
    )).mappings().all()
    for i, row in enumerate(rows):
        ref = f"{role}:{row['id']}"
        known = conn.execute(
            sa.text("SELECT 1 FROM entities WHERE source_ref LIKE :ref"),
            {"ref": f"%{ref}%"},
        ).first()
        if known:
            continue
        conn.execute(sa.text(
            "INSERT INTO entities (id, company_id, name, nif, email, phone, address, "
            f"{flag}, default_category_id, default_category_name, active, source_ref) "
            "VALUES (:id, :company_id, :name, :nif, :email, :phone, :address, "
            ":flag, :cat_id, :cat_name, :active, :ref)"
        ), {
            "id": f"ENT-L{int(time.time() * 1000)}{i}",
            "company_id": row["company_id"],
            "name": row["name"],
            "nif": row["nif"],
            "email": row["email"],
            "phone": row["phone"],
            "address": row["address"],
            "flag": True,
            "cat_id": row["default_category_id"],
            "cat_name": row["default_category_name"],
            "active": True,
            "ref": ref,
        })


def upgrade() -> None:
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    for table, role in (("suppliers", "supplier"), ("customers", "customer")):
        if inspector.has_table(table):
            _rescue(conn, table, role)
            op.drop_table(table)


def downgrade() -> None:
    op.create_table(
        "suppliers",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("company_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("nif", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("address", sa.String(), nullable=True),
        sa.Column("default_category_id", sa.String(), nullable=True),
        sa.Column("default_category_name", sa.String(), nullable=True),
        sa.Column("total_spent", sa.Float(), nullable=True),
        sa.Column("last_transaction_date", sa.String(), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_suppliers_id", "suppliers", ["id"], unique=False)
    op.create_table(
        "customers",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("company_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("nif", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("default_category_id", sa.String(), nullable=True),
        sa.Column("default_category_name", sa.String(), nullable=True),
        sa.Column("total_revenue", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_customers_id", "customers", ["id"], unique=False)
