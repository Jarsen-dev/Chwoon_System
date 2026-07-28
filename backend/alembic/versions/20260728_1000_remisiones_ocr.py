"""add remisiones OCR tables (recepciones por foto + sesiones QR)

Revision ID: 20260728_remisiones_ocr
Revises: 20260716_sku_modelo_uq
Create Date: 2026-07-28 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '20260728_remisiones_ocr'
down_revision: Union[str, None] = '20260716_sku_modelo_uq'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'remisiones_recepcion',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('proveedor', sa.String(length=200), nullable=False),
        sa.Column('numero_remision', sa.String(length=100), nullable=False),
        sa.Column('po', sa.String(length=100), nullable=True),
        sa.Column('fecha', sa.Date(), nullable=False),
        sa.Column('tipo_documento', sa.String(length=80), nullable=False),
        sa.Column('foto_path', sa.String(length=255), nullable=False),
        sa.Column('ocr_raw', sa.JSON(), nullable=True),
        sa.Column('advertencias', sa.JSON(), nullable=True),
        sa.Column('creado_por', sa.String(length=100), nullable=False),
        sa.Column('fecha_captura', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_remisiones_recepcion_id'), 'remisiones_recepcion', ['id'], unique=False)
    op.create_index(op.f('ix_remisiones_recepcion_numero_remision'), 'remisiones_recepcion', ['numero_remision'], unique=False)
    op.create_index(op.f('ix_remisiones_recepcion_fecha_captura'), 'remisiones_recepcion', ['fecha_captura'], unique=False)

    op.create_table(
        'remisiones_recepcion_items',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('remision_id', sa.Integer(), nullable=False),
        sa.Column('numero_parte', sa.String(length=50), nullable=False),
        sa.Column('cantidad', sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column('descripcion', sa.String(length=255), nullable=True),
        sa.Column('unidad_de_medida', sa.String(length=50), nullable=True),
        sa.ForeignKeyConstraint(['remision_id'], ['remisiones_recepcion.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_remisiones_recepcion_items_id'), 'remisiones_recepcion_items', ['id'], unique=False)
    op.create_index(op.f('ix_remisiones_recepcion_items_remision_id'), 'remisiones_recepcion_items', ['remision_id'], unique=False)
    op.create_index(op.f('ix_remisiones_recepcion_items_numero_parte'), 'remisiones_recepcion_items', ['numero_parte'], unique=False)

    op.create_table(
        'remision_qr_sesiones',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('estado', sa.String(length=20), nullable=False),
        sa.Column('foto_path', sa.String(length=255), nullable=True),
        sa.Column('creado_por', sa.String(length=100), nullable=False),
        sa.Column('creado_en', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expira_en', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade() -> None:
    op.drop_table('remision_qr_sesiones')
    op.drop_index(op.f('ix_remisiones_recepcion_items_numero_parte'), table_name='remisiones_recepcion_items')
    op.drop_index(op.f('ix_remisiones_recepcion_items_remision_id'), table_name='remisiones_recepcion_items')
    op.drop_index(op.f('ix_remisiones_recepcion_items_id'), table_name='remisiones_recepcion_items')
    op.drop_table('remisiones_recepcion_items')
    op.drop_index(op.f('ix_remisiones_recepcion_fecha_captura'), table_name='remisiones_recepcion')
    op.drop_index(op.f('ix_remisiones_recepcion_numero_remision'), table_name='remisiones_recepcion')
    op.drop_index(op.f('ix_remisiones_recepcion_id'), table_name='remisiones_recepcion')
    op.drop_table('remisiones_recepcion')
