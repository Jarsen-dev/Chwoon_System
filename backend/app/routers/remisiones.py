"""Recepciones por foto (OCR) — subtab nueva de Almacén.

Flujo independiente del de Compras/OC: el personal fotografía la hoja de
remisión física, Ollama extrae los campos por few-shot (services/ocr_remisiones),
el usuario corrige en un formulario editable y se guarda con la foto como
evidencia de auditoría. Incluye handoff QR celular↔computadora.

Prefijo /api/remisiones: ya proxeado por la regla catch-all /api/:path* de
next.config.ts y exento del middleware de roles del frontend.
"""

import asyncio
import logging
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import Date, String, cast, delete, exists, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_almacen, get_db
from app.models.impresion_trabajo import (
    ESTADO_IMPRESO,
    ESTADO_PENDIENTE as ESTADO_PENDIENTE_IMPRESION,
    FORMATO_PDF,
    FORMATO_ZPL,
    ImpresionTrabajo,
)
from app.models.lote_inventario import LoteInventario, MovimientoLote
from app.models.producto import Producto
from app.models.remision_etiqueta import RemisionEtiqueta
from app.models.remision_qr_sesion import (
    ESTADO_PENDIENTE,
    ESTADO_SUBIDA,
    ESTADO_USADA,
    RemisionQrSesion,
)
from app.models.remision_recepcion import RemisionRecepcion, RemisionRecepcionItem
from app.models.usuario import Usuario
from app.schemas.remision_recepcion import (
    EtiquetaOut,
    EtiquetasCreate,
    QrSesionEstado,
    QrSesionOut,
    RemisionCreate,
    RemisionesPage,
    RemisionOCRItem,
    RemisionOCRResponse,
    RemisionOut,
    ReimprimirIn,
)
from app.services import impresion_red, ocr_remisiones, pdf_etiquetas, zpl_etiquetas

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/remisiones", tags=["remisiones"])

TZ_LOCAL = timezone(timedelta(hours=-6))

# /app/app/routers/ → /app/static/remisiones (mismo volumen que Logo.png)
FOTOS_ROOT = Path(__file__).resolve().parents[2] / "static" / "remisiones"

QR_SESION_MINUTOS = 10
MAX_FOTO_BYTES = 15 * 1024 * 1024  # 15 MB
EXTENSIONES_FOTO = {".jpg", ".jpeg", ".png", ".webp"}
# Nombres generados por el servidor: <uuid4>.<ext> — nada más se sirve
NOMBRE_FOTO_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$")


def _ahora() -> datetime:
    return datetime.now(TZ_LOCAL)


def _aware(dt: datetime) -> datetime:
    """SQLite (tests) regresa naive aunque la columna sea timezone=True."""
    return dt if dt.tzinfo else dt.replace(tzinfo=TZ_LOCAL)


async def _guardar_foto(file: UploadFile) -> tuple[str, bytes]:
    """Valida y persiste la foto en static/remisiones/. Regresa (ruta_relativa, bytes)."""
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="El archivo debe ser una imagen")
    contenido = await file.read()
    if not contenido:
        raise HTTPException(status_code=400, detail="Archivo vacío")
    if len(contenido) > MAX_FOTO_BYTES:
        raise HTTPException(status_code=413, detail="La imagen excede el máximo de 15 MB")

    ext = Path(file.filename or "").suffix.lower()
    if ext not in EXTENSIONES_FOTO:
        ext = ".jpg"
    FOTOS_ROOT.mkdir(parents=True, exist_ok=True)
    nombre = f"{uuid.uuid4()}{ext}"
    (FOTOS_ROOT / nombre).write_bytes(contenido)
    return f"remisiones/{nombre}", contenido


