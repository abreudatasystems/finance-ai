"""Ficha completa da empresa

A empresa passa a guardar o que é preciso para a controlar sem ir a outro
sítio: nome comercial, sede e contactos, capital social e data de
constituição, regime de IRC, número da Segurança Social, o contabilista
certificado e os prazos de pagamento habituais a clientes e a fornecedores.

Os prazos são usados: um documento lançado sem data de vencimento vence a
data do documento mais esse prazo.

Todas as colunas aceitam nulo — as empresas que já existem ficam como estão.

Revision ID: 0014_company_profile
Revises: 0013_drop_legacy_registry
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0014_company_profile'
down_revision: Union[str, Sequence[str], None] = '0013_drop_legacy_registry'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNS = [
    sa.Column('trade_name', sa.String(), nullable=True),
    sa.Column('share_capital', sa.Numeric(14, 2), nullable=True),
    sa.Column('incorporation_date', sa.String(), nullable=True),
    sa.Column('address', sa.String(), nullable=True),
    sa.Column('postal_code', sa.String(), nullable=True),
    sa.Column('city', sa.String(), nullable=True),
    sa.Column('email', sa.String(), nullable=True),
    sa.Column('phone', sa.String(), nullable=True),
    sa.Column('website', sa.String(), nullable=True),
    sa.Column('irc_regime', sa.String(), nullable=True),
    sa.Column('niss', sa.String(), nullable=True),
    sa.Column('accountant_name', sa.String(), nullable=True),
    sa.Column('accountant_nif', sa.String(), nullable=True),
    sa.Column('accountant_email', sa.String(), nullable=True),
    sa.Column('customer_terms_days', sa.Integer(), nullable=True),
    sa.Column('supplier_terms_days', sa.Integer(), nullable=True),
]


def upgrade() -> None:
    with op.batch_alter_table('companies') as batch:
        for column in COLUMNS:
            batch.add_column(column.copy())


def downgrade() -> None:
    with op.batch_alter_table('companies') as batch:
        for column in reversed(COLUMNS):
            batch.drop_column(column.name)
