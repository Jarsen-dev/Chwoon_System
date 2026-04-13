from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from app.database import Base

class ColaImpresion(Base):
    __tablename__ = "cola_impresion"

    id                  = Column(Integer, primary_key=True, index=True)
    codigo_inventario   = Column(String(50), ForeignKey("inventario_planta.codigo"), nullable=False)  # ← CAMBIO
    cantidad_etiquetas  = Column(Integer, nullable=False)
    turno               = Column(String(20), nullable=False)
    estado              = Column(String(20), default="pendiente")
    created_at          = Column(DateTime, nullable=True)
    usuario             = Column(String(100), nullable=True)