from datetime import date, datetime
from decimal import Decimal
from typing import List, Literal, Optional

from pydantic import BaseModel

# Zebra ZD220 (etiqueta individual, vía agente) u hoja carta en la HP de red
Destino = Literal["zebra", "carta"]


# ── OCR ──────────────────────────────────────────────────────────────

class RemisionOCRItem(BaseModel):
    numero_parte: Optional[str] = None
    cantidad: Optional[float] = None


class RemisionOCRResponse(BaseModel):
    """Respuesta de /api/remisiones/ocr — todo opcional: los campos que el
    modelo no pudo leer vienen en null y listados en `advertencias`."""
    tipo_detectado: str
    tipo_conocido: bool
    proveedor: Optional[str] = None
    numero_remision: Optional[str] = None
    po: Optional[str] = None
    fecha: Optional[str] = None  # string crudo del OCR; el frontend lo parsea
    items: List[RemisionOCRItem] = []
    foto_path: str
    advertencias: List[str] = []
    ocr_ok: bool = True
    error: str = ""


# ── Guardado ─────────────────────────────────────────────────────────

class RemisionItemCreate(BaseModel):
    numero_parte: str
    cantidad: Decimal


class NuevoFormato(BaseModel):
    tipo_documento: str


class RemisionCreate(BaseModel):
    proveedor: str
    numero_remision: str
    po: Optional[str] = None
    fecha: date
    tipo_documento: str
    foto_path: str
    ocr_raw: Optional[dict] = None
    advertencias: Optional[List[str]] = None
    items: List[RemisionItemCreate]
    # Presente cuando el documento era de formato desconocido: además de guardar
    # el registro se persiste foto + JSON corregido como template nuevo
    nuevo_formato: Optional[NuevoFormato] = None


class RemisionItemOut(BaseModel):
    id: int
    numero_parte: str
    cantidad: float
    descripcion: Optional[str] = None
    unidad_de_medida: Optional[str] = None

    class Config:
        from_attributes = True


class EtiquetaOut(BaseModel):
    id: int
    lote_id: str
    numero_parte: str
    descripcion: Optional[str] = None
    cantidad: float
    unidad_de_medida: Optional[str] = None
    secuencia: int
    fecha_recepcion: date
    # Derivado del último ImpresionTrabajo: pendiente | enviado | impreso | error
    estado_impresion: str = "pendiente"

    class Config:
        from_attributes = True


class RemisionOut(BaseModel):
    id: int
    proveedor: str
    numero_remision: str
    po: Optional[str] = None
    fecha: date
    tipo_documento: str
    foto_path: str
    advertencias: Optional[List[str]] = None
    creado_por: str
    fecha_captura: datetime
    items: List[RemisionItemOut] = []
    etiquetas: List[EtiquetaOut] = []

    class Config:
        from_attributes = True


class RemisionesPage(BaseModel):
    items: List[RemisionOut]
    total: int


# ── Etiquetas de lote ────────────────────────────────────────────────

class EtiquetaItemSolicitud(BaseModel):
    """Una partida de la remisión y las cantidades de cada etiqueta a imprimir."""
    item_id: int
    cantidades: List[Decimal]


class EtiquetasCreate(BaseModel):
    items: List[EtiquetaItemSolicitud]
    # Default 'zebra': es como se imprimía antes de que existiera la hoja carta
    destino: Destino = "zebra"


class ReimprimirIn(BaseModel):
    """Destino de una reimpresión; sin él se repite el del trabajo original."""
    destino: Optional[Destino] = None


# ── Sesiones QR ──────────────────────────────────────────────────────

class QrSesionOut(BaseModel):
    session_id: str
    expira_en: datetime


class QrSesionEstado(BaseModel):
    estado: str
    valida: bool
