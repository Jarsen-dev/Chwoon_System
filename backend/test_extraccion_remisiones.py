"""
Prueba local rápida del OCR de remisiones, sin FastAPI de por medio.
Úsala para validar el flujo few-shot contra el servidor Ollama ANTES de
probar los endpoints (flujo de validación local en WSL2).

Uso (dentro del contenedor o con el venv del backend):
  dcl exec -w /app backend python test_extraccion_remisiones.py ruta/a/foto_nueva.jpg

Requiere OLLAMA_HOST / OLLAMA_VISION_MODEL en el entorno (o usa los defaults).
"""

import asyncio
import json
import sys

from app.services.ocr_remisiones import extraer_con_ejemplos, listar_tipos_documento


async def main():
    if len(sys.argv) < 2:
        print("Uso: python test_extraccion_remisiones.py <ruta_imagen>")
        sys.exit(1)

    print(f"Tipos de documento disponibles: {listar_tipos_documento()}\n")

    ruta = sys.argv[1]
    with open(ruta, "rb") as f:
        imagen_bytes = f.read()

    print(f"Analizando {ruta} ...\n")
    resultado = await extraer_con_ejemplos(imagen_bytes)

    print(f"Tipo detectado: {resultado.tipo_detectado}")
    print(f"OCR ok: {resultado.ocr_ok}  {resultado.error or ''}\n")
    print("Datos extraídos:")
    print(json.dumps(resultado.datos, indent=2, ensure_ascii=False))
    print(f"\nCampos que quedaron en null (revisar a mano): {resultado.advertencias}")


if __name__ == "__main__":
    asyncio.run(main())
