"""formato en impresion_trabajos y zpl nullable

Segundo destino de impresión: la HP de red imprime las etiquetas en hoja carta
(PDF por TCP 9100, sin agente). Esos trabajos no llevan ZPL, de ahí que la
columna pase a nullable; `formato` distingue cuáles puede reclamar el agente de
Windows.

Revision ID: 20260803_impresion_fmt
Revises: 20260731_insp_cant_float
Create Date: 2026-08-03 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '20260803_impresion_fmt'
down_revision: Union[str, None] = '20260731_insp_cant_float'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # server_default para que las filas existentes queden marcadas como ZPL;
    # se retira después, el default lo pone el modelo.
    op.add_column(
        'impresion_trabajos',
        sa.Column('formato', sa.String(length=10), nullable=False, server_default='zpl'),
    )
    op.alter_column('impresion_trabajos', 'formato', server_default=None)
    op.create_index(
        op.f('ix_impresion_trabajos_formato'), 'impresion_trabajos', ['formato'],
    )
    op.alter_column(
        'impresion_trabajos', 'zpl',
        existing_type=sa.Text(),
        nullable=True,
    )


def downgrade() -> None:
    # Los trabajos de hoja carta no tienen ZPL que recuperar: se borran antes de
    # devolver la columna a NOT NULL.
    op.execute("DELETE FROM impresion_trabajos WHERE formato <> 'zpl' OR zpl IS NULL")
    op.alter_column(
        'impresion_trabajos', 'zpl',
        existing_type=sa.Text(),
        nullable=False,
    )
    op.drop_index(op.f('ix_impresion_trabajos_formato'), table_name='impresion_trabajos')
    op.drop_column('impresion_trabajos', 'formato')
