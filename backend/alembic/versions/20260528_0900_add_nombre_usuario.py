"""add_nombre_usuario

Revision ID: 20260528_0900
Revises: 20260527_0900
Create Date: 2026-05-28 09:00:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20260528_0900'
down_revision: Union[str, None] = '20260527_0900'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('usuarios', sa.Column('nombre', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('usuarios', 'nombre')
