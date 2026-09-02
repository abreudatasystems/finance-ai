"""Invoice lines can name an item from the catalogue

The catalogue existed and the lines existed, and nothing joined them: a
product with a price and a VAT rate had to be typed out by hand on every
document. The link is a nullable reference, so every line written before this
stays exactly as it was.

What the line copies from the item — description, unit price, rate — stays
written on the line. An item that changes price tomorrow must not rewrite an
invoice from yesterday.

Revision ID: 0010_line_items
Revises: dea9622df654
Create Date: 2026-09-02 19:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0010_line_items'
down_revision: Union[str, Sequence[str], None] = 'dea9622df654'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('transaction_lines') as batch:
        batch.add_column(sa.Column('item_id', sa.String(), nullable=True))
        batch.add_column(sa.Column('item_code', sa.String(), nullable=True))
    op.create_index(op.f('ix_transaction_lines_item_id'), 'transaction_lines',
                    ['item_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_transaction_lines_item_id'), table_name='transaction_lines')
    with op.batch_alter_table('transaction_lines') as batch:
        batch.drop_column('item_code')
        batch.drop_column('item_id')
