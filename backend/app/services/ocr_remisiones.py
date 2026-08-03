"""
Extracción de remisiones en dos pasos deterministas + un LLM de texto liviano,
SIN entrenar/fine-tunear nada:

  1. OCR local (Tesseract) sobre la foto → texto crudo.
  2. Clasificación LOCAL (sin Ollama): similitud TF-IDF entre ese texto y el
     texto OCR (cacheado) de los ejemplos guardados de cada tipo de documento.
  3. Estructuración: un modelo de TEXTO (no visión) de Ollama recibe el texto
     OCR ya leído + 1-2 ejemplos few-shot (texto OCR → JSON esperado) de ESE
     tipo, y solo tiene que acomodarlo en el JSON de salida — nunca "lee"
     píxeles, así que no puede alucinar caracteres que Tesseract no vio.

Mantenimiento: cuando aparece un formato nuevo se agrega una carpeta en
static/ocr_templates/<tipo_documento>/ con 1-2 ejemplos (imagen + JSON) — la
propia UI lo hace al guardar una remisión de formato desconocido. El texto
OCR de cada ejemplo se cachea en un .txt junto a la imagen/JSON la primera
vez que se necesita (o al guardar el template) para no repetir el OCR en
cada clasificación.
"""

import asyncio
import io
import json
import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path

import httpx
import pytesseract
from PIL import Image, ImageOps
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

logger = logging.getLogger(__name__)

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://192.168.1.56:11434")
# Modelo de TEXTO (no de visión): la clasificación ya no usa Ollama y la
# estructuración solo necesita acomodar texto ya leído por Tesseract, así que
# un modelo chico basta y deja espacio de VRAM (el host tiene 8GB, un modelo
# de visión de ~7.8GB no dejaba lugar para nada más).
OLLAMA_TEXT_MODEL = os.getenv("OLLAMA_TEXT_MODEL", "llama3.2:latest")

# /app/app/services/ → /app/static/ocr_templates (mismo volumen que Logo.png,
# escribible por appuser; los templates auto-aprendidos sobreviven rebuilds)
TEMPLATES_DIR = Path(__file__).resolve().parents[2] / "static" / "ocr_templates"

# Ejemplos "curados": los que el usuario crea explícitamente al registrar un
# formato nuevo (archivos ejemplo_N.*). Nunca se borran automáticamente.
MAX_EJEMPLOS_CURADOS = 2
# Ejemplos auto-aprendidos: cada recepción confirmada de un formato YA conocido
# se suma como ejemplo (archivos auto_N.*), rotando FIFO. Es lo que hace que el
# clasificador mejore con el uso en vez de quedarse congelado en 1-2 fotos.
MAX_EJEMPLOS_AUTO = 4
# Cuántos ejemplos few-shot se mandan a Ollama. Deliberadamente bajo y separado
# de los de arriba: el corpus de clasificación quiere MUCHOS ejemplos, pero el
# prompt quiere POCOS (cada ejemplo alarga el prompt y llama3.2 tiene contexto
# limitado). Sin esta separación, aprender haría la extracción cada vez más lenta.
MAX_EJEMPLOS_PROMPT = 2
# Piso absoluto de texto para aceptar un ejemplo auto-aprendido: por debajo de
# esto la foto salió esencialmente ilegible (borrosa, en blanco) y solo metería
# ruido al corpus.
#
# Deliberadamente bajo. Se midió con la foto real de IPA, el formato más débil
# (105 chars de OCR): aprenderla sube el score de una foto IPA nueva de 0.168
# —por DEBAJO del umbral, o sea "desconocido"— a 0.402, sin contaminar los otros
# formatos. Un piso de 200 la habría rechazado y ese formato nunca habría
# mejorado, que es justo el problema que este mecanismo viene a resolver.
MIN_CHARS_TEMPLATE = 100
# Arriba de esto se considera la misma foto resubida; no aporta señal nueva.
UMBRAL_DEDUP_EJEMPLO = 0.98

TESSERACT_LANG = "spa+eng"
OSD_CONFIANZA_MINIMA = 2.0

