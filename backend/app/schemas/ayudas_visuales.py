from pydantic import BaseModel
from typing import List, Optional


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


class SyncResumenOut(BaseModel):
    """Resultado de la fase de espejo (Synology → disco local)."""
    archivos_remotos: int = 0
    copiados: int = 0
    actualizados: int = 0
    sin_cambios: int = 0
    borrados: int = 0
    bytes_descargados: int = 0
    prune_omitido: bool = False
    errores: List[str] = []


class SyncEstado(BaseModel):
    """Estado del job de sincronización (se consulta por polling desde la UI)."""
    estado: str                      # idle | corriendo | ok | error
    fase: str = ""                   # nube | indice | ""
    actual: int = 0
    total: int = 0
    inicio: Optional[str] = None
    fin: Optional[str] = None
    disparado_por: str = ""          # usuario que lo lanzó, o "scheduler"
    nube: Optional[SyncResumenOut] = None
    indice: Optional[ReindexResumen] = None
    error: Optional[str] = None
