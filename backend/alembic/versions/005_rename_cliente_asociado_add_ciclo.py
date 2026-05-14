"""rename cliente_asociado to modelo, add ciclo to caracteristicas_inyeccion

Revision ID: 005_modelo_ciclo_prod
Revises: d5c8fa4b3aa0
Create Date: 2026-05-08 08:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '005_modelo_ciclo_prod'
down_revision = 'd5c8fa4b3aa0'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Renombrar columna cliente_asociado → modelo
    op.alter_column('productos', 'cliente_asociado', new_column_name='modelo')
    
    # 2. Actualizar registros existentes: migrar caracteristicas_inyeccion.ciclo si no existe
    #    (PostgreSQL JSONB/JSON no requiere alter table para nuevas keys en JSON)
    #    Solo aseguramos que los registros existentes tengan ciclo=null si no lo tienen
    op.execute("""
        UPDATE productos 
        SET caracteristicas_inyeccion = jsonb_set(
            COALESCE(caracteristicas_inyeccion, '{}')::jsonb,
            '{ciclo}',
            'null'
        )
        WHERE clase_producto IN ('INYECCIÓN', 'INYECCION') 
          AND (caracteristicas_inyeccion IS NULL OR NOT (caracteristicas_inyeccion::jsonb ? 'ciclo'))
    """)


def downgrade() -> None:
    # 1. Revertir nombre de columna
    op.alter_column('productos', 'modelo', new_column_name='cliente_asociado')
    
    # 2. Opcional: quitar ciclo de JSON (no estrictamente necesario pero limpio)
    op.execute("""
        UPDATE productos 
        SET caracteristicas_inyeccion = caracteristicas_inyeccion::jsonb - 'ciclo'
        WHERE caracteristicas_inyeccion::jsonb ? 'ciclo'
    """)