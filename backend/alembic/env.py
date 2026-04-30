import os
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool
from alembic import context
from dotenv import load_dotenv

# ============================================================
# Setup de paths e imports
# ============================================================

# Agrega /app al sys.path para poder importar `app.*`
BASE_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE_DIR))

# Carga el .env del backend
load_dotenv(BASE_DIR / ".env")

# Importar Base y registrar todos los modelos
# (app/models/__init__.py ya importa todos los modelos al hacer `import app.models`)
from app.database import Base  # noqa: E402
import app.models  # noqa: E402, F401  # Importa todos los modelos automáticamente

# ============================================================
# Configuración de Alembic
# ============================================================

config = context.config

# Inyectar DATABASE_URL desde env, convirtiendo asyncpg → psycopg2
db_url = os.getenv("DATABASE_URL", "")
if db_url:
    db_url_sync = db_url.replace("+asyncpg", "+psycopg2")
    config.set_main_option("sqlalchemy.url", db_url_sync)

# Logging
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Metadata para autogenerate
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Modo offline: genera SQL sin conectarse a la DB."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Modo online: se conecta a la DB y ejecuta las migraciones."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,             # detecta cambios de tipo
            compare_server_default=True,   # detecta cambios de defaults
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()