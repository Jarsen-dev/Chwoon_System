from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from datetime import datetime
from app.database import Base

class PlanProduccion(Base):
    __tablename__ = "planes_produccion"
    
    id = Column(Integer, primary_key=True)
    numero_parte = Column(String(50), ForeignKey("partes.numero_parte"), unique=True)
    meta_piezas = Column(Integer)
    turno_objetivo = Column(String(10))
    created_at = Column(DateTime, default=datetime.utcnow)