from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from datetime import datetime
from app.database import Base

class ColaImpresion(Base):
    __tablename__ = "cola_impresion"
    
    id = Column(Integer, primary_key=True)
    parte_id = Column(Integer, ForeignKey("partes.id"))
    cantidad_etiquetas = Column(Integer)
    turno = Column(String(10))
    estado = Column(String(20), default="pendiente")
    created_at = Column(DateTime, default=datetime.utcnow)