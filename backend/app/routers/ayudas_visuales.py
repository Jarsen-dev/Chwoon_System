import asyncio
import logging
import re
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.core.deps import get_supervisor_or_admin
from app.models.ayuda_visual import AyudaVisual
from app.models.producto import Producto
from app.models.usuario import Usuario
from app.schemas.ayudas_visuales import (
    AyudaVisualOut,
    ReindexResumen,
    SyncEstado,
    SyncResumenOut,
)
from app.services import ayudas_sync
from app.services.ayudas_sync import SmbNoDisponible, es_pdf_indexable

logger = logging.getLogger(__name__)

# /app/app/routers/ → /app/static/ayudas_visuales (mismo volumen que Logo.png)
AYUDAS_ROOT = Path(__file__).resolve().parents[2] / "static" / "ayudas_visuales"
THUMBS_DIR = AYUDAS_ROOT / ".thumbnails"
THUMB_WIDTH = 200

router = APIRouter(prefix="/ayudas-visuales", tags=["ayudas-visuales"])


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


# ══════════════════════════════════════════════════════════════════════
# HELPERS DE INDEXADO
# ══════════════════════════════════════════════════════════════════════

CODIGO_AV_RE = re.compile(r"^(AV-[A-Z0-9.\-]+)", re.IGNORECASE)


def extraer_sku(stem: str, skus_upper: dict) -> str:
    """Encuentra el SKU dentro del nombre de archivo (sin extensión).

    1) Match exacto por token (separado por espacios/guiones bajos) — caso normal:
       "AV-CA-EPS-001.01 MAL62484101" → token "MAL62484101".
    2) Fallback por substring (el más largo primero) para SKUs con separadores
       embebidos o nombres sin espacios.
    """
    s = stem.upper()
    for tok in re.split(r"[\s_]+", s):
        if tok and tok in skus_upper:
            return skus_upper[tok]
    for sku_u in sorted(skus_upper, key=len, reverse=True):
        if len(sku_u) >= 5 and sku_u in s:
            return skus_upper[sku_u]
    return ""


def extraer_codigo_av(stem: str) -> str:
    m = CODIGO_AV_RE.match(stem.strip())
    return m.group(1) if m else ""


def _render_thumbnail(pdf_path: Path, out_path: Path, width: int = THUMB_WIDTH) -> None:
    """Renderiza la primera página del PDF como PNG (bloqueante — usar en to_thread)."""
    import fitz  # PyMuPDF

    with fitz.open(pdf_path) as doc:
        page = doc[0]
        zoom = width / page.rect.width
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
        pix.save(out_path)


def _archivo_valido(f: Path) -> bool:
    # Mismo criterio que usa el espejo al copiar y podar, para que disco e
    # índice nunca discrepen (excluye .thumbnails y temporales de OneDrive).
    return es_pdf_indexable(f, AYUDAS_ROOT)


# ══════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ══════════════════════════════════════════════════════════════════════

@router.get("/producto/{sku}", response_model=List[AyudaVisualOut])
@router.get("/producto/{sku}/", response_model=List[AyudaVisualOut])
async def listar_ayudas_producto(sku: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AyudaVisual)
        .where(AyudaVisual.sku == sku)
        .order_by(AyudaVisual.nombre_archivo)
    )
    return result.scalars().all()


@router.get("/{av_id}/pdf")
@router.get("/{av_id}/pdf/")
async def descargar_pdf_ayuda(av_id: int, db: AsyncSession = Depends(get_db)):
    av = await db.get(AyudaVisual, av_id)
    if not av:
        raise HTTPException(status_code=404, detail="Ayuda visual no encontrada")

    path = (AYUDAS_ROOT / av.ruta).resolve()
    if not path.is_relative_to(AYUDAS_ROOT.resolve()) or not path.is_file():
        raise HTTPException(status_code=404, detail="Archivo no disponible en el servidor")

    safe_name = av.nombre_archivo.encode("ascii", "ignore").decode() or "ayuda_visual.pdf"
    return FileResponse(
        path,
        media_type="application/pdf",
        headers={
            "Cache-Control": "public, max-age=86400",
            "Content-Disposition": f'inline; filename="{safe_name}"',
        },
    )