# Similitud coseno TF-IDF mínima entre el texto OCR de la foto y el mejor
# ejemplo guardado para aceptar ese tipo; si no la alcanza, "desconocido".
# Ajustable sin rebuild — ver el log "clasificación TF-IDF" para calibrar.
#
# Calibrado midiendo contra las fotos reales de producción con la config de
# n-gramas de caracteres de abajo: los verdaderos positivos caen en 0.41-0.76,
# mientras que documentos de formato ajeno (facturas CFDI, recibos de nómina,
# cartas porte) no pasan de 0.149. 0.20 deja ~34% de holgura sobre el peor
# ajeno y queda muy por debajo del verdadero positivo más débil.
#
# El barrido de umbrales mostró que subirlo más sale caro: a 0.25 el acierto
# bajo 30% de ruido de OCR cae de 40% a 7%, sin ganar nada en rechazo (los
# ajenos ya se rechazan desde 0.15). Y de los dos errores posibles, el falso
# negativo es el que duele: obliga a dar de alta un formato duplicado. Un falso
# positivo, en cambio, el usuario lo corrige en la pantalla de revisión.
UMBRAL_SIMILITUD_CLASIFICACION = float(os.getenv("OCR_UMBRAL_SIMILITUD", "0.20"))

# Vectorización por n-gramas de CARACTERES, no por palabras: el texto viene de
# OCR y un solo carácter mal leído destruye la palabra completa como token
# ("Warehouse" → "Warehousc" no comparte nada como palabra, pero comparte
# War/are/reh/eho… como n-gramas). Medido sobre las fotos reales degradando el
# texto artificialmente: con 20% de ruido de OCR el acierto pasa de 43% (por
# palabras) a 88% (por n-gramas), que es justo el escenario de dos fotos
# distintas del mismo papel.
VECTORIZER_KWARGS = {"analyzer": "char_wb", "ngram_range": (3, 5)}

# El modelo de texto se descarga de VRAM tras OLLAMA_KEEP_ALIVE de inactividad
# (60 min, configurado en el servicio Ollama). La primera llamada tras eso
# paga la carga a GPU antes de poder inferir; llamadas subsecuentes con el
# modelo ya caliente responden más rápido. Se consulta /api/ps (TIMEOUT_PS)
# para elegir el timeout adecuado. Más cortos que cuando esto usaba el modelo
# de visión: este modelo es ~4x más chico y no hay tokens de imagen que procesar.
TIMEOUT_PS = 5.0
TIMEOUT_ESTRUCTURACION_FRIO = 45.0
TIMEOUT_ESTRUCTURACION_CALIENTE = 20.0

EXTENSIONES_IMG = (".jpg", ".jpeg", ".png")

PROMPT_SISTEMA = (
    "Eres un extractor de datos de hojas de remisión / departure sheets de almacén. "
    "Recibes texto ya leído por OCR (puede tener errores de reconocimiento, saltos "
    "de línea irregulares o ruido) y SIEMPRE respondes con JSON válido, sin texto "
    "adicional ni markdown. La estructura es exactamente: {\"proveedor\": str, "
    "\"numero_remision\": str, \"po\": str, \"fecha\": \"YYYY-MM-DD\", "
    "\"items\": [{\"numero_parte\": str, \"cantidad\": number}]}. "
    "Si un campo no aparece en el texto o no puedes interpretarlo con confianza "
    "(incluye texto manuscrito que el OCR no pudo leer), usa null para ese campo. "
    "NUNCA inventes ni aproximes un valor que no esté razonablemente presente en el texto."
)


@dataclass
class ResultadoExtraccion:
    tipo_detectado: str
    datos: dict = field(default_factory=dict)
    advertencias: list = field(default_factory=list)  # rutas tipo "items[0].cantidad" en null
    ocr_ok: bool = True
    error: str = ""


