"""baseline initial schema

Revision ID: b07f06943d3b
Revises:
Create Date: 2026-04-30 08:45:04.452831-06:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b07f06943d3b'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Baseline: representa el estado inicial de la DB.
    # No ejecuta cambios porque las tablas ya existen.
    pass


def downgrade() -> None:
    # No se puede revertir un baseline.
    pass
