"""actualizacion_pipeline_ventas

Revision ID: actualizacion_pipeline_ventas
Revises: add_firmas_orden_compra
Create Date: 2026-06-05 13:40:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = 'actualizacion_pipeline_ventas'
down_revision = 'add_firmas_orden_compra'
branch_labels = None
depends_on = None

def upgrade() -> None:
    # Añadir campos logísticos al envío de la venta
    op.add_column('envios_venta', sa.Column('no_camion', sa.String(length=100), nullable=True))
    op.add_column('envios_venta', sa.Column('chofer', sa.String(length=200), nullable=True))
    op.add_column('envios_venta', sa.Column('status_salida', sa.String(length=50), nullable=True))
    
    # Añadir campo para conectar con la factura de Cheong Woon
    op.add_column('ordenes_venta', sa.Column('cw_invoice', sa.String(length=100), nullable=True))

def downgrade() -> None:
    op.drop_column('ordenes_venta', 'cw_invoice')
    op.drop_column('envios_venta', 'status_salida')
    op.drop_column('envios_venta', 'chofer')
    op.drop_column('envios_venta', 'no_camion')