"""Retentions: the money withheld at source, and the amount that really moves

The document says 184,50 EUR and the bank transfer is 147,00 EUR, with
37,50 EUR owed to the State. Storing the withholding and the payable amount is
what stops every cash figure being wrong by the retention.

Revision ID: 0008_retentions
Revises: 0007_budgets
Create Date: 2026-09-02 09:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0008_retentions'
down_revision: Union[str, Sequence[str], None] = '0007_budgets'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # render_as_batch keeps SQLite able to alter a table it cannot alter.
    with op.batch_alter_table('transactions') as batch:
        batch.add_column(sa.Column('retention_code', sa.String(), nullable=True))
        batch.add_column(sa.Column('retention_rate', sa.Float(), nullable=True))
        batch.add_column(sa.Column('retention_amount', sa.Numeric(14, 2), nullable=True))
        batch.add_column(sa.Column('payable_amount', sa.Numeric(14, 2), nullable=True))

    with op.batch_alter_table('entities') as batch:
        batch.add_column(sa.Column('default_retention_code', sa.String(), nullable=True))

    # Existing documents carry no withholding, so what is payable is the gross
    # they already had. Written once here rather than defaulted at read time,
    # so the column means the same thing on every row from now on.
    op.execute(
        "UPDATE transactions SET retention_amount = 0, "
        "payable_amount = COALESCE(gross_amount, amount)"
    )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('entities') as batch:
        batch.drop_column('default_retention_code')

    with op.batch_alter_table('transactions') as batch:
        batch.drop_column('payable_amount')
        batch.drop_column('retention_amount')
        batch.drop_column('retention_rate')
        batch.drop_column('retention_code')