def _normalizar_orientacion(imagen: Image.Image) -> Image.Image:
    """Corrige rotaciones de 90/180/270° (comunes en fotos de celular) usando
    el detector de orientación de Tesseract. NO corrige inclinación fina
    (deskew) — fuera de alcance, requeriría OpenCV/Hough.

    Solo se aplica si orientation_conf supera OSD_CONFIANZA_MINIMA: probado
    contra los templates reales de este proyecto, el OSD a veces sugiere una
    rotación de 180°/270° con confianza baja (<2.0) que en realidad EMPEORA
    una foto ya bien orientada (texto legible se vuelve ilegible) — es peor
    rotar mal que no rotar."""
    try:
        osd = pytesseract.image_to_osd(imagen, output_type=pytesseract.Output.DICT)
        angulo = osd.get("rotate", 0)
        confianza = osd.get("orientation_conf", 0)
    except pytesseract.TesseractError:
        # Común en fotos borrosas / con muy poco texto detectable — el OSD
        # truena antes que el OCR principal; seguimos sin rotar.
        return imagen
    if not angulo or confianza < OSD_CONFIANZA_MINIMA:
        return imagen
    return imagen.rotate(-angulo, expand=True)


def _mejorar_para_ocr(imagen: Image.Image) -> Image.Image:
    gris = ImageOps.grayscale(imagen)
    return ImageOps.autocontrast(gris, cutoff=1)


def _texto_ocr_desde_imagen(imagen_bytes: bytes) -> str:
    """OCR local (Tesseract) sobre una foto. Puede lanzar
    pytesseract.TesseractNotFoundError (binario no instalado) o errores de
    PIL si los bytes no son una imagen válida; el caller decide cómo mapear
    eso a ResultadoExtraccion(ocr_ok=False, ...)."""
    imagen = Image.open(io.BytesIO(imagen_bytes))
    imagen = _normalizar_orientacion(imagen)
    imagen = _mejorar_para_ocr(imagen)
    return pytesseract.image_to_string(imagen, lang=TESSERACT_LANG)


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


def _texto_ejemplo_cacheado(json_path: Path, img_path: Path) -> str:
    """Texto OCR de un ejemplo, cacheado en ejemplo_N.txt junto a la imagen/JSON.
    Si no existe (o quedó vacío por un intento previo fallido), lo genera y
    lo escribe para la próxima vez — auto-sana sin script de migración."""
    txt_path = json_path.with_suffix(".txt")
    if txt_path.is_file():
        texto = txt_path.read_text(encoding="utf-8")
        if texto.strip():
            return texto
    try:
        texto = _texto_ocr_desde_imagen(img_path.read_bytes())
    except Exception as e:
        logger.warning("No se pudo generar OCR cacheado para %s (%s)", img_path.name, e)
        return ""
    try:
        txt_path.write_text(texto, encoding="utf-8")
    except OSError as e:
        logger.warning("No se pudo escribir cache OCR %s (%s); se recalculará en cada lectura", txt_path, e)
    return texto


def _jsons_ordenados(carpeta: Path, solo_curados: bool = False) -> list:
    """Rutas de los JSON de ejemplo, SIEMPRE con los curados (ejemplo_N) primero
    y luego los auto-aprendidos (auto_N), cada grupo en orden natural.

    El orden importa: `sorted(glob("*.json"))` pondría "auto_*" antes que
    "ejemplo_*" por alfabeto, y al recortar por límite los auto-aprendidos
    desplazarían a los curados justo en el prompt few-shot, que es donde más
    queremos los curados."""
    curados = sorted(carpeta.glob("ejemplo_*.json"))
    if solo_curados:
        return curados
    return curados + sorted(carpeta.glob("auto_*.json"))


