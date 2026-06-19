"""Helpers de turno y timezone (UTC-6 fijo para la planta).

Copia canónica de los helpers que estaban duplicados en routers/admin.py y
routers/secado.py. Los routers nuevos deben importar desde aquí.

Turnos: DIA 07:30-19:30 / NOCHE 19:30-07:30.
"""
from datetime import datetime, timedelta, timezone

TZ_LOCAL = timezone(timedelta(hours=-6))  # CST México (UTC-6)

# Minutos desde medianoche para los límites de turno
_INICIO_DIA = 7 * 60 + 30   # 07:30 → 450
_FIN_DIA = 19 * 60 + 30     # 19:30 → 1170


def ahora_local() -> datetime:
    """Hora actual con tzinfo UTC-6."""
    return datetime.now(TZ_LOCAL)


def get_turno_actual() -> str:
    """Retorna 'DIA' (07:30-19:30) o 'NOCHE'."""
    now = ahora_local()
    total_min = now.hour * 60 + now.minute
    return "DIA" if _INICIO_DIA <= total_min < _FIN_DIA else "NOCHE"


def get_fecha_turno() -> str:
    """Fecha del turno en formato YYYY-MM-DD.

    El turno NOCHE que arranca a las 19:30 cruza la medianoche; las horas
    entre 00:00 y 07:30 pertenecen al turno que empezó el día anterior.
    """
    now = ahora_local()
    total_min = now.hour * 60 + now.minute
    if total_min < _INICIO_DIA:  # antes de 07:30 → el turno NOCHE empezó ayer
        return (now - timedelta(days=1)).strftime("%Y-%m-%d")
    return now.strftime("%Y-%m-%d")
