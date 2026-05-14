"""remove nombre and linea_lg columns, keep modelo as main name field

Revision ID: 006_remove_nombre_linea_lg
Revises: 005_modelo_ciclo_prod
Create Date: 2026-05-08 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = '006_remove_nombre_linea_lg'
down_revision = '005_modelo_ciclo_prod'
branch_labels = None
depends_on = None


def column_exists(table_name, column_name):
    bind = op.get_bind()
    result = bind.execute(text(f"""
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = '{table_name}' AND column_name = '{column_name}'
    """))
    return result.fetchone() is not None


def upgrade() -> None:
    # 1. Eliminar columna nombre
    if column_exists('productos', 'nombre'):
        op.drop_column('productos', 'nombre')
    
    # 2. Eliminar columna linea_lg
    if column_exists('productos', 'linea_lg'):
        op.drop_column('productos', 'linea_lg')


def downgrade() -> None:
    # 1. Restaurar columna nombre
    if not column_exists('productos', 'nombre'):
        op.add_column('productos', sa.Column('nombre', sa.String(200), nullable=False, server_default=''))
        op.alter_column('productos', 'nombre', server_default=None)
    
    # 2. Restaurar columna linea_lg
    if not column_exists('productos', 'linea_lg'):
        op.add_column('productos', sa.Column('linea_lg', sa.String(20), default=''))