"""Recepciones por foto (OCR) — subtab nueva de Almacén.

Flujo independiente del de Compras/OC: el personal fotografía la hoja de
remisión física, Ollama extrae los campos por few-shot (services/ocr_remisiones),
el usuario corrige en un formulario editable y se guarda con la foto como
evidencia de auditoría. Incluye handoff QR celular↔computadora.

Prefijo /api/remisiones: ya proxeado por la regla catch-all /api/:path* de
next.config.ts y exento del middleware de roles del frontend.
"""

import re
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_almacen, get_db
from app.models.producto import Producto
from app.models.remision_qr_sesion import (
    ESTADO_PENDIENTE,
    ESTADO_SUBIDA,
    ESTADO_USADA,
    RemisionQrSesion,
)
from app.models.remision_recepcion import RemisionRecepcion, RemisionRecepcionItem
from app.models.usuario import Usuario
from app.schemas.remision_recepcion import (
    QrSesionEstado,
    QrSesionOut,
    RemisionCreate,
    RemisionesPage,
    RemisionOCRItem,
    RemisionOCRResponse,
    RemisionOut,
)
from app.services import ocr_remisiones

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
    if payload.nuevo_formato:
        # Formato nuevo: además del registro se guarda foto + JSON corregido
        # como template para futuras recepciones de este proveedor/formato
        slug = ocr_remisiones.slugify_tipo(payload.nuevo_formato.tipo_documento)
        if slug in ocr_remisiones.listar_tipos_documento():
            raise HTTPException(
                status_code=409,
                detail=f"Ya existe un template llamado '{slug}'; usa otro nombre",
            )
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
        try:
            ocr_remisiones.guardar_template(
                slug, foto.read_bytes(), template_json, extension=foto.suffix
            )
        except ValueError as e:
            raise HTTPException(status_code=409, detail=str(e))
        tipo_documento = slug

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
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_almacen),
):
    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    total = (await db.execute(select(func.count(RemisionRecepcion.id)))).scalar() or 0
    result = await db.execute(
        select(RemisionRecepcion)
        .order_by(RemisionRecepcion.fecha_captura.desc())
        .offset(offset)
        .limit(limit)
    )
    return RemisionesPage(items=result.scalars().all(), total=total)


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
