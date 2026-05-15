"""fix alembic version column size

Revision ID: 20260515_1500_fix_alembic_v
Revises: 20260515_1400_add_proc_maq
Create Date: 2026-05-15 15:00:00.000000-06:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20260515_1500_fix_alembic_v'
down_revision: Union[str, None] = '20260515_1400_add_proc_maq'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE varchar(100)")


def downgrade() -> None:
    op.execute("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE varchar(32)")
