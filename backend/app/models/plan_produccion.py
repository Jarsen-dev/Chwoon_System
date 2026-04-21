from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from datetime import datetime
from app.database import Base

class PlanProduccion(Base):
    __tablename__ = "planes_produccion"
    
    id = Column(Integer, primary_key=True)
    numero_parte = Column(String, ForeignKey('inventario_planta.codigo'))
    meta_piezas = Column(Integer)
    turno_objetivo = Column(String(10))
    estado = Column(String(20), default="pendiente")
    created_at = Column(DateTime, default=datetime.utcnow)