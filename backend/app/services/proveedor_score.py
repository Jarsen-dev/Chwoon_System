from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from app.models.orden_compra import Proveedor, ProveedorEvento

TZ_LOCAL = timezone(timedelta(hours=-6))

SCORE_BASE = 100.0
VENTANA_DIAS = 180
VENTANA_INCIDENTES_DIAS = 90

# Impactos por categoría
IMPACTOS = {
    "CALIDAD_IQC_RECHAZO": -10.0,
    "CALIDAD_IQC_APROBADO": +2.0,
    "PUNTUALIDAD_TARDE": -8.0,
    "PUNTUALIDAD_A_TIEMPO": +3.0,
    "EXACTITUD_INCIDENCIA": -15.0,
}


def _ahora_local() -> datetime:
    return datetime.now(TZ_LOCAL)


def _clamp(val: float) -> float:
    return max(0.0, min(100.0, val))


def _score_categoria(eventos_categoria: list[ProveedorEvento]) -> float:
    total = sum(e.impacto for e in eventos_categoria)
    return _clamp(SCORE_BASE + total)


def _recomendacion_estatus(score: float, estatus_actual: str) -> Optional[str]:
    if score < 30 and estatus_actual != "Suspendido":
        return "Recomendación del sistema: Cambiar a Suspendido debido a bajo Score"
    if score < 60 and estatus_actual == "Aprobado":
        return "Recomendación del sistema: Cambiar a Condicional debido a bajo Score"
    return None


async def recalcular_score(proveedor_id: int, db: AsyncSession) -> dict:
    """Recalcula score del proveedor basado en eventos de los últimos 180 días."""
    result = await db.execute(select(Proveedor).where(Proveedor.id == proveedor_id))
    proveedor = result.scalar_one_or_none()
    if not proveedor:
        raise ValueError("Proveedor no encontrado")

    ahora = _ahora_local()
    limite = ahora - timedelta(days=VENTANA_DIAS)
    limite_incidentes = ahora - timedelta(days=VENTANA_INCIDENTES_DIAS)

    # Eventos en ventana
    eventos_result = await db.execute(
        select(ProveedorEvento).where(
            and_(
                ProveedorEvento.proveedor_id == proveedor_id,
                ProveedorEvento.fecha >= limite,
            )
        )
    )
    eventos = eventos_result.scalars().all()

    # Categorías dinámicas
    calidad_eventos = [e for e in eventos if e.tipo_evento.startswith("CALIDAD_")]
    puntualidad_eventos = [e for e in eventos if e.tipo_evento.startswith("PUNTUALIDAD_")]
    exactitud_eventos = [e for e in eventos if e.tipo_evento.startswith("EXACTITUD_")]

    score_calidad = _score_categoria(calidad_eventos)
    score_puntualidad = _score_categoria(puntualidad_eventos)
    score_exactitud = _score_categoria(exactitud_eventos)

    # Crédito estático
    dias = proveedor.dias_credito or 30
    if dias < 30:
        score_credito = _clamp(SCORE_BASE - 5.0)
    elif dias >= 60:
        score_credito = _clamp(SCORE_BASE + 5.0)
    else:
        score_credito = SCORE_BASE

    # Historial: sin incidentes negativos en últimos 90 días
    eventos_negativos = [
        e for e in eventos
        if e.fecha >= limite_incidentes and e.impacto < 0
    ]
    bonus_historial = 5.0 if not eventos_negativos else 0.0

    # Score global: promedio de categorías + bonus historial
    categorias = [score_calidad, score_puntualidad, score_exactitud, score_credito]
    score_global = _clamp(sum(categorias) / len(categorias) + bonus_historial)

    detalle = {
        "calidad": round(score_calidad, 1),
        "puntualidad": round(score_puntualidad, 1),
        "exactitud": round(score_exactitud, 1),
        "credito": round(score_credito, 1),
        "bonus_historial": round(bonus_historial, 1),
        "score_global": round(score_global, 1),
    }

    proveedor.score_calidad = score_global
    proveedor.score_detalle = detalle
    proveedor.score_updated_at = ahora

    await db.commit()
    await db.refresh(proveedor)

    return {
        "proveedor_id": proveedor.id,
        "razon_social": proveedor.razon_social,
        "score_calidad": score_global,
        "score_detalle": detalle,
        "score_updated_at": proveedor.score_updated_at,
        "recomendacion_estatus": _recomendacion_estatus(score_global, proveedor.estatus_calidad),
    }


async def registrar_evento(
    proveedor_id: int,
    tipo_evento: str,
    impacto: float,
    referencia_id: Optional[str] = None,
    descripcion: Optional[str] = None,
    registrado_por: Optional[str] = None,
    db: AsyncSession = None,
) -> ProveedorEvento:
    """Registra un evento y recalcula el score del proveedor."""
    if db is None:
        raise ValueError("db session requerida")

    evento = ProveedorEvento(
        proveedor_id=proveedor_id,
        tipo_evento=tipo_evento,
        impacto=impacto,
        referencia_id=referencia_id,
        descripcion=descripcion,
        registrado_por=registrado_por,
        fecha=_ahora_local(),
    )
    db.add(evento)
    await db.flush()

    await recalcular_score(proveedor_id, db)
    return evento
