"""add_firmas_orden_compra

Revision ID: add_firmas_orden_compra
Revises: add_iva_orden_compra
Create Date: 2026-06-03 10:15:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'add_firmas_orden_compra'
down_revision = 'add_iva_orden_compra'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('ordenes_compra', sa.Column('firma_compras', sa.String(length=200), nullable=True))
    op.add_column('ordenes_compra', sa.Column('fecha_firma_compras', sa.DateTime(timezone=True), nullable=True))
    op.add_column('ordenes_compra', sa.Column('firma_finanzas', sa.String(length=200), nullable=True))
    op.add_column('ordenes_compra', sa.Column('fecha_firma_finanzas', sa.DateTime(timezone=True), nullable=True))
    op.add_column('ordenes_compra', sa.Column('motivo_rechazo', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('ordenes_compra', 'motivo_rechazo')
    op.drop_column('ordenes_compra', 'fecha_firma_finanzas')
    op.drop_column('ordenes_compra', 'firma_finanzas')
    op.drop_column('ordenes_compra', 'fecha_firma_compras')
    op.drop_column('ordenes_compra', 'firma_compras')