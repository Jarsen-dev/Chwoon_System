from pydantic import BaseModel
from typing import Optional, List, Dict, Any


class BomItem(BaseModel):
    sku_componente: str
    cantidad: float


class ProductoBase(BaseModel):
    sku: str
    nombre: Optional[str] = ""
    tipo: Optional[str] = ""
    clase_producto: Optional[str] = ""
    unidad_de_medida: Optional[str] = ""
    descripcion: Optional[str] = ""
    cantidad_carrito: Optional[int] = 0
    proveedor: Optional[str] = ""
    cliente: Optional[str] = ""
    cliente_id: Optional[str] = ""
    modelo: Optional[str] = ""
    linea_produccion: Optional[str] = ""
    ubicacion: Optional[str] = ""
    status: Optional[str] = "Activo"
    controles_calidad: Optional[List[str]] = []
    puntos_inspeccion_iqc: Optional[List[Dict[str, Any]]] = []
    puntos_inspeccion_lqc: Optional[List[Dict[str, Any]]] = []
    puntos_inspeccion_oqc: Optional[List[Dict[str, Any]]] = []
    bom: Optional[List[Dict[str, Any]]] = []
    caracteristicas_inyeccion: Optional[Dict[str, Any]] = {}
    caracteristicas_resina: Optional[Dict[str, Any]] = {}


class ProductoCreate(ProductoBase):
    pass


class ProductoUpdate(BaseModel):
    tipo: Optional[str] = None
    clase_producto: Optional[str] = None
    unidad_de_medida: Optional[str] = None
    descripcion: Optional[str] = None
    cantidad_carrito: Optional[int] = None
    proveedor: Optional[str] = None
    cliente: Optional[str] = None
    cliente_id: Optional[str] = None
    modelo: Optional[str] = None
    linea_produccion: Optional[str] = None
    ubicacion: Optional[str] = None
    status: Optional[str] = None
    controles_calidad: Optional[List[str]] = None
    puntos_inspeccion_iqc: Optional[List[Dict[str, Any]]] = None
    puntos_inspeccion_lqc: Optional[List[Dict[str, Any]]] = None
    puntos_inspeccion_oqc: Optional[List[Dict[str, Any]]] = None
    bom: Optional[List[Dict[str, Any]]] = None
    caracteristicas_inyeccion: Optional[Dict[str, Any]] = None
    caracteristicas_resina: Optional[Dict[str, Any]] = None


class ProductoBomUpdate(BaseModel):
    bom: List[BomItem]


class PuntosInspeccionUpdate(BaseModel):
    tipo_control: str
    puntos: List[Dict[str, Any]]


class ProductoStatusUpdate(BaseModel):
    ids: List[int]
    status: str


class Producto(ProductoBase):
    id: int

    class Config:
        from_attributes = True


class ProductoListItem(BaseModel):
    """Versión ligera para listados: sin BOM, puntos de inspección ni características."""
    id: int
    sku: str
    nombre: Optional[str] = ""
    tipo: Optional[str] = ""
    clase_producto: Optional[str] = ""
    unidad_de_medida: Optional[str] = ""
    descripcion: Optional[str] = ""
    cantidad_carrito: Optional[int] = 0
    proveedor: Optional[str] = ""
    cliente: Optional[str] = ""
    cliente_id: Optional[str] = ""
    modelo: Optional[str] = ""
    linea_produccion: Optional[str] = ""
    ubicacion: Optional[str] = ""
    status: Optional[str] = "Activo"
    controles_calidad: Optional[List[str]] = []
    bom_count: int = 0

    class Config:
        from_attributes = True


class ProductoListPage(BaseModel):
    items: List[ProductoListItem]
    total: int
    limit: int
    offset: int