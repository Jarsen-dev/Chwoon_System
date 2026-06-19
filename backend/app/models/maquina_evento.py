from sqlalchemy import Column, Integer, String, DateTime, JSON, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base
from app.core.turnos import ahora_local


class MaquinaEvento(Base):
    """Evento significativo proveniente del PLC/HMI vía el gateway.

    Solo se persisten cambios significativos (no cada lectura cruda):
      - PIEZA              → flanco de COUNTER (nueva pieza producida)
      - INCIDENCIA_INICIO  → alarma sostenida ≥ umbral (filtra falsos positivos cíclicos)
      - INCIDENCIA_FIN     → la alarma sostenida se liberó
      - CAMBIO_ESTADO      → transición AUTO ↔ MANUAL
    """
    __tablename__ = "eventos"

    id          = Column(Integer, primary_key=True, index=True)
    maquina_id  = Column(Integer, ForeignKey("maquinas.id", ondelete="CASCADE"),
                         nullable=False, index=True)
    tipo_evento = Column(String(40), nullable=False, index=True)
    valor       = Column(Integer, nullable=True)    # counter al momento (PIEZA) o nulo
    estado      = Column(String(20), nullable=True)  # AUTO | MANUAL | DESCONOCIDO
    operador    = Column(String(100), nullable=True)
    turno       = Column(String(10), nullable=True, index=True)   # get_turno_actual()
    fecha_turno = Column(String(20), nullable=True, index=True)   # get_fecha_turno()
    # `metadata` es atributo reservado en SQLAlchemy → se mapea a la columna pero
    # el atributo Python se llama `meta`.
    meta        = Column("metadata", JSON, default=dict)
    created_at  = Column(DateTime(timezone=True), default=ahora_local, index=True)

    maquina = relationship("Maquina", back_populates="eventos")
