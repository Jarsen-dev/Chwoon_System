from sqlalchemy import Column, Integer, String, DateTime, JSON, Enum as SAEnum
from datetime import datetime, timezone, timedelta
import enum
from app.database import Base

TZ_LOCAL = timezone(timedelta(hours=-6))


class TipoInspeccion(str, enum.Enum):
    IQC = "IQC"
    LQC = "LQC"
    OQC = "OQC"
    DEVOLUCION = "DEVOLUCION"


class ResultadoInspeccion(str, enum.Enum):
    Aprobado = "Aprobado"
    Rechazado = "Rechazado"


def _ahora_naive():
    """Retorna datetime local SIN timezone info (naive) para PostgreSQL TIMESTAMP WITHOUT TZ."""
    return datetime.now(TZ_LOCAL).replace(tzinfo=None)


class Inspeccion(Base):
    __tablename__ = "inspecciones"

    id                     = Column(Integer, primary_key=True, index=True)
    inspeccion_id          = Column(String(60), unique=True, nullable=False, index=True)
    lote_id                = Column(String(100), nullable=True, index=True)
    sku_producto           = Column(String(100), nullable=True, index=True)
    nombre_producto        = Column(String(200), nullable=True)
    tipo_inspeccion        = Column(SAEnum(TipoInspeccion), nullable=False, index=True)
    fecha                  = Column(DateTime, default=_ahora_naive)
    inspector              = Column(String(100), nullable=False)
    resultado_final        = Column(SAEnum(ResultadoInspeccion), nullable=False)
    resultados_puntos      = Column(JSON, default=[])
    oc_origen              = Column(String(100), nullable=True)
    op_origen              = Column(String(100), nullable=True)
    cantidad_inspeccionada = Column(Integer, default=0)
    notas                  = Column(String(500), nullable=True)
    created_at             = Column(DateTime, default=_ahora_naive)