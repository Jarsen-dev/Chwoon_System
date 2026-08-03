"""Etiquetas de lote en hoja tamaño carta para la HP Color LaserJet MFP E78625.

Mismo contenido que la etiqueta de la Zebra (`zpl_etiquetas.generar_zpl`), pero
maquetado en una grilla de 2 x 4 sobre papel bond, para recortar.

A tamaño real no caben: dos etiquetas de 104 mm son 208 mm en una hoja de
215.9 mm, lo que dejaría 3.95 mm por lado — menos que el margen no imprimible de
la E78625 (~4.2 mm). Se reducen a 95 x 46.4 mm conservando la proporción
104 : 50.8, con márgenes laterales de casi 9 mm.

Las medidas interiores salen de convertir las posiciones del ZPL (831 x 406 dots
a 203 dpi) a milímetros y multiplicarlas por ESCALA, así las dos etiquetas se
ven iguales.
"""
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from functools import lru_cache
from io import BytesIO
from pathlib import Path

from PIL import Image
from reportlab.lib.colors import black, HexColor
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

# Helpers de dibujo ya probados en las etiquetas de OC; el QR es vectorial
from app.services.pdf_generator import _generar_qr_code, _truncate_text
from app.services.zpl_etiquetas import fmt_cantidad

LOGO_PATH = Path(__file__).resolve().parents[2] / "static" / "Logo.png"

# ── Hoja ─────────────────────────────────────────────────────────────
ANCHO_HOJA, ALTO_HOJA = letter          # 612 x 792 pt = 215.9 x 279.4 mm

ETIQUETA_ANCHO = 95.0 * mm
ETIQUETA_ALTO = 46.4 * mm               # 95 x (50.8 / 104), misma proporción
COLUMNAS = 2
FILAS = 4
POR_HOJA = COLUMNAS * FILAS             # 8
SEPARACION = 8.0 * mm

_BLOQUE_ANCHO = COLUMNAS * ETIQUETA_ANCHO + (COLUMNAS - 1) * SEPARACION
_BLOQUE_ALTO = FILAS * ETIQUETA_ALTO + (FILAS - 1) * SEPARACION
MARGEN_X = (ANCHO_HOJA - _BLOQUE_ANCHO) / 2
MARGEN_Y = (ALTO_HOJA - _BLOQUE_ALTO) / 2

# ── Interior de la etiqueta ──────────────────────────────────────────
# Factor contra la etiqueta de la Zebra (104 mm de ancho)
ESCALA = 95.0 / 104.0
DOT = (25.4 / 203) * mm * ESCALA        # un dot del ZPL, ya reducido

MARGEN = 25 * DOT
LOGO_ANCHO, LOGO_ALTO = 118 * DOT, 75 * DOT
ANCHO_TEXTO = 540 * DOT                 # columna izquierda; después empieza el QR
# El QR es lo único que se escanea: se le da todo el hueco que queda a la derecha
# del texto (que nunca pasa de ANCHO_TEXTO) sin tocar el margen de la etiqueta.
QR_LADO = 22.0 * mm
QR_X = ETIQUETA_ANCHO - MARGEN - QR_LADO
QR_Y = 150 * DOT

GRIS_CORTE = HexColor("#BBBBBB")

# ^A0N,38,38 y demás: la altura de celda del ZPL equivale al cuerpo en puntos
FUENTE_TITULO = 38 * DOT
FUENTE_DATO = 28 * DOT
FUENTE_DESC = 24 * DOT
FUENTE_LOTE = 34 * DOT


@lru_cache(maxsize=1)
def _logo_gris() -> ImageReader:
    """Logo.png en escala de grises: la E78625 es a color y esta etiqueta debe
    salir solo en blanco y negro.

    No hay un `@PJL SET` fiable para forzarlo a nivel impresora: su
    `@PJL INFO VARIABLES` (medido por TCP contra la propia impresora) no trae
    ninguna variable de color/render — solo `MEDIATYPE=COLOR` como tipo de
    papel, que es otra cosa. La única palanca segura es no mandar color en el
    PDF. Cacheado porque el archivo no cambia.
    """
    img = Image.open(LOGO_PATH).convert("RGBA")
    fondo = Image.new("RGBA", img.size, "WHITE")
    img = Image.alpha_composite(fondo, img).convert("L")
    buffer = BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    return ImageReader(buffer)


@dataclass(frozen=True)
class DatosEtiqueta:
    """Lo que va impreso. Sin ORM a propósito: el servicio se puede probar solo."""
    lote_id: str
    numero_parte: str
    descripcion: str | None
    cantidad: Decimal | float | str
    unidad_de_medida: str | None
    fecha_recepcion: date


def _linea(c, y_arriba: float, texto: str, fuente: str, cuerpo: float) -> None:
    """Escribe una línea recortada a la columna de texto.

    `y_arriba` es la distancia desde el borde superior de la etiqueta, como el
    ^FO del ZPL; reportlab dibuja desde la línea base, de ahí el 0.8 del cuerpo.
    """
    c.setFont(fuente, cuerpo)
    c.drawString(
        MARGEN,
        ETIQUETA_ALTO - y_arriba - cuerpo * 0.8,
        _truncate_text(c, texto, fuente, cuerpo, ANCHO_TEXTO),
    )


