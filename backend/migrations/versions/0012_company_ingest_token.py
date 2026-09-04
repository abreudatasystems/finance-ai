"""Cada empresa passa a ter o seu segredo de ingestão

Os webhooks de email e WhatsApp liam a empresa do corpo do pedido, com
``COMP001`` por omissão. Quem chegasse ao endpoint escolhia em que livro
escrevia — e o segredo global, quando definido, não distinguia empresas: quem o
tivesse tinha-as todas. Um segredo por empresa faz do próprio segredo a
identificação, que é o que ele tem de ser.

Fica nulo para as empresas existentes: um canal automático só passa a funcionar
depois de alguém o ligar de propósito nas definições.

Revision ID: 0012_company_ingest_token
Revises: 0011_occurrence_unique
"""

from alembic import op
import sqlalchemy as sa

revision = "0012_company_ingest_token"
down_revision = "0011_occurrence_unique"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ``render_as_batch`` porque o SQLite não altera tabelas no sítio: recria-as.
    with op.batch_alter_table("companies", schema=None) as batch:
        batch.add_column(sa.Column("ingest_token", sa.String(), nullable=True))
        batch.create_index("ix_companies_ingest_token", ["ingest_token"], unique=True)


def downgrade() -> None:
    with op.batch_alter_table("companies", schema=None) as batch:
        batch.drop_index("ix_companies_ingest_token")
        batch.drop_column("ingest_token")
