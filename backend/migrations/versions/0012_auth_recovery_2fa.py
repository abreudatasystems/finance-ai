"""Recuperação de palavra-passe por email e verificação em dois passos (TOTP)

* ``password_reset_tokens`` — pedidos de recuperação; guarda-se só o hash do
  token, com prazo e uso único;
* ``two_factor_recovery_codes`` — códigos de recuperação da 2FA, com hash;
* ``users`` ganha o estado da 2FA (segredo, segredo pendente, último passo
  aceite);
* ``companies.require_two_factor`` — a empresa pode obrigar a equipa a usar
  2FA.

As colunas booleanas novas têm ``server_default`` falso, para as linhas que já
existem ficarem preenchidas no upgrade.

Revision ID: 0012_auth_recovery_2fa
Revises: 0011_occurrence_unique
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0012_auth_recovery_2fa'
down_revision: Union[str, Sequence[str], None] = '0011_occurrence_unique'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('password_reset_tokens',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('user_id', sa.String(), nullable=False),
    sa.Column('token_hash', sa.String(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('expires_at', sa.DateTime(), nullable=False),
    sa.Column('used_at', sa.DateTime(), nullable=True),
    sa.Column('requested_ip', sa.String(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('password_reset_tokens', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_password_reset_tokens_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_password_reset_tokens_user_id'), ['user_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_password_reset_tokens_token_hash'), ['token_hash'], unique=True)

    op.create_table('two_factor_recovery_codes',
    sa.Column('id', sa.String(), nullable=False),
    sa.Column('user_id', sa.String(), nullable=False),
    sa.Column('code_hash', sa.String(), nullable=False),
    sa.Column('created_at', sa.DateTime(), nullable=True),
    sa.Column('used_at', sa.DateTime(), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    with op.batch_alter_table('two_factor_recovery_codes', schema=None) as batch_op:
        batch_op.create_index(batch_op.f('ix_two_factor_recovery_codes_id'), ['id'], unique=False)
        batch_op.create_index(batch_op.f('ix_two_factor_recovery_codes_user_id'), ['user_id'], unique=False)

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('two_factor_enabled', sa.Boolean(), nullable=False,
                                      server_default=sa.false()))
        batch_op.add_column(sa.Column('totp_secret', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('totp_pending_secret', sa.String(), nullable=True))
        batch_op.add_column(sa.Column('totp_last_step', sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column('two_factor_enabled_at', sa.DateTime(), nullable=True))

    with op.batch_alter_table('companies', schema=None) as batch_op:
        batch_op.add_column(sa.Column('require_two_factor', sa.Boolean(), nullable=False,
                                      server_default=sa.false()))


def downgrade() -> None:
    with op.batch_alter_table('companies', schema=None) as batch_op:
        batch_op.drop_column('require_two_factor')

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('two_factor_enabled_at')
        batch_op.drop_column('totp_last_step')
        batch_op.drop_column('totp_pending_secret')
        batch_op.drop_column('totp_secret')
        batch_op.drop_column('two_factor_enabled')

    with op.batch_alter_table('two_factor_recovery_codes', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_two_factor_recovery_codes_user_id'))
        batch_op.drop_index(batch_op.f('ix_two_factor_recovery_codes_id'))
    op.drop_table('two_factor_recovery_codes')

    with op.batch_alter_table('password_reset_tokens', schema=None) as batch_op:
        batch_op.drop_index(batch_op.f('ix_password_reset_tokens_token_hash'))
        batch_op.drop_index(batch_op.f('ix_password_reset_tokens_user_id'))
        batch_op.drop_index(batch_op.f('ix_password_reset_tokens_id'))
    op.drop_table('password_reset_tokens')
