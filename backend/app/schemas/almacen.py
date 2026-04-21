from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime


# ==========================================
# UBICACIONES
# ==========================================
class UbicacionCreate(BaseModel):
    nombre: str
    parent_id: Optional[int] = None

class UbicacionUpdate(BaseModel):
    nombre: str

class UbicacionResponse(BaseModel):
    id: int
    nombre: str
    parent_id: Optional[int] = None

    class Config:
        from_attributes = True


# ==========================================
# LOTES DE INVENTARIO
# ==========================================
class LoteInventarioResponse(BaseModel):
    id: int
    lote_id: str
    sku_producto: str
    cantidad_actual: float
    cantidad_inicial: float
    ubicacion_id: Optional[int] = None
    nombre_ubicacion: Optional[str] = None
    nombre_producto: Optional[str] = None
    tipo_producto: Optional[str] = None
    clase_producto: Optional[str] = None
    fecha_recepcion: Optional[datetime] = None
    oc_origen: Optional[str] = None
    op_origen: Optional[str] = None
    ov_origen: Optional[str] = None
    estado_calidad: str = "Pendiente IQC"
    carrito_id: Optional[str] = None
    lote_produccion_origen: Optional[str] = None
    motivo_devolucion: Optional[str] = None

    class Config:
        from_attributes = True


class RecepcionMaterialItem(BaseModel):
    sku_producto: str
    cantidad_recibida: float

class RecepcionMaterialRequest(BaseModel):
    oc_id: str
    items: List[RecepcionMaterialItem]


class TransferenciaItem(BaseModel):
    lote_id: str
    sku_producto: str
    destino_id: int
    destino_nombre: str

class TransferenciaBatchRequest(BaseModel):
    transferencias: List[TransferenciaItem]


class AjusteLoteRequest(BaseModel):
    nueva_cantidad: float
    motivo: str
    responsable: str


class ScrapInventarioRequest(BaseModel):
    cantidad_scrap: float
    motivo: str
    responsable: str


class TransferenciaEntreUbicacionesRequest(BaseModel):
    sku: str
    nombre_producto: str
    cantidad: float
    origen_nombre: str
    destino_nombre: str


class ConsumoFifoRequest(BaseModel):
    sku: str
    cantidad: float
    detalles: dict = {}
    ubicacion_priorizada: Optional[str] = None


# ==========================================
# MOVIMIENTOS
# ==========================================
class MovimientoLoteResponse(BaseModel):
    id: int
    lote_id: str
    fecha: Optional[datetime] = None
    tipo: str
    cantidad: float
    detalles: dict = {}

    class Config:
        from_attributes = True


# ==========================================
# INVENTARIO CONSOLIDADO
# ==========================================
class InventarioConsolidadoResponse(BaseModel):
    sku: str
    nombre: Optional[str] = None
    tipo: Optional[str] = None
    clase_producto: Optional[str] = None
    stock_total: float = 0
    stock_por_ubicacion_agregado: dict = {}
    stock_por_ubicacion_detalle: dict = {}
    en_compra: float = 0
    en_produccion: float = 0


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
# TRASLADOS A PRODUCCIÓN
# ==========================================
class TrasladoProduccionItemRequest(BaseModel):
    sku: str
    cantidad: float

class CrearTrasladoProduccionRequest(BaseModel):
    op_id: str
    plan_de_consumo: List[TrasladoProduccionItemRequest]
    linea_produccion: Optional[str] = None

class MovimientoParcialItem(BaseModel):
    sku: str
    cantidad_a_mover: float

class EjecutarMovimientoParcialRequest(BaseModel):
    movimientos: List[MovimientoParcialItem]
    autorizador: str


class TrasladoProduccionResponse(BaseModel):
    id: int
    id_traslado: str
    op_id_origen: str
    linea_produccion_destino: Optional[str] = None
    fecha_creacion: Optional[datetime] = None
    status: str
    items: list = []
    historial: list = []
    creado_por: Optional[str] = None

    class Config:
        from_attributes = True


# ==========================================
# ALMACÉN EPS
# ==========================================
class IngresoCarritoEPSRequest(BaseModel):
    op_id: str
    carrito_id: str
    ubicacion_id: int
    ubicacion_nombre: str


# ==========================================
# TRAZABILIDAD
# ==========================================
class TrazabilidadResponse(BaseModel):
    info_lote: Optional[dict] = None
    origen: Optional[Any] = None
    origen_produccion: Optional[dict] = None
    componentes_consumidos: Optional[list] = None
    destino_consumo: Optional[list] = None
    devoluciones_asociadas: Optional[list] = None
    info_devolucion: Optional[dict] = None


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
# DASHBOARD
# ==========================================
class AlmacenDashboard(BaseModel):
    total_lotes: int = 0
    lotes_sin_ubicacion: int = 0
    total_ubicaciones: int = 0
    total_embarques: int = 0
    embarques_surtidos: int = 0
    embarques_en_transito: int = 0
    embarques_entregados: int = 0
    traslados_pendientes: int = 0
    traslados_en_proceso: int = 0
    traslados_completados: int = 0
    stock_total_items: float = 0
    lotes_eps: int = 0