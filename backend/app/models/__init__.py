from app.models.parte import Parte
from app.models.inventario import InventarioPlanta          # ← AGREGAR
from app.models.cola_impresion import ColaImpresion
from app.models.registro_produccion import RegistroProduccion
from app.models.plan_produccion import PlanProduccion
from app.models.anomalia import Anomalia
from app.models.registro_paro import RegistroParo

__all__ = [
    "Parte",
    "InventarioPlanta",        # ← AGREGAR
    "ColaImpresion",
    "RegistroProduccion",
    "PlanProduccion",
    "Anomalia",
    "RegistroParo"
]