def _cargar_ejemplos(tipo: str, limite: int | None = None, solo_curados: bool = False) -> list:
    """Regresa lista de (texto_ocr_ejemplo, json_esperado_como_string) para un tipo.
    Salta pares con JSON no parseable, sin imagen, o sin texto OCR utilizable,
    con warning en logs.

    Sin `limite` regresa todos (curados + auto-aprendidos) — es lo que quiere el
    clasificador. El prompt few-shot pasa `limite=MAX_EJEMPLOS_PROMPT,
    solo_curados=True` para no crecer conforme el sistema aprende."""
    carpeta = TEMPLATES_DIR / tipo
    if not carpeta.is_dir():
        return []
    candidatos = _jsons_ordenados(carpeta, solo_curados=solo_curados)
    if limite is not None:
        candidatos = candidatos[:limite]
    ejemplos = []
    for json_path in candidatos:
        img_path = next(
            (p for ext in EXTENSIONES_IMG if (p := json_path.with_suffix(ext)).exists()),
            None,
        )
        if img_path is None:
            logger.warning("ocr_templates/%s: %s sin imagen acompañante, se omite", tipo, json_path.name)
            continue
        try:
            texto_json = json_path.read_text(encoding="utf-8").strip()
            json.loads(texto_json)  # validar; se envía el texto tal cual
        except (json.JSONDecodeError, OSError) as e:
            logger.warning("ocr_templates/%s: %s inválido (%s), se omite", tipo, json_path.name, e)
            continue
        texto_ocr = _texto_ejemplo_cacheado(json_path, img_path)
        if not texto_ocr.strip():
            logger.warning("ocr_templates/%s: %s sin texto OCR utilizable, se omite", tipo, json_path.name)
            continue
        ejemplos.append((texto_ocr, texto_json))
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
    if len(existentes) >= MAX_EJEMPLOS_CURADOS:
        raise ValueError(
            f"El tipo '{slug}' ya tiene {MAX_EJEMPLOS_CURADOS} ejemplos; "
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
    try:
        texto = _texto_ocr_desde_imagen(foto_bytes)
        (carpeta / f"ejemplo_{n}.txt").write_text(texto, encoding="utf-8")
    except Exception as e:
        logger.warning(
            "No se pudo cachear OCR del template nuevo %s/ejemplo_%s (%s); "
            "se generará de forma perezosa la próxima vez que se lea", slug, n, e,
        )
    return json_path.relative_to(TEMPLATES_DIR).as_posix()


def _borrar_ejemplo(json_path: Path) -> None:
    """Borra un ejemplo completo (json + txt + imagen, cualquier extensión)."""
    for p in [json_path, json_path.with_suffix(".txt")] + [
        json_path.with_suffix(ext) for ext in EXTENSIONES_IMG
    ]:
        try:
            p.unlink(missing_ok=True)
        except OSError as e:
            logger.warning("No se pudo borrar %s (%s)", p, e)


def agregar_ejemplo_auto(tipo: str, foto_bytes: bytes, datos: dict, extension: str = ".jpg") -> str:
    """Suma una recepción YA confirmada de un formato conocido como ejemplo
    auto-aprendido (auto_N.*), para que el clasificador mejore con el uso.

    A diferencia de `guardar_template` (formatos nuevos, ejemplos curados por el
    usuario), esto corre solo y por lo tanto es conservador: descarta fotos con
    OCR pobre y fotos duplicadas, y rota FIFO en vez de acumular sin límite.
    Nunca toca los ejemplo_N curados.

    Regresa la ruta relativa del JSON guardado, o "" si se decidió no aprender
    de esta foto. NO lanza por condiciones esperadas (OCR pobre, duplicado);
    sí puede lanzar por errores de disco, que el caller debe absorber.
    """
    slug = slugify_tipo(tipo)
    carpeta = TEMPLATES_DIR / slug
    if not slug or not carpeta.is_dir():
        return ""

    texto = _texto_ocr_desde_imagen(foto_bytes)
    if len(texto.strip()) < MIN_CHARS_TEMPLATE:
        logger.info(
            "OCR remisiones: no se aprende de esta foto de '%s' — texto OCR muy corto "
            "(%s chars < %s), sería ruido en el corpus",
            slug, len(texto.strip()), MIN_CHARS_TEMPLATE,
        )
        return ""

    # ¿Es prácticamente la misma foto que un ejemplo que ya tenemos?
    existentes_texto = [t for t, _ in _cargar_ejemplos(slug)]
    if existentes_texto:
        try:
            vectorizer = TfidfVectorizer(**VECTORIZER_KWARGS)
            matriz = vectorizer.fit_transform(existentes_texto + [texto])
            similitudes = cosine_similarity(matriz[-1], matriz[:-1])[0]
            if float(similitudes.max()) > UMBRAL_DEDUP_EJEMPLO:
                logger.info(
                    "OCR remisiones: no se aprende de esta foto de '%s' — casi idéntica "
                    "a un ejemplo existente (sim=%.3f)", slug, float(similitudes.max()),
                )
                return ""
        except ValueError:
            pass  # corpus degenerado; seguimos y guardamos igual

    autos = sorted(carpeta.glob("auto_*.json"), key=lambda p: p.stat().st_mtime)
    while len(autos) >= MAX_EJEMPLOS_AUTO:
        viejo = autos.pop(0)
        logger.info("OCR remisiones: rotando ejemplo auto-aprendido %s/%s", slug, viejo.name)
        _borrar_ejemplo(viejo)

    # Índice libre: no reusar len()+1 porque la rotación deja huecos.
    usados = {p.stem for p in carpeta.glob("auto_*.json")}
    n = next(i for i in range(1, MAX_EJEMPLOS_AUTO + 2) if f"auto_{i}" not in usados)

    if extension.lower() not in EXTENSIONES_IMG:
        extension = ".jpg"
    (carpeta / f"auto_{n}{extension.lower()}").write_bytes(foto_bytes)
    json_path = carpeta / f"auto_{n}.json"
    json_path.write_text(
        json.dumps(datos, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    (carpeta / f"auto_{n}.txt").write_text(texto, encoding="utf-8")
    logger.info("OCR remisiones: aprendido ejemplo nuevo %s/auto_%s", slug, n)
    return json_path.relative_to(TEMPLATES_DIR).as_posix()


async def _modelo_esta_caliente() -> bool:
    """Consulta /api/ps para saber si OLLAMA_TEXT_MODEL ya está cargado en VRAM.
    Si la consulta falla (Ollama caído, red intermitente) asume que NO está
    caliente — es la opción segura, da más tiempo en vez de cortar antes de hora."""
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_PS) as client:
            res = await client.get(f"{OLLAMA_HOST}/api/ps")
            res.raise_for_status()
            modelos = res.json().get("models", [])
    except httpx.HTTPError:
        return False
    base = OLLAMA_TEXT_MODEL.split(":")[0]
    return any((m.get("name") or "").split(":")[0] == base for m in modelos)


def _clasificar_por_texto(texto_ocr: str) -> str:
    """Clasifica comparando el texto OCR de la foto contra el texto OCR
    cacheado de cada ejemplo de cada tipo (TF-IDF + similitud coseno). No usa
    Ollama — determinista, local y gratis, y a diferencia del clasificador
    anterior sí "mira" el contenido real de los templates guardados."""
    tipos = listar_tipos_documento()
    if not tipos:
        return "desconocido"

    corpus, corpus_tipo = [], []
    for tipo in tipos:
        for texto_ejemplo, _json in _cargar_ejemplos(tipo):
            if texto_ejemplo.strip():
                corpus.append(texto_ejemplo)
                corpus_tipo.append(tipo)

    if not corpus or not texto_ocr.strip():
        return "desconocido"

    vectorizer = TfidfVectorizer(**VECTORIZER_KWARGS)
    matriz = vectorizer.fit_transform(corpus + [texto_ocr])
    similitudes = cosine_similarity(matriz[-1], matriz[:-1])[0]
    mejor_idx = int(similitudes.argmax())
    mejor_score = float(similitudes[mejor_idx])

    # Se loguea también el mejor de OTRO tipo: el margen entre ambos es lo que
    # dice si la clasificación fue clara o apenas ganó, y es lo que hay que
    # mirar para recalibrar UMBRAL_SIMILITUD_CLASIFICACION sin adivinar.
    mejor_tipo = corpus_tipo[mejor_idx]
    scores_otros = [s for s, t in zip(similitudes, corpus_tipo) if t != mejor_tipo]
    segundo = max(scores_otros) if scores_otros else 0.0
    logger.info(
        "OCR remisiones: clasificación TF-IDF → %s (score=%.3f, 2º tipo=%.3f, "
        "margen=%.3f, umbral=%.3f, %s ejemplos de %s tipos)",
        mejor_tipo, mejor_score, segundo, mejor_score - segundo,
        UMBRAL_SIMILITUD_CLASIFICACION, len(corpus), len(tipos),
    )
    if mejor_score < UMBRAL_SIMILITUD_CLASIFICACION:
        return "desconocido"
    return corpus_tipo[mejor_idx]


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
    """OCR local + clasificación local + estructuración few-shot con un modelo
    de texto liviano, usando los ejemplos etiquetados de ocr_templates/.

    NUNCA lanza excepción por fallas de Tesseract u Ollama: regresa
    ocr_ok=False y el flujo continúa con captura manual (la foto ya quedó
    guardada en el router).
    """
    try:
        texto_ocr = await asyncio.to_thread(_texto_ocr_desde_imagen, imagen_bytes)
    except pytesseract.TesseractNotFoundError:
        logger.error("OCR remisiones: tesseract-ocr no está instalado en el contenedor")
        return ResultadoExtraccion(
            tipo_detectado="desconocido",
            ocr_ok=False,
            error="El servidor no tiene instalado el motor de OCR; captura los campos manualmente",
        )
    except Exception as e:  # imagen corrupta / no decodable, etc.
        logger.error("OCR remisiones: no se pudo leer/OCR'ar la imagen (%s)", e)
        return ResultadoExtraccion(
            tipo_detectado="desconocido",
            ocr_ok=False,
            error="No se pudo procesar la imagen; captura los campos manualmente",
        )

    if not texto_ocr.strip():
        return ResultadoExtraccion(
            tipo_detectado="desconocido",
            ocr_ok=False,
            error="No se detectó texto legible en la foto; captura los campos manualmente",
        )

    tipo = await asyncio.to_thread(_clasificar_por_texto, texto_ocr)

    mensajes = [{"role": "system", "content": PROMPT_SISTEMA}]

    if tipo != "desconocido":
        # Solo los curados y como máximo MAX_EJEMPLOS_PROMPT: el corpus de
        # clasificación crece conforme el sistema aprende, pero el prompt no debe.
        ejemplos = await asyncio.to_thread(
            _cargar_ejemplos, tipo, MAX_EJEMPLOS_PROMPT, True
        )
        for texto_ejemplo, json_ejemplo in ejemplos:
            mensajes.append({
                "role": "user",
                "content": f"Extrae los campos de este texto OCR de ejemplo, en formato JSON:\n\n{texto_ejemplo}",
            })
            mensajes.append({"role": "assistant", "content": json_ejemplo})

    mensajes.append({
        "role": "user",
        "content": (
            "Ahora extrae los campos de este NUEVO texto OCR, siguiendo EXACTAMENTE "
            "la misma estructura JSON de los ejemplos anteriores (mismas llaves, "
            "mismo formato de fecha, items como lista). El texto puede tener errores "
            "de OCR (caracteres mal reconocidos, saltos de línea irregulares, ruido) "
            "— interprétalo lo mejor posible pero NUNCA inventes un valor que no esté "
            f"razonablemente presente en él. Si un campo no es legible, usa null.\n\n{texto_ocr}"
        ),
    })

    payload = {
        "model": OLLAMA_TEXT_MODEL,
        "messages": mensajes,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.1, "num_predict": 800},
    }

    caliente = await _modelo_esta_caliente()
    timeout = TIMEOUT_ESTRUCTURACION_CALIENTE if caliente else TIMEOUT_ESTRUCTURACION_FRIO
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            res = await client.post(f"{OLLAMA_HOST}/api/chat", json=payload)
            res.raise_for_status()
            contenido = res.json()["message"]["content"]
        datos = _parsear_json_respuesta(contenido)
    except httpx.TimeoutException:
        logger.error("OCR remisiones: estructuración excedió %ss", timeout)
        return ResultadoExtraccion(
            tipo_detectado=tipo,
            ocr_ok=False,
            error="El modelo tardó demasiado en responder; captura los campos manualmente",
        )
    except (httpx.HTTPError, KeyError, ValueError) as e:
        logger.error("OCR remisiones: estructuración falló (%s)", e)
        return ResultadoExtraccion(
            tipo_detectado=tipo,
            ocr_ok=False,
            error=f"La estructuración falló ({type(e).__name__}); captura los campos manualmente",
        )

    return ResultadoExtraccion(
        tipo_detectado=tipo,
        datos=datos,
        advertencias=_encontrar_campos_null(datos),
    )
