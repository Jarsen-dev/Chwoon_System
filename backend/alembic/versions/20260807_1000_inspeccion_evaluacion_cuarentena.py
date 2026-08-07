"""Inspecciones: respuestas, fotos de evidencia y estado Cuarentena

Reemplaza los puntos de inspección por dos preguntas con motivo, agrega la
evidencia fotográfica (rutas relativas a static/) y el tercer resultado
posible, Cuarentena, que retiene el lote fuera de inventario hasta que una
segunda revisión lo cierre como Aprobado o Rechazado.

`resultados_puntos` se conserva intacto: el historial anterior al cambio se
sigue leyendo desde ahí.

Revision ID: 20260807_insp_evaluacion
Revises: 887b6cbdf40c
Create Date: 2026-08-07 10:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '20260807_insp_evaluacion'
down_revision: Union[str, None] = '887b6cbdf40c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # PostgreSQL 12+ permite ADD VALUE dentro de la transacción de la migración
    # siempre que el valor nuevo no se USE en esa misma transacción. Aquí solo
    # se declara; lo escribe el runtime, ya con la migración confirmada.
    op.execute("ALTER TYPE resultadoinspeccion ADD VALUE IF NOT EXISTS 'Cuarentena'")

    op.add_column('inspecciones', sa.Column('respuestas', sa.JSON(), nullable=True,
                                            server_default='[]'))
    op.add_column('inspecciones', sa.Column('fotos', sa.JSON(), nullable=True,
                                            server_default='[]'))
    op.add_column('inspecciones', sa.Column('segunda_revision', sa.JSON(), nullable=True))


def downgrade() -> None:
    # 'Cuarentena' no se quita: PostgreSQL no soporta DROP VALUE en un enum, y
    # recrear el tipo obligaría a reescribir la tabla. Queda como valor huérfano
    # sin filas que lo usen (las que lo tuvieran ya no se podrían representar).
    op.drop_column('inspecciones', 'segunda_revision')
    op.drop_column('inspecciones', 'fotos')
    op.drop_column('inspecciones', 'respuestas')
