from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from app.database import Base

class Anomalia(Base):
    __tablename__ = "anomalias"
    
    id = Column(Integer, primary_key=True)
    fecha = Column(String(20))
    hora = Column(String(20))
    numero_parte = Column(String(50))
    motivo = Column(String(500))
    tipo = Column(String(50))  # FRAUDE, MANTENIMIENTO, LENTITUD_PLAN
    created_at = Column(DateTime, default=datetime.utcnow)