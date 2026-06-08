"""add no_departure to envios_venta and estado fields to ordenes_venta

Revision ID: a1b2c3d4e5f6
Revises: <pega aquí el ID de tu última migración>
Create Date: 2026-06-08

Cambios:
  - envios_venta.no_departure  VARCHAR(100) nullable  → folio NPX que asigna LG por embarque
  - ordenes_venta.estado       ya existe, solo documentamos los nuevos valores válidos
    Nuevos valores permitidos: "En Preparación", "Lista para Carga"
    (no hay cambio de columna — son valores de string, no enum de DB)
"""

from alembic import op
import sqlalchemy as sa

revision = "a1b2c3d4e5f6"
down_revision = "actualizacion_pipeline_ventas"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ------------------------------------------------------------------ #
    # 1. envios_venta — agregar no_departure                              #
    # ------------------------------------------------------------------ #
    op.add_column(
        "envios_venta",
        sa.Column("no_departure", sa.String(100), nullable=True),
    )

    # ------------------------------------------------------------------ #
    # 2. ordenes_venta — los nuevos estados "En Preparación" y            #
    #    "Lista para Carga" son valores de string, no requieren           #
    #    cambio de columna. Solo actualizamos el CHECK CONSTRAINT          #
    #    si tienes uno (la mayoría de proyectos FastAPI+SQLAlchemy no lo  #
    #    tienen). Si no tienes constraint, esta sección no hace nada.     #
    # ------------------------------------------------------------------ #
    # op.execute("""
    #     ALTER TABLE ordenes_venta
    #     DROP CONSTRAINT IF EXISTS ordenes_venta_estado_check;
    # """)
    # — No aplica: el proyecto usa String libre, sin CHECK CONSTRAINT.
    # Los estados válidos se controlan a nivel de negocio en el router.
    pass


def downgrade() -> None:
    op.drop_column("envios_venta", "no_departure")