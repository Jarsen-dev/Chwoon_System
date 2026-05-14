"""add nombre to productos

Revision ID: 20260513_1500_add_nombre_productos
Revises: 20260511_1200_inyeccion
Create Date: 2026-05-13 15:00:00.000000-06:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20260513_1500_add_nombre'
down_revision: Union[str, None] = '20260511_1200_inyeccion'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('productos', sa.Column('nombre', sa.String(length=300), nullable=True, server_default=''))
    op.alter_column('productos', 'nombre', server_default=None)


def downgrade() -> None:
    op.drop_column('productos', 'nombre')
