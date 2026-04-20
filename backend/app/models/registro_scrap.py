from sqlalchemy import Column, Integer, String, DateTime, Float
from datetime import datetime, timezone, timedelta
from app.database import Base

TZ_LOCAL = timezone(timedelta(hours=-6))


def _ahora_naive():
    return datetime.now(TZ_LOCAL).replace(tzinfo=None)


class RegistroScrap(Base):
    __tablename__ = "registros_scrap"

    id              = Column(Integer, primary_key=True, index=True)
    scrap_id        = Column(String(60), unique=True, nullable=False, index=True)
    fecha           = Column(DateTime, default=_ahora_naive, index=True)
    sku_producto    = Column(String(100), nullable=False, index=True)
    nombre_producto = Column(String(200), nullable=True)
    lote_id         = Column(String(100), nullable=True)
    cantidad        = Column(Float, nullable=False)
    motivo          = Column(String(500), nullable=True)
    origen          = Column(String(50), nullable=False)
    referencia      = Column(String(100), nullable=True)
    registrado_por  = Column(String(100), nullable=True)
    created_at      = Column(DateTime, default=_ahora_naive)