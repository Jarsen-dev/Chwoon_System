from sqlalchemy import Column, Integer, String, DateTime, JSON, Float
from datetime import datetime
from app.database import Base


class ConteoFisico(Base):
    __tablename__ = "conteos_fisicos"

    id               = Column(Integer, primary_key=True, index=True)
    conteo_id        = Column(String(100), unique=True, nullable=False)
    fecha_inicio     = Column(DateTime, default=datetime.utcnow)
    fecha_cierre     = Column(DateTime, nullable=True)
    zona             = Column(String(200), nullable=False)
    status           = Column(String(30), default="En Proceso", nullable=False)
    items            = Column(JSON, default=list)
    total_diferencia = Column(Float, default=0)
    aprobado_por     = Column(String(100), nullable=True)
    creado_por       = Column(String(100), nullable=False)
