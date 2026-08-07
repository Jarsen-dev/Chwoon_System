"""Elimina el flujo clásico de Recepciones (Almacén › Recepciones sobre OC)

Recepciones por Foto pasa a ser el único flujo de recepción, así que:

  1. Se borra `recepciones_compra` — la bitácora del flujo clásico. La tabla
     nunca fue creada por una migración (viene del `create_all` legacy anterior
     al baseline), por eso el downgrade la reconstruye a mano desde el modelo.
  2. Se borra `ordenes_compra_items.cantidad_recibida`: el único código que la
     incrementaba era el endpoint de recepción clásico.
  3. Se renombra el id del tab `recepciones-ocr` → `recepciones` dentro del JSON
     `usuarios.permisos_tabs`, porque el tab de foto hereda el nombre y el id
     del clásico.

Los registros de `recepciones_compra` se pierden de forma irreversible.

Revision ID: 20260807_del_recepciones
Revises: 20260807_insp_evaluacion
Create Date: 2026-08-07 14:00:00.000000

"""
import json
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '20260807_del_recepciones'
down_revision: Union[str, None] = '20260807_insp_evaluacion'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


TAB_VIEJO = 'recepciones-ocr'
TAB_NUEVO = 'recepciones'


def _remapear_permisos_tabs(desde: str, hacia: str) -> None:
    """Sustituye un id de tab por otro dentro de usuarios.permisos_tabs['almacen'].

    Deduplica preservando el orden: un usuario que tuviera los dos ids acaba con
    uno solo.
    """
    conn = op.get_bind()
    filas = conn.execute(sa.text(
        "SELECT id, permisos_tabs FROM usuarios WHERE permisos_tabs IS NOT NULL"
    )).fetchall()

    for user_id, permisos in filas:
        # La columna es JSON: psycopg2 la devuelve ya deserializada, pero si el
        # driver entregara texto lo parseamos igual.
        if isinstance(permisos, str):
            try:
                permisos = json.loads(permisos)
            except (ValueError, TypeError):
                continue
        if not isinstance(permisos, dict):
            continue

        tabs = permisos.get('almacen')
        if not isinstance(tabs, list) or desde not in tabs:
            continue

        nuevos = []
        for tab in tabs:
            tab = hacia if tab == desde else tab
            if tab not in nuevos:
                nuevos.append(tab)
        permisos['almacen'] = nuevos

        conn.execute(
            sa.text("UPDATE usuarios SET permisos_tabs = CAST(:p AS JSON) WHERE id = :id"),
            {"p": json.dumps(permisos), "id": user_id},
        )


def upgrade() -> None:
    op.drop_table('recepciones_compra')
    op.drop_column('ordenes_compra_items', 'cantidad_recibida')
    _remapear_permisos_tabs(TAB_VIEJO, TAB_NUEVO)


def downgrade() -> None:
    _remapear_permisos_tabs(TAB_NUEVO, TAB_VIEJO)

    op.add_column(
        'ordenes_compra_items',
        sa.Column('cantidad_recibida', sa.Float(), nullable=True, server_default='0'),
    )
    op.alter_column('ordenes_compra_items', 'cantidad_recibida', server_default=None)

    # Reconstruye la tabla vacía tal como estaba en el modelo. Los datos no se
    # recuperan.
    op.create_table(
        'recepciones_compra',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('recepcion_id', sa.String(length=50), nullable=False),
        sa.Column('orden_compra_id', sa.Integer(), nullable=False),
        sa.Column('oc_id', sa.String(length=50), nullable=False),
        sa.Column('sku_producto', sa.String(length=100), nullable=False),
        sa.Column('cantidad_recibida', sa.Float(), nullable=False),
        sa.Column('fecha_recepcion', sa.DateTime(timezone=True), nullable=True),
        sa.Column('recibido_por', sa.String(length=100), nullable=True),
        sa.Column('notas', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['orden_compra_id'], ['ordenes_compra.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_recepciones_compra_id', 'recepciones_compra', ['id'])
    op.create_index(
        'ix_recepciones_compra_recepcion_id', 'recepciones_compra', ['recepcion_id'], unique=True
    )
