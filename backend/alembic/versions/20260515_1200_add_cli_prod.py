"""add cliente to productos

Revision ID: 20260515_1200_add_cli_prod
Revises: 20260513_1600_aux_silo
Create Date: 2026-05-15 12:00:00.000000-06:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20260515_1200_add_cli_prod'
down_revision: Union[str, None] = '20260513_1600_aux_silo'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('productos', sa.Column('cliente', sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column('productos', 'cliente')
