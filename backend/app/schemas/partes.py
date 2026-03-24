from pydantic import BaseModel
from typing import Optional

class ParteBase(BaseModel):
    numero_parte: str
    descripcion: Optional[str] = ""
    linea: Optional[str] = ""
    id_interno: Optional[str] = ""
    cantidad_por_etiqueta: Optional[str] = "1"
    cliente_lg: Optional[str] = ""
    ayuda_visual: Optional[str] = ""

class ParteCreate(ParteBase):
    pass

class ParteUpdate(BaseModel):
    descripcion: Optional[str] = None
    linea: Optional[str] = None
    id_interno: Optional[str] = None
    cantidad_por_etiqueta: Optional[str] = None
    cliente_lg: Optional[str] = None
    ayuda_visual: Optional[str] = None

class Parte(ParteBase):
    id: int
    
    class Config:
        from_attributes = True