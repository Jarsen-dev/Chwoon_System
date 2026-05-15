"""add proceso and maquina to planes_produccion

Revision ID: 20260515_1400_add_proceso_maquina_plan
Revises: 20260515_1200_add_cli_prod
Create Date: 2026-05-15 14:00:00.000000-06:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20260515_1400_add_proceso_maquina_plan'
down_revision: Union[str, None] = '20260515_1200_add_cli_prod'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('planes_produccion', sa.Column('proceso', sa.String(length=100), nullable=True))
    op.add_column('planes_produccion', sa.Column('maquina', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('planes_produccion', 'maquina')
    op.drop_column('planes_produccion', 'proceso')
