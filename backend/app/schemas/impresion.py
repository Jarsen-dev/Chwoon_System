from typing import List, Optional

from pydantic import BaseModel


class ReclamarIn(BaseModel):
    impresora: str
    max: int = 10


class TrabajoOut(BaseModel):
    id: int
    zpl: str

    class Config:
        from_attributes = True


class ResultadoTrabajo(BaseModel):
    id: int
    ok: bool
    error: Optional[str] = None


class ConfirmarIn(BaseModel):
    resultados: List[ResultadoTrabajo]


class DestinoOut(BaseModel):
    """Una impresora a la que se pueden mandar etiquetas, y si está o no.

    El modal solo ofrece las `disponible=True`; `detalle` es lo que se le enseña
    al usuario cuando una no está, para que sepa qué revisar.
    """
    id: str            # 'zebra' | 'carta'
    nombre: str
    disponible: bool
    detalle: str
