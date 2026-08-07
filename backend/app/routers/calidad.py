from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, cast, Date
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional
import logging
import re
import uuid

from app.core.deps import get_db, get_current_user
from app.models.usuario import Usuario, RolUsuario
from app.models.inspeccion import Inspeccion, TipoInspeccion, ResultadoInspeccion
from app.models.registro_scrap import RegistroScrap
from app.models.producto import Producto
from app.models.lote_inventario import LoteInventario, MovimientoLote
from app.models.orden_compra import OrdenCompra
from app.models.remision_etiqueta import RemisionEtiqueta
from app.models.remision_recepcion import RemisionRecepcion
from app.services.proveedor_score import registrar_evento
from app.schemas.calidad import (
    FotoIncidenciaOut,
    InspeccionCreate, InspeccionResponse, InspeccionesPage,
    LoteEtiquetaOut,
    ScrapCreate, ScrapResponse,
    SegundaRevisionCreate,
    CalidadDashboard,
)
from app.services.calidad_pdf import generar_pdf_inspeccion, generar_pdf_scrap

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/calidad", tags=["calidad"])

TZ_LOCAL = timezone(timedelta(hours=-6))

# ── Evidencia fotográfica de incidencias ──────────────────────────────
# /app/app/routers/ → /app/static/incidencias_iqc (mismo volumen que Logo.png)
INCIDENCIAS_ROOT = Path(__file__).resolve().parents[2] / "static" / "incidencias_iqc"
INCIDENCIAS_PREFIJO = "incidencias_iqc"

MAX_FOTO_BYTES = 15 * 1024 * 1024  # 15 MB
EXTENSIONES_FOTO = {".jpg", ".jpeg", ".png", ".webp"}
# Una carpeta por Lote ID; se acota el juego de caracteres para que no pueda
# escaparse del directorio raíz.
LOTE_DIR_RE = re.compile(r"^[A-Za-z0-9_\-]{1,150}$")
# Nombres generados por el servidor: <uuid4>.<ext> — nada más se sirve
NOMBRE_FOTO_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|jpeg|png|webp)$"
)

RESULTADOS_VALIDOS = {"Aprobado", "Rechazado", "Cuarentena"}
RESULTADOS_NO_CONFORME = {"Rechazado", "Cuarentena"}


# ── Helper: verificar rol calidad ─────────────────────────────────────
def require_calidad_role(user: Usuario):
    if user.rol not in [RolUsuario.admin, RolUsuario.calidad]:
        raise HTTPException(status_code=403, detail="Se requiere rol admin o calidad")


def ahora_local():
    return datetime.now(TZ_LOCAL).replace(tzinfo=None)


def generar_inspeccion_id(tipo: str) -> str:
    now = ahora_local()
    return f"INS-{tipo}-{now.strftime('%d%m%y%H%M%S')}"


async def generar_inspeccion_id_unico(db: AsyncSession, tipo: str) -> str:
    """inspeccion_id libre, con sufijo solo si hace falta.

    El formato tiene resolución de segundos, así que inspeccionar varias cajas
    seguidas (una etiqueta = una caja) chocaba contra el índice único. En el
    caso normal el id queda idéntico al documentado; solo al empatar el segundo
    se le añade -2, -3, …
    """
    base = generar_inspeccion_id(tipo)
    candidato = base
    for intento in range(2, 100):
        existe = (await db.execute(
            select(Inspeccion.id).where(Inspeccion.inspeccion_id == candidato)
        )).scalar()
        if existe is None:
            return candidato
        candidato = f"{base}-{intento}"
    raise HTTPException(status_code=500, detail="No se pudo generar un inspeccion_id único")


def generar_scrap_id() -> str:
    now = ahora_local()
    return f"SCRAP-{now.strftime('%d%m%y%H%M%S')}"


# ── Helpers de evidencia fotográfica ──────────────────────────────────
def _carpeta_lote(lote_id: str) -> Path:
    """Directorio de evidencia de un lote, con guard de traversal."""
    if not LOTE_DIR_RE.match(lote_id or ""):
        raise HTTPException(status_code=400, detail=f"Lote ID inválido: '{lote_id}'")
    carpeta = (INCIDENCIAS_ROOT / lote_id).resolve()
    if not carpeta.is_relative_to(INCIDENCIAS_ROOT.resolve()):
        raise HTTPException(status_code=400, detail=f"Lote ID inválido: '{lote_id}'")
    return carpeta


