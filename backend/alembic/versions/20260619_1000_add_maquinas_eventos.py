"""add_maquinas_y_eventos

Revision ID: 20260619_maquinas
Revises: eb2fbe5b186d
Create Date: 2026-06-19 10:00:00.000000-06:00

Crea las tablas para la integración PLC/HMI de máquinas EPS:
  - maquinas: registro maestro de máquinas de planta
  - eventos:  eventos significativos (PIEZA, INCIDENCIA_*, CAMBIO_ESTADO)
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '20260619_maquinas'
down_revision: Union[str, None] = 'eb2fbe5b186d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'maquinas',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('codigo', sa.String(length=50), nullable=False),
        sa.Column('nombre', sa.String(length=120), nullable=False),
        sa.Column('linea', sa.String(length=50), nullable=True),
        sa.Column('tipo', sa.String(length=50), nullable=True),
        sa.Column('marca_plc', sa.String(length=50), nullable=True),
        sa.Column('ip_hmi', sa.String(length=50), nullable=True),
        sa.Column('umbral_incidencia_seg', sa.Integer(), nullable=True),
        sa.Column('activa', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_maquinas_id'), 'maquinas', ['id'], unique=False)
    op.create_index(op.f('ix_maquinas_codigo'), 'maquinas', ['codigo'], unique=True)

    op.create_table(
        'eventos',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('maquina_id', sa.Integer(), nullable=False),
        sa.Column('tipo_evento', sa.String(length=40), nullable=False),
        sa.Column('valor', sa.Integer(), nullable=True),
        sa.Column('estado', sa.String(length=20), nullable=True),
        sa.Column('operador', sa.String(length=100), nullable=True),
        sa.Column('turno', sa.String(length=10), nullable=True),
        sa.Column('fecha_turno', sa.String(length=20), nullable=True),
        sa.Column('metadata', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['maquina_id'], ['maquinas.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_eventos_id'), 'eventos', ['id'], unique=False)
    op.create_index(op.f('ix_eventos_maquina_id'), 'eventos', ['maquina_id'], unique=False)
    op.create_index(op.f('ix_eventos_tipo_evento'), 'eventos', ['tipo_evento'], unique=False)
    op.create_index(op.f('ix_eventos_turno'), 'eventos', ['turno'], unique=False)
    op.create_index(op.f('ix_eventos_fecha_turno'), 'eventos', ['fecha_turno'], unique=False)
    op.create_index(op.f('ix_eventos_created_at'), 'eventos', ['created_at'], unique=False)

    # Seed de la máquina piloto (idempotente: no falla si ya existe)
    op.execute(
        """
        INSERT INTO maquinas (codigo, nombre, linea, tipo, marca_plc, ip_hmi, umbral_incidencia_seg, activa)
        VALUES ('SHM-1234VS', 'Sunghoon SHM-1234VS', NULL, 'EPS', 'LS XBM', '192.168.0.132', 8, true)
        ON CONFLICT (codigo) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_eventos_created_at'), table_name='eventos')
    op.drop_index(op.f('ix_eventos_fecha_turno'), table_name='eventos')
    op.drop_index(op.f('ix_eventos_turno'), table_name='eventos')
    op.drop_index(op.f('ix_eventos_tipo_evento'), table_name='eventos')
    op.drop_index(op.f('ix_eventos_maquina_id'), table_name='eventos')
    op.drop_index(op.f('ix_eventos_id'), table_name='eventos')
    op.drop_table('eventos')

    op.drop_index(op.f('ix_maquinas_codigo'), table_name='maquinas')
    op.drop_index(op.f('ix_maquinas_id'), table_name='maquinas')
    op.drop_table('maquinas')
