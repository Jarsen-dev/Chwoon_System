from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime


# ── Inspección ────────────────────────────────────────────────────────
class PuntoResultado(BaseModel):
    punto: str
    especificacion: Optional[str] = None
    resultado: str  # "Conforme" | "No Conforme"


class InspeccionCreate(BaseModel):
    lote_id: Optional[str] = None
    sku_producto: str
    nombre_producto: Optional[str] = None
    tipo_inspeccion: str  # IQC | LQC | OQC | DEVOLUCION
    resultado_final: str  # Aprobado | Rechazado
    resultados_puntos: List[PuntoResultado] = []
    oc_origen: Optional[str] = None
    op_origen: Optional[str] = None
    cantidad_inspeccionada: Optional[int] = 0
    notas: Optional[str] = None


class InspeccionResponse(BaseModel):
    id: int
    inspeccion_id: str
    lote_id: Optional[str]
    sku_producto: Optional[str]
    nombre_producto: Optional[str]
    tipo_inspeccion: str
    fecha: Optional[datetime]
    inspector: str
    resultado_final: str
    resultados_puntos: Any
    oc_origen: Optional[str]
    op_origen: Optional[str]
    cantidad_inspeccionada: int
    notas: Optional[str]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


# ── Scrap ─────────────────────────────────────────────────────────────
class ScrapCreate(BaseModel):
    sku_producto: str
    nombre_producto: Optional[str] = None
    lote_id: Optional[str] = None
    cantidad: float
    motivo: Optional[str] = None
    origen: str  # Produccion | Inventario | Devolucion
    referencia: Optional[str] = None


class ScrapResponse(BaseModel):
    id: int
    scrap_id: str
    fecha: Optional[datetime]
    sku_producto: str
    nombre_producto: Optional[str]
    lote_id: Optional[str]
    cantidad: float
    motivo: Optional[str]
    origen: str
    referencia: Optional[str]
    registrado_por: Optional[str]

    class Config:
        from_attributes = True


# ── Dashboard ─────────────────────────────────────────────────────────
class CalidadDashboard(BaseModel):
    total_inspecciones: int = 0
    inspecciones_hoy: int = 0
    iqc_total: int = 0
    iqc_aprobadas: int = 0
    iqc_rechazadas: int = 0
    lqc_total: int = 0
    lqc_aprobadas: int = 0
    lqc_rechazadas: int = 0
    oqc_total: int = 0
    oqc_aprobadas: int = 0
    oqc_rechazadas: int = 0
    dev_total: int = 0
    scrap_hoy: float = 0
    scrap_mes: float = 0
    tasa_aprobacion: float = 0