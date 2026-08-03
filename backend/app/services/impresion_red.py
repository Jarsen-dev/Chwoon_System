"""Impresión directa por TCP raw (puerto 9100) a la HP de red.

A diferencia de la Zebra —que cuelga de un USB en la PC de Windows y necesita el
agente de `gateway/agente_impresion.py`— el contenedor SÍ alcanza esta impresora,
así que el backend imprime él mismo y no hay nada que encolar.

La E78625 trae PDF entre sus personalidades instaladas (lo lista su página de
configuración: PCL, PCLXL, POSTSCRIPT, PDF, TIFF), o sea que se le manda el PDF
tal cual, sin convertir a PostScript.
"""

import asyncio
import logging
import os
import time

logger = logging.getLogger(__name__)

HOST = os.getenv("IMPRESORA_CARTA_HOST", "192.168.1.250")
PUERTO = int(os.getenv("IMPRESORA_CARTA_PORT", "9100"))
NOMBRE = os.getenv("IMPRESORA_CARTA_NOMBRE", "HP Color LaserJet MFP E78625")

TIMEOUT_SONDEO = 1.5      # el modal espera esta respuesta: no puede tardar
TIMEOUT_ENVIO = 30.0
CACHE_SEGUNDOS = 15.0     # abrir un socket por cada refresco del modal es de más

# Universal Exit Language: cierra lo que la impresora tuviera a medias
_UEL = b"\x1b%-12345X"

_cache: tuple[float, bool] | None = None


def _sanitizar_titulo(titulo: str) -> str:
    """El JOB NAME de PJL va entre comillas: unas comillas dentro lo romperían."""
    limpio = "".join(c for c in titulo if c.isprintable() and c not in '"\\')
    return limpio[:60] or "Etiquetas"


def _envolver_pjl(pdf: bytes, titulo: str) -> bytes:
    """Envuelve el PDF en PJL en vez de confiar en el autosensado de la cola.

    DUPLEX=OFF no es opcional: si la impresora arrastra el dúplex de un trabajo
    anterior, la mitad de las etiquetas sale por el reverso de la hoja.
    """
    cabecera = (
        _UEL
        + f'@PJL JOB NAME="{_sanitizar_titulo(titulo)}"\r\n'.encode("ascii", "replace")
        + b"@PJL SET PAPER=LETTER\r\n"
        + b"@PJL SET DUPLEX=OFF\r\n"
        + b"@PJL SET COPIES=1\r\n"
        + b"@PJL ENTER LANGUAGE=PDF\r\n"
    )
    return cabecera + pdf + b"\r\n" + _UEL + b"@PJL EOJ\r\n" + _UEL


async def disponible(forzar: bool = False) -> bool:
    """¿Responde la impresora en el 9100? Cacheado unos segundos."""
    global _cache

    ahora = time.monotonic()
    if not forzar and _cache and ahora - _cache[0] < CACHE_SEGUNDOS:
        return _cache[1]

    try:
        _, escritor = await asyncio.wait_for(
            asyncio.open_connection(HOST, PUERTO), timeout=TIMEOUT_SONDEO
        )
        escritor.close()
        await escritor.wait_closed()
        ok = True
    except (OSError, asyncio.TimeoutError) as exc:
        logger.info("Impresora carta %s:%s no responde — %s", HOST, PUERTO, exc)
        ok = False

    _cache = (ahora, ok)
    return ok


async def enviar_pdf(pdf: bytes, titulo: str) -> None:
    """Manda el PDF a imprimir. Levanta `OSError`/`TimeoutError` si no sale.

    El 9100 no confirma nada: lo único que se puede afirmar es que los bytes
    salieron y la impresora aceptó la conexión hasta el cierre.
    """
    global _cache

    escritor = None
    try:
        _, escritor = await asyncio.wait_for(
            asyncio.open_connection(HOST, PUERTO), timeout=TIMEOUT_SONDEO
        )
        escritor.write(_envolver_pjl(pdf, titulo))
        await asyncio.wait_for(escritor.drain(), timeout=TIMEOUT_ENVIO)
    except Exception:
        _cache = None      # el próximo sondeo no puede decir "disponible" por caché
        raise
    finally:
        if escritor is not None:
            escritor.close()
            # Cerrar el socket es lo que le marca el fin del trabajo a la impresora
            try:
                await asyncio.wait_for(escritor.wait_closed(), timeout=TIMEOUT_ENVIO)
            except (OSError, asyncio.TimeoutError):
                logger.warning("Impresora carta: el cierre del socket no terminó limpio")

    logger.info("Impresora carta: %d bytes enviados a %s:%s (%s)", len(pdf), HOST, PUERTO, titulo)
