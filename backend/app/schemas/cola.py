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
    numero_parte: str        # viene del JOIN con inventario_planta
    descripcion:  str        # viene del JOIN con inventario_planta
    estado:       str
    user:         Optional[str] = None  # listo para sistema de usuarios

    class Config:
        from_attributes = True