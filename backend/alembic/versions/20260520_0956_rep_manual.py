"""rep_manual

Revision ID: rep_manual
Revises: 20260515_1500_fix_alembic_v
Create Date: 2026-05-20 09:56:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = 'rep_manual'
down_revision = '20260515_1500_fix_alembic_v'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'reportes_manuales_inyeccion',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('fecha', sa.DateTime(), nullable=True),
        sa.Column('turno', sa.String(length=10), nullable=False),
        sa.Column('numero_parte', sa.String(length=100), nullable=False),
        sa.Column('descripcion', sa.String(length=300), nullable=True),
        sa.Column('cliente', sa.String(length=200), nullable=True),
        sa.Column('resina', sa.String(length=10), nullable=False),
        sa.Column('proceso', sa.String(length=20), nullable=False),
        sa.Column('peso', sa.Float(), nullable=True),
        sa.Column('cav_bom', sa.Integer(), nullable=True),
        sa.Column('ciclo', sa.Float(), nullable=True),
        sa.Column('type', sa.String(length=50), nullable=True),
        sa.Column('maquina', sa.String(length=50), nullable=True),
        sa.Column('cav_real', sa.Integer(), nullable=True),
        sa.Column('ciclo_real', sa.Float(), nullable=True),
        sa.Column('tiempo_trabajo', sa.Float(), nullable=True),
        sa.Column('produccion_total', sa.Integer(), nullable=True),
        # paros
        sa.Column('cambio_molde', sa.Float(), nullable=True),
        sa.Column('ajustes', sa.Float(), nullable=True),
        sa.Column('arranque_paro', sa.Float(), nullable=True),
        sa.Column('mantenimiento', sa.Float(), nullable=True),
        sa.Column('molde_danado', sa.Float(), nullable=True),
        sa.Column('falta_personal', sa.Float(), nullable=True),
        sa.Column('falta_material', sa.Float(), nullable=True),
        sa.Column('otro_paro', sa.Float(), nullable=True),
        # sub-motivos mantenimiento
        sa.Column('soldar_puerta_ejector', sa.Float(), nullable=True),
        sa.Column('estopero', sa.Float(), nullable=True),
        sa.Column('bomba_hidraulica', sa.Float(), nullable=True),
        sa.Column('motor_hidraulico', sa.Float(), nullable=True),
        sa.Column('manguera_hidraulica', sa.Float(), nullable=True),
        sa.Column('valvula_hidraulica', sa.Float(), nullable=True),
        sa.Column('reloj', sa.Float(), nullable=True),
        sa.Column('caldera', sa.Float(), nullable=True),
        sa.Column('sensor_seguridad', sa.Float(), nullable=True),
        sa.Column('falta_aire', sa.Float(), nullable=True),
        sa.Column('fuga_aceite', sa.Float(), nullable=True),
        sa.Column('electrico', sa.Float(), nullable=True),
        sa.Column('tolva_tapada', sa.Float(), nullable=True),
        sa.Column('extra', sa.Float(), nullable=True),
        # scrap
        sa.Column('scrap_falta_llenado', sa.Integer(), nullable=True),
        sa.Column('scrap_cruda', sa.Integer(), nullable=True),
        sa.Column('scrap_quebrada', sa.Integer(), nullable=True),
        sa.Column('scrap_hinchada', sa.Integer(), nullable=True),
        sa.Column('scrap_arranque', sa.Integer(), nullable=True),
        sa.Column('scrap_fuera_dimension', sa.Integer(), nullable=True),
        sa.Column('scrap_pandeada', sa.Integer(), nullable=True),
        sa.Column('scrap_aplastada_molde', sa.Integer(), nullable=True),
        # calculados
        sa.Column('scrap_total', sa.Integer(), nullable=True),
        sa.Column('scrap_kg', sa.Float(), nullable=True),
        sa.Column('tiempo_paro_total', sa.Float(), nullable=True),
        sa.Column('cm', sa.Float(), nullable=True),
        sa.Column('produccion_buena', sa.Integer(), nullable=True),
        sa.Column('produccion_kg', sa.Float(), nullable=True),
        sa.Column('produccion_meta_total', sa.Float(), nullable=True),
        sa.Column('produccion_meta_kg', sa.Float(), nullable=True),
        sa.Column('produccion_porcentaje', sa.Float(), nullable=True),
        sa.Column('scrap_porcentaje', sa.Float(), nullable=True),
        # timestamps
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_reportes_manuales_inyeccion_id'), 'reportes_manuales_inyeccion', ['id'], unique=False)
    op.create_index(op.f('ix_reportes_manuales_inyeccion_numero_parte'), 'reportes_manuales_inyeccion', ['numero_parte'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_reportes_manuales_inyeccion_numero_parte'), table_name='reportes_manuales_inyeccion')
    op.drop_index(op.f('ix_reportes_manuales_inyeccion_id'), table_name='reportes_manuales_inyeccion')
    op.drop_table('reportes_manuales_inyeccion')
