"""
Agente de impresión de etiquetas — Backend ERP → Zebra ZD220 (Windows)
======================================================================
Corre en la PC de Windows que tiene la Zebra conectada por USB. Sondea la cola
de impresión del backend, y manda cada trabajo a la impresora en RAW con
win32print (sin pasar por el driver gráfico: el ZPL viaja tal cual).

Existe porque el backend NO puede imprimir: corre en Docker sobre Linux/WSL2 y
no tiene ruta hacia la impresora USB de Windows (probado: sin host.docker.internal,
sin device passthrough, ConnectionRefused hacia cualquier IP de Windows).

    Navegador ──POST /api/remisiones/{id}/etiquetas──> Backend ──cola en BD──┐
                                                                             │
    Zebra ZD220 <──WritePrinter RAW── este agente <──POST /api/impresion/─────┘
                                                       reclamar + confirmar

Requiere:  pip install requests pywin32
"""
import os
import sys
import time
from datetime import datetime

import requests

try:
    import win32print
except ImportError:  # pragma: no cover - solo corre en Windows
    print("ERROR: falta pywin32. Instálalo con:  pip install pywin32")
    sys.exit(1)

# ---------- CONFIGURACIÓN (vía variables de entorno) ----------
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000").rstrip("/")
GATEWAY_API_KEY = os.getenv("GATEWAY_API_KEY", "")
IMPRESORA = os.getenv("IMPRESORA", "ZDesigner ZD220-203dpi ZPL")
INTERVALO_SEGUNDOS = float(os.getenv("INTERVALO_SEGUNDOS", "2"))
MAX_POR_VUELTA = int(os.getenv("MAX_POR_VUELTA", "10"))
HTTP_TIMEOUT = float(os.getenv("HTTP_TIMEOUT", "10"))

HEADERS = {"X-API-Key": GATEWAY_API_KEY, "Content-Type": "application/json"}

# La consola de Windows en español usa cp1252 por defecto y truena con cualquier
# carácter fuera de ese mapa (un mensaje de error del spooler, una descripción
# acentuada). errors="replace" para que el agente nunca muera por un log.
for _flujo in (sys.stdout, sys.stderr):
    try:
        _flujo.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):  # pragma: no cover - stream redirigido
        pass


def log(mensaje: str) -> None:
    print(f"{datetime.now():%Y-%m-%d %H:%M:%S} | {mensaje}", flush=True)


def imprimir_raw(zpl: str) -> None:
    """Manda el ZPL a la cola de Windows en modo RAW (passthrough).

    El driver "ZDesigner ... ZPL" acepta RAW sin necesidad de compartir la
    impresora ni de habilitar puerto TCP.
    """
    handle = win32print.OpenPrinter(IMPRESORA)
    try:
        win32print.StartDocPrinter(handle, 1, ("Etiqueta de lote", None, "RAW"))
        try:
            win32print.StartPagePrinter(handle)
            win32print.WritePrinter(handle, zpl.encode("utf-8"))
            win32print.EndPagePrinter(handle)
        finally:
            win32print.EndDocPrinter(handle)
    finally:
        win32print.ClosePrinter(handle)


def reclamar() -> list[dict]:
    resp = requests.post(
        f"{BACKEND_URL}/api/impresion/reclamar",
        headers=HEADERS,
        json={"impresora": IMPRESORA, "max": MAX_POR_VUELTA},
        timeout=HTTP_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def confirmar(resultados: list[dict]) -> None:
    resp = requests.post(
        f"{BACKEND_URL}/api/impresion/confirmar",
        headers=HEADERS,
        json={"resultados": resultados},
        timeout=HTTP_TIMEOUT,
    )
    resp.raise_for_status()


def verificar_impresora() -> None:
    """Falla temprano y con un mensaje útil si el nombre de la cola no existe."""
    colas = [p[2] for p in win32print.EnumPrinters(
        win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
    )]
    if IMPRESORA not in colas:
        log(f"ERROR: no existe la impresora '{IMPRESORA}'. Disponibles:")
        for cola in colas:
            log(f"   - {cola}")
        sys.exit(1)


def main() -> None:
    if not GATEWAY_API_KEY:
        log("ERROR: falta GATEWAY_API_KEY (debe ser la misma del backend)")
        sys.exit(1)
    verificar_impresora()
    log(f"Agente de impresion iniciado | {IMPRESORA} | backend {BACKEND_URL}")

    # Resultados que ya se imprimieron pero cuya confirmación no pasó: se
    # reintentan en la siguiente vuelta para no dejar trabajos colgados.
    pendientes_de_confirmar: list[dict] = []

    while True:
        try:
            if pendientes_de_confirmar:
                confirmar(pendientes_de_confirmar)
                log(f"Confirmados {len(pendientes_de_confirmar)} trabajo(s) atrasados")
                pendientes_de_confirmar = []

            trabajos = reclamar()
        except requests.RequestException as e:
            # El backend no responde: los trabajos siguen en la BD, no se pierde nada
            log(f"Backend no disponible ({e.__class__.__name__}); reintentando...")
            time.sleep(INTERVALO_SEGUNDOS)
            continue

        resultados = []
        for trabajo in trabajos:
            try:
                imprimir_raw(trabajo["zpl"])
                resultados.append({"id": trabajo["id"], "ok": True})
                log(f"Impreso trabajo {trabajo['id']}")
            except Exception as e:
                resultados.append({"id": trabajo["id"], "ok": False, "error": str(e)[:500]})
                log(f"FALLÓ trabajo {trabajo['id']}: {e}")

        if resultados:
            try:
                confirmar(resultados)
            except requests.RequestException as e:
                log(f"No se pudo confirmar ({e.__class__.__name__}); se reintenta después")
                pendientes_de_confirmar.extend(resultados)

        time.sleep(INTERVALO_SEGUNDOS)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        log("Agente detenido")
