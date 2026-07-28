"""
Extracción de remisiones con in-context learning (few-shot) sobre Ollama
(llama3.2-vision), SIN entrenar/fine-tunear nada.

Flujo:
  1. Clasificar qué tipo de documento es (1 llamada corta, sin imágenes de ejemplo)
  2. Construir una conversación multi-turno donde le "enseñamos" al modelo
     1-2 ejemplos reales de ESE tipo de documento ya resueltos correctamente
     (imagen + JSON esperado), y al final le pedimos que resuelva el documento
     nuevo siguiendo el mismo patrón. El modelo generaliza el patrón sin
     reentrenar un solo peso.

Mantenimiento: cuando aparece un formato nuevo se agrega una carpeta en
static/ocr_templates/<tipo_documento>/ con 1-2 ejemplos (imagen + JSON) — la
propia UI lo hace al guardar una remisión de formato desconocido.
"""

import asyncio
import base64
import json
import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path

import httpx

logger = logging.getLogger(__name__)

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://192.168.1.56:11434")
OLLAMA_VISION_MODEL = os.getenv("OLLAMA_VISION_MODEL", "llama3.2-vision")

# /app/app/services/ → /app/static/ocr_templates (mismo volumen que Logo.png,
# escribible por appuser; los templates auto-aprendidos sobreviven rebuilds)
TEMPLATES_DIR = Path(__file__).resolve().parents[2] / "static" / "ocr_templates"

# Máximo de ejemplos que se envían por tipo de documento.
# Más ejemplos = más precisión potencial, pero también más tokens de imagen
# y más lento en un servidor sin GPU dedicada.
MAX_EJEMPLOS_POR_TIPO = 2

TIMEOUT_CLASIFICACION = 30.0
TIMEOUT_EXTRACCION = 120.0

EXTENSIONES_IMG = (".jpg", ".jpeg", ".png")

PROMPT_SISTEMA = (
    "Eres un extractor de datos de hojas de remisión / departure sheets de almacén. "
    "SIEMPRE respondes con JSON válido, sin texto adicional ni markdown. "
    "La estructura es exactamente: {\"proveedor\": str, \"numero_remision\": str, "
    "\"po\": str, \"fecha\": \"YYYY-MM-DD\", \"items\": [{\"numero_parte\": str, "
    "\"cantidad\": number}]}. "
    "Si un campo no es legible con alta confianza (incluye escritura a mano borrosa, "
    "tachado, o tapado por sello/firma), usa null para ese campo. "
    "NUNCA inventes ni aproximes un valor que no puedas leer con certeza."
)


@dataclass
class ResultadoExtraccion:
    tipo_detectado: str
    datos: dict = field(default_factory=dict)
    advertencias: list = field(default_factory=list)  # rutas tipo "items[0].cantidad" en null
    ocr_ok: bool = True
    error: str = ""


def _b64(datos: bytes) -> str:
    return base64.b64encode(datos).decode()


def listar_tipos_documento() -> list:
    """Tipos de documento disponibles = subcarpetas de ocr_templates con al menos
    un par imagen+JSON válido."""
    if not TEMPLATES_DIR.is_dir():
        return []
    tipos = []
    for d in sorted(TEMPLATES_DIR.iterdir()):
        if d.is_dir() and not d.name.startswith(".") and _cargar_ejemplos(d.name):
            tipos.append(d.name)
    return tipos


def _cargar_ejemplos(tipo: str) -> list:
    """Regresa lista de (imagen_base64, json_esperado_como_string) para un tipo.
    Salta pares con JSON no parseable o sin imagen, con warning en logs."""
    carpeta = TEMPLATES_DIR / tipo
    if not carpeta.is_dir():
        return []
    ejemplos = []
    for json_path in sorted(carpeta.glob("*.json"))[:MAX_EJEMPLOS_POR_TIPO]:
        img_path = next(
            (p for ext in EXTENSIONES_IMG if (p := json_path.with_suffix(ext)).exists()),
            None,
        )
        if img_path is None:
            logger.warning("ocr_templates/%s: %s sin imagen acompañante, se omite", tipo, json_path.name)
            continue
        try:
            texto = json_path.read_text(encoding="utf-8").strip()
            json.loads(texto)  # validar; se envía el texto tal cual
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("ocr_templates/%s: %s inválido (%s), se omite", tipo, json_path.name, e)
            continue
        ejemplos.append((_b64(img_path.read_bytes()), texto))
    return ejemplos


def slugify_tipo(nombre: str) -> str:
    """Normaliza el nombre de un tipo de documento a slug [a-z0-9_]."""
    slug = re.sub(r"[^a-z0-9]+", "_", nombre.strip().lower()).strip("_")
    return slug[:80]


