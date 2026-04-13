from sqlalchemy import Column, Integer, String, DateTime, JSON
from datetime import datetime
from app.database import Base


class HistorialTurno(Base):
    __tablename__ = "historial_turnos"

    id             = Column(Integer,     primary_key=True)
    fecha          = Column(String(20),  nullable=False)
    turno          = Column(String(10),  nullable=False)
    resumen        = Column(JSON,        nullable=False, default=list)
    total_piezas   = Column(Integer,     default=0)
    total_escaneos = Column(Integer,     default=0)
    cerrado_por    = Column(String(100), default="scheduler")
    cerrado_en     = Column(String(30),  nullable=True)
    created_at     = Column(DateTime,    default=datetime.utcnow)