def _descripcion(c, y_arriba: float, texto: str) -> None:
    """Descripción a dos líneas como máximo; lo que sobra se recorta con '…'.

    El ^FB del ZPL hace justo esto. `_draw_wrapped_text` de pdf_generator no
    sirve aquí porque no limita el número de líneas: una descripción larga se
    comería la Cantidad y la Fecha.
    """
    c.setFont("Helvetica", FUENTE_DESC)
    lineas: list[str] = []
    actual = ""
    for palabra in texto.split():
        prueba = f"{actual} {palabra}".strip()
        if c.stringWidth(prueba, "Helvetica", FUENTE_DESC) <= ANCHO_TEXTO:
            actual = prueba
        elif len(lineas) < 1:
            lineas.append(actual)
            actual = palabra
        else:
            # Ya no cabe una tercera línea: se marca el recorte y se para
            actual = _truncate_text(c, f"{actual} …", "Helvetica", FUENTE_DESC, ANCHO_TEXTO)
            break
    lineas.append(actual)

    alto_linea = FUENTE_DESC * 1.25
    for i, linea in enumerate(lineas):
        c.drawString(
            MARGEN,
            ETIQUETA_ALTO - y_arriba - FUENTE_DESC * 0.8 - i * alto_linea,
            _truncate_text(c, linea, "Helvetica", FUENTE_DESC, ANCHO_TEXTO),
        )


def _dibujar_etiqueta(c, x: float, y: float, datos: DatosEtiqueta) -> None:
    """Una etiqueta con su esquina inferior izquierda en (x, y)."""
    c.saveState()
    c.translate(x, y)

    # Guía de corte: la hoja es papel bond, se recorta a mano
    c.setStrokeColor(GRIS_CORTE)
    c.setLineWidth(0.25)
    c.setDash(2, 2)
    c.rect(0, 0, ETIQUETA_ANCHO, ETIQUETA_ALTO)
    c.setDash()
    c.setStrokeColor(black)

    # ── Encabezado: logo (en gris, ver _logo_gris) + razón social, pegados ──
    if LOGO_PATH.exists():
        c.drawImage(
            _logo_gris(),
            MARGEN,
            ETIQUETA_ALTO - 15 * DOT - LOGO_ALTO,
            width=LOGO_ANCHO,
            height=LOGO_ALTO,
        )
    c.setFont("Helvetica-Bold", FUENTE_TITULO)
    c.drawString(
        MARGEN + LOGO_ANCHO + 12 * DOT,
        ETIQUETA_ALTO - 45 * DOT - FUENTE_TITULO * 0.8,
        "CHEONG WOON MEXICO",
    )
    c.setLineWidth(1)
    c.line(
        MARGEN, ETIQUETA_ALTO - 112 * DOT,
        ETIQUETA_ANCHO - MARGEN, ETIQUETA_ALTO - 112 * DOT,
    )

    # ── Datos ──
    cantidad = fmt_cantidad(datos.cantidad)
    if datos.unidad_de_medida:
        cantidad = f"{cantidad} {datos.unidad_de_medida}"

    _linea(c, 128 * DOT, f"Número de Parte: {datos.numero_parte}", "Helvetica", FUENTE_DATO)
    _descripcion(c, 168 * DOT, f"Descripción: {datos.descripcion or '—'}")
    _linea(c, 232 * DOT, f"Cantidad: {cantidad}", "Helvetica", FUENTE_DATO)
    _linea(
        c, 272 * DOT,
        f"Fecha Recepción: {datos.fecha_recepcion:%d/%m/%Y}",
        "Helvetica", FUENTE_DATO,
    )
    _linea(c, 315 * DOT, f"Lote ID: {datos.lote_id}", "Helvetica-Bold", FUENTE_LOTE)

    # ── QR con el Lote ID: es lo que escanea Calidad en IQC ──
    _generar_qr_code(c, datos.lote_id, QR_X, ETIQUETA_ALTO - QR_Y - QR_LADO, QR_LADO)

    c.restoreState()


def generar_pdf(etiquetas: list[DatosEtiqueta]) -> bytes:
    """Hojas carta con las etiquetas en grilla 2 x 4, de izquierda a derecha.

    La última hoja queda incompleta si el total no es múltiplo de 8; los huecos
    se dejan en blanco.
    """
    if not etiquetas:
        raise ValueError("No hay etiquetas que imprimir")

    buffer = BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    c.setTitle("Etiquetas de lote")

    for i, datos in enumerate(etiquetas):
        posicion = i % POR_HOJA
        if posicion == 0 and i:
            c.showPage()

        columna = posicion % COLUMNAS
        fila = posicion // COLUMNAS
        x = MARGEN_X + columna * (ETIQUETA_ANCHO + SEPARACION)
        # fila 0 arriba: reportlab mide desde abajo
        y = ALTO_HOJA - MARGEN_Y - (fila + 1) * ETIQUETA_ALTO - fila * SEPARACION
        _dibujar_etiqueta(c, x, y, datos)

    c.save()
    return buffer.getvalue()
