"""Budgets: what the company planned, so a month can be judged

The product could say what happened and what is coming, and nothing about what
was intended. Only the plan is stored; the realizado stays derived from the
documents.

Revision ID: 0007_budgets
Revises: 0006_recurrences
Create Date: 2026-09-02 08:40:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0007_budgets'
down_revision: Union[str, Sequence[str], None] = '0006_recurrences'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        'budgets',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('company_id', sa.String(), nullable=False),
        sa.Column('category_id', sa.String(), nullable=False),
        sa.Column('category_name', sa.String(), nullable=False),
        sa.Column('type', sa.String(), nullable=False),
        sa.Column('period', sa.String(), nullable=False),
        sa.Column('amount', sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_by', sa.String(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['company_id'], ['companies.id'], ),
        sa.PrimaryKeyConstraint('id'),
        # One budget per category per month: a second one would be a second
        # opinion, and the report would have to guess which is the plan.
        sa.UniqueConstraint('company_id', 'category_id', 'period',
                            name='uq_budget_category_period'),
    )
    op.create_index(op.f('ix_budgets_id'), 'budgets', ['id'], unique=False)
    op.create_index(op.f('ix_budgets_company_id'), 'budgets', ['company_id'], unique=False)
    op.create_index(op.f('ix_budgets_period'), 'budgets', ['period'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_budgets_period'), table_name='budgets')
    op.drop_index(op.f('ix_budgets_company_id'), table_name='budgets')
    op.drop_index(op.f('ix_budgets_id'), table_name='budgets')
    op.drop_table('budgets')