def guardar_template(tipo: str, foto_bytes: bytes, datos: dict, extension: str = ".jpg") -> str:
    """Guarda un ejemplo etiquetado nuevo (foto + JSON corregido por el usuario)
    para que futuras remisiones de este formato se extraigan por few-shot.

    Regresa la ruta relativa del JSON guardado. Lanza ValueError si el tipo ya
    tiene el máximo de ejemplos (no tiene caso acumular más).
    """
    slug = slugify_tipo(tipo)
    if not slug:
        raise ValueError("Nombre de tipo de documento inválido")
    carpeta = TEMPLATES_DIR / slug
    carpeta.mkdir(parents=True, exist_ok=True)
    existentes = sorted(carpeta.glob("ejemplo_*.json"))
    if len(existentes) >= MAX_EJEMPLOS_POR_TIPO:
        raise ValueError(
            f"El tipo '{slug}' ya tiene {MAX_EJEMPLOS_POR_TIPO} ejemplos; "
            "edítalos manualmente si quieres reemplazarlos"
        )
    n = len(existentes) + 1
    if extension.lower() not in EXTENSIONES_IMG:
        extension = ".jpg"
    (carpeta / f"ejemplo_{n}{extension.lower()}").write_bytes(foto_bytes)
    json_path = carpeta / f"ejemplo_{n}.json"
    json_path.write_text(
        json.dumps(datos, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    return json_path.relative_to(TEMPLATES_DIR).as_posix()


async def _clasificar_documento(imagen_b64: str, tipos: list) -> str:
    if not tipos:
        return "desconocido"

    prompt = (
        f"Observa esta imagen de un documento de almacén. "
        f"¿Cuál de estos tipos de documento es? Opciones: {', '.join(tipos)}, o 'desconocido' "
        f"si no coincide con ninguno. Responde ÚNICAMENTE con el nombre exacto del tipo, "
        f"nada más."
    )
    payload = {
        "model": OLLAMA_VISION_MODEL,
        "prompt": prompt,
        "images": [imagen_b64],
        "stream": False,
        "options": {"temperature": 0.0, "num_predict": 20},
    }
    async with httpx.AsyncClient(timeout=TIMEOUT_CLASIFICACION) as client:
        res = await client.post(f"{OLLAMA_HOST}/api/generate", json=payload)
        res.raise_for_status()
        tipo = res.json()["response"].strip().lower()

    return tipo if tipo in tipos else "desconocido"


def _parsear_json_respuesta(contenido: str) -> dict:
    """Ollama con format:'json' normalmente devuelve JSON limpio, pero por si el
    modelo agrega texto extra intentamos extraer el bloque {...} como respaldo."""
    try:
        return json.loads(contenido)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", contenido)
        if not match:
            raise ValueError(f"El modelo no devolvió JSON válido: {contenido[:200]}")
        return json.loads(match.group(0))


def _encontrar_campos_null(datos, ruta: str = "") -> list:
    """Recorre el JSON extraído y regresa las rutas de todos los campos en null,
    para que el frontend sepa exactamente qué resaltar."""
    advertencias = []
    if isinstance(datos, dict):
        for clave, valor in datos.items():
            nueva_ruta = f"{ruta}.{clave}" if ruta else clave
            advertencias.extend(_encontrar_campos_null(valor, nueva_ruta))
    elif isinstance(datos, list):
        for i, item in enumerate(datos):
            advertencias.extend(_encontrar_campos_null(item, f"{ruta}[{i}]"))
    elif datos is None:
        advertencias.append(ruta)
    return advertencias


async def extraer_con_ejemplos(imagen_bytes: bytes) -> ResultadoExtraccion:
    """Clasifica el documento y extrae sus campos usando few-shot / in-context
    learning con los ejemplos etiquetados de ocr_templates/.

    NUNCA lanza excepción por fallas de Ollama: regresa ocr_ok=False y el
    flujo continúa con captura manual (la foto ya quedó guardada en el router).
    """
    imagen_b64 = _b64(imagen_bytes)
    tipos = await asyncio.to_thread(listar_tipos_documento)

    try:
        tipo = await _clasificar_documento(imagen_b64, tipos)
    except (httpx.HTTPError, KeyError, ValueError) as e:
        logger.error("OCR remisiones: clasificación falló (%s)", e)
        return ResultadoExtraccion(
            tipo_detectado="desconocido",
            ocr_ok=False,
            error=f"No se pudo contactar el servidor de IA ({type(e).__name__})",
        )

    mensajes = [{"role": "system", "content": PROMPT_SISTEMA}]

    if tipo != "desconocido":
        ejemplos = await asyncio.to_thread(_cargar_ejemplos, tipo)
        for ejemplo_img, ejemplo_json in ejemplos:
            mensajes.append({
                "role": "user",
                "content": "Extrae los campos de este documento de ejemplo, en formato JSON.",
                "images": [ejemplo_img],
            })
            mensajes.append({"role": "assistant", "content": ejemplo_json})

    mensajes.append({
        "role": "user",
        "content": (
            "Ahora extrae los campos de este NUEVO documento, siguiendo EXACTAMENTE "
            "la misma estructura JSON de los ejemplos anteriores (mismas llaves, "
            "mismo formato de fecha, items como lista). Si un campo no es legible, usa null."
        ),
        "images": [imagen_b64],
    })

    payload = {
        "model": OLLAMA_VISION_MODEL,
        "messages": mensajes,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.1, "num_predict": 800},
    }

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_EXTRACCION) as client:
            res = await client.post(f"{OLLAMA_HOST}/api/chat", json=payload)
            res.raise_for_status()
            contenido = res.json()["message"]["content"]
        datos = _parsear_json_respuesta(contenido)
    except httpx.TimeoutException:
        logger.error("OCR remisiones: extracción excedió %ss", TIMEOUT_EXTRACCION)
        return ResultadoExtraccion(
            tipo_detectado=tipo,
            ocr_ok=False,
            error="El modelo tardó demasiado en responder; captura los campos manualmente",
        )
    except (httpx.HTTPError, KeyError, ValueError) as e:
        logger.error("OCR remisiones: extracción falló (%s)", e)
        return ResultadoExtraccion(
            tipo_detectado=tipo,
            ocr_ok=False,
            error=f"La extracción falló ({type(e).__name__}); captura los campos manualmente",
        )

    return ResultadoExtraccion(
        tipo_detectado=tipo,
        datos=datos,
        advertencias=_encontrar_campos_null(datos),
    )