def _foto_absoluta(ruta: str) -> Path:
    """Resuelve 'incidencias_iqc/<lote_id>/<uuid>.jpg' a un archivo existente."""
    partes = Path(ruta or "").parts
    if len(partes) != 3 or partes[0] != INCIDENCIAS_PREFIJO:
        raise HTTPException(status_code=404, detail="Foto no encontrada")
    _, lote_id, nombre = partes
    if not NOMBRE_FOTO_RE.match(nombre):
        raise HTTPException(status_code=404, detail="Foto no encontrada")
    path = (_carpeta_lote(lote_id) / nombre).resolve()
    if not path.is_relative_to(INCIDENCIAS_ROOT.resolve()) or not path.is_file():
        raise HTTPException(status_code=404, detail="Foto no encontrada")
    return path


def _fotos_en_disco(rutas: list) -> list[str]:
    """Rutas absolutas de las fotos que siguen existiendo.

    Para el PDF: una foto borrada del volumen no debe tumbar la descarga del
    reporte completo, así que se omite en silencio.
    """
    existentes = []
    for ruta in rutas:
        try:
            existentes.append(str(_foto_absoluta(ruta)))
        except HTTPException:
            logger.warning("Incidencias IQC: foto ausente al generar el PDF (%s)", ruta)
    return existentes


def _valor_enum(valor, por_defecto: str) -> str:
    """Los campos Enum llegan como enum desde la DB y como str recién asignados."""
    if valor is None:
        return por_defecto
    return valor.value if hasattr(valor, "value") else str(valor)


async def _registrar_evento_iqc(
    db: AsyncSession,
    oc_id: str,
    resultado: str,
    inspeccion_id: str,
    lote_id: Optional[str],
    usuario: str,
) -> None:
    """Impacto al score del proveedor por el veredicto de una inspección IQC."""
    oc = (await db.execute(
        select(OrdenCompra).where(OrdenCompra.oc_id == oc_id)
    )).scalar_one_or_none()
    if not oc or not oc.proveedor_id:
        return

    aprobado = resultado == "Aprobado"
    await registrar_evento(
        proveedor_id=oc.proveedor_id,
        tipo_evento="CALIDAD_IQC_APROBADO" if aprobado else "CALIDAD_IQC_RECHAZO",
        impacto=2.0 if aprobado else -10.0,
        referencia_id=inspeccion_id,
        descripcion=f"Inspección IQC {resultado} para lote {lote_id}",
        registrado_por=usuario,
        db=db,
    )


def _validar_evaluacion(data: InspeccionCreate) -> None:
    """El veredicto lo propone el cliente; aquí se comprueba que sea coherente.

    Las inspecciones sin `respuestas` (Devoluciones, y el historial anterior al
    cambio) solo pasan por la validación del resultado y de las fotos.
    """
    if data.resultado_final not in RESULTADOS_VALIDOS:
        raise HTTPException(
            status_code=400,
            detail=f"Resultado inválido: '{data.resultado_final}'",
        )

    for ruta in data.fotos:
        _foto_absoluta(ruta)  # 404 si no existe o si intenta salirse de la raíz

    if not data.respuestas:
        if data.resultado_final == "Cuarentena":
            raise HTTPException(
                status_code=400,
                detail="Cuarentena requiere la evaluación con el motivo del rechazo",
            )
        return

    hay_no = False
    for r in data.respuestas:
        if r.respuesta not in ("Si", "No"):
            raise HTTPException(
                status_code=400,
                detail=f"Respuesta inválida para '{r.pregunta}': '{r.respuesta}'",
            )
        if r.respuesta == "No":
            hay_no = True
            if not (r.motivo or "").strip():
                raise HTTPException(
                    status_code=400,
                    detail=f"Falta el motivo de '{r.pregunta}'",
                )

    if hay_no:
        if data.resultado_final not in RESULTADOS_NO_CONFORME:
            raise HTTPException(
                status_code=400,
                detail="Con alguna respuesta en No el resultado debe ser Rechazado o Cuarentena",
            )
        if not data.fotos:
            raise HTTPException(
                status_code=400,
                detail="Se requiere al menos una foto de evidencia",
            )
    elif data.resultado_final != "Aprobado":
        raise HTTPException(
            status_code=400,
            detail="Con todas las respuestas en Sí el resultado debe ser Aprobado",
        )


