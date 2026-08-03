"""Cola de impresión RAW — la consume el agente de Windows.

El backend corre en Docker y no alcanza la Zebra ZD220 (USB001, sin compartir,
sin TCP/9100), así que no imprime nada: encola el ZPL y `gateway/agente_impresion.py`
lo reclama por HTTP desde la PC de Windows y lo manda con win32print.

Autenticación por `X-API-Key` (GATEWAY_API_KEY), igual que el gateway de máquinas:
el agente es un proceso sin usuario, no tiene sesión JWT.
"""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_almacen, get_db, verify_gateway_key
from app.models.impresion_trabajo import (
    ESTADO_ENVIADO,
    ESTADO_ERROR,
    ESTADO_IMPRESO,
    ESTADO_PENDIENTE,
    FORMATO_ZPL,
    ImpresionTrabajo,
)
from app.models.usuario import Usuario
from app.schemas.impresion import ConfirmarIn, DestinoOut, ReclamarIn, TrabajoOut
from app.services import impresion_red, zpl_etiquetas

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/impresion", tags=["impresion"])

TZ_LOCAL = timezone(timedelta(hours=-6))

# Última vez que el agente de Windows pidió trabajo, por cola de impresión.
# En memoria a propósito: el agente sondea cada 2 s (INTERVALO_SEGUNDOS), así que
# un reinicio del backend se repuebla solo y no vale una tabla ni una migración.
ULTIMO_VISTO: dict[str, datetime] = {}

# Margen antes de dar por caído al agente: varias vueltas de sondeo, para que un
# hipo de red no haga desaparecer la Zebra del modal mientras alguien lo tiene abierto.
TOLERANCIA_AGENTE = timedelta(seconds=15)


@router.post("/reclamar", response_model=list[TrabajoOut])
@router.post("/reclamar/", response_model=list[TrabajoOut])
async def reclamar_trabajos(
    body: ReclamarIn,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_gateway_key),
):
    """Entrega hasta `max` trabajos pendientes y los marca como enviados.

    `SKIP LOCKED` para que dos agentes apuntando a la misma impresora no se
    lleven el mismo trabajo y salga la etiqueta duplicada.
    """
    limite = max(1, min(body.max, 50))
    ahora = datetime.now(TZ_LOCAL)
    ULTIMO_VISTO[body.impresora] = ahora

    result = await db.execute(
        select(ImpresionTrabajo)
        .where(
            ImpresionTrabajo.impresora == body.impresora,
            ImpresionTrabajo.estado == ESTADO_PENDIENTE,
            # El agente solo sabe hablar ZPL; los de hoja carta los manda el
            # propio backend. Hoy el filtro por impresora ya los dejaría fuera,
            # pero un rename de cola no debe abrir esa puerta.
            ImpresionTrabajo.formato == FORMATO_ZPL,
        )
        .order_by(ImpresionTrabajo.id)
        .limit(limite)
        .with_for_update(skip_locked=True)
    )
    trabajos = result.scalars().all()

    for trabajo in trabajos:
        trabajo.estado = ESTADO_ENVIADO
        trabajo.enviado_en = ahora
    await db.commit()

    if trabajos:
        logger.info("Impresión: %d trabajo(s) entregados a '%s'", len(trabajos), body.impresora)
    return [TrabajoOut(id=t.id, zpl=t.zpl) for t in trabajos]


@router.post("/confirmar")
@router.post("/confirmar/")
async def confirmar_trabajos(
    body: ConfirmarIn,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_gateway_key),
):
    """Cierra los trabajos que el agente ya mandó (o intentó mandar).

    Los que se queden en `enviado` porque el agente murió a media impresión NO
    se reencolan solos: reencolar a ciegas imprimiría la etiqueta dos veces.
    Se resuelven con la reimpresión individual desde la UI.
    """
    if not body.resultados:
        return {"actualizados": 0}

    ids = [r.id for r in body.resultados]
    result = await db.execute(
        select(ImpresionTrabajo).where(ImpresionTrabajo.id.in_(ids))
    )
    por_id = {t.id: t for t in result.scalars().all()}
    faltantes = [i for i in ids if i not in por_id]
    if faltantes:
        raise HTTPException(
            status_code=404,
            detail=f"Trabajos inexistentes: {faltantes}",
        )

    ahora = datetime.now(TZ_LOCAL)
    for resultado in body.resultados:
        trabajo = por_id[resultado.id]
        trabajo.estado = ESTADO_IMPRESO if resultado.ok else ESTADO_ERROR
        trabajo.error = None if resultado.ok else (resultado.error or "Error sin detalle")
        trabajo.terminado_en = ahora
        if not resultado.ok:
            logger.warning("Impresión: trabajo %d falló — %s", trabajo.id, trabajo.error)
    await db.commit()
    return {"actualizados": len(body.resultados)}


def _estado_zebra() -> tuple[bool, str]:
    """La Zebra está disponible mientras su agente siga pidiendo trabajo."""
    visto = ULTIMO_VISTO.get(zpl_etiquetas.IMPRESORA_DEFAULT)
    if visto is None:
        return False, "El agente de impresión de Windows no se ha conectado"

    hace = datetime.now(TZ_LOCAL) - visto
    if hace > TOLERANCIA_AGENTE:
        return False, f"El agente no responde desde hace {int(hace.total_seconds())} s"
    return True, f"Agente activo (visto hace {int(hace.total_seconds())} s)"


@router.get("/destinos", response_model=list[DestinoOut])
@router.get("/destinos/", response_model=list[DestinoOut])
async def listar_destinos(_: Usuario = Depends(get_current_almacen)):
    """Impresoras a las que se puede mandar una etiqueta ahora mismo.

    El modal de impresión ofrece solo las disponibles; si no hay ninguna, no
    deja generar etiquetas — crear el lote de algo que nunca se imprimió deja
    material en el sistema sin nada pegado en la caja.
    """
    zebra_ok, zebra_detalle = _estado_zebra()
    carta_ok = await impresion_red.disponible()

    return [
        DestinoOut(
            id="zebra",
            nombre=f"{zpl_etiquetas.IMPRESORA_DEFAULT} — etiqueta individual",
            disponible=zebra_ok,
            detalle=zebra_detalle,
        ),
        DestinoOut(
            id="carta",
            nombre=f"{impresion_red.NOMBRE} — hoja carta (8 por hoja)",
            disponible=carta_ok,
            detalle=(
                f"{impresion_red.HOST}:{impresion_red.PUERTO}"
                if carta_ok
                else f"Sin respuesta en {impresion_red.HOST}:{impresion_red.PUERTO}"
            ),
        ),
    ]
