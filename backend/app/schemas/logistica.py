from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# ==========================================
# EMBARQUES
# ==========================================
class EmbarqueItemRequest(BaseModel):
    lote_id: str
    sku: str
    cantidad: float


class CrearEmbarqueRequest(BaseModel):
    ov_id: str
    items: List[EmbarqueItemRequest]


class SalidaEmbarqueRequest(BaseModel):
    camion: str
    chofer: str
    departure: str


class EmbarqueResponse(BaseModel):
    id: int
    numero_embarque: str
    ov_id: str
    cliente_id: Optional[str] = None
    fecha_creacion: Optional[datetime] = None
    status: str
    items: list = []
    camion: Optional[str] = None
    chofer: Optional[str] = None
    departure: Optional[str] = None
    sku: Optional[str] = None
    nombre_producto: Optional[str] = None
    creado_por: Optional[str] = None

    class Config:
        from_attributes = True


# ==========================================
# REPORTE EMBARQUES
# ==========================================
class ReporteEmbarqueItem(BaseModel):
    item_id: str
    sku: str
    cantidad_solicitada: float
    cantidad_enviada: float
    diferencia: float
    porcentaje_en_transito: str
    total_embarcado_dia: float
    embarques_por_hora: dict = {}


# ==========================================
# DASHBOARD LOGÍSTICA
# ==========================================
class LogisticaDashboard(BaseModel):
    total_embarques: int = 0
    embarques_surtidos: int = 0
    embarques_en_transito: int = 0
    embarques_entregados: int = 0
    embarques_hoy: int = 0
    entregas_hoy: int = 0


# ==========================================
# LIMPIEZA
# ==========================================
class LimpiezaResponse(BaseModel):
    message: str
    eliminados: int = 0