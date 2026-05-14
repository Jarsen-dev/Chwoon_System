"""inyeccion

Revision ID: 20260511_1200_inyeccion
Revises: 006_remove_nombre_linea_lg
Create Date: 2026-05-11 12:00:00.000000-06:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '20260511_1200_inyeccion'
down_revision: Union[str, None] = '006_remove_nombre_linea_lg'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('plan_inyeccion', sa.Column('cav', sa.Integer(), nullable=False, server_default='1'))
    op.create_table('registro_avance_inyeccion',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('plan_inyeccion_id', sa.Integer(), nullable=False),
        sa.Column('tiempo_ciclo', sa.Float(), nullable=False),
        sa.Column('contador_hora', sa.Integer(), nullable=False),
        sa.Column('produccion_total', sa.Integer(), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(['plan_inyeccion_id'], ['plan_inyeccion.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_registro_avance_inyeccion_id'), 'registro_avance_inyeccion', ['id'], unique=False)
    op.create_index(op.f('ix_registro_avance_inyeccion_plan_inyeccion_id'), 'registro_avance_inyeccion', ['plan_inyeccion_id'], unique=False)
    op.create_index(op.f('ix_registro_avance_inyeccion_timestamp'), 'registro_avance_inyeccion', ['timestamp'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_registro_avance_inyeccion_timestamp'), table_name='registro_avance_inyeccion')
    op.drop_index(op.f('ix_registro_avance_inyeccion_plan_inyeccion_id'), table_name='registro_avance_inyeccion')
    op.drop_index(op.f('ix_registro_avance_inyeccion_id'), table_name='registro_avance_inyeccion')
    op.drop_table('registro_avance_inyeccion')
    op.drop_column('plan_inyeccion', 'cav')