def _foto_absoluta(foto_path: str) -> Path:
    """Resuelve una ruta relativa 'remisiones/<archivo>' con guard de traversal."""
    nombre = Path(foto_path).name
    if not NOMBRE_FOTO_RE.match(nombre):
        raise HTTPException(status_code=404, detail="Foto no encontrada")
    path = (FOTOS_ROOT / nombre).resolve()
    if not path.is_relative_to(FOTOS_ROOT.resolve()) or not path.is_file():
        raise HTTPException(status_code=404, detail="Foto no encontrada")
    return path


def _resultado_a_response(resultado, foto_path: str) -> RemisionOCRResponse:
    """Mapea ResultadoExtraccion → respuesta del endpoint, tolerante a la forma
    del JSON que haya devuelto el modelo."""
    datos = resultado.datos if isinstance(resultado.datos, dict) else {}
    items_raw = datos.get("items") if isinstance(datos.get("items"), list) else []
    items = []
    for it in items_raw:
        if not isinstance(it, dict):
            continue
        cantidad = it.get("cantidad")
        if isinstance(cantidad, str):
            try:
                cantidad = float(cantidad.replace(",", ""))
            except ValueError:
                cantidad = None
        numero_parte = it.get("numero_parte")
        items.append(RemisionOCRItem(
            numero_parte=str(numero_parte) if numero_parte is not None else None,
            cantidad=cantidad,
        ))

    def _texto(clave: str):
        v = datos.get(clave)
        return str(v) if v is not None else None

    return RemisionOCRResponse(
        tipo_detectado=resultado.tipo_detectado,
        tipo_conocido=resultado.tipo_detectado != "desconocido",
        proveedor=_texto("proveedor"),
        numero_remision=_texto("numero_remision"),
        po=_texto("po"),
        fecha=_texto("fecha"),
        items=items,
        foto_path=foto_path,
        advertencias=resultado.advertencias,
        ocr_ok=resultado.ocr_ok,
        error=resultado.error,
    )


# ══════════════════════════════════════════════════════════════════════
# OCR
# ══════════════════════════════════════════════════════════════════════

@router.post("/ocr", response_model=RemisionOCRResponse)
@router.post("/ocr/", response_model=RemisionOCRResponse)
async def ocr_remision(
    file: UploadFile = File(...),
    user: Usuario = Depends(get_current_almacen),
):
    """Guarda la foto SIEMPRE (evidencia) y corre clasificación + extracción
    few-shot. Si Ollama falla, responde 200 con ocr_ok=false e items vacíos:
    el personal captura a mano y el flujo no se rompe."""
    foto_path, contenido = await _guardar_foto(file)
    resultado = await ocr_remisiones.extraer_con_ejemplos(contenido)
    return _resultado_a_response(resultado, foto_path)


@router.post("/ocr/desde-sesion/{session_id}", response_model=RemisionOCRResponse)
@router.post("/ocr/desde-sesion/{session_id}/", response_model=RemisionOCRResponse)
async def ocr_desde_sesion(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_almacen),
):
    """Corre el OCR sobre la foto que el celular ya subió a la sesión QR."""
    sesion = await db.get(RemisionQrSesion, session_id)
    if not sesion or not sesion.foto_path or sesion.estado != ESTADO_SUBIDA:
        raise HTTPException(status_code=404, detail="Sesión sin foto disponible")

    path = _foto_absoluta(sesion.foto_path)
    contenido = path.read_bytes()

    sesion.estado = ESTADO_USADA
    await db.commit()

    resultado = await ocr_remisiones.extraer_con_ejemplos(contenido)
    return _resultado_a_response(resultado, sesion.foto_path)


# ══════════════════════════════════════════════════════════════════════
# GUARDADO Y CONSULTA
# ══════════════════════════════════════════════════════════════════════

