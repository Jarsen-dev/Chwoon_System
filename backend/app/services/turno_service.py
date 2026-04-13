"""
turno_service.py
────────────────
Cierre automático de turno usando APScheduler con zona horaria
America/Mexico_City (CST UTC-6).

Turnos:
  DIA   → 07:30 – 19:30 CST   cierra a las 19:30 CST
  NOCHE → 19:30 – 07:30 CST   cierra a las 07:30 CST del día siguiente
"""

import json
import logging
from datetime import datetime, timedelta

import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron      import CronTrigger
from sqlalchemy                     import select

from app.database                   import AsyncSessionLocal
from app.models.historial_turno     import HistorialTurno
from app.models.registro_produccion import RegistroProduccion
from app.models.plan_produccion     import PlanProduccion

logger = logging.getLogger(__name__)

TZ_LOCAL = pytz.timezone("America/Mexico_City")


def _ahora_local() -> datetime:
    """Hora actual en America/Mexico_City."""
    return datetime.now(TZ_LOCAL)


def _fecha_turno_que_termina(turno: str) -> str:
    """
    Fecha local del turno que acaba de terminar.
      DIA   termina 19:30 CST → fecha = hoy local
      NOCHE termina 07:30 CST → el turno empezó ayer local
    """
    ahora = _ahora_local()
    if turno == "NOCHE":
        return (ahora - timedelta(days=1)).strftime("%Y-%m-%d")
    return ahora.strftime("%Y-%m-%d")


async def _guardar_historial(
    db,
    fecha:         str,
    turno:         str,
    registros_prod: list,
    plan_map:      dict,
) -> None:
    """Construye el JSON resumen y guarda/actualiza en historial_turnos."""

    # ── Acumulado por parte ───────────────────────────────────────────
    por_parte: dict = {}
    for r in registros_prod:
        p = r.numero_parte
        if p not in por_parte:
            por_parte[p] = {
                "numero_parte":    p,
                "maquina":         r.maquina or "—",
                "total_acumulado": 0,
                "escaneos":        0,
                "meta":            plan_map.get(p, 0),
            }
        por_parte[p]["total_acumulado"] = max(
            por_parte[p]["total_acumulado"],
            r.total_acumulado or 0,
        )
        por_parte[p]["escaneos"] += 1

    # ── Cumplimiento % ────────────────────────────────────────────────
    resumen = []
    for datos in por_parte.values():
        meta         = datos["meta"]
        cumplimiento = (
            round((datos["total_acumulado"] / meta) * 100, 1)
            if meta > 0 else 0
        )
        resumen.append({**datos, "cumplimiento_pct": cumplimiento})

    total_piezas   = sum(r.qty_bolsa   or 0 for r in registros_prod)
    total_escaneos = len(registros_prod)
    cerrado_en     = _ahora_local().strftime("%Y-%m-%d %H:%M:%S CST")

    # ── Evitar duplicados ─────────────────────────────────────────────
    result = await db.execute(
        select(HistorialTurno)
        .where(HistorialTurno.fecha == fecha)
        .where(HistorialTurno.turno == turno)
    )
    existente = result.scalar_one_or_none()

    if existente:
        existente.resumen        = resumen
        existente.total_piezas   = total_piezas
        existente.total_escaneos = total_escaneos
        existente.cerrado_en     = cerrado_en
        existente.cerrado_por    = "scheduler"
        logger.info(f"📝 Historial actualizado → turno {turno} | {fecha}")
    else:
        db.add(HistorialTurno(
            fecha          = fecha,
            turno          = turno,
            resumen        = resumen,
            total_piezas   = total_piezas,
            total_escaneos = total_escaneos,
            cerrado_por    = "scheduler",
            cerrado_en     = cerrado_en,
        ))
        logger.info(f"✅ Historial creado → turno {turno} | {fecha}")

    await db.commit()


async def cerrar_turno(turno: str) -> None:
    """
    Punto de entrada del scheduler.
    turno = "DIA" | "NOCHE"
    """
    fecha = _fecha_turno_que_termina(turno)
    logger.info(f"⏰ Cerrando turno {turno} | fecha {fecha}")

    try:
        async with AsyncSessionLocal() as db:

            # ── Registros de producción ───────────────────────────────
            result = await db.execute(
                select(RegistroProduccion)
                .where(RegistroProduccion.fecha == fecha)
                .where(RegistroProduccion.turno == turno)
            )
            registros_prod = result.scalars().all()

            if not registros_prod:
                logger.warning(
                    f"⚠️  Sin registros para turno {turno} | {fecha}. "
                    "Se guarda historial vacío."
                )

            # ── Plan ──────────────────────────────────────────────────
            result_plan = await db.execute(select(PlanProduccion))
            plan_map    = {
                p.numero_parte: p.meta_piezas
                for p in result_plan.scalars().all()
            }

            await _guardar_historial(db, fecha, turno, registros_prod, plan_map)

            logger.info(
                f"🏁 Turno {turno} cerrado exitosamente | "
                f"{total_escaneos} escaneos | "
                f"{total_piezas} piezas"
                if (total_escaneos := len(registros_prod)) is not None
                and (total_piezas := sum(r.qty_bolsa or 0 for r in registros_prod)) is not None
                else f"🏁 Turno {turno} cerrado (sin producción)"
            )

    except Exception as exc:
        logger.exception(f"❌ Error cerrando turno {turno}: {exc}")


def iniciar_scheduler() -> AsyncIOScheduler:
    """
    Inicia APScheduler con CronTrigger en zona America/Mexico_City.
    Los triggers usan hora local directamente, sin conversión manual.
    """
    scheduler = AsyncIOScheduler(timezone=TZ_LOCAL)

    # ── Cierre turno DIA → 19:30 CST ─────────────────────────────────
    scheduler.add_job(
        cerrar_turno,
        trigger         = CronTrigger(
                            hour            = 19,
                            minute          = 30,
                            timezone        = TZ_LOCAL,
                          ),
        args            = ["DIA"],
        id              = "cierre_turno_dia",
        replace_existing= True,
        misfire_grace_time = 300,   # tolera 5 min de retraso
    )

    # ── Cierre turno NOCHE → 07:30 CST ───────────────────────────────
    scheduler.add_job(
        cerrar_turno,
        trigger         = CronTrigger(
                            hour            = 7,
                            minute          = 30,
                            timezone        = TZ_LOCAL,
                          ),
        args            = ["NOCHE"],
        id              = "cierre_turno_noche",
        replace_existing= True,
        misfire_grace_time = 300,
    )

    scheduler.start()
    logger.info(
        "⏰ Scheduler iniciado │ "
        "Cierre DIA: 19:30 CST │ "
        "Cierre NOCHE: 07:30 CST │ "
        "Zona: America/Mexico_City"
    )
    return scheduler