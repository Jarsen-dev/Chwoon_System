"""add psi_snapshots table

Revision ID: 20260609_add_psi_snapshots
Revises: 20260608_add_no_departure
Create Date: 2026-06-09

Tabla para almacenar snapshots diarios del PSI RESUME importado desde
el archivo PLAN EMBARQUE de LG. Guarda coverage rates (Ref y Oven,
D-Day y D+1) para el dashboard de ventas.
"""

from alembic import op
import sqlalchemy as sa

revision = "20260609_add_psi_snapshots"
down_revision = "20260608_add_no_departure"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "psi_snapshots",
        sa.Column("id",                 sa.Integer(),         primary_key=True, index=True),
        sa.Column("fecha",              sa.Date(),            nullable=False, unique=True),
        sa.Column("coverage_ref_dday",  sa.Float(),           server_default="0"),
        sa.Column("coverage_ref_d1",    sa.Float(),           server_default="0"),
        sa.Column("coverage_oven_dday", sa.Float(),           server_default="0"),
        sa.Column("coverage_oven_d1",   sa.Float(),           server_default="0"),
        sa.Column("ref_need_dday",      sa.Integer(),         server_default="0"),
        sa.Column("ref_covered_dday",   sa.Integer(),         server_default="0"),
        sa.Column("ref_need_d1",        sa.Integer(),         server_default="0"),
        sa.Column("ref_covered_d1",     sa.Integer(),         server_default="0"),
        sa.Column("oven_need_dday",     sa.Integer(),         server_default="0"),
        sa.Column("oven_covered_dday",  sa.Integer(),         server_default="0"),
        sa.Column("oven_need_d1",       sa.Integer(),         server_default="0"),
        sa.Column("oven_covered_d1",    sa.Integer(),         server_default="0"),
        sa.Column("importado_por",      sa.String(100),       nullable=True),
        sa.Column("fecha_importacion",  sa.DateTime(timezone=True), nullable=True),
        sa.Column("raw_data",           sa.JSON(),            nullable=True),
    )
    op.create_index("ix_psi_snapshots_fecha", "psi_snapshots", ["fecha"])


def downgrade() -> None:
    op.drop_index("ix_psi_snapshots_fecha", table_name="psi_snapshots")
    op.drop_table("psi_snapshots")
