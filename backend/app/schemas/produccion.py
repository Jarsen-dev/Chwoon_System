from pydantic import BaseModel
from typing import Optional

class RegistroProduccionBase(BaseModel):
    fecha: str
    hora: str
    turno: str
    maquina: str
    numero_parte: str
    descripcion: str
    carrito_numero: int
    qty_bolsa: int
    total_acumulado: int

class RegistroProduccionCreate(RegistroProduccionBase):
    pass

class RegistroProduccion(RegistroProduccionBase):
    id: int
    
    class Config:
        from_attributes = True

class PlanProduccionBase(BaseModel):
    numero_parte: str
    meta_piezas: int
    turno_objetivo: Optional[str] = "Día"

class PlanProduccionCreate(PlanProduccionBase):
    pass

class PlanProduccion(PlanProduccionBase):
    id: int
    
    class Config:
        from_attributes = True

class AnomaliaBase(BaseModel):
    fecha: str
    hora: str
    numero_parte: str
    motivo: str
    tipo: str

class AnomaliaCreate(AnomaliaBase):
    pass

class Anomalia(AnomaliaBase):
    id: int
    
    class Config:
        from_attributes = True

class RegistroParoBase(BaseModel):
    fecha: str
    hora_inicio: str
    hora_fin: str
    duracion_minutos: float
    maquina: str
    motivo: str
    comentario: Optional[str] = ""

class RegistroParoCreate(RegistroParoBase):
    pass

class RegistroParo(RegistroParoBase):
    id: int
    
    class Config:
        from_attributes = True