@router.get("/{av_id}/thumbnail")
@router.get("/{av_id}/thumbnail/")
async def thumbnail_ayuda(av_id: int, db: AsyncSession = Depends(get_db)):
    av = await db.get(AyudaVisual, av_id)
    if not av:
        raise HTTPException(status_code=404, detail="Ayuda visual no encontrada")

    thumb = THUMBS_DIR / f"{av_id}.png"
    if not thumb.is_file():
        raise HTTPException(status_code=404, detail="Miniatura no disponible")

    return FileResponse(
        thumb,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=604800"},
    )


async def _reindexar_db(db: AsyncSession, progreso=None) -> ReindexResumen:
    """Escanea static/ayudas_visuales/ recursivamente, asocia cada PDF a su
    producto por SKU en el nombre del archivo y genera miniaturas faltantes.
    Idempotente: upsert por ruta; elimina filas cuyos archivos ya no existen."""
    AYUDAS_ROOT.mkdir(parents=True, exist_ok=True)
    THUMBS_DIR.mkdir(parents=True, exist_ok=True)

    skus_result = await db.execute(select(Producto.sku))
    skus_upper = {s.strip().upper(): s for s in skus_result.scalars() if s}

    existentes_result = await db.execute(select(AyudaVisual))
    existentes = {av.ruta: av for av in existentes_result.scalars()}

    archivos = [f for f in AYUDAS_ROOT.rglob("*") if _archivo_valido(f)]

    nuevos = actualizados = thumbs_generados = 0
    sin_producto: List[str] = []
    errores: List[str] = []
    rutas_vistas = set()

    for i, f in enumerate(archivos, start=1):
        if progreso:
            progreso("indice", i, len(archivos))
        ruta = f.relative_to(AYUDAS_ROOT).as_posix()
        sku = extraer_sku(f.stem, skus_upper)
        if not sku:
            sin_producto.append(ruta)
            continue

        rutas_vistas.add(ruta)
        codigo_av = extraer_codigo_av(f.stem)
        av = existentes.get(ruta)
        if av is None:
            av = AyudaVisual(
                sku=sku,
                nombre_archivo=f.name,
                ruta=ruta,
                codigo_av=codigo_av,
                tiene_thumbnail=False,
            )
            db.add(av)
            await db.flush()  # obtener id para nombrar la miniatura
            nuevos += 1
        elif av.sku != sku or av.codigo_av != codigo_av or av.nombre_archivo != f.name:
            av.sku = sku
            av.nombre_archivo = f.name
            av.codigo_av = codigo_av
            av.updated_at = datetime.utcnow()
            actualizados += 1

        thumb_path = THUMBS_DIR / f"{av.id}.png"
        if not thumb_path.is_file():
            try:
                await asyncio.to_thread(_render_thumbnail, f, thumb_path)
                av.tiene_thumbnail = True
                thumbs_generados += 1
            except Exception as e:  # PDF corrupto/protegido: indexar sin miniatura
                av.tiene_thumbnail = False
                errores.append(f"{ruta}: error generando miniatura ({e})")
        elif not av.tiene_thumbnail:
            av.tiene_thumbnail = True

    # Eliminar registros cuyos archivos desaparecieron del disco
    eliminados = 0
    for ruta, av in existentes.items():
        if ruta not in rutas_vistas:
            (THUMBS_DIR / f"{av.id}.png").unlink(missing_ok=True)
            await db.delete(av)
            eliminados += 1

    await db.commit()

    return ReindexResumen(
        total_archivos=len(archivos),
        indexados=len(rutas_vistas),
        nuevos=nuevos,
        actualizados=actualizados,
        eliminados=eliminados,
        thumbnails_generados=thumbs_generados,
        sin_producto=sorted(sin_producto),
        errores=errores,
    )


@router.post("/reindexar", response_model=ReindexResumen)
@router.post("/reindexar/", response_model=ReindexResumen)
async def reindexar_ayudas(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_supervisor_or_admin),
):
    """Reindexa SOLO el disco local, sin tocar la nube.

    Fallback para cuando el Synology no está disponible o se copiaron PDFs a
    mano. El flujo normal es POST /sync, que espeja y luego reindexa."""
    return await _reindexar_db(db)


# ══════════════════════════════════════════════════════════════════════
# SYNC EN BACKGROUND (espejo Synology → disco + reindexado)
# ══════════════════════════════════════════════════════════════════════

