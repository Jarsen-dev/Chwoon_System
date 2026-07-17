"""replace unique(sku) with composite unique(sku, modelo) on productos

Revision ID: 20260716_sku_modelo_uq
Revises: 20260715_ayudas_vis
Create Date: 2026-07-16 09:00:00.000000

"""
from typing import Sequence, Union
from alembic import op

# revision identifiers, used by Alembic.
revision: str = '20260716_sku_modelo_uq'
down_revision: Union[str, None] = '20260715_ayudas_vis'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_index('ix_productos_sku', table_name='productos')
    op.create_index('ix_productos_sku', 'productos', ['sku'], unique=False)
    op.create_unique_constraint('uq_productos_sku_modelo', 'productos', ['sku', 'modelo'])


def downgrade() -> None:
    op.drop_constraint('uq_productos_sku_modelo', 'productos', type_='unique')
    op.drop_index('ix_productos_sku', table_name='productos')
    op.create_index('ix_productos_sku', 'productos', ['sku'], unique=True)
