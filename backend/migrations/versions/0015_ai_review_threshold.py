"""Limite de confiança da IA guardado na empresa

O limite abaixo do qual uma fatura lida pela IA fica marcada para revisão
vivia só no navegador de quem o escolhia, e o servidor usava sempre 80%.
Passa a ser da empresa. Nulo = 80%, o comportamento de sempre.

Revision ID: 0015_ai_review_threshold
Revises: 0014_company_profile
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0015_ai_review_threshold'
down_revision: Union[str, Sequence[str], None] = '0014_company_profile'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('companies') as batch:
        batch.add_column(sa.Column('ai_review_threshold', sa.Integer(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table('companies') as batch:
        batch.drop_column('ai_review_threshold')
