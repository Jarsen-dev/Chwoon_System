from pydantic import BaseModel, Field, computed_field
from typing import Optional, List, Dict, Any
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
    iva: float = Field(default=0.0, ge=0.0, description="IVA aplicado al total de la orden, ej: 16.0 para 16%")


class OrdenCompraUpdate(BaseModel):
    nombre_proveedor: Optional[str] = None
    status: Optional[str] = None
    notas: Optional[str] = None
    iva: Optional[float] = None
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
    iva: float = 0.0
    firma_compras: Optional[str] = None
    fecha_firma_compras: Optional[datetime] = None
    firma_finanzas: Optional[str] = None
    fecha_firma_finanzas: Optional[datetime] = None
    motivo_rechazo: Optional[str] = None

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

class ValidarFinanzasRequest(BaseModel):
    accion: str  # Puede ser "aprobar" o "rechazar"
    motivo: Optional[str] = None


# ========================
# ÓRDENES DE VENTA
# ========================
class CambiarEstadoRequest(BaseModel):
    estado: str
    notas: Optional[str] = None
 
 
class DespacharRequest(BaseModel):
    no_camion:    str
    chofer:       str
    status_salida: str = "OK"           # "OK" | "NG"
    cw_invoice:   Optional[str] = None
    no_departure: Optional[str] = None  # folio NPX de LG — ej: NPX26060000025
    items_enviados: Optional[list[dict]] = None  # [{sku_producto, cantidad}]


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
    # ── Órdenes de compra (sin cambio) ────────────────────────────────────────
    total_oc:              int   = 0
    oc_pendientes:         int   = 0
    oc_completadas:        int   = 0
 
    # ── Órdenes de venta ──────────────────────────────────────────────────────
    total_ov:              int   = 0
    ov_pendientes:         int   = 0      # "Pendiente de Envío"
    ov_en_preparacion:     int   = 0      # NUEVO
    ov_lista_para_carga:   int   = 0      # NUEVO
    ov_enviadas:           int   = 0
    ov_stock_insuficiente: int   = 0
 
    # ── Devoluciones y plan ────────────────────────────────────────────────────
    total_devoluciones:    int   = 0
    devoluciones_pendientes: int = 0
    planes_venta_activos:  int   = 0
 
    # ── Financiero ────────────────────────────────────────────────────────────
    valor_compras_mes:     float = 0.0
    valor_ventas_mes:      float = 0.0
 
    # ── KPIs operativos del día (NUEVOS) ──────────────────────────────────────
    programado_hoy:        int   = 0      # suma del plan del día activo en CW PLAN
    embarcado_hoy:         int   = 0      # suma de envíos con fecha_envio = hoy
 
    @computed_field
    @property
    def pct_cumplimiento(self) -> float:
        """
        % de cumplimiento del día: embarcado / programado × 100.
        Devuelve 0.0 si no hay plan, 100.0 si se programó 0 y se embarcó algo.
        Siempre acotado a [0, 100].
        """
        if self.programado_hoy == 0:
            return 100.0 if self.embarcado_hoy > 0 else 0.0
        return min(round(self.embarcado_hoy / self.programado_hoy * 100, 1), 100.0)
 
    skus_dif_negativa:     int   = 0      # SKUs donde stock_lg < plan_acumulado
 
    # ── PSI Coverage — del PSI RESUME del Plan de Embarque (NUEVOS) ───────────
    # Valores en fracción (0.0–1.0). Frontend los convierte a porcentaje.
    coverage_ref_dday:     float = 0.0    # cobertura Ref   D-Day
    coverage_ref_d1:       float = 0.0    # cobertura Ref   D+1
    coverage_oven_dday:    float = 0.0    # cobertura Oven  D-Day
    coverage_oven_d1:      float = 0.0    # cobertura Oven  D+1
 
 
# ========================
# ANÁLISIS DE DEMANDA (DemandaTab)
# ========================
class AnalisisDemandaItem(BaseModel):
    sku: str
    descripcion: str
    demanda_semanal: float
    stock_aprobado: float            # stock en almacén con estado_calidad=Aprobado
    brecha: float                    # stock_aprobado - demanda_semanal (negativo = faltante)
    status: str                      # "OK" | "FALTANTE" | "CRÍTICO"
    linea: Optional[str] = None      # R1 / R2 / R3
    model: Optional[str] = None      # QUANTUM-T, MAJESTY, etc.


