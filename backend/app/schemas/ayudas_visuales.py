from pydantic import BaseModel
from typing import List


class AyudaVisualOut(BaseModel):
    id: int
    sku: str
    nombre_archivo: str
    codigo_av: str = ""
    ruta: str
    tiene_thumbnail: bool = False

    class Config:
        from_attributes = True


class ReindexResumen(BaseModel):
    total_archivos: int
    indexados: int
    nuevos: int
    actualizados: int
    eliminados: int
    thumbnails_generados: int
    sin_producto: List[str] = []
    errores: List[str] = []
