from sqlalchemy import Column, Integer, String, Float, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Ubicacion(Base):
    __tablename__ = "ubicaciones"

    id        = Column(Integer, primary_key=True, index=True)
    nombre    = Column(String(200), unique=True, nullable=False, index=True)
    parent_id = Column(Integer, ForeignKey("ubicaciones.id"), nullable=True)
    tipo_zona = Column(String(50), default="ALMACEN", nullable=False)
    capacidad_max  = Column(Float, nullable=True)
    permite_mixing = Column(Boolean, default=False, nullable=False)
    activa         = Column(Boolean, default=True, nullable=False)

    parent   = relationship("Ubicacion", remote_side=[id], backref="children")
