from sqlalchemy import Column, Integer, String, DateTime, Float
from datetime import datetime
from app.database import Base

class RegistroParo(Base):
    __tablename__ = "registros_paros"
    
    id = Column(Integer, primary_key=True)
    fecha = Column(String(20))
    hora_inicio = Column(String(10))
    hora_fin = Column(String(10))
    duracion_minutos = Column(Float)
    maquina = Column(String(50))
    motivo = Column(String(100))
    comentario = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)