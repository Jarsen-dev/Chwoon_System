from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date


# ========================
# ÓRDENES DE COMPRA
# ========================
class OrdenCompraItemCreate(BaseModel):
    sku_producto: str
    nombre_producto: str
    cantidad_requerida: float
    precio_unitario: float = 0
    moneda: str = "MXN"


class OrdenCompraItemResponse(BaseModel):
    id: int
    sku_producto: str
    nombre_producto: str
    cantidad_requerida: float
    cantidad_recibida: float
    precio_unitario: float
    moneda: str

    class Config:
        from_attributes = True


class OrdenCompraCreate(BaseModel):
    id_proveedor: str
    nombre_proveedor: str
    items: List[OrdenCompraItemCreate]
    notas: Optional[str] = None


class OrdenCompraUpdate(BaseModel):
    nombre_proveedor: Optional[str] = None
    status: Optional[str] = None
    notas: Optional[str] = None
    items: Optional[List[OrdenCompraItemCreate]] = None


class OrdenCompraResponse(BaseModel):
    id: int
    oc_id: str
    id_proveedor: str
    nombre_proveedor: str
    status: str
    fecha_creacion: datetime
    fecha_actualizacion: Optional[datetime] = None
    notas: Optional[str] = None
    creado_por: Optional[str] = None
    items: List[OrdenCompraItemResponse] = []

    class Config:
        from_attributes = True


# ========================
# RECEPCIONES DE COMPRA
# ========================
class RecepcionCompraCreate(BaseModel):
    oc_id: str
    sku_producto: str
    cantidad_recibida: float
    notas: Optional[str] = None


class RecepcionCompraResponse(BaseModel):
    id: int
    recepcion_id: str
    oc_id: str
    sku_producto: str
    cantidad_recibida: float
    fecha_recepcion: datetime
    recibido_por: Optional[str] = None
    notas: Optional[str] = None

    class Config:
        from_attributes = True


# ========================
# ÓRDENES DE VENTA
# ========================
class OrdenVentaItemCreate(BaseModel):
    sku_producto: str
    nombre_producto: Optional[str] = None
    cantidad: float
    precio_unitario: float = 0
    moneda: str = "MXN"


class OrdenVentaItemResponse(BaseModel):
    id: int
    sku_producto: str
    nombre_producto: Optional[str] = None
    cantidad: float
    cantidad_enviada: float
    precio_unitario: float
    moneda: str

    class Config:
        from_attributes = True


class OrdenVentaCreate(BaseModel):
    cliente_id: str
    nombre_cliente: Optional[str] = None
    items: List[OrdenVentaItemCreate]
    notas: Optional[str] = None


class OrdenVentaUpdate(BaseModel):
    nombre_cliente: Optional[str] = None
    estado: Optional[str] = None
    notas: Optional[str] = None


class OrdenVentaResponse(BaseModel):
    id: int
    ov_id: str
    cliente_id: str
    nombre_cliente: Optional[str] = None
    estado: str
    fecha_creacion: datetime
    fecha_actualizacion: Optional[datetime] = None
    notas: Optional[str] = None
    creado_por: Optional[str] = None
    items: List[OrdenVentaItemResponse] = []
    total_items: Optional[int] = 0
    valor_total: Optional[float] = 0

    class Config:
        from_attributes = True


class EnvioVentaCreate(BaseModel):
    ov_id: str
    items_enviados: List[dict]  # [{sku_producto, cantidad}]
    notas: Optional[str] = None


# ========================
# DEVOLUCIONES
# ========================
class DevolucionCreate(BaseModel):
    ov_id: str
    sku_producto: str
    nombre_producto: Optional[str] = None
    cantidad_devuelta: float
    motivo: str
    lote_produccion_origen: Optional[str] = None


class DisposicionDevolucionCreate(BaseModel):
    cantidad_scrap: float = 0
    cantidad_retrabajo: float = 0


class DevolucionResponse(BaseModel):
    id: int
    devolucion_id: str
    ov_id: str
    sku_producto: str
    nombre_producto: Optional[str] = None
    cantidad_devuelta: float
    motivo: str
    lote_produccion_origen: Optional[str] = None
    fecha_devolucion: datetime
    estado_inspeccion: str
    disposicion_final: Optional[str] = None
    cantidad_scrap: float
    cantidad_retrabajo: float
    procesado_por: Optional[str] = None
    creado_por: Optional[str] = None

    class Config:
        from_attributes = True


# ========================
# PLAN DE VENTAS
# ========================
class PlanVentasImport(BaseModel):
    fecha_inicio_semana: date


class PlanVentasDiaAutorizar(BaseModel):
    sku: str
    dia: str
    cantidad: int


class AutorizarVentasMasivo(BaseModel):
    identificador_semana: str
    ventas: List[PlanVentasDiaAutorizar]


class PlanVentasResponse(BaseModel):
    id: int
    identificador_semana: str
    fecha_inicio_semana: date
    fecha_importacion: datetime
    items: list
    importado_por: Optional[str] = None

    class Config:
        from_attributes = True


# ========================
# DASHBOARD FINANZAS
# ========================
class FinanzasDashboardResponse(BaseModel):
    total_oc: int = 0
    oc_pendientes: int = 0
    oc_completadas: int = 0
    total_ov: int = 0
    ov_pendientes: int = 0
    ov_enviadas: int = 0
    ov_stock_insuficiente: int = 0
    total_devoluciones: int = 0
    devoluciones_pendientes: int = 0
    valor_compras_mes: float = 0
    valor_ventas_mes: float = 0
    planes_venta_activos: int = 0