@router.post("", response_model=RemisionOut, status_code=201)
@router.post("/", response_model=RemisionOut, status_code=201)
async def crear_remision(
    payload: RemisionCreate,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_almacen),
):
    if not payload.items:
        raise HTTPException(status_code=400, detail="La remisión debe tener al menos un item")

    foto = _foto_absoluta(payload.foto_path)  # valida que la foto exista

    # Validar TODOS los números de parte contra el catálogo de productos y
    # tomar snapshot de descripción/unidad (mismo criterio que GET /productos/{sku}:
    # primer match por modelo, ya que sku solo no es único)
    skus = sorted({item.numero_parte.strip().upper() for item in payload.items})
    result = await db.execute(
        select(Producto).where(Producto.sku.in_(skus)).order_by(Producto.sku, Producto.modelo)
    )
    catalogo: dict = {}
    for p in result.scalars():
        catalogo.setdefault(p.sku, p)

    desconocidos = [sku for sku in skus if sku not in catalogo]
    if desconocidos:
        raise HTTPException(
            status_code=400,
            detail=(
                "Números de parte no registrados en Productos: "
                + ", ".join(desconocidos)
                + ". Agrégalos primero en el catálogo de Productos."
            ),
        )

    tipo_documento = payload.tipo_documento
    template_json = {
        "proveedor": payload.proveedor,
        "numero_remision": payload.numero_remision,
        "po": payload.po,
        "fecha": payload.fecha.isoformat(),
        "items": [
            {"numero_parte": i.numero_parte.strip().upper(), "cantidad": float(i.cantidad)}
            for i in payload.items
        ],
    }
    if payload.nuevo_formato:
        # Formato nuevo: además del registro se guarda foto + JSON corregido
        # como template para futuras recepciones de este proveedor/formato
        slug = ocr_remisiones.slugify_tipo(payload.nuevo_formato.tipo_documento)
        if slug in ocr_remisiones.listar_tipos_documento():
            raise HTTPException(
                status_code=409,
                detail=f"Ya existe un template llamado '{slug}'; usa otro nombre",
            )
        try:
            # guardar_template ahora también corre OCR local (Tesseract) para
            # cachear el texto del ejemplo — es CPU-bound, va a un hilo aparte
            # para no bloquear el event loop.
            await asyncio.to_thread(
                ocr_remisiones.guardar_template,
                slug, foto.read_bytes(), template_json, extension=foto.suffix,
            )
        except ValueError as e:
            raise HTTPException(status_code=409, detail=str(e))
        tipo_documento = slug
    elif tipo_documento in ocr_remisiones.listar_tipos_documento():
        # Formato YA conocido: esta recepción confirmada por el usuario es un
        # ejemplo etiquetado gratis. Sumarlo hace que el clasificador mejore con
        # el uso en vez de quedarse congelado en las 1-2 fotos iniciales.
        # Es best-effort: si falla, la recepción se guarda igual.
        try:
            await asyncio.to_thread(
                ocr_remisiones.agregar_ejemplo_auto,
                tipo_documento, foto.read_bytes(), template_json, extension=foto.suffix,
            )
        except Exception as e:
            logger.warning(
                "No se pudo aprender de la recepción de '%s' (%s); se guarda igual",
                tipo_documento, e,
            )

    remision = RemisionRecepcion(
        proveedor=payload.proveedor.strip(),
        numero_remision=payload.numero_remision.strip(),
        po=payload.po.strip() if payload.po else None,
        fecha=payload.fecha,
        tipo_documento=tipo_documento,
        foto_path=payload.foto_path,
        ocr_raw=payload.ocr_raw,
        advertencias=payload.advertencias,
        creado_por=user.username,
        fecha_captura=_ahora(),
    )
    for item in payload.items:
        sku = item.numero_parte.strip().upper()
        producto = catalogo[sku]
        remision.items.append(RemisionRecepcionItem(
            numero_parte=sku,
            cantidad=item.cantidad,
            descripcion=(producto.descripcion or producto.nombre or "")[:255] or None,
            unidad_de_medida=producto.unidad_de_medida,
        ))

    db.add(remision)
    await db.commit()
    # Re-consultar para que lazy="selectin" cargue items (refresh no carga relaciones)
    result = await db.execute(
        select(RemisionRecepcion).where(RemisionRecepcion.id == remision.id)
    )
    return result.scalars().first()


