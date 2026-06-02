"""add_proveedor_contacto_columns

Revision ID: add_proveedor_contacto_cols
Revises: a1b2c3d4e5f6
Create Date: 2026-05-29 1200

"""
from alembic import op
import sqlalchemy as sa


revision = 'add_proveedor_contacto_cols'
down_revision = 'a1b2c3d4e5f6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('proveedores', sa.Column('direccion', sa.String(300), nullable=True))
    op.add_column('proveedores', sa.Column('nombre_ventas', sa.String(100), nullable=True))
    op.add_column('proveedores', sa.Column('numero_contacto', sa.String(20), nullable=True))
    op.add_column('proveedores', sa.Column('correo_contacto', sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column('proveedores', 'correo_contacto')
    op.drop_column('proveedores', 'numero_contacto')
    op.drop_column('proveedores', 'nombre_ventas')
    op.drop_column('proveedores', 'direccion')