# ========================
# APROBAR ORDEN DE COMPRA (desde Producción)
# ========================
class AprobarOrdenCompraRequest(BaseModel):
    id_proveedor: Optional[str] = None
    nombre_proveedor: Optional[str] = None
    items: Optional[List[OrdenCompraItemCreate]] = None
    notas: Optional[str] = None

# ========================
# PROVEEDORES Y MATERIALES
# ========================
class ProveedorMaterialBase(BaseModel):
    sku_material: str
    codigo_proveedor: Optional[str] = None
    costo_unitario: float = Field(default=0.0, ge=0.0)
    moneda: str = "MXN"

class ProveedorMaterialCreate(ProveedorMaterialBase):
    pass

class ProveedorMaterialResponse(ProveedorMaterialBase):
    id: int
    proveedor_id: int

    class Config:
        from_attributes = True

class ProveedorCreate(BaseModel):
    razon_social: str = Field(..., min_length=2)
    rfc: str = Field(..., min_length=12, max_length=13)
    lead_time_dias: int = Field(default=7, ge=0)
    condiciones_pago: Optional[str] = "30 días"
    dias_credito: int = Field(default=30, ge=0)
    estatus_calidad: str = "Aprobado"
    direccion: Optional[str] = None
    nombre_contacto: Optional[str] = None
    numero_contacto: Optional[str] = None
    correo_contacto: Optional[str] = None
    notas: Optional[str] = None
    materiales: List[ProveedorMaterialCreate] = []

class ProveedorUpdate(BaseModel):
    razon_social: Optional[str] = None
    rfc: Optional[str] = None
    lead_time_dias: Optional[int] = None
    condiciones_pago: Optional[str] = None
    dias_credito: Optional[int] = None
    estatus_calidad: Optional[str] = None
    direccion: Optional[str] = None
    nombre_contacto: Optional[str] = None
    numero_contacto: Optional[str] = None
    correo_contacto: Optional[str] = None
    notas: Optional[str] = None
    materiales: Optional[List[ProveedorMaterialCreate]] = None

class ProveedorResponse(BaseModel):
    id: int
    uuid: str
    razon_social: str
    rfc: str
    lead_time_dias: int
    condiciones_pago: Optional[str]
    dias_credito: Optional[int] = None
    estatus_calidad: str
    direccion: Optional[str] = None
    nombre_contacto: Optional[str] = None
    numero_contacto: Optional[str] = None
    correo_contacto: Optional[str] = None
    notas: Optional[str]
    score_calidad: Optional[float] = 100.0
    score_detalle: Optional[Dict[str, Any]] = {}
    score_updated_at: Optional[datetime] = None
    fecha_creacion: datetime
    materiales: List[ProveedorMaterialResponse] = []

    class Config:
        from_attributes = True


# ========================
# PROVEEDOR EVENTOS (Scoring)
# ========================
class ProveedorEventoCreate(BaseModel):
    tipo_evento: str
    impacto: float
    referencia_id: Optional[str] = None
    descripcion: Optional[str] = None

class ProveedorEventoResponse(BaseModel):
    id: int
    proveedor_id: int
    tipo_evento: str
    impacto: float
    referencia_id: Optional[str] = None
    descripcion: Optional[str] = None
    fecha: datetime
    registrado_por: Optional[str] = None

    class Config:
        from_attributes = True

class ProveedorScoreResponse(BaseModel):
    proveedor_id: int
    razon_social: str
    score_calidad: float
    score_detalle: Dict[str, Any]
    score_updated_at: Optional[datetime] = None
    recomendacion_estatus: Optional[str] = None

class EnvioLogisticoCreate(BaseModel):
    no_camion: str
    chofer: str
    status_salida: str = "OK"
    cw_invoice: Optional[str] = None

class AnalisisDemandaItem(BaseModel):
    sku: str
    descripcion: str
    demanda_semanal: float
    stock_aprobado: float
    brecha: float
    status: str