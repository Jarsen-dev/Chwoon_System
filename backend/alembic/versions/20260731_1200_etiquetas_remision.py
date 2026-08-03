"""add etiquetas de lote por remisión + cola de impresión RAW

Revision ID: 20260731_etiquetas_rem
Revises: 20260728_remisiones_ocr
Create Date: 2026-07-31 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '20260731_etiquetas_rem'
down_revision: Union[str, None] = '20260728_remisiones_ocr'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'remisiones_etiquetas',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('remision_id', sa.Integer(), nullable=False),
        sa.Column('item_id', sa.Integer(), nullable=False),
        sa.Column('lote_id', sa.String(length=120), nullable=False),
        sa.Column('numero_parte', sa.String(length=50), nullable=False),
        sa.Column('descripcion', sa.String(length=255), nullable=True),
        sa.Column('cantidad', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('unidad_de_medida', sa.String(length=50), nullable=True),
        sa.Column('secuencia', sa.Integer(), nullable=False),
        sa.Column('fecha_recepcion', sa.Date(), nullable=False),
        sa.Column('creado_por', sa.String(length=100), nullable=False),
        sa.Column('creado_en', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['remision_id'], ['remisiones_recepcion.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['item_id'], ['remisiones_recepcion_items.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_remisiones_etiquetas_id'), 'remisiones_etiquetas', ['id'], unique=False)
    op.create_index(op.f('ix_remisiones_etiquetas_remision_id'), 'remisiones_etiquetas', ['remision_id'], unique=False)
    op.create_index(op.f('ix_remisiones_etiquetas_item_id'), 'remisiones_etiquetas', ['item_id'], unique=False)
    op.create_index(op.f('ix_remisiones_etiquetas_numero_parte'), 'remisiones_etiquetas', ['numero_parte'], unique=False)
    # único: el lote_id se escanea desde el QR, tiene que identificar un solo bulto
    op.create_index(op.f('ix_remisiones_etiquetas_lote_id'), 'remisiones_etiquetas', ['lote_id'], unique=True)

    op.create_table(
        'impresion_trabajos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('etiqueta_id', sa.Integer(), nullable=True),
        sa.Column('impresora', sa.String(length=120), nullable=False),
        sa.Column('zpl', sa.Text(), nullable=False),
        sa.Column('estado', sa.String(length=20), nullable=False),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('creado_por', sa.String(length=100), nullable=False),
        sa.Column('creado_en', sa.DateTime(timezone=True), nullable=False),
        sa.Column('enviado_en', sa.DateTime(timezone=True), nullable=True),
        sa.Column('terminado_en', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['etiqueta_id'], ['remisiones_etiquetas.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_impresion_trabajos_id'), 'impresion_trabajos', ['id'], unique=False)
    op.create_index(op.f('ix_impresion_trabajos_etiqueta_id'), 'impresion_trabajos', ['etiqueta_id'], unique=False)
    op.create_index(op.f('ix_impresion_trabajos_impresora'), 'impresion_trabajos', ['impresora'], unique=False)
    op.create_index(op.f('ix_impresion_trabajos_estado'), 'impresion_trabajos', ['estado'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_impresion_trabajos_estado'), table_name='impresion_trabajos')
    op.drop_index(op.f('ix_impresion_trabajos_impresora'), table_name='impresion_trabajos')
    op.drop_index(op.f('ix_impresion_trabajos_etiqueta_id'), table_name='impresion_trabajos')
    op.drop_index(op.f('ix_impresion_trabajos_id'), table_name='impresion_trabajos')
    op.drop_table('impresion_trabajos')
    op.drop_index(op.f('ix_remisiones_etiquetas_lote_id'), table_name='remisiones_etiquetas')
    op.drop_index(op.f('ix_remisiones_etiquetas_numero_parte'), table_name='remisiones_etiquetas')
    op.drop_index(op.f('ix_remisiones_etiquetas_item_id'), table_name='remisiones_etiquetas')
    op.drop_index(op.f('ix_remisiones_etiquetas_remision_id'), table_name='remisiones_etiquetas')
    op.drop_index(op.f('ix_remisiones_etiquetas_id'), table_name='remisiones_etiquetas')
    op.drop_table('remisiones_etiquetas')
