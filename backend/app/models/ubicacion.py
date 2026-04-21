from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base


class Ubicacion(Base):
    __tablename__ = "ubicaciones"

    id        = Column(Integer, primary_key=True, index=True)
    nombre    = Column(String(200), unique=True, nullable=False, index=True)
    parent_id = Column(Integer, ForeignKey("ubicaciones.id"), nullable=True)

    parent   = relationship("Ubicacion", remote_side=[id], backref="children")