# ══════════════════════════════════════════════════════════════════════
# DASHBOARD
# ══════════════════════════════════════════════════════════════════════

@router.get("/dashboard")
@router.get("/dashboard/")
async def get_calidad_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    require_calidad_role(current_user)

    hoy = ahora_local().date()
    inicio_mes = hoy.replace(day=1)

    # Total inspecciones
    total_q = await db.execute(select(func.count(Inspeccion.id)))
    total_inspecciones = total_q.scalar() or 0

    # Inspecciones hoy
    hoy_q = await db.execute(
        select(func.count(Inspeccion.id)).where(
            cast(Inspeccion.fecha, Date) == hoy
        )
    )
    inspecciones_hoy = hoy_q.scalar() or 0

    # IQC
    iqc_total = (await db.execute(
        select(func.count(Inspeccion.id)).where(Inspeccion.tipo_inspeccion == TipoInspeccion.IQC)
    )).scalar() or 0
    iqc_aprobadas = (await db.execute(
        select(func.count(Inspeccion.id)).where(
            and_(Inspeccion.tipo_inspeccion == TipoInspeccion.IQC,
                 Inspeccion.resultado_final == ResultadoInspeccion.Aprobado)
        )
    )).scalar() or 0

    # LQC
    lqc_total = (await db.execute(
        select(func.count(Inspeccion.id)).where(Inspeccion.tipo_inspeccion == TipoInspeccion.LQC)
    )).scalar() or 0
    lqc_aprobadas = (await db.execute(
        select(func.count(Inspeccion.id)).where(
            and_(Inspeccion.tipo_inspeccion == TipoInspeccion.LQC,
                 Inspeccion.resultado_final == ResultadoInspeccion.Aprobado)
        )
    )).scalar() or 0

    # OQC
    oqc_total = (await db.execute(
        select(func.count(Inspeccion.id)).where(Inspeccion.tipo_inspeccion == TipoInspeccion.OQC)
    )).scalar() or 0
    oqc_aprobadas = (await db.execute(
        select(func.count(Inspeccion.id)).where(
            and_(Inspeccion.tipo_inspeccion == TipoInspeccion.OQC,
                 Inspeccion.resultado_final == ResultadoInspeccion.Aprobado)
        )
    )).scalar() or 0

    # Devoluciones
    dev_total = (await db.execute(
        select(func.count(Inspeccion.id)).where(Inspeccion.tipo_inspeccion == TipoInspeccion.DEVOLUCION)
    )).scalar() or 0

    # Scrap hoy
    scrap_hoy_q = await db.execute(
        select(func.coalesce(func.sum(RegistroScrap.cantidad), 0)).where(
            cast(RegistroScrap.fecha, Date) == hoy
        )
    )
    scrap_hoy = float(scrap_hoy_q.scalar() or 0)

    # Scrap mes
    scrap_mes_q = await db.execute(
        select(func.coalesce(func.sum(RegistroScrap.cantidad), 0)).where(
            cast(RegistroScrap.fecha, Date) >= inicio_mes
        )
    )
    scrap_mes = float(scrap_mes_q.scalar() or 0)

    # Tasa aprobación
    tasa = 0.0
    if total_inspecciones > 0:
        total_aprobadas = (await db.execute(
            select(func.count(Inspeccion.id)).where(
                Inspeccion.resultado_final == ResultadoInspeccion.Aprobado
            )
        )).scalar() or 0
        tasa = round((total_aprobadas / total_inspecciones) * 100, 1)

    return CalidadDashboard(
        total_inspecciones=total_inspecciones,
        inspecciones_hoy=inspecciones_hoy,
        iqc_total=iqc_total,
        iqc_aprobadas=iqc_aprobadas,
        iqc_rechazadas=iqc_total - iqc_aprobadas,
        lqc_total=lqc_total,
        lqc_aprobadas=lqc_aprobadas,
        lqc_rechazadas=lqc_total - lqc_aprobadas,
        oqc_total=oqc_total,
        oqc_aprobadas=oqc_aprobadas,
        oqc_rechazadas=oqc_total - oqc_aprobadas,
        dev_total=dev_total,
        scrap_hoy=scrap_hoy,
        scrap_mes=scrap_mes,
        tasa_aprobacion=tasa,
    )


