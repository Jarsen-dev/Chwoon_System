from __future__ import annotations

from datetime import datetime
from typing import Optional, Any, Dict

from pydantic import BaseModel, Field


# ══════════════════════════════════════════════════════════════════════
# Eventos entrantes desde el gateway (script Python)
# ══════════════════════════════════════════════════════════════════════

class EventoIn(BaseModel):
    maquina_codigo: str
    tipo_evento:    str  # PIEZA | INCIDENCIA_INICIO | INCIDENCIA_FIN | CAMBIO_ESTADO
    valor:          Optional[int] = None
    estado:         Optional[str] = None
    operador:       Optional[str] = None
    metadata:       Dict[str, Any] = Field(default_factory=dict)


class EventoOut(BaseModel):
    id:          int
    maquina_id:  int
    tipo_evento: str
    valor:       Optional[int] = None
    estado:      Optional[str] = None
    operador:    Optional[str] = None
    turno:       Optional[str] = None
    fecha_turno: Optional[str] = None
    # Lee del atributo ORM `meta` pero serializa como "metadata" (FastAPI usa by_alias=True)
    metadata:    Dict[str, Any] = Field(
        default_factory=dict,
        validation_alias="meta",
        serialization_alias="metadata",
    )
    created_at:  Optional[datetime] = None

    model_config = {"from_attributes": True, "populate_by_name": True}


# ══════════════════════════════════════════════════════════════════════
# Máquinas + estado en vivo
# ══════════════════════════════════════════════════════════════════════

class MaquinaOut(BaseModel):
    id:                    int
    codigo:                str
    nombre:                str
    linea:                 Optional[str] = None
    tipo:                  Optional[str] = None
    marca_plc:             Optional[str] = None
    ip_hmi:                Optional[str] = None
    umbral_incidencia_seg: int = 8
    activa:                bool = True

    model_config = {"from_attributes": True}


class MaquinaEstadoOut(MaquinaOut):
    """Máquina + snapshot en vivo + avance del turno actual."""
    counter:             Optional[int] = None
    process_no:          Optional[int] = None
    meta_h:              Optional[int] = None
    estado_actual:       Optional[str] = None   # AUTO | MANUAL | DESCONOCIDO
    incidencias_activas: list[str] = Field(default_factory=list)
    piezas_turno:        int = 0
    ultima_actualizacion: Optional[datetime] = None
