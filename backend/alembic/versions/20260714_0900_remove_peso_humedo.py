"""remove peso_humedo key from caracteristicas_inyeccion, add cutting/molde id_proceso options (data-only, no schema impact)

Revision ID: 20260714_rm_peso_humedo
Revises: 20260713_resina_idproc
Create Date: 2026-07-14 09:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '20260714_rm_peso_humedo'
down_revision: Union[str, None] = '20260713_resina_idproc'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Quitar la clave 'peso_humedo' de caracteristicas_inyeccion en cualquier fila que la tenga
    op.execute("""
        UPDATE productos
        SET caracteristicas_inyeccion = caracteristicas_inyeccion::jsonb - 'peso_humedo'
        WHERE caracteristicas_inyeccion::jsonb ? 'peso_humedo'
    """)


def downgrade() -> None:
    # Reinsertar 'peso_humedo' = null en productos de inyección que no la tengan
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
