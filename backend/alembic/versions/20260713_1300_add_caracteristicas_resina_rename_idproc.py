"""add caracteristicas_resina column, rename id_proceso VENTA->PACKING, CORTE->BLOCK

Revision ID: 20260713_resina_idproc
Revises: 20260713_peso_spec
Create Date: 2026-07-13 13:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '20260713_resina_idproc'
down_revision: Union[str, None] = '20260713_peso_spec'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Nueva columna caracteristicas_resina (mismo patrón que caracteristicas_inyeccion)
    op.add_column('productos', sa.Column('caracteristicas_resina', sa.JSON(), nullable=True))
    op.execute("UPDATE productos SET caracteristicas_resina = '{}' WHERE caracteristicas_resina IS NULL")

    # 2. Renombrar valores de id_proceso: VENTA -> PACKING, CORTE -> BLOCK
    op.execute("""
        UPDATE productos
        SET caracteristicas_inyeccion = jsonb_set(
            caracteristicas_inyeccion::jsonb, '{id_proceso}', '"PACKING"'
        )
        WHERE clase_producto IN ('INYECCIÓN', 'INYECCION')
          AND caracteristicas_inyeccion::jsonb ->> 'id_proceso' = 'VENTA'
    """)
    op.execute("""
        UPDATE productos
        SET caracteristicas_inyeccion = jsonb_set(
            caracteristicas_inyeccion::jsonb, '{id_proceso}', '"BLOCK"'
        )
        WHERE clase_producto IN ('INYECCIÓN', 'INYECCION')
          AND caracteristicas_inyeccion::jsonb ->> 'id_proceso' = 'CORTE'
    """)


def downgrade() -> None:
    # 1. Revertir valores de id_proceso: PACKING -> VENTA, BLOCK -> CORTE
    op.execute("""
        UPDATE productos
        SET caracteristicas_inyeccion = jsonb_set(
            caracteristicas_inyeccion::jsonb, '{id_proceso}', '"VENTA"'
        )
        WHERE clase_producto IN ('INYECCIÓN', 'INYECCION')
          AND caracteristicas_inyeccion::jsonb ->> 'id_proceso' = 'PACKING'
    """)
    op.execute("""
        UPDATE productos
        SET caracteristicas_inyeccion = jsonb_set(
            caracteristicas_inyeccion::jsonb, '{id_proceso}', '"CORTE"'
        )
        WHERE clase_producto IN ('INYECCIÓN', 'INYECCION')
          AND caracteristicas_inyeccion::jsonb ->> 'id_proceso' = 'BLOCK'
    """)

    # 2. Quitar columna caracteristicas_resina
    op.drop_column('productos', 'caracteristicas_resina')
