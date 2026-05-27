"""add_zonas_y_lote_campos

Revision ID: 20260527_0900
Revises: 20260525_1437_scoring
Create Date: 2026-05-27 09:00:00

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20260527_0900'
down_revision: Union[str, None] = '20260525_1437_scoring'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ubicaciones
    op.add_column('ubicaciones', sa.Column('tipo_zona', sa.String(length=50), server_default='ALMACEN', nullable=False))
    op.add_column('ubicaciones', sa.Column('capacidad_max', sa.Float(), nullable=True))
    op.add_column('ubicaciones', sa.Column('permite_mixing', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('ubicaciones', sa.Column('activa', sa.Boolean(), server_default='true', nullable=False))

    # lotes_inventario
    op.add_column('lotes_inventario', sa.Column('bloqueado_por', sa.String(length=100), nullable=True))
    op.add_column('lotes_inventario', sa.Column('numero_remision', sa.String(length=100), nullable=True))
    op.add_column('lotes_inventario', sa.Column('fecha_caducidad', sa.Date(), nullable=True))
    op.add_column('lotes_inventario', sa.Column('lote_proveedor', sa.String(length=100), nullable=True))
    op.add_column('lotes_inventario', sa.Column('bultos', sa.Integer(), server_default='1', nullable=False))

    # seed existing ubicaciones based on name
    op.execute("""
        UPDATE ubicaciones SET tipo_zona = 'SILOS'
        WHERE upper(nombre) LIKE '%SILO%' OR upper(nombre) = 'SILOS'
    """)
    op.execute("""
        UPDATE ubicaciones SET tipo_zona = 'PRODUCCION'
        WHERE upper(nombre) LIKE '%LINEA%' OR upper(nombre) LIKE '%MAQ%'
    """)
    op.execute("""
        UPDATE ubicaciones SET tipo_zona = 'DOCK'
        WHERE upper(nombre) LIKE '%DOCK%'
    """)
    op.execute("""
        UPDATE ubicaciones SET tipo_zona = 'CUARENTENA'
        WHERE upper(nombre) LIKE '%CUARENTENA%'
    """)
    op.execute("""
        UPDATE ubicaciones SET tipo_zona = 'PICKING'
        WHERE upper(nombre) LIKE '%PICKING%' OR upper(nombre) LIKE '%STAGING%'
    """)
    op.execute("""
        UPDATE ubicaciones SET tipo_zona = 'EMBARQUE'
        WHERE upper(nombre) LIKE '%EMBARQUE%'
    """)
    op.execute("""
        UPDATE ubicaciones SET tipo_zona = 'SCRAP'
        WHERE upper(nombre) LIKE '%SCRAP%'
    """)


def downgrade() -> None:
    op.drop_column('lotes_inventario', 'bultos')
    op.drop_column('lotes_inventario', 'lote_proveedor')
    op.drop_column('lotes_inventario', 'fecha_caducidad')
    op.drop_column('lotes_inventario', 'numero_remision')
    op.drop_column('lotes_inventario', 'bloqueado_por')

    op.drop_column('ubicaciones', 'activa')
    op.drop_column('ubicaciones', 'permite_mixing')
    op.drop_column('ubicaciones', 'capacidad_max')
    op.drop_column('ubicaciones', 'tipo_zona')
