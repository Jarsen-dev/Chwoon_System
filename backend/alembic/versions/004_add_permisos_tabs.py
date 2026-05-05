"""add permisos_tabs to usuarios

Revision ID: 004_add_permisos_tabs
Revises: 003_add_compras_ventas_roles
Create Date: 2025-01-02 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '004_add_permisos_tabs'
down_revision = '003_add_compras_ventas_roles'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'usuarios',
        sa.Column(
            'permisos_tabs',
            sa.JSON(),
            nullable=True,
            server_default=None,
        )
    )


def downgrade() -> None:
    op.drop_column('usuarios', 'permisos_tabs')