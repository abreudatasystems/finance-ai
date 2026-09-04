"""Uma recorrência trata cada período uma vez só — garantido pela base de dados

A geração era idempotente por convenção: lia os períodos já feitos e saltava-os.
Enquanto alguém carregava num botão isso chegava. A partir do momento em que a
geração corre sozinha, e pode correr em mais do que um processo ao mesmo tempo,
duas leituras simultâneas veem ambas "ainda não foi feito" e a mesma renda
entra duas vezes. A restrição fecha essa janela.

Revision ID: 0011_occurrence_unique
Revises: 0010_line_items
"""

from alembic import op
import sqlalchemy as sa

revision = "0011_occurrence_unique"
down_revision = "0010_line_items"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Duplicados anteriores impediriam a restrição de ser criada. Ficam os
    # primeiros de cada par: são os que têm lançamentos já contabilizados.
    connection = op.get_bind()
    connection.execute(sa.text("""
        DELETE FROM recurrence_occurrences
        WHERE id NOT IN (
            SELECT MIN(id) FROM recurrence_occurrences GROUP BY recurrence_id, period
        )
    """))

    with op.batch_alter_table("recurrence_occurrences") as batch:
        batch.create_unique_constraint(
            "uq_occurrence_recurrence_period", ["recurrence_id", "period"]
        )


def downgrade() -> None:
    with op.batch_alter_table("recurrence_occurrences") as batch:
        batch.drop_constraint("uq_occurrence_recurrence_period", type_="unique")
