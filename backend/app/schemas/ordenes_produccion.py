from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime


# ==========================================
# ORDEN DE PRODUCCIÓN — Base
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
    cantidad_a_producir: float
    cantidad_usada: float
    operador: str
    ubicacion_destino: Optional[str] = "PISO"


class RegistroParciallPreExpRequest(BaseModel):
    cantidad_parcial_producida: float


class FinalizarPreExpansionRequest(BaseModel):
    ubicacion_destino_final: Optional[str] = None


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