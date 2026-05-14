from pydantic import BaseModel, Field
from typing import Optional, List, Any
from datetime import datetime


# ==========================================
# ORDEN DE PRODUCCIÓN — Response
# ==========================================
class OrdenProduccionResponse(BaseModel):
    id: int
    op_id: str
    clase_produccion: str
    sku_producto: str
    nombre_producto: str = ""
    linea_produccion: Optional[str] = None
    cantidad_a_producir: float = 0
    cantidad_producida: float = 0
    cantidad_carrito: float = 0
    operador: Optional[str] = None
    status: str = "En Proceso"
    fecha_inicio: Optional[datetime] = None
    fecha_fin: Optional[datetime] = None

    # Pre-Expansión
    sku_materia_prima: Optional[str] = None
    cantidad_usada_requerida: float = 0
    cantidad_total_consumida: float = 0
    ubicacion_destino: Optional[str] = None
    lote_inventario_generado: Optional[str] = None
    
    # Nuevos Pre-Expansión
    grado: Optional[str] = None
    numero_costal: Optional[str] = None
    hora_inicio_real: Optional[datetime] = None
    densidad: Optional[float] = None
    pantalla_peso: Optional[float] = None
    ciclo_seg: Optional[float] = None
    counter_tiro: Optional[float] = None
    hora_finalizacion: Optional[datetime] = None
    silo_destino: Optional[str] = None

    # Inyección
    uph_esperado: float = 0
    metodo_conteo: Optional[str] = None

    # JSON
    registros_parciales: list = []
    material_consumido: list = []
    paros: list = []
    etiquetas_generadas: list = []
    scrap_reportado: list = []
    componentes_consumidos: dict = {}

    creado_por: Optional[str] = None

    class Config:
        from_attributes = True


# ==========================================
# PRE-EXPANSIÓN
# ==========================================
class IniciarPreExpansionRequest(BaseModel):
    sku_producto_resina: str
    sku_materia_prima: str
    grado: str
    numero_costal: Optional[str] = None
    cantidad_a_producir: float = 0
    cantidad_usada: float
    operador: str
    ubicacion_destino: Optional[str] = "PISO"


class RegistroParciallPreExpRequest(BaseModel):
    cantidad_parcial_producida: float


class RegistroDatosProcesoRequest(BaseModel):
    """Se envía al registrar el primer parcial"""
    densidad: float
    pantalla_peso: float
    ciclo_seg: float


class FinalizarPreExpansionRequest(BaseModel):
    ubicacion_destino_final: Optional[str] = None
    cantidad_producida: float = 0
    counter_tiro: Optional[float] = None


# ==========================================
# SUMINISTRO SILO
# ==========================================
class CrearSuministroRequest(BaseModel):
    silo_origen: str
    aux_destino: str
    kg_suministrados: float
    maquinas_inyeccion: list = []


class SuministroSiloResponse(BaseModel):
    id: int
    suministro_id: str
    silo_origen: str
    silo_origen_op_id: Optional[str] = None
    aux_destino: str
    sku_resina: Optional[str] = None
    nombre_resina: Optional[str] = None
    grado: Optional[str] = None
    densidad: float = 0
    kg_suministrados: float = 0
    kg_restantes: float = 0
    tiempo_reposo_horas: float = 0
    maquinas_inyeccion: list = []
    fecha_suministro: Optional[datetime] = None
    creado_por: Optional[str] = None

    class Config:
        from_attributes = True


# ==========================================
# ESTADO SILO
# ==========================================
class EstadoSiloResponse(BaseModel):
    nombre_silo: str
    es_aux: bool = False
    vacio: bool = True
    # Datos de la resina almacenada (si no está vacío)
    sku_resina: Optional[str] = None
    nombre_resina: Optional[str] = None
    grado: Optional[str] = None
    densidad: Optional[float] = None
    kg_totales: float = 0
    fecha_entrada: Optional[datetime] = None
    hora_finalizacion_lote: Optional[datetime] = None
    op_id_origen: Optional[str] = None
    tiempo_reposo_segundos: float = 0
    tiempo_reposo_horas: float = 0
    # Para AUX — datos del suministro
    suministro: Optional[SuministroSiloResponse] = None
    silo_fuente: Optional[str] = None


# ==========================================
# INYECCIÓN
# ==========================================
class IniciarInyeccionRequest(BaseModel):
    sku_producto: str
    cantidad_a_producir: float
    cantidad_carrito: float = 0
    operador: str
    linea_produccion: Optional[str] = None


class RegistrarPiezaRequest(BaseModel):
    cantidad: int = 1
    entrada_scanner: str = ""


class FinalizarInyeccionRequest(BaseModel):
    scrap_data: list = []

# ==========================================
# PLAN INYECCIÓN
# ==========================================

class PlanInyeccionBase(BaseModel):
    maquina: str
    prioridad: int
    numero_parte: str
    plan_piezas: int
    cav: int = 1
    orden_secuencia: int = 0
    aux_silo: Optional[str] = None


class PlanInyeccionCreate(PlanInyeccionBase):
    pass


class PlanInyeccionBatchCreate(BaseModel):
    items: List[PlanInyeccionCreate]


class PlanInyeccionAvanceRequest(BaseModel):
    piezas: int = Field(..., ge=1, description="Piezas producidas en este registro")
    tiempo_ciclo: float = Field(..., ge=0, description="Tiempo de ciclo en segundos")
    contador_hora: int = Field(..., ge=0, description="Contador por hora")


class PlanInyeccionParoRequest(BaseModel):
    motivo: str
    motivo_mantenimiento: Optional[str] = None
    comentarios: str = ""


class PlanInyeccionReanudarRequest(BaseModel):
    motivo: str
    motivo_mantenimiento: Optional[str] = None
    comentarios: str = ""


class ParoItem(BaseModel):
    id: str
    motivo: str
    motivo_mantenimiento: Optional[str] = None
    comentarios: str = ""
    inicio: str
    fin: Optional[str] = None
    duracion_segundos: int = 0
    status: str  # Activo | Finalizado


class PlanInyeccionResponse(PlanInyeccionBase):
    id: int
    piezas_producidas: int
    status: str
    hora_inicio: Optional[datetime] = None
    hora_ultimo_inicio: Optional[datetime] = None
    tiempo_acumulado_seg: int
    en_paro: bool
    paros: List[ParoItem] = []
    hora_fin: Optional[datetime] = None
    created_at: Optional[datetime] = None
    aux_silo: Optional[str] = None

    class Config:
        from_attributes = True


class PlanInyeccionFinalizarResponse(BaseModel):
    message: str
    finalizado_id: int
    siguiente_iniciado: Optional[PlanInyeccionResponse] = None


# ==========================================
# ENSAMBLE (ASSY)
# ==========================================
class IniciarAssyRequest(BaseModel):
    sku_producto: str
    cantidad_a_producir: float
    cantidad_carrito: float = 0
    operador: str
    linea_produccion: Optional[str] = None
    uph_esperado: float = 0
    metodo_conteo: Optional[str] = None


class FinalizarAssyRequest(BaseModel):
    scrap_data: list = []


# ==========================================
# PAROS
# ==========================================
class RegistrarParoRequest(BaseModel):
    motivo: str


# ==========================================
# VISTA UNIFICADA
# ==========================================
class OrdenUnificadaResponse(BaseModel):
    id: str
    tipo: str
    sku: str
    nombre: str = ""
    progreso: str
    status: str
    fecha: Optional[datetime] = None
    linea: Optional[str] = None
    operador: Optional[str] = None

    class Config:
        from_attributes = True