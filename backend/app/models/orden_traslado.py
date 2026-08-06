from sqlalchemy import Column, Integer, String, Float, DateTime, JSON
from datetime import datetime
from app.database import Base


class OrdenTraslado(Base):
    """Traslados de IQC a ubicaciones físicas."""
    __tablename__ = "ordenes_traslado"

    id          = Column(Integer, primary_key=True, index=True)
    traslado_id = Column(String(100), unique=True, nullable=False, index=True)
    fecha       = Column(DateTime, default=datetime.utcnow)
    items       = Column(JSON, default=list)
    creado_por  = Column(String(50), nullable=True)


class RegistroSalidaProduccion(Base):
    """Registro de una salida de material de almacén hacia una ubicación de producción,
    generado por el flujo de escaneo FIFO en la sub-tab Traslados."""
    __tablename__ = "registros_salida_produccion"

    id                          = Column(Integer, primary_key=True, index=True)
    fecha                       = Column(DateTime, nullable=False, index=True)
    lote_id                     = Column(String(150), nullable=False, index=True)
    sku_producto                = Column(String(100), nullable=False, index=True)
    cantidad                    = Column(Float, nullable=False)
    ubicacion_almacen_nombre    = Column(String(200), nullable=False)
    ubicacion_produccion_nombre = Column(String(200), nullable=False)
    creado_por                  = Column(String(50), nullable=True)