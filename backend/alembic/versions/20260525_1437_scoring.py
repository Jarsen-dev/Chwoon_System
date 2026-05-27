"""add_proveedor_scoring_fields_and_eventos_table

Revision ID: 20260525_1437_scoring
Revises: aa86a080294c
Create Date: 2026-05-25 14:37:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '20260525_1437_scoring'
down_revision = 'aa86a080294c'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('proveedores', sa.Column('score_calidad', sa.Float(), nullable=True))
    op.add_column('proveedores', sa.Column('score_detalle', postgresql.JSON(astext_type=sa.Text()), nullable=True))
    op.add_column('proveedores', sa.Column('dias_credito', sa.Integer(), nullable=True))
    op.add_column('proveedores', sa.Column('score_updated_at', sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        'proveedor_eventos',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('proveedor_id', sa.Integer(), sa.ForeignKey('proveedores.id', ondelete='CASCADE'), nullable=False),
        sa.Column('tipo_evento', sa.String(length=50), nullable=False),
        sa.Column('impacto', sa.Float(), nullable=False),
        sa.Column('referencia_id', sa.String(length=100), nullable=True),
        sa.Column('descripcion', sa.String(length=500), nullable=True),
        sa.Column('fecha', sa.DateTime(timezone=True), nullable=True),
        sa.Column('registrado_por', sa.String(length=100), nullable=True),
    )


def downgrade() -> None:
    op.drop_table('proveedor_eventos')
    op.drop_column('proveedores', 'score_updated_at')
    op.drop_column('proveedores', 'dias_credito')
    op.drop_column('proveedores', 'score_detalle')
    op.drop_column('proveedores', 'score_calidad')
