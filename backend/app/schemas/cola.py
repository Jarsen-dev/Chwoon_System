from pydantic import BaseModel
from typing import Optional

class ColaItemBase(BaseModel):
    parte_id: int
    cantidad_etiquetas: int
    turno: str = "Día"

class ColaItemCreate(ColaItemBase):
    pass

class ColaItem(ColaItemBase):
    id: int
    estado: str = "pendiente"
    numero_parte: Optional[str] = None
    descripcion: Optional[str] = None
    
    class Config:
        from_attributes = True