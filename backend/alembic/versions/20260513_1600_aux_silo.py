"""add aux_silo to plan_inyeccion

Revision ID: 20260513_1600_aux_silo
Revises: 20260513_1500_add_nombre
Create Date: 2026-05-13 16:00:00.000000-06:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20260513_1600_aux_silo'
down_revision: Union[str, None] = '20260513_1500_add_nombre'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('plan_inyeccion', sa.Column('aux_silo', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('plan_inyeccion', 'aux_silo')