@router.get("", response_model=RemisionesPage)
@router.get("/", response_model=RemisionesPage)
async def listar_remisiones(
    limit: int = 50,
    offset: int = 0,
    search: str | None = None,
    fecha_recepcion: date | None = None,
    fecha_hoja: date | None = None,
    formato: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_almacen),
):
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    filtros = []
    if search and search.strip():
        q = f"%{search.strip()}%"
        item_match = exists(
            select(RemisionRecepcionItem.id).where(
                RemisionRecepcionItem.remision_id == RemisionRecepcion.id,
                or_(
                    RemisionRecepcionItem.numero_parte.ilike(q),
                    RemisionRecepcionItem.descripcion.ilike(q),
                    cast(RemisionRecepcionItem.cantidad, String).ilike(q),
                ),
            )
        )
        filtros.append(or_(
            RemisionRecepcion.proveedor.ilike(q),
            RemisionRecepcion.numero_remision.ilike(q),
            RemisionRecepcion.po.ilike(q),
            item_match,
        ))
    if fecha_recepcion:
        filtros.append(cast(RemisionRecepcion.fecha_captura, Date) == fecha_recepcion)
    if fecha_hoja:
        filtros.append(RemisionRecepcion.fecha == fecha_hoja)
    if formato:
        filtros.append(RemisionRecepcion.tipo_documento == formato)

    total = (await db.execute(
        select(func.count(RemisionRecepcion.id)).where(*filtros)
    )).scalar() or 0
    result = await db.execute(
        select(RemisionRecepcion)
        .where(*filtros)
        .order_by(RemisionRecepcion.fecha_captura.desc())
        .offset(offset)
        .limit(limit)
    )
    return RemisionesPage(items=result.scalars().all(), total=total)


@router.get("/tipos-documento")
@router.get("/tipos-documento/")
async def listar_tipos_documento_remision(
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_almacen),
):
    """Valores distintos de tipo_documento ya presentes en recepciones
    registradas — usado para poblar el filtro 'Formato' del listado."""
    result = await db.execute(
        select(RemisionRecepcion.tipo_documento)
        .distinct()
        .order_by(RemisionRecepcion.tipo_documento)
    )
    return result.scalars().all()


@router.get("/foto/{nombre}")
@router.get("/foto/{nombre}/")
async def foto_remision(
    nombre: str,
    user: Usuario = Depends(get_current_almacen),
):
    """Sirve una foto guardada (preview durante la revisión o evidencia del
    listado). Solo nombres <uuid>.<ext> generados por el servidor."""
    path = _foto_absoluta(nombre)
    media = "image/png" if path.suffix == ".png" else ("image/webp" if path.suffix == ".webp" else "image/jpeg")
    return FileResponse(
        path,
        media_type=media,
        headers={"Cache-Control": "private, max-age=3600"},
    )


# ══════════════════════════════════════════════════════════════════════
# SESIONES QR (handoff celular ↔ computadora)
# ══════════════════════════════════════════════════════════════════════

@router.post("/qr-session", response_model=QrSesionOut)
@router.post("/qr-session/", response_model=QrSesionOut)
async def crear_qr_sesion(
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_almacen),
):
    ahora = _ahora()
    # Limpieza lazy: fuera filas expiradas (las fotos quedan; son evidencia
    # solo si terminaron en un registro, y el uuid las hace inofensivas)
    await db.execute(
        delete(RemisionQrSesion).where(RemisionQrSesion.expira_en < ahora)
    )

    sesion = RemisionQrSesion(
        id=str(uuid.uuid4()),
        estado=ESTADO_PENDIENTE,
        creado_por=user.username,
        creado_en=ahora,
        expira_en=ahora + timedelta(minutes=QR_SESION_MINUTOS),
    )
    db.add(sesion)
    await db.commit()
    return QrSesionOut(session_id=sesion.id, expira_en=sesion.expira_en)


