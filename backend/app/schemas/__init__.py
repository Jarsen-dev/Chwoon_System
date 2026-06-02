from app.schemas.partes import Parte, ParteCreate, ParteUpdate
from app.schemas.cola import ColaItem, ColaItemCreate
from app.schemas.produccion import (
    RegistroProduccion, 
    RegistroProduccionCreate,
    PlanProduccion,
    PlanProduccionCreate,
    Anomalia,
    AnomaliaCreate,
    RegistroParo,
    RegistroParoCreate
)

# ── Empresa (importar modelos para que Alembic los detecte en Base.metadata) ──
from app.models.empresa import ConfiguracionEmpresa, ContactoEmpresa  # noqa: F401

__all__ = [
    "Parte", "ParteCreate", "ParteUpdate",
    "ColaItem", "ColaItemCreate",
    "RegistroProduccion", "RegistroProduccionCreate",
    "PlanProduccion", "PlanProduccionCreate",
    "Anomalia", "AnomaliaCreate",
    "RegistroParo", "RegistroParoCreate",
    "ConfiguracionEmpresa", "ContactoEmpresa",
]