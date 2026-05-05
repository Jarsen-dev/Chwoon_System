"""add compras and ventas roles

Revision ID: 003_add_compras_ventas_roles
Revises: 5b0b45019a2a
Create Date: 2025-01-01 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers
revision = '003_add_compras_ventas_roles'
down_revision = '5b0b45019a2a'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # PostgreSQL no permite ALTER TYPE dentro de una transacción activa
    # con ADD VALUE, por eso usamos COMMIT explícito vía raw connection
    op.execute("ALTER TYPE rolusuario ADD VALUE IF NOT EXISTS 'compras'")
    op.execute("ALTER TYPE rolusuario ADD VALUE IF NOT EXISTS 'ventas'")


def downgrade() -> None:
    # PostgreSQL no soporta DROP VALUE de enums directamente.
    # El downgrade requiere recrear el tipo completo sin los valores.
    # En producción se recomienda no hacer downgrade de enums.
    # Si se necesita, ejecutar manualmente:
    #
    # 1. ALTER TABLE usuarios ALTER COLUMN rol TYPE VARCHAR(50);
    # 2. DROP TYPE rolusuario;
    # 3. CREATE TYPE rolusuario AS ENUM ('admin','supervisor','operador',
    #                                    'finanzas','calidad','almacen','logistica');
    # 4. UPDATE usuarios SET rol='operador' WHERE rol IN ('compras','ventas');
    # 5. ALTER TABLE usuarios ALTER COLUMN rol TYPE rolusuario
    #       USING rol::rolusuario;
    pass