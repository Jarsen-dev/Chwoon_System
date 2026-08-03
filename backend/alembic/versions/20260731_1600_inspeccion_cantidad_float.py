"""cantidad_inspeccionada de Integer a Float

Las etiquetas de lote traen cantidades Numeric(12,2) y lotes_inventario ya usa
Float; con Integer, inspeccionar una caja de 2.5 kg guardaba 2 o 3 en el
registro y en el PDF de la inspección.

Revision ID: 20260731_insp_cant_float
Revises: 20260731_etiquetas_rem
Create Date: 2026-07-31 16:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '20260731_insp_cant_float'
down_revision: Union[str, None] = '20260731_etiquetas_rem'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        'inspecciones', 'cantidad_inspeccionada',
        existing_type=sa.Integer(),
        type_=sa.Float(),
        existing_nullable=True,
        postgresql_using='cantidad_inspeccionada::double precision',
    )


def downgrade() -> None:
    # Vuelve a entero: las fracciones se redondean (pérdida esperada)
    op.alter_column(
        'inspecciones', 'cantidad_inspeccionada',
        existing_type=sa.Float(),
        type_=sa.Integer(),
        existing_nullable=True,
        postgresql_using='ROUND(cantidad_inspeccionada)::integer',
    )
