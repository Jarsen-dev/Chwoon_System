from pydantic import BaseModel
from typing import Optional

# ==========================================
# INVENTARIO PLANTA
# ==========================================

class InventarioBase(BaseModel):
    codigo:       str
    descripcion:  str
    linea:        str
    tipo:         str
    qtu:          int
    linea_lg:     str
    ayuda_visual: Optional[str] = ''

class InventarioCreate(InventarioBase):
    """Schema para crear un nuevo item en inventario"""
    pass

class InventarioUpdate(BaseModel):
    """Schema para actualizar — todos los campos opcionales"""
    descripcion:  Optional[str] = None
    linea:        Optional[str] = None
    tipo:         Optional[str] = None
    qtu:          Optional[int] = None
    linea_lg:     Optional[str] = None
    ayuda_visual: Optional[str] = None

class Inventario(InventarioBase):
    """Schema completo para leer"""
    class Config:
        from_attributes = True