@router.get("/qr-session/{session_id}", response_model=QrSesionEstado)
@router.get("/qr-session/{session_id}/", response_model=QrSesionEstado)
async def estado_qr_sesion(session_id: str, db: AsyncSession = Depends(get_db)):
    """PÚBLICO (lo consulta la página móvil sin JWT y el polling del desktop).
    No revela nada sensible: solo el estado de la sesión."""
    sesion = await db.get(RemisionQrSesion, session_id)
    if not sesion:
        return QrSesionEstado(estado="inexistente", valida=False)
    expirada = _aware(sesion.expira_en) < _ahora()
    return QrSesionEstado(
        estado=sesion.estado,
        valida=not expirada and sesion.estado in (ESTADO_PENDIENTE, ESTADO_SUBIDA),
    )


@router.post("/qr-session/{session_id}/upload", response_model=QrSesionEstado)
@router.post("/qr-session/{session_id}/upload/", response_model=QrSesionEstado)
async def subir_foto_qr_sesion(
    session_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    """PÚBLICO — lo llama la página móvil. Asegurado por el UUID no adivinable,
    la expiración corta y el uso único de la sesión."""
    sesion = await db.get(RemisionQrSesion, session_id)
    if not sesion:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    if _aware(sesion.expira_en) < _ahora() or sesion.estado != ESTADO_PENDIENTE:
        raise HTTPException(status_code=410, detail="La sesión expiró o ya fue usada")

    foto_path, _ = await _guardar_foto(file)
    sesion.foto_path = foto_path
    sesion.estado = ESTADO_SUBIDA
    await db.commit()
    return QrSesionEstado(estado=sesion.estado, valida=True)


# ══════════════════════════════════════════════════════════════════════
# ETIQUETAS DE LOTE
# ══════════════════════════════════════════════════════════════════════
# Estas rutas van al final a propósito: `/{remision_id}` es un catch-all y
# taparía a /tipos-documento, /foto/... y /qr-session/... si se declarara antes.

NO_ALFANUM_RE = re.compile(r"[^A-Z0-9]")


def _sufijo(texto: str, n: int = 4) -> str:
    """Últimos `n` caracteres alfanuméricos, en mayúsculas.

    'CWM260420-04' → '2004', 'A 83332' → '3332', '27' → '0027'.
    """
    limpio = NO_ALFANUM_RE.sub("", (texto or "").upper())
    return limpio[-n:].rjust(n, "0")


def _escapar_like(texto: str) -> str:
    """El prefijo del lote_id trae '_', que en LIKE es comodín de un carácter."""
    return texto.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def _siguiente_secuencia(db: AsyncSession, prefijo: str) -> int:
    """Siguiente `n` libre para un prefijo de lote_id.

    En el caso normal arranca en 1 por partida. Si dos remisiones del mismo día
    terminan en los mismos 4 dígitos y traen la misma parte, sigue contando en
    vez de chocar contra el índice único de lote_id.
    """
    maximo = (await db.execute(
        select(func.max(RemisionEtiqueta.secuencia)).where(
            RemisionEtiqueta.lote_id.like(f"{_escapar_like(prefijo)}%", escape="\\")
        )
    )).scalar()
    return (maximo or 0) + 1


@router.post("/etiquetas/{etiqueta_id}/reimprimir", status_code=202)
@router.post("/etiquetas/{etiqueta_id}/reimprimir/", status_code=202)
async def reimprimir_etiqueta(
    etiqueta_id: int,
    payload: ReimprimirIn | None = None,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_almacen),
):
    """Vuelve a sacar una etiqueta ya generada (se rompió, salió mal, se despegó).

    En la Zebra se reusa el ZPL guardado, así que la etiqueta reimpresa es byte
    por byte la misma. En hoja carta se regenera desde el snapshot que guarda
    `remisiones_etiquetas` —que es inmutable— y sale una sola etiqueta en la
    esquina de la hoja.
    """
    etiqueta = await db.get(RemisionEtiqueta, etiqueta_id)
    if not etiqueta:
        raise HTTPException(status_code=404, detail="Etiqueta no encontrada")

    original = (await db.execute(
        select(ImpresionTrabajo)
        .where(ImpresionTrabajo.etiqueta_id == etiqueta_id)
        .order_by(ImpresionTrabajo.id)
        .limit(1)
    )).scalars().first()
    if not original:
        raise HTTPException(
            status_code=409,
            detail="La etiqueta no tiene un trabajo de impresión previo que reusar",
        )

    destino = (payload.destino if payload else None) or (
        "carta" if original.formato == FORMATO_PDF else "zebra"
    )

    if destino == "carta":
        try:
            await impresion_red.enviar_pdf(
                pdf_etiquetas.generar_pdf([pdf_etiquetas.DatosEtiqueta(
                    lote_id=etiqueta.lote_id,
                    numero_parte=etiqueta.numero_parte,
                    descripcion=etiqueta.descripcion,
                    cantidad=etiqueta.cantidad,
                    unidad_de_medida=etiqueta.unidad_de_medida,
                    fecha_recepcion=etiqueta.fecha_recepcion,
                )]),
                f"Reimpresion {etiqueta.lote_id}",
            )
        except Exception as exc:
            logger.error("No se pudo reimprimir %s en hoja carta: %s", etiqueta.lote_id, exc)
            raise HTTPException(
                status_code=502,
                detail=(
                    f"No se pudo imprimir en {impresion_red.NOMBRE} "
                    f"({impresion_red.HOST}:{impresion_red.PUERTO})"
                ),
            )
        ahora = _ahora()
        db.add(ImpresionTrabajo(
            etiqueta_id=etiqueta.id,
            impresora=impresion_red.NOMBRE,
            formato=FORMATO_PDF,
            zpl=None,
            estado=ESTADO_IMPRESO,
            creado_por=user.username,
            enviado_en=ahora,
            terminado_en=ahora,
        ))
        await db.commit()
        return {"detail": f"Etiqueta {etiqueta.lote_id} impresa en hoja carta"}

    if original.formato != FORMATO_ZPL or not original.zpl:
        # Se imprimió en hoja carta y ahora se pide por la Zebra: no hay ZPL que
        # reusar, se genera del mismo snapshot inmutable de la etiqueta.
        zpl = zpl_etiquetas.generar_zpl(
            lote_id=etiqueta.lote_id,
            numero_parte=etiqueta.numero_parte,
            descripcion=etiqueta.descripcion,
            cantidad=etiqueta.cantidad,
            unidad_de_medida=etiqueta.unidad_de_medida,
            fecha_recepcion=etiqueta.fecha_recepcion,
        )
    else:
        zpl = original.zpl

    db.add(ImpresionTrabajo(
        etiqueta_id=etiqueta.id,
        impresora=zpl_etiquetas.IMPRESORA_DEFAULT,
        formato=FORMATO_ZPL,
        zpl=zpl,
        estado=ESTADO_PENDIENTE_IMPRESION,
        creado_por=user.username,
    ))
    await db.commit()
    return {"detail": f"Etiqueta {etiqueta.lote_id} reencolada"}