# Estado en memoria del proceso: hay un solo contenedor backend, así que no
# hace falta persistirlo. Se consulta por polling desde la UI.
_estado: dict = {
    "estado": "idle",
    "fase": "",
    "actual": 0,
    "total": 0,
    "inicio": None,
    "fin": None,
    "disparado_por": "",
    "nube": None,
    "indice": None,
    "error": None,
}
_sync_lock = asyncio.Lock()   # serializa el arranque desde el endpoint
_run_lock = asyncio.Lock()    # garantiza un solo sync a la vez (manual o nocturno)


def _progreso(fase: str, actual: int, total: int) -> None:
    _estado["fase"] = fase
    _estado["actual"] = actual
    _estado["total"] = total


async def _run_sync(disparado_por: str) -> None:
    """Fase 1: espejo SMB → disco. Fase 2: reindexado de la DB sobre ese disco."""
    if _run_lock.locked():
        # El nocturno y el botón pueden coincidir: el segundo se descarta y deja
        # intacto el estado del que ya va corriendo.
        logger.info("Sync de ayudas visuales ya en curso; se ignora el disparo de %s", disparado_por)
        return

    async with _run_lock:
        await _ejecutar_sync(disparado_por)


async def _ejecutar_sync(disparado_por: str) -> None:
    _estado.update(
        estado="corriendo", fase="nube", actual=0, total=0,
        inicio=datetime.utcnow().isoformat(), fin=None,
        disparado_por=disparado_por, nube=None, indice=None, error=None,
    )
    try:
        resumen_nube = await asyncio.to_thread(
            ayudas_sync.sincronizar_espejo, AYUDAS_ROOT, _progreso
        )
        _estado["nube"] = SyncResumenOut(**vars(resumen_nube))

        _estado.update(fase="indice", actual=0, total=0)
        async with AsyncSessionLocal() as db:
            _estado["indice"] = await _reindexar_db(db, _progreso)

        _estado.update(estado="ok", fase="")
    except SmbNoDisponible as e:
        logger.warning("Sync de ayudas visuales abortado: %s", e)
        # El espejo local queda intacto: las AV se siguen viendo.
        _estado.update(
            estado="error", fase="",
            error=f"{e} — el espejo local se conservó sin cambios.",
        )
    except Exception as e:
        logger.exception("Error en sync de ayudas visuales")
        _estado.update(estado="error", fase="", error=str(e))
    finally:
        _estado["fin"] = datetime.utcnow().isoformat()


@router.post("/sync", response_model=SyncEstado)
@router.post("/sync/", response_model=SyncEstado)
async def iniciar_sync(
    current_user: Usuario = Depends(get_supervisor_or_admin),
):
    """Lanza el espejo contra el Synology y responde de inmediato.

    El avance se consulta con GET /ayudas-visuales/sync/estado."""
    async with _sync_lock:
        if _estado["estado"] == "corriendo":
            raise HTTPException(
                status_code=409,
                detail=f"Ya hay una sincronización en curso "
                       f"(iniciada por {_estado['disparado_por'] or 'el sistema'}).",
            )
        _estado.update(estado="corriendo", fase="nube", actual=0, total=0)
        asyncio.create_task(_run_sync(current_user.username))

    return SyncEstado(**_estado)


@router.get("/sync/estado", response_model=SyncEstado)
@router.get("/sync/estado/", response_model=SyncEstado)
async def estado_sync():
    """Estado del sync actual o del último terminado (incluye el nocturno)."""
    return SyncEstado(**_estado)


def registrar_job_sync_ayudas(scheduler) -> None:
    """Registra el sync nocturno si AYUDAS_SYNC_AUTO está activo (.env)."""
    if not ayudas_sync.sync_automatico_activo():
        logger.info("🌙 Sync automático de ayudas visuales desactivado (AYUDAS_SYNC_AUTO)")
        return

    from apscheduler.triggers.cron import CronTrigger

    hora, minuto = ayudas_sync.hora_sync_automatico()
    scheduler.add_job(
        _run_sync,
        trigger=CronTrigger(hour=hora, minute=minuto),
        args=["scheduler"],
        id="sync_ayudas_visuales",
        replace_existing=True,
        misfire_grace_time=3600,
    )
    logger.info("🌙 Sync automático de ayudas visuales programado a las %02d:%02d", hora, minuto)
