from pydantic import BaseModel
from typing import Optional
from datetime import datetime

# ==========================================
# REGISTRO PRODUCCIÓN
# ==========================================

class RegistroProduccionBase(BaseModel):
    fecha:           str
    hora:            str
    turno:           str
    maquina:         str
    numero_parte:    str
    descripcion:     Optional[str] = ''
    carrito_numero:  int
    qty_bolsa:       int
    total_acumulado: int
    usuario:         str

class RegistroProduccionCreate(RegistroProduccionBase):
    pass

class RegistroProduccion(RegistroProduccionBase):
    id:         int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ==========================================
# PLAN DE PRODUCCIÓN
# ==========================================

class PlanProduccionBase(BaseModel):
    numero_parte:    str
    meta_piezas:     int
    turno_objetivo:  str

class PlanProduccionCreate(PlanProduccionBase):
    pass

class PlanProduccion(PlanProduccionBase):
    id:         int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ==========================================
# ANOMALÍA
# ==========================================

class AnomaliaBase(BaseModel):
    fecha:        str
    hora:         str
    numero_parte: str
    motivo:       str
    tipo:         str

class AnomaliaCreate(AnomaliaBase):
    pass

class Anomalia(AnomaliaBase):
    id:         int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True

# ==========================================
# REGISTRO PARO
# ==========================================

class RegistroParoBase(BaseModel):
    fecha:              str
    hora_inicio:        str
    hora_fin:           Optional[str]  = None
    duracion_minutos:   Optional[int]  = None
    maquina:            str
    motivo:             str
    turno:              str

class RegistroParoCreate(RegistroParoBase):
    pass

class RegistroParo(RegistroParoBase):
    id:         int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True