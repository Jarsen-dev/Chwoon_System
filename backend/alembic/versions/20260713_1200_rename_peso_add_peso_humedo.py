"""rename peso to peso_spec and add peso_humedo in caracteristicas_inyeccion

Revision ID: 20260713_peso_spec
Revises: 20260619_maquinas
Create Date: 2026-07-13 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '20260713_peso_spec'
down_revision: Union[str, None] = '20260619_maquinas'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Renombrar clave 'peso' -> 'peso_spec' dentro de caracteristicas_inyeccion
    op.execute("""
        UPDATE productos
        SET caracteristicas_inyeccion = (
            COALESCE(caracteristicas_inyeccion, '{}')::jsonb
            - 'peso'
        ) || jsonb_build_object(
            'peso_spec',
            COALESCE(caracteristicas_inyeccion, '{}')::jsonb -> 'peso'
        )
        WHERE clase_producto IN ('INYECCIÓN', 'INYECCION')
          AND caracteristicas_inyeccion::jsonb ? 'peso'
    """)

    # 2. Agregar 'peso_humedo' = null a registros de inyección que aún no lo tengan
    op.execute("""
        UPDATE productos
        SET caracteristicas_inyeccion = jsonb_set(
            COALESCE(caracteristicas_inyeccion, '{}')::jsonb,
            '{peso_humedo}',
            'null'
        )
        WHERE clase_producto IN ('INYECCIÓN', 'INYECCION')
          AND (caracteristicas_inyeccion IS NULL OR NOT (caracteristicas_inyeccion::jsonb ? 'peso_humedo'))
    """)


def downgrade() -> None:
    # 1. Revertir 'peso_spec' -> 'peso'
    op.execute("""
        UPDATE productos
        SET caracteristicas_inyeccion = (
            caracteristicas_inyeccion::jsonb - 'peso_spec'
        ) || jsonb_build_object(
            'peso',
            caracteristicas_inyeccion::jsonb -> 'peso_spec'
        )
        WHERE clase_producto IN ('INYECCIÓN', 'INYECCION')
          AND caracteristicas_inyeccion::jsonb ? 'peso_spec'
    """)

    # 2. Quitar 'peso_humedo'
    op.execute("""
        UPDATE productos
        SET caracteristicas_inyeccion = caracteristicas_inyeccion::jsonb - 'peso_humedo'
        WHERE clase_producto IN ('INYECCIÓN', 'INYECCION')
          AND caracteristicas_inyeccion::jsonb ? 'peso_humedo'
    """)
