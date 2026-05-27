from sqlalchemy import Column, Integer, String, Float, Boolean, JSON
from app.database import Base


class ConfigAlertaStock(Base):
    __tablename__ = "config_alertas_stock"

    id            = Column(Integer, primary_key=True, index=True)
    sku           = Column(String(100), nullable=False, index=True)
    stock_minimo  = Column(Float, default=0)
    stock_maximo  = Column(Float, nullable=True)
    dias_rotacion = Column(Integer, nullable=True)
    activa        = Column(Boolean, default=True)
    notificar_a   = Column(JSON, default=list)