@router.get("/{remision_id}", response_model=RemisionOut)
@router.get("/{remision_id}/", response_model=RemisionOut)
async def obtener_remision(
    remision_id: int,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_almacen),
):
    """Una remisión con sus items y etiquetas — refresca el modal de detalle
    después de imprimir sin recargar todo el listado."""
    result = await db.execute(
        select(RemisionRecepcion).where(RemisionRecepcion.id == remision_id)
    )
    remision = result.scalars().first()
    if not remision:
        raise HTTPException(status_code=404, detail="Remisión no encontrada")
    return remision


@router.post("/{remision_id}/etiquetas", response_model=list[EtiquetaOut], status_code=201)
@router.post("/{remision_id}/etiquetas/", response_model=list[EtiquetaOut], status_code=201)
async def crear_etiquetas(
    remision_id: int,
    payload: EtiquetasCreate,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_almacen),
):
    """Genera las etiquetas de lote de una remisión y las manda a imprimir.

    Según el destino:

    - `zebra` — el contenedor no alcanza la Zebra (USB en la PC de Windows), así
      que deja el ZPL en `impresion_trabajos` y el agente lo reclama y lo manda RAW.
    - `carta` — la HP está en la red: se arma el PDF con todas las etiquetas en
      grilla 2 x 4 y se manda **antes** del commit. Si la impresora falla se
      revierte todo; tener el lote dado de alta sin la etiqueta pegada en la caja
      es peor que no haber hecho nada.
    """
    result = await db.execute(
        select(RemisionRecepcion).where(RemisionRecepcion.id == remision_id)
    )
    remision = result.scalars().first()
    if not remision:
        raise HTTPException(status_code=404, detail="Remisión no encontrada")
    if remision.etiquetas:
        raise HTTPException(
            status_code=409,
            detail="Esta remisión ya tiene etiquetas generadas; usa la reimpresión individual",
        )

    items_por_id = {it.id: it for it in remision.items}
    if not payload.items:
        raise HTTPException(status_code=422, detail="No se indicó ninguna etiqueta a imprimir")

    # Validar TODO antes de escribir nada: o salen todas las etiquetas o ninguna
    for solicitud in payload.items:
        item = items_por_id.get(solicitud.item_id)
        if item is None:
            raise HTTPException(
                status_code=422,
                detail=f"La partida {solicitud.item_id} no pertenece a esta remisión",
            )
        if not solicitud.cantidades:
            raise HTTPException(
                status_code=422,
                detail=f"La partida {item.numero_parte} no tiene ninguna etiqueta",
            )
        if any(c <= 0 for c in solicitud.cantidades):
            raise HTTPException(
                status_code=422,
                detail=f"Hay cantidades en cero o negativas en {item.numero_parte}",
            )
        total = sum(solicitud.cantidades)
        if total > item.cantidad:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"La suma de las etiquetas de {item.numero_parte} ({total}) "
                    f"excede la cantidad recibida ({item.cantidad})"
                ),
            )

    # astimezone: Postgres devuelve la captura en UTC; sin convertir a UTC-6 una
    # recepción de las 20:00 caería en el día siguiente y el lote_id sería otro
    fecha_recepcion = _aware(remision.fecha_captura).astimezone(TZ_LOCAL).date()
    sufijo_remision = _sufijo(remision.numero_remision)
    # lotes_inventario / movimientos_lote guardan DateTime sin timezone
    ahora_naive = _ahora().replace(tzinfo=None)
    creadas: list[RemisionEtiqueta] = []
    a_imprimir: list[pdf_etiquetas.DatosEtiqueta] = []
    es_carta = payload.destino == "carta"

    for solicitud in payload.items:
        item = items_por_id[solicitud.item_id]
        prefijo = f"{fecha_recepcion:%Y%m%d}_{sufijo_remision}_{_sufijo(item.numero_parte)}_"
        secuencia = await _siguiente_secuencia(db, prefijo)

        for cantidad in solicitud.cantidades:
            lote_id = f"{prefijo}{secuencia}"
            etiqueta = RemisionEtiqueta(
                remision_id=remision.id,
                item_id=item.id,
                lote_id=lote_id,
                numero_parte=item.numero_parte,
                descripcion=item.descripcion,
                cantidad=cantidad,
                unidad_de_medida=item.unidad_de_medida,
                secuencia=secuencia,
                fecha_recepcion=fecha_recepcion,
                creado_por=user.username,
            )
            if es_carta:
                a_imprimir.append(pdf_etiquetas.DatosEtiqueta(
                    lote_id=lote_id,
                    numero_parte=item.numero_parte,
                    descripcion=item.descripcion,
                    cantidad=cantidad,
                    unidad_de_medida=item.unidad_de_medida,
                    fecha_recepcion=fecha_recepcion,
                ))
                # La HP imprime abajo, en línea: el trabajo nace ya resuelto
                etiqueta.trabajos.append(ImpresionTrabajo(
                    impresora=impresion_red.NOMBRE,
                    formato=FORMATO_PDF,
                    zpl=None,
                    estado=ESTADO_IMPRESO,
                    creado_por=user.username,
                    enviado_en=_ahora(),
                    terminado_en=_ahora(),
                ))
            else:
                etiqueta.trabajos.append(ImpresionTrabajo(
                    impresora=zpl_etiquetas.IMPRESORA_DEFAULT,
                    formato=FORMATO_ZPL,
                    zpl=zpl_etiquetas.generar_zpl(
                        lote_id=lote_id,
                        numero_parte=item.numero_parte,
                        descripcion=item.descripcion,
                        cantidad=cantidad,
                        unidad_de_medida=item.unidad_de_medida,
                        fecha_recepcion=fecha_recepcion,
                    ),
                    estado=ESTADO_PENDIENTE_IMPRESION,
                    creado_por=user.username,
                ))
            db.add(etiqueta)

            # La etiqueta ES el lote: se crea aquí, con el mismo lote_id que va
            # en el QR, para que Calidad pueda escanearla en IQC y al aprobarla
            # caiga sola en "Pendientes de Ubicar" (estado Aprobado + sin ubicación).
            db.add(LoteInventario(
                lote_id=lote_id,
                sku_producto=item.numero_parte,
                cantidad_actual=float(cantidad),
                cantidad_inicial=float(cantidad),
                ubicacion_id=None,
                fecha_recepcion=ahora_naive,
                oc_origen=None,           # esta recepción no viene de una OC
                estado_calidad="Pendiente IQC",
                numero_remision=remision.numero_remision,
                bultos=1,                 # una etiqueta = un bulto
            ))
            db.add(MovimientoLote(
                lote_id=lote_id,
                fecha=ahora_naive,
                tipo="RECEPCION_REMISION",
                cantidad=float(cantidad),
                detalles={
                    "remision_id": remision.id,
                    "numero_remision": remision.numero_remision,
                    "proveedor": remision.proveedor,
                    "capturo": user.username,
                },
            ))

            creadas.append(etiqueta)
            secuencia += 1

    if es_carta:
        # Imprimir ANTES del commit: si la HP no contesta, la remisión se queda
        # sin etiquetas ni lotes y se puede reintentar sin limpiar nada a mano.
        try:
            await impresion_red.enviar_pdf(
                pdf_etiquetas.generar_pdf(a_imprimir),
                f"Etiquetas remision {remision.numero_remision}",
            )
        except Exception as exc:
            await db.rollback()
            logger.error("No se pudo imprimir en hoja carta: %s", exc)
            raise HTTPException(
                status_code=502,
                detail=(
                    f"No se pudo imprimir en {impresion_red.NOMBRE} "
                    f"({impresion_red.HOST}:{impresion_red.PUERTO}). "
                    "No se generó ninguna etiqueta; revisa la impresora y vuelve a intentar."
                ),
            )

    await db.commit()
    # Re-consultar para que selectin cargue `trabajos` (de ahí sale estado_impresion)
    result = await db.execute(
        select(RemisionEtiqueta)
        .where(RemisionEtiqueta.id.in_([e.id for e in creadas]))
        .order_by(RemisionEtiqueta.id)
    )
    return result.scalars().all()
