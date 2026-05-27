from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime, date


# ==========================================
# UBICACIONES
# ==========================================
class UbicacionCreate(BaseModel):
    nombre: str
    parent_id: Optional[int] = None
    tipo_zona: Optional[str] = "ALMACEN"
    capacidad_max: Optional[float] = None
    permite_mixing: Optional[bool] = False
    activa: Optional[bool] = True

class UbicacionUpdate(BaseModel):
    nombre: str
    tipo_zona: Optional[str] = None
    capacidad_max: Optional[float] = None
    permite_mixing: Optional[bool] = None
    activa: Optional[bool] = None

class UbicacionResponse(BaseModel):
    id: int
    nombre: str
    parent_id: Optional[int] = None
    tipo_zona: str
    capacidad_max: Optional[float] = None
    permite_mixing: bool
    activa: bool

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
    bloqueado_por: Optional[str] = None
    numero_remision: Optional[str] = None
    fecha_caducidad: Optional[date] = None
    lote_proveedor: Optional[str] = None
    bultos: int = 1

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
    zonas_prioridad: Optional[List[str]] = None
    excluir_zonas: Optional[List[str]] = None


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
    sku_producto: str
    cantidad: float
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
# DASHBOARD
# ==========================================
class StockPorZona(BaseModel):
    lotes: int = 0
    kg: float = 0

class AlmacenDashboard(BaseModel):
    total_lotes_activos: int = 0
    lotes_sin_ubicacion: int = 0
    lotes_cuarentena: int = 0
    lotes_pendiente_iqc: int = 0
    valor_stock_estimado: float = 0
    lote_mas_antiguo_dias: int = 0
    lotes_sin_movimiento_30d: int = 0
    rotacion_promedio_dias: float = 0
    recepciones_hoy: int = 0
    picking_pendientes: int = 0
    picking_completados_hoy: int = 0
    traslados_pendientes: int = 0
    alertas_stock_minimo: list = []
    alertas_lotes_bloqueados: list = []
    stock_por_zona: dict = {}


# ==========================================
# RECEPCIONES DE COMPRA (vista Almacén)
# ==========================================
class RecepcionAlmacenCreate(BaseModel):
    oc_id: str
    sku_producto: str
    cantidad_recibida: float
    notas: Optional[str] = None
    cantidad_bultos: Optional[int] = 1
    numero_remision: Optional[str] = None
    temperatura: Optional[float] = None
    recibido_en_zona: Optional[str] = "DOCK"


class OrdenCompraAlmacenItemResponse(BaseModel):
    id: int
    sku_producto: str
    nombre_producto: str
    cantidad_requerida: float
    cantidad_recibida: float

    class Config:
        from_attributes = True


class RecepcionAlmacenResponse(BaseModel):
    id: int
    recepcion_id: str
    sku_producto: str
    cantidad_recibida: float
    fecha_recepcion: Optional[datetime] = None
    recibido_por: Optional[str] = None
    notas: Optional[str] = None
    cantidad_bultos: Optional[int] = None
    numero_remision: Optional[str] = None
    temperatura: Optional[float] = None
    recibido_en_zona: Optional[str] = None

    class Config:
        from_attributes = True


class OrdenCompraAlmacenResponse(BaseModel):
    id: int
    oc_id: str
    id_proveedor: str
    nombre_proveedor: str
    status: str
    origen: Optional[str] = "FINANZAS"
    fecha_creacion: Optional[datetime] = None
    fecha_actualizacion: Optional[datetime] = None
    notas: Optional[str] = None
    creado_por: Optional[str] = None
    items: List[OrdenCompraAlmacenItemResponse] = []
    recepciones: List[RecepcionAlmacenResponse] = []

    class Config:
        from_attributes = True


# ==========================================
# PICKING
# ==========================================
class PickingItemRequest(BaseModel):
    sku: str
    cantidad_requerida: float

class OrdenPickingCreate(BaseModel):
    tipo_origen: str
    origen_id: str
    cliente_id: Optional[str] = None
    items: List[PickingItemRequest]
    zona_staging: Optional[str] = None
    asignado_a: Optional[str] = None

class ConfirmarLotePickingRequest(BaseModel):
    sku: str
    lote_id: str
    cantidad_confirmada: float

class OrdenPickingResponse(BaseModel):
    id: int
    picking_id: str
    tipo_origen: str
    origen_id: str
    cliente_id: Optional[str] = None
    status: str
    items: list = []
    zona_staging: Optional[str] = None
    creado_por: Optional[str] = None
    asignado_a: Optional[str] = None
    fecha_creacion: Optional[datetime] = None
    fecha_completado: Optional[datetime] = None
    notas: Optional[str] = None

    class Config:
        from_attributes = True


# ==========================================
# CONTEO FISICO
# ==========================================
class ConteoFisicoCreate(BaseModel):
    zona: str

class RegistrarConteoRequest(BaseModel):
    lote_id: str
    cantidad_contada: float

class AprobarConteoRequest(BaseModel):
    motivo: str

class ConteoFisicoResponse(BaseModel):
    id: int
    conteo_id: str
    fecha_inicio: Optional[datetime] = None
    fecha_cierre: Optional[datetime] = None
    zona: str
    status: str
    items: list = []
    total_diferencia: float = 0
    aprobado_por: Optional[str] = None
    creado_por: Optional[str] = None

    class Config:
        from_attributes = True
