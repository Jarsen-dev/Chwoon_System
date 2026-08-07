from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import date, datetime


# ── Lote escaneable en IQC (etiqueta de una recepción por foto) ───────
class LoteEtiquetaOut(BaseModel):
    """Lo que IQC necesita al escanear el QR de una etiqueta de lote.

    Una etiqueta = una caja = un lote de inventario, así que `cantidad` es la
    de ESA caja, no la de la partida completa.
    """
    lote_id: str
    sku_producto: str
    nombre_producto: Optional[str] = None
    cantidad: float
    unidad_de_medida: Optional[str] = None
    secuencia: int
    total_etiquetas: int
    fecha_recepcion: date
    # Origen: la hoja de remisión física
    proveedor: str
    numero_remision: str
    po: Optional[str] = None
    fecha_hoja: date
    tipo_documento: str
    # Estado actual en inventario ("Pendiente IQC" | "Aprobado" | "Rechazado")
    estado_calidad: str


# ── Inspección ────────────────────────────────────────────────────────
class PuntoResultado(BaseModel):
    """Legado — los puntos de inspección del producto. Ya no se envía."""
    punto: str
    especificacion: Optional[str] = None
    resultado: str  # "Conforme" | "No Conforme"


class RespuestaInspeccion(BaseModel):
    pregunta: str
    respuesta: str                    # "Si" | "No"
    motivo: Optional[str] = None      # obligatorio cuando respuesta == "No"


class InspeccionCreate(BaseModel):
    lote_id: Optional[str] = None
    sku_producto: str
    nombre_producto: Optional[str] = None
    tipo_inspeccion: str  # IQC | LQC | OQC | DEVOLUCION
    resultado_final: str  # Aprobado | Rechazado | Cuarentena
    resultados_puntos: List[PuntoResultado] = []
    respuestas: List[RespuestaInspeccion] = []
    # Rutas devueltas por POST /calidad/incidencias/foto
    fotos: List[str] = []
    oc_origen: Optional[str] = None
    op_origen: Optional[str] = None
    cantidad_inspeccionada: Optional[float] = 0
    notas: Optional[str] = None


class SegundaRevisionCreate(BaseModel):
    ahora_ok: bool
    resultado: str                    # "Aprobado" | "Rechazado"
    notas: Optional[str] = None


class FotoIncidenciaOut(BaseModel):
    ruta: str


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
    respuestas: Any = []
    fotos: Any = []
    segunda_revision: Any = None
    oc_origen: Optional[str]
    op_origen: Optional[str]
    cantidad_inspeccionada: float
    notas: Optional[str]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


class InspeccionesPage(BaseModel):
    items: List[InspeccionResponse]
    total: int


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