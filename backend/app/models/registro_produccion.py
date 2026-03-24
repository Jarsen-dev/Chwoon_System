from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from app.database import Base

class RegistroProduccion(Base):
    __tablename__ = "registros_produccion"
    
    id = Column(Integer, primary_key=True)
    fecha = Column(String(20))
    hora = Column(String(20))
    turno = Column(String(10))  # DIA o NOCHE
    maquina = Column(String(50))
    numero_parte = Column(String(50))
    descripcion = Column(String(200))
    carrito_numero = Column(Integer)
    qty_bolsa = Column(Integer)
    total_acumulado = Column(Integer)
    created_at = Column(DateTime, default=datetime.utcnow)