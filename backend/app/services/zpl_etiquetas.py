"""Generación de etiquetas de lote en ZPL para la Zebra ZD220 (203 dpi).

El backend NO imprime: corre en Docker y no alcanza la impresora (USB, sin
compartir, sin TCP). Aquí solo se arma el ZPL; lo manda a la impresora el
agente de Windows (`gateway/agente_impresion.py`) vía win32print en modo RAW.

Etiqueta de 104 x 50.8 mm = 831 x 406 dots a 203 dpi.
El QR lo dibuja la propia impresora con ^BQ — no hace falta generar imagen.
"""
import os
import re
from datetime import date
from decimal import Decimal
from functools import lru_cache
from pathlib import Path

from PIL import Image

# app/services/ -> app/ -> backend/  + static/Logo.png
LOGO_PATH = Path(__file__).resolve().parents[2] / "static" / "Logo.png"

# Nombre EXACTO de la cola de Windows. Tiene que coincidir con el IMPRESORA del
# agente (gateway/agente_impresion.py) o los trabajos nunca se reclaman.
IMPRESORA_DEFAULT = os.getenv("IMPRESORA_ETIQUETAS", "ZDesigner ZD220-203dpi ZPL")

ANCHO_DOTS = 831          # 104 mm
ALTO_DOTS = 406           # 50.8 mm
MARGEN = 25
ANCHO_TEXTO = 540         # columna izquierda; a partir de ahí empieza el QR

LOGO_ANCHO = 118          # mantiene el 1.575:1 del Logo.png original (668x424)
LOGO_ALTO = 75
UMBRAL_LOGO = 160         # gris por debajo del cual el pixel se imprime negro

# ^ y ~ son los caracteres de control de ZPL: una descripción del catálogo que
# los traiga rompería la etiqueta completa.
_CONTROL_ZPL = re.compile(r"[\^~]")


def _sanitizar(texto: str | None) -> str:
    if not texto:
        return ""
    return _CONTROL_ZPL.sub(" ", str(texto)).strip()


@lru_cache(maxsize=1)
def _logo_gfa() -> str:
    """Logo.png -> campo ^GFA (hex ASCII), cacheado: el archivo no cambia."""
    img = Image.open(LOGO_PATH).convert("RGBA")
    fondo = Image.new("RGBA", img.size, "WHITE")
    img = Image.alpha_composite(fondo, img).convert("L")
    img = img.resize((LOGO_ANCHO, LOGO_ALTO), Image.LANCZOS)
    img = img.point(lambda p: 0 if p < UMBRAL_LOGO else 255, mode="1")

    # PIL modo '1' empaqueta MSB-first con relleno a byte por fila, pero con
    # 1 = blanco; ZPL quiere 1 = punto negro, de ahí el XOR.
    datos = bytes(b ^ 0xFF for b in img.tobytes())
    bytes_por_fila = (LOGO_ANCHO + 7) // 8
    total = bytes_por_fila * LOGO_ALTO
    return f"^GFA,{total},{total},{bytes_por_fila},{datos.hex().upper()}"


def fmt_cantidad(cantidad: Decimal | float | str) -> str:
    """1000.00 -> "1000"; 2.50 -> "2.5" (sin ceros de relleno en la etiqueta).

    Pública porque la comparte `pdf_etiquetas`: la misma cantidad tiene que verse
    igual salga por la Zebra o por la hoja carta.
    """
    d = Decimal(str(cantidad)).normalize()
    if d == d.to_integral_value():
        d = d.to_integral_value()
    return f"{d:f}"


def generar_zpl(
    lote_id: str,
    numero_parte: str,
    descripcion: str | None,
    cantidad: Decimal | float | str,
    unidad_de_medida: str | None,
    fecha_recepcion: date,
) -> str:
    """Arma el ZPL de una etiqueta de lote.

    Todos los campos de texto van con ^FB (field block), que recorta lo que no
    quepa en vez de invadir la zona del QR.
    """
    parte = _sanitizar(numero_parte)
    desc = _sanitizar(descripcion) or "—"
    unidad = _sanitizar(unidad_de_medida)
    cant = fmt_cantidad(cantidad)
    if unidad:
        cant = f"{cant} {unidad}"
    lote = _sanitizar(lote_id)

    return (
        "^XA"
        "^CI28"                                    # UTF-8: acentos de las etiquetas
        f"^PW{ANCHO_DOTS}^LL{ALTO_DOTS}^LH0,0"
        # ── Encabezado: logo + razón social, pegados ──
        f"^FO{MARGEN},15{_logo_gfa()}^FS"
        f"^FO{MARGEN + LOGO_ANCHO + 12},45^A0N,38,38^FB600,1,0,L"
        "^FDCHEONG WOON MEXICO^FS"
        f"^FO{MARGEN},112^GB{ANCHO_DOTS - 2 * MARGEN},0,4^FS"
        # ── Datos ──
        f"^FO{MARGEN},128^A0N,28,28^FB{ANCHO_TEXTO},1,0,L"
        f"^FDNúmero de Parte: {parte}^FS"
        f"^FO{MARGEN},168^A0N,24,24^FB{ANCHO_TEXTO},2,2,L"
        f"^FDDescripción: {desc}^FS"
        f"^FO{MARGEN},232^A0N,28,28^FB{ANCHO_TEXTO},1,0,L"
        f"^FDCantidad: {cant}^FS"
        f"^FO{MARGEN},272^A0N,28,28^FB{ANCHO_TEXTO},1,0,L"
        f"^FDFecha Recepción: {fecha_recepcion:%d/%m/%Y}^FS"
        f"^FO{MARGEN},315^A0N,34,34^FB{ANCHO_TEXTO},1,0,L"
        f"^FDLote ID: {lote}^FS"
        # ── QR con el Lote ID, corrección Q (25%) por el maltrato en almacén ──
        f"^FO615,150^BQN,2,6^FDQA,{lote}^FS"
        "^PQ1"
        "^XZ"
    )
