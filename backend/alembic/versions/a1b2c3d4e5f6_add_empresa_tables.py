"""add empresa tables

Revision ID: a1b2c3d4e5f6
Revises: 20260528_0900
Create Date: 2025-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '20260528_0900'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'configuracion_empresa',
        sa.Column('id',                  sa.Integer(),     primary_key=True),
        sa.Column('nombre',              sa.String(200),   nullable=False),
        sa.Column('rfc',                 sa.String(20),    nullable=True),
        sa.Column('direccion',           sa.Text(),        nullable=True),
        sa.Column('telefono',            sa.String(20),    nullable=True),
        sa.Column('email',               sa.String(100),   nullable=True),
        sa.Column('logo_url',            sa.String(500),   nullable=True),
        sa.Column('representante_legal', sa.String(200),   nullable=True),
        sa.Column('regimen_fiscal',      sa.String(200),   nullable=True),
        sa.Column('cp',                  sa.String(10),    nullable=True),
        sa.Column('ciudad',              sa.String(100),   nullable=True),
        sa.Column('estado',              sa.String(100),   nullable=True),
        sa.Column('pais',                sa.String(100),   nullable=True, server_default='México'),
        sa.Column('banco',               sa.String(200),   nullable=True),
        sa.Column('cuenta',              sa.String(50),    nullable=True),
        sa.Column('clabe',               sa.String(18),    nullable=True),
        sa.Column('created_at',          sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at',          sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        'contactos_empresa',
        sa.Column('id',           sa.Integer(),    primary_key=True),
        sa.Column('area',         sa.String(100),  nullable=False),
        sa.Column('nombre',       sa.String(200),  nullable=False),
        sa.Column('puesto',       sa.String(200),  nullable=True),
        sa.Column('telefono',     sa.String(20),   nullable=True),
        sa.Column('ext',          sa.String(10),   nullable=True),
        sa.Column('celular',      sa.String(20),   nullable=True),
        sa.Column('email',        sa.String(100),  nullable=True),
        sa.Column('es_principal', sa.Boolean(),    nullable=False, server_default='false'),
        sa.Column('horario',      sa.String(200),  nullable=True),
        sa.Column('notas',        sa.Text(),       nullable=True),
        sa.Column('activo',       sa.Boolean(),    nullable=False, server_default='true'),
        sa.Column('created_at',   sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at',   sa.DateTime(timezone=True), nullable=True),
    )

    op.create_index('ix_contactos_empresa_area', 'contactos_empresa', ['area'])


def downgrade() -> None:
    op.drop_index('ix_contactos_empresa_area', table_name='contactos_empresa')
    op.drop_table('contactos_empresa')
    op.drop_table('configuracion_empresa')