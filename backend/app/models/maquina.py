from sqlalchemy import Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import relationship

from app.database import Base
from app.core.turnos import ahora_local


class Maquina(Base):
    """Registro maestro de máquinas de planta (moldeadoras EPS/EPP, inyección).

    Los eventos de PLC/HMI referencian una máquina por su FK. Pensado para
    escalar a las ~10 máquinas de la planta sin migración adicional.
    """
    __tablename__ = "maquinas"

    id                    = Column(Integer, primary_key=True, index=True)
    codigo                = Column(String(50), unique=True, nullable=False, index=True)  # ej. "SHM-1234VS"
    nombre                = Column(String(120), nullable=False)
    linea                 = Column(String(50), nullable=True)
    tipo                  = Column(String(50), nullable=True)   # EPS | EPP | INYECCION
    marca_plc             = Column(String(50), nullable=True)   # ej. "LS XBM"
    ip_hmi                = Column(String(50), nullable=True)
    umbral_incidencia_seg = Column(Integer, default=8)          # debounce de referencia (segundos)
    activa                = Column(Boolean, default=True)
    created_at            = Column(DateTime(timezone=True), default=ahora_local)

    eventos = relationship(
        "MaquinaEvento",
        back_populates="maquina",
        cascade="all, delete-orphan",
    )
