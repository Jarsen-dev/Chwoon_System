from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON
from datetime import datetime
from app.database import Base


class LoteInventario(Base):
    __tablename__ = "lotes_inventario"

    id                     = Column(Integer, primary_key=True, index=True)
    lote_id                = Column(String(150), unique=True, nullable=False, index=True)
    sku_producto           = Column(String(100), nullable=False, index=True)
    cantidad_actual        = Column(Float, default=0)
    cantidad_inicial       = Column(Float, default=0)
    ubicacion_id           = Column(Integer, ForeignKey("ubicaciones.id"), nullable=True)
    fecha_recepcion        = Column(DateTime, default=datetime.utcnow)
    oc_origen              = Column(String(100), nullable=True)
    op_origen              = Column(String(100), nullable=True)
    ov_origen              = Column(String(100), nullable=True)
    estado_calidad         = Column(String(50), default="Pendiente IQC", index=True)
    carrito_id             = Column(String(100), nullable=True)
    lote_produccion_origen = Column(String(100), nullable=True)
    motivo_devolucion      = Column(String(500), nullable=True)


class MovimientoLote(Base):
    __tablename__ = "movimientos_lote"

    id       = Column(Integer, primary_key=True, index=True)
    lote_id  = Column(String(150), nullable=False, index=True)
    fecha    = Column(DateTime, default=datetime.utcnow)
    tipo     = Column(String(50), nullable=False, index=True)
    cantidad = Column(Float, default=0)
    detalles = Column(JSON, default=dict)