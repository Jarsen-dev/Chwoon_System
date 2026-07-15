"""add ayudas_visuales table (PDFs de ayuda visual por producto, indexados por sku)

Revision ID: 20260715_ayudas_vis
Revises: 20260714_rm_peso_humedo
Create Date: 2026-07-15 12:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '20260715_ayudas_vis'
down_revision: Union[str, None] = '20260714_rm_peso_humedo'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'ayudas_visuales',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('sku', sa.String(length=50), nullable=False),
        sa.Column('nombre_archivo', sa.String(length=300), nullable=False),
        sa.Column('ruta', sa.String(length=600), nullable=False),
        sa.Column('codigo_av', sa.String(length=120), nullable=True),
        sa.Column('tiene_thumbnail', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('ruta'),
    )
    op.create_index(op.f('ix_ayudas_visuales_id'), 'ayudas_visuales', ['id'], unique=False)
    op.create_index(op.f('ix_ayudas_visuales_sku'), 'ayudas_visuales', ['sku'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_ayudas_visuales_sku'), table_name='ayudas_visuales')
    op.drop_index(op.f('ix_ayudas_visuales_id'), table_name='ayudas_visuales')
    op.drop_table('ayudas_visuales')
