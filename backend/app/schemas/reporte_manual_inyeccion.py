from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ReporteManualInyeccionCreate(BaseModel):
    turno: str
    numero_parte: str
    descripcion: str = ""
    cliente: str = ""
    resina: str
    proceso: str
    peso: float = Field(..., ge=0)
    cav_bom: int = Field(..., ge=0)
    ciclo: float = Field(..., gt=0)
    type: str = ""
    maquina: str = ""
    cav_real: int = Field(..., ge=0)
    ciclo_real: float = Field(..., ge=0)
    tiempo_trabajo: float = Field(..., ge=0)
    produccion_total: int = Field(..., ge=0)

    # Paros
    cambio_molde: float = 0
    ajustes: float = 0
    arranque_paro: float = 0
    mantenimiento: float = 0
    molde_danado: float = 0
    falta_personal: float = 0
    falta_material: float = 0
    otro_paro: float = 0

    # Sub-motivos mantenimiento
    soldar_puerta_ejector: float = 0
    estopero: float = 0
    bomba_hidraulica: float = 0
    motor_hidraulico: float = 0
    manguera_hidraulica: float = 0
    valvula_hidraulica: float = 0
    reloj: float = 0
    caldera: float = 0
    sensor_seguridad: float = 0
    falta_aire: float = 0
    fuga_aceite: float = 0
    electrico: float = 0
    tolva_tapada: float = 0
    extra: float = 0

    # Scrap
    scrap_falta_llenado: int = 0
    scrap_cruda: int = 0
    scrap_quebrada: int = 0
    scrap_hinchada: int = 0
    scrap_arranque: int = 0
    scrap_fuera_dimension: int = 0
    scrap_pandeada: int = 0
    scrap_aplastada_molde: int = 0


class ReporteManualInyeccionResponse(BaseModel):
    id: int
    fecha: Optional[datetime] = None
    turno: str
    numero_parte: str
    descripcion: str
    cliente: str
    resina: str
    proceso: str
    peso: float
    cav_bom: int
    ciclo: float
    type: str
    maquina: str
    cav_real: int
    ciclo_real: float
    tiempo_trabajo: float
    produccion_total: int

    cambio_molde: float
    ajustes: float
    arranque_paro: float
    mantenimiento: float
    molde_danado: float
    falta_personal: float
    falta_material: float
    otro_paro: float

    soldar_puerta_ejector: float
    estopero: float
    bomba_hidraulica: float
    motor_hidraulico: float
    manguera_hidraulica: float
    valvula_hidraulica: float
    reloj: float
    caldera: float
    sensor_seguridad: float
    falta_aire: float
    fuga_aceite: float
    electrico: float
    tolva_tapada: float
    extra: float

    scrap_falta_llenado: int
    scrap_cruda: int
    scrap_quebrada: int
    scrap_hinchada: int
    scrap_arranque: int
    scrap_fuera_dimension: int
    scrap_pandeada: int
    scrap_aplastada_molde: int

    # Calculados
    scrap_total: int
    scrap_kg: float
    tiempo_paro_total: float
    cm: float
    produccion_buena: int
    produccion_kg: float
    produccion_meta_total: float
    produccion_meta_kg: float
    produccion_porcentaje: float
    scrap_porcentaje: float

    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ══════════════════════════════════════════════════════════════════
# DASHBOARD
# ══════════════════════════════════════════════════════════════════
class DashboardPeriodoItem(BaseModel):
    periodo: str
    produccion_total: int
    produccion_buena: int
    scrap_total: int
    tiempo_paro_total: float
    produccion_porcentaje: float
    scrap_porcentaje: float
    cantidad_registros: int


class DashboardMaquinaItem(BaseModel):
    maquina: str
    produccion_total: int
    produccion_buena: int
    scrap_total: int
    tiempo_paro_total: float
    produccion_porcentaje: float


class DashboardMotivoItem(BaseModel):
    motivo: str
    valor: float


class DashboardTurnoItem(BaseModel):
    turno: str
    produccion_total: int
    produccion_buena: int
    scrap_total: int
    tiempo_paro_total: float


class DashboardResponse(BaseModel):
    periodo: str
    fecha_desde: str
    fecha_hasta: str
    totales: dict
    por_periodo: list[DashboardPeriodoItem]
    por_maquina: list[DashboardMaquinaItem]
    por_turno: list[DashboardTurnoItem]
    por_motivo_paro: list[DashboardMotivoItem]
    por_motivo_scrap: list[DashboardMotivoItem]
    registros_detalle: list[ReporteManualInyeccionResponse]
