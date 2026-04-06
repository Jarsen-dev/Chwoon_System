from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime

from app.models.contador_carrito import ContadorCarrito
from app.database import AsyncSessionLocal


def _get_turno_por_hora() -> str:
    """
    Día:   7:30 → 19:30  (450  → 1170 minutos)
    Noche: 19:30 → 7:30  (1170 → 450  minutos)
    """
    now           = datetime.now()
    total_minutos = now.hour * 60 + now.minute
    return 'D' if 450 <= total_minutos < 1170 else 'N'


async def obtener_siguiente_carrito(numero_parte: str, turno_item: str) -> int:
    """
    Obtiene el siguiente número de carrito para un número de parte.
    - Si no existe en DB         → crea con count = 1
    - Si el turno por hora cambió → resetea a 1
    - Si mismo turno              → incrementa
    """
    turno_hora = _get_turno_por_hora()

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ContadorCarrito).where(
                ContadorCarrito.numero_parte == numero_parte
            )
        )
        registro = result.scalar_one_or_none()

        if not registro:
            # Primera vez → crea
            registro = ContadorCarrito(
                numero_parte = numero_parte,
                turno_hora   = turno_hora,
                count        = 1,
                updated_at   = datetime.utcnow()
            )
            db.add(registro)

        elif registro.turno_hora != turno_hora:
            # El turno real cambió → resetea
            registro.turno_hora = turno_hora
            registro.count      = 1
            registro.updated_at = datetime.utcnow()

        else:
            # Mismo turno → incrementa
            registro.count     += 1
            registro.updated_at = datetime.utcnow()

        await db.commit()
        await db.refresh(registro)
        return registro.count


async def resetear_contador_db(numero_parte: str | None = None) -> None:
    """
    Resetea el contador en DB.
    - numero_parte = None → resetea todo
    - numero_parte = str  → resetea solo esa parte
    """
    async with AsyncSessionLocal() as db:
        if numero_parte:
            result = await db.execute(
                select(ContadorCarrito).where(
                    ContadorCarrito.numero_parte == numero_parte
                )
            )
            registro = result.scalar_one_or_none()
            if registro:
                await db.delete(registro)
        else:
            result = await db.execute(select(ContadorCarrito))
            for registro in result.scalars().all():
                await db.delete(registro)

        await db.commit()


async def obtener_estado_contador_db() -> list:
    """
    Retorna el estado actual de todos los contadores en DB.
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(ContadorCarrito).order_by(ContadorCarrito.updated_at.desc())
        )
        registros = result.scalars().all()
        return [
            {
                "numero_parte":   r.numero_parte,
                "turno_hora":     r.turno_hora,
                "ultimo_carrito": r.count,
                "updated_at":     r.updated_at,
            }
            for r in registros
        ]