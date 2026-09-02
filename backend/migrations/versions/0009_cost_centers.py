"""Cost centres become real: a project a document can belong to

The table existed with budget and spent as stored Floats and nothing ever read
or wrote it, while cost_center_name was typed as free text on the documents.
This makes it a managed entity, drops the stored `spent` — what was spent is
derived from the documents, like every other figure in this product — and puts
money in Numeric.

The table is empty in every deployment (nothing ever inserted into it), so the
columns are rebuilt rather than migrated.

Revision ID: 0009_cost_centers
Revises: 0008_retentions
Create Date: 2026-09-02 12:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0009_cost_centers'
down_revision: Union[str, Sequence[str], None] = '0008_retentions'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('cost_centers') as batch:
        # Derived, never stored: a spent figure written down is a spent figure
        # that drifts from the documents it came from.
        batch.drop_column('spent')
        batch.alter_column('budget', type_=sa.Numeric(14, 2), existing_type=sa.Float(),
                           existing_nullable=True)
        batch.add_column(sa.Column('description', sa.Text(), nullable=True))
        batch.add_column(sa.Column('contract_value', sa.Numeric(14, 2), nullable=True))
        batch.add_column(sa.Column('entity_id', sa.String(), nullable=True))
        batch.add_column(sa.Column('entity_name', sa.String(), nullable=True))
        batch.add_column(sa.Column('started_on', sa.String(), nullable=True))
        batch.add_column(sa.Column('ended_on', sa.String(), nullable=True))
        batch.add_column(sa.Column('status', sa.String(), nullable=True))
        batch.add_column(sa.Column('created_at', sa.DateTime(), nullable=True))

    op.create_index(op.f('ix_cost_centers_company_id'), 'cost_centers',
                    ['company_id'], unique=False)
    op.execute("UPDATE cost_centers SET status = 'open' WHERE status IS NULL")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_cost_centers_company_id'), table_name='cost_centers')
    with op.batch_alter_table('cost_centers') as batch:
        batch.drop_column('created_at')
        batch.drop_column('status')
        batch.drop_column('ended_on')
        batch.drop_column('started_on')
        batch.drop_column('entity_name')
        batch.drop_column('entity_id')
        batch.drop_column('contract_value')
        batch.drop_column('description')
        batch.alter_column('budget', type_=sa.Float(), existing_type=sa.Numeric(14, 2),
                           existing_nullable=True)
        batch.add_column(sa.Column('spent', sa.Float(), nullable=True))