# ══════════════════════════════════════════════════════════════════════
# LOTE ESCANEABLE (etiqueta de recepción por foto)
# ══════════════════════════════════════════════════════════════════════

@router.get("/lote/{lote_id}", response_model=LoteEtiquetaOut)
@router.get("/lote/{lote_id}/", response_model=LoteEtiquetaOut)
async def obtener_lote_etiqueta(
    lote_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Resuelve el QR de una etiqueta de lote para la inspección IQC.

    Busca la fila exacta en `remisiones_etiquetas`.
    """
    require_calidad_role(current_user)

    etiqueta = (await db.execute(
        select(RemisionEtiqueta).where(RemisionEtiqueta.lote_id == lote_id)
    )).scalars().first()
    if not etiqueta:
        raise HTTPException(
            status_code=404,
            detail=f"No existe ninguna etiqueta de lote '{lote_id}'",
        )

    remision = await db.get(RemisionRecepcion, etiqueta.remision_id)
    if not remision:
        raise HTTPException(
            status_code=404,
            detail=f"La etiqueta '{lote_id}' quedó huérfana de su remisión",
        )

    # Cuántas cajas tiene esta partida — para mostrar "Caja N de M"
    total_etiquetas = (await db.execute(
        select(func.count(RemisionEtiqueta.id))
        .where(RemisionEtiqueta.item_id == etiqueta.item_id)
    )).scalar() or 1

    # El lote se crea junto con la etiqueta; si faltara (etiquetas anteriores a
    # este cambio) se reporta como pendiente y la inspección lo creará.
    lote = (await db.execute(
        select(LoteInventario).where(LoteInventario.lote_id == lote_id)
    )).scalars().first()

    return LoteEtiquetaOut(
        lote_id=etiqueta.lote_id,
        sku_producto=etiqueta.numero_parte,
        nombre_producto=etiqueta.descripcion,
        cantidad=float(etiqueta.cantidad),
        unidad_de_medida=etiqueta.unidad_de_medida,
        secuencia=etiqueta.secuencia,
        total_etiquetas=total_etiquetas,
        fecha_recepcion=etiqueta.fecha_recepcion,
        proveedor=remision.proveedor,
        numero_remision=remision.numero_remision,
        po=remision.po,
        fecha_hoja=remision.fecha,
        tipo_documento=remision.tipo_documento,
        estado_calidad=lote.estado_calidad if lote else "Pendiente IQC",
    )


# ══════════════════════════════════════════════════════════════════════
# EVIDENCIA FOTOGRÁFICA DE INCIDENCIAS
# ══════════════════════════════════════════════════════════════════════

@router.post("/incidencias/foto", response_model=FotoIncidenciaOut)
@router.post("/incidencias/foto/", response_model=FotoIncidenciaOut)
async def subir_foto_incidencia(
    lote_id: str = Form(...),
    file: UploadFile = File(...),
    current_user: Usuario = Depends(get_current_user),
):
    """Guarda una foto de evidencia bajo static/incidencias_iqc/<lote_id>/.

    Se sube ANTES de que exista la inspección: el inspector fotografía y recién
    después decide entre Rechazo y Cuarentena. Por eso la carpeta se nombra con
    el Lote ID y no con el inspeccion_id.
    """
    require_calidad_role(current_user)

    carpeta = _carpeta_lote(lote_id)

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
    nombre = f"{uuid.uuid4()}{ext}"
    try:
        carpeta.mkdir(parents=True, exist_ok=True)
        (carpeta / nombre).write_bytes(contenido)
    except OSError as e:
        # Sin la foto no hay evidencia del rechazo, así que se corta aquí con un
        # mensaje entendible en vez de un 500 opaco.
        logger.error("Incidencias IQC: no se pudo guardar la foto (%s)", e)
        raise HTTPException(
            status_code=507,
            detail="No se pudo guardar la foto en el servidor; avisa a sistemas",
        )

    return FotoIncidenciaOut(ruta=f"{INCIDENCIAS_PREFIJO}/{lote_id}/{nombre}")


@router.get("/incidencias/{lote_id}/{nombre}")
@router.get("/incidencias/{lote_id}/{nombre}/")
async def foto_incidencia(
    lote_id: str,
    nombre: str,
    current_user: Usuario = Depends(get_current_user),
):
    """Sirve una foto de evidencia (galería del historial y visor del detalle)."""
    require_calidad_role(current_user)

    path = _foto_absoluta(f"{INCIDENCIAS_PREFIJO}/{lote_id}/{nombre}")
    media = {
        ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
        ".png": "image/png", ".webp": "image/webp",
    }.get(path.suffix.lower(), "application/octet-stream")

    return FileResponse(
        path,
        media_type=media,
        headers={"Cache-Control": "private, max-age=3600"},
    )


# ══════════════════════════════════════════════════════════════════════
# INSPECCIONES — CRUD
# ══════════════════════════════════════════════════════════════════════

@router.post("/inspecciones")
@router.post("/inspecciones/")
async def registrar_inspeccion(
    data: InspeccionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    require_calidad_role(current_user)

    _validar_evaluacion(data)

    inspeccion_id = await generar_inspeccion_id_unico(db, data.tipo_inspeccion)

    inspeccion = Inspeccion(
        inspeccion_id=inspeccion_id,
        lote_id=data.lote_id,
        sku_producto=data.sku_producto,
        nombre_producto=data.nombre_producto,
        tipo_inspeccion=data.tipo_inspeccion,
        fecha=ahora_local(),
        inspector=current_user.username,
        resultado_final=data.resultado_final,
        resultados_puntos=[p.dict() for p in data.resultados_puntos],
        respuestas=[r.dict() for r in data.respuestas],
        fotos=list(data.fotos),
        oc_origen=data.oc_origen,
        op_origen=data.op_origen,
        cantidad_inspeccionada=data.cantidad_inspeccionada or 0,
        notas=data.notas,
    )
    db.add(inspeccion)

    # ── Si es IQC, actualizar o crear lote en inventario ──
    lote_actualizado = False
    lote_creado = False
    if data.tipo_inspeccion == "IQC" and data.lote_id:
        lote_result = await db.execute(
            select(LoteInventario).where(LoteInventario.lote_id == data.lote_id)
        )
        lote = lote_result.scalar_one_or_none()

        if lote:
            # Lote existe → actualizar estado
            lote.estado_calidad = data.resultado_final
            lote_actualizado = True
        else:
            # Lote NO existe (recepción anterior al cambio) → crear
            nuevo_lote = LoteInventario(
                lote_id=data.lote_id,
                sku_producto=data.sku_producto,
                cantidad_actual=data.cantidad_inspeccionada or 0,
                cantidad_inicial=data.cantidad_inspeccionada or 0,
                ubicacion_id=None,
                fecha_recepcion=ahora_local(),
                oc_origen=data.oc_origen,
                estado_calidad=data.resultado_final,
            )
            db.add(nuevo_lote)
            lote_actualizado = True
            lote_creado = True

        # Registrar movimiento de inspección
        mov = MovimientoLote(
            lote_id=data.lote_id,
            fecha=ahora_local(),
            tipo="INSPECCION_IQC",
            cantidad=0,
            detalles={
                "inspeccion_id": inspeccion_id,
                "resultado": data.resultado_final,
                "inspector": current_user.username,
                "sku_producto": data.sku_producto,
                "lote_creado_en_inspeccion": lote_creado,
            },
        )
        db.add(mov)

    # ── Registrar evento de calidad IQC ──
    # En Cuarentena el veredicto todavía no existe, así que el impacto al
    # proveedor se difiere hasta la segunda revisión.
    if (
        data.tipo_inspeccion == "IQC"
        and data.oc_origen
        and data.resultado_final != "Cuarentena"
    ):
        await _registrar_evento_iqc(
            db=db,
            oc_id=data.oc_origen,
            resultado=data.resultado_final,
            inspeccion_id=inspeccion_id,
            lote_id=data.lote_id,
            usuario=current_user.username,
        )

    await db.commit()
    await db.refresh(inspeccion)

    response = {
        "message": f"Inspección {data.tipo_inspeccion} registrada",
        "inspeccion_id": inspeccion_id,
        "resultado": data.resultado_final,
    }

    if data.tipo_inspeccion == "IQC":
        response["lote_actualizado"] = lote_actualizado
        response["lote_creado"] = lote_creado
        if lote_actualizado and data.resultado_final == "Aprobado":
            response["message"] += " — Lote aprobado y disponible para ubicar en almacén"
        elif lote_actualizado and data.resultado_final == "Cuarentena":
            response["message"] += " — Lote retenido en cuarentena, pendiente de segunda revisión"

    return response


@router.post("/inspecciones/{inspeccion_id}/segunda-revision")
@router.post("/inspecciones/{inspeccion_id}/segunda-revision/")
async def registrar_segunda_revision(
    inspeccion_id: str,
    data: SegundaRevisionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Cierra una inspección en Cuarentena como Aprobada o Rechazada.

    Actualiza el mismo registro (no crea uno nuevo) y guarda en
    `segunda_revision` los motivos originales, para que el detalle de un lote
    aprobado siga mostrando por qué estuvo retenido.
    """
    require_calidad_role(current_user)

    if data.resultado not in ("Aprobado", "Rechazado"):
        raise HTTPException(
            status_code=400,
            detail="La segunda revisión solo puede cerrar en Aprobado o Rechazado",
        )

    insp = (await db.execute(
        select(Inspeccion).where(Inspeccion.inspeccion_id == inspeccion_id)
    )).scalar_one_or_none()
    if not insp:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")

    resultado_actual = (
        insp.resultado_final.value
        if isinstance(insp.resultado_final, ResultadoInspeccion)
        else insp.resultado_final
    )
    if resultado_actual != "Cuarentena":
        raise HTTPException(
            status_code=409,
            detail=f"La inspección ya está {resultado_actual}; no admite segunda revisión",
        )

    insp.segunda_revision = {
        "fecha": ahora_local().isoformat(),
        "revisor": current_user.username,
        "ahora_ok": data.ahora_ok,
        "resultado": data.resultado,
        "notas": data.notas,
        "motivos_previos": [
            r.get("motivo")
            for r in (insp.respuestas or [])
            if r.get("respuesta") == "No" and r.get("motivo")
        ],
    }
    insp.resultado_final = data.resultado

    lote_actualizado = False
    if insp.tipo_inspeccion == TipoInspeccion.IQC and insp.lote_id:
        lote = (await db.execute(
            select(LoteInventario).where(LoteInventario.lote_id == insp.lote_id)
        )).scalar_one_or_none()
        if lote:
            # Aprobado + ubicacion_id NULL = vuelve a "Pendientes de Ubicar"
            lote.estado_calidad = data.resultado
            lote_actualizado = True

        db.add(MovimientoLote(
            lote_id=insp.lote_id,
            fecha=ahora_local(),
            tipo="SEGUNDA_REVISION_IQC",
            cantidad=0,
            detalles={
                "inspeccion_id": inspeccion_id,
                "resultado": data.resultado,
                "revisor": current_user.username,
                "sku_producto": insp.sku_producto,
            },
        ))

        # Impacto al proveedor diferido desde el registro en cuarentena
        if insp.oc_origen:
            await _registrar_evento_iqc(
                db=db,
                oc_id=insp.oc_origen,
                resultado=data.resultado,
                inspeccion_id=inspeccion_id,
                lote_id=insp.lote_id,
                usuario=current_user.username,
            )

    await db.commit()
    await db.refresh(insp)

    mensaje = f"Segunda revisión registrada — {data.resultado}"
    if lote_actualizado and data.resultado == "Aprobado":
        mensaje += " — Lote disponible para ubicar en almacén"

    return {
        "message": mensaje,
        "inspeccion_id": inspeccion_id,
        "resultado": data.resultado,
        "lote_actualizado": lote_actualizado,
    }


@router.get("/inspecciones", response_model=InspeccionesPage)
@router.get("/inspecciones/", response_model=InspeccionesPage)
async def listar_inspecciones(
    tipo: Optional[str] = Query(None),
    resultado: Optional[str] = Query(None),
    fecha_desde: Optional[str] = Query(None),
    fecha_hasta: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50),
    offset: int = Query(0),
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    require_calidad_role(current_user)

    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    filtros = []
    if tipo:
        filtros.append(Inspeccion.tipo_inspeccion == tipo)
    if resultado:
        filtros.append(Inspeccion.resultado_final == resultado)
    if fecha_desde:
        filtros.append(cast(Inspeccion.fecha, Date) >= fecha_desde)
    if fecha_hasta:
        filtros.append(cast(Inspeccion.fecha, Date) <= fecha_hasta)
    if search and search.strip():
        q = f"%{search.strip()}%"
        filtros.append(or_(
            Inspeccion.sku_producto.ilike(q),
            Inspeccion.nombre_producto.ilike(q),
            Inspeccion.inspector.ilike(q),
        ))

    total = (await db.execute(
        select(func.count()).select_from(Inspeccion).where(*filtros)
    )).scalar() or 0

    result = await db.execute(
        select(Inspeccion).where(*filtros)
        .order_by(Inspeccion.fecha.desc()).offset(offset).limit(limit)
    )
    return InspeccionesPage(items=result.scalars().all(), total=total)


@router.get("/inspecciones/{inspeccion_id}")
@router.get("/inspecciones/{inspeccion_id}/")
async def obtener_inspeccion(
    inspeccion_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    require_calidad_role(current_user)

    result = await db.execute(
        select(Inspeccion).where(Inspeccion.inspeccion_id == inspeccion_id)
    )
    inspeccion = result.scalar_one_or_none()
    if not inspeccion:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")

    return inspeccion


# ══════════════════════════════════════════════════════════════════════
# PDF INSPECCIÓN
# ══════════════════════════════════════════════════════════════════════

@router.get("/inspecciones/{inspeccion_id}/pdf")
@router.get("/inspecciones/{inspeccion_id}/pdf/")
async def descargar_pdf_inspeccion(
    inspeccion_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    require_calidad_role(current_user)

    result = await db.execute(
        select(Inspeccion).where(Inspeccion.inspeccion_id == inspeccion_id)
    )
    insp = result.scalar_one_or_none()
    if not insp:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")

    tipo = _valor_enum(insp.tipo_inspeccion, "QC")
    resultado = _valor_enum(insp.resultado_final, "N/A")

    data = {
        "tipo_inspeccion": tipo,
        "resultado_final": resultado,
        "lote_id": insp.lote_id,
        "sku_producto": insp.sku_producto,
        "nombre_producto": insp.nombre_producto,
        "oc_origen": insp.oc_origen,
        "op_origen": insp.op_origen,
        "fecha": insp.fecha,
        "inspector": insp.inspector,
        "cantidad_inspeccionada": insp.cantidad_inspeccionada,
        "resultados_puntos": insp.resultados_puntos or [],
        "respuestas": insp.respuestas or [],
        # Rutas absolutas: el generador embebe las imágenes desde disco
        "fotos": _fotos_en_disco(insp.fotos or []),
        "segunda_revision": insp.segunda_revision,
        "notas": insp.notas,
    }

    pdf_buf = generar_pdf_inspeccion(data)
    filename = f"{tipo}_{resultado}_{inspeccion_id}.pdf"

    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ══════════════════════════════════════════════════════════════════════
# PUNTOS DE INSPECCIÓN (desde productos)
# ══════════════════════════════════════════════════════════════════════

@router.get("/puntos-inspeccion/{sku}")
@router.get("/puntos-inspeccion/{sku}/")
async def obtener_puntos_inspeccion(
    sku: str,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Obtiene los puntos de inspección IQC/LQC/OQC de un producto por SKU."""
    require_calidad_role(current_user)

    result = await db.execute(
        select(Producto).where(Producto.sku == sku)
    )
    producto = result.scalar_one_or_none()
    if not producto:
        raise HTTPException(status_code=404, detail=f"Producto {sku} no encontrado")

    return {
        "sku": producto.sku,
        "nombre": producto.nombre,
        "tipo": producto.tipo,
        "controles_calidad": producto.controles_calidad or [],
        "puntos_inspeccion_iqc": producto.puntos_inspeccion_iqc or [],
        "puntos_inspeccion_lqc": producto.puntos_inspeccion_lqc or [],
        "puntos_inspeccion_oqc": producto.puntos_inspeccion_oqc or [],
    }


# ══════════════════════════════════════════════════════════════════════
# SCRAP
# ══════════════════════════════════════════════════════════════════════

@router.post("/scrap")
@router.post("/scrap/")
async def registrar_scrap(
    data: ScrapCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    require_calidad_role(current_user)

    scrap = RegistroScrap(
        scrap_id=generar_scrap_id(),
        fecha=ahora_local(),
        sku_producto=data.sku_producto,
        nombre_producto=data.nombre_producto,
        lote_id=data.lote_id,
        cantidad=data.cantidad,
        motivo=data.motivo,
        origen=data.origen,
        referencia=data.referencia,
        registrado_por=current_user.username,
    )
    db.add(scrap)
    await db.commit()
    await db.refresh(scrap)

    return {"message": "Scrap registrado", "scrap_id": scrap.scrap_id}


@router.get("/scrap", response_model=list[ScrapResponse])
@router.get("/scrap/", response_model=list[ScrapResponse])
async def listar_scrap(
    fecha: Optional[str] = Query(None),
    sku: Optional[str] = Query(None),
    origen: Optional[str] = Query(None),
    limite: int = Query(200),
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    require_calidad_role(current_user)

    query = select(RegistroScrap)

    if fecha:
        query = query.where(cast(RegistroScrap.fecha, Date) == fecha)
    if sku:
        query = query.where(RegistroScrap.sku_producto.ilike(f"%{sku}%"))
    if origen:
        query = query.where(RegistroScrap.origen == origen)

    query = query.order_by(RegistroScrap.fecha.desc()).limit(limite)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/scrap/pdf")
@router.get("/scrap/pdf/")
async def descargar_pdf_scrap(
    fecha: Optional[str] = Query(None),
    sku: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    require_calidad_role(current_user)

    query = select(RegistroScrap)
    if fecha:
        query = query.where(cast(RegistroScrap.fecha, Date) == fecha)
    if sku:
        query = query.where(RegistroScrap.sku_producto.ilike(f"%{sku}%"))
    query = query.order_by(RegistroScrap.fecha.desc())

    result = await db.execute(query)
    items = result.scalars().all()

    items_dict = [
        {
            "fecha": s.fecha,
            "sku_producto": s.sku_producto,
            "lote_id": s.lote_id,
            "cantidad": s.cantidad,
            "origen": s.origen,
            "referencia": s.referencia,
        }
        for s in items
    ]

    pdf_buf = generar_pdf_scrap(
        {"fecha": fecha or "Todas", "sku_filtro": sku or "Todos"},
        items_dict,
    )

    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="reporte_scrap.pdf"'},
    )


# ══════════════════════════════════════════════════════════════════════
# LIMPIEZA (solo admin)
# ══════════════════════════════════════════════════════════════════════

@router.post("/limpiar/inspecciones")
@router.post("/limpiar/inspecciones/")
async def limpiar_inspecciones_antiguas(
    dias: int = Query(90),
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if current_user.rol != RolUsuario.admin:
        raise HTTPException(status_code=403, detail="Solo admin")

    limite = ahora_local() - timedelta(days=dias)
    result = await db.execute(
        select(Inspeccion).where(Inspeccion.fecha < limite)
    )
    items = result.scalars().all()
    count = len(items)
    for item in items:
        await db.delete(item)
    await db.commit()

    return {"message": f"{count} inspecciones eliminadas (>{dias} días)"}


@router.post("/limpiar/scrap")
@router.post("/limpiar/scrap/")
async def limpiar_scrap_antiguo(
    dias: int = Query(90),
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if current_user.rol != RolUsuario.admin:
        raise HTTPException(status_code=403, detail="Solo admin")

    limite = ahora_local() - timedelta(days=dias)
    result = await db.execute(
        select(RegistroScrap).where(RegistroScrap.fecha < limite)
    )
    items = result.scalars().all()
    count = len(items)
    for item in items:
        await db.delete(item)
    await db.commit()

    return {"message": f"{count} registros de scrap eliminados (>{dias} días)"}