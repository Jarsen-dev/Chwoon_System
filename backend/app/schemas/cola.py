from pydantic import BaseModel
from typing import Optional

# ==========================================
# COLA DE IMPRESIÓN
# ==========================================

class ColaItemBase(BaseModel):
    codigo_inventario:  str
    cantidad_etiquetas: int
    turno:              str

class ColaItemCreate(ColaItemBase):
    """Schema para crear un item en la cola"""
    pass

class ColaItem(ColaItemBase):
    """Schema completo para leer un item de la cola"""
    id:           int
    numero_parte: str
    descripcion:  str
    estado:       str
    user:         Optional[str] = None

    class Config:
        from_attributes = True