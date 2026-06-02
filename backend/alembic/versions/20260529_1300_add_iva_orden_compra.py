"""add_iva_orden_compra

Revision ID: add_iva_orden_compra
Revises: add_proveedor_contacto_cols
Create Date: 2026-05-29 1300

"""
from alembic import op
import sqlalchemy as sa


revision = 'add_iva_orden_compra'
down_revision = 'add_proveedor_contacto_cols'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('ordenes_compra', sa.Column('iva', sa.Float(), nullable=False, server_default='0.0'))


def downgrade() -> None:
    op.drop_column('ordenes_compra', 'iva')
