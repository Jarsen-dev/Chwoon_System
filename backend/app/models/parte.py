from sqlalchemy import Column, Integer, String, DateTime, Float
from datetime import datetime
from app.database import Base

class Parte(Base):
    __tablename__ = "partes"
    
    id = Column(Integer, primary_key=True, index=True)
    numero_parte = Column(String(50), unique=True, index=True)
    descripcion = Column(String(200))
    linea = Column(String(50))
    id_interno = Column(String(50))
    cantidad_por_etiqueta = Column(String(10))
    cliente_lg = Column(String(50))
    ayuda_visual = Column(String(500))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)