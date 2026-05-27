from sqlalchemy import Column, Integer, String, DateTime, JSON, Text
from datetime import datetime
from app.database import Base


class OrdenPicking(Base):
    __tablename__ = "ordenes_picking"

    id               = Column(Integer, primary_key=True, index=True)
    picking_id       = Column(String(100), unique=True, index=True, nullable=False)
    tipo_origen      = Column(String(20), nullable=False)  # OV | OP | TRASLADO
    origen_id        = Column(String(100), nullable=False)
    cliente_id       = Column(String(100), nullable=True)
    status           = Column(String(30), default="Pendiente", nullable=False)
    items            = Column(JSON, default=list)  # [{sku, cantidad_requerida, cantidad_picking, lotes_asignados[]}]
    zona_staging     = Column(String(200), nullable=True)
    creado_por       = Column(String(100), nullable=False)
    asignado_a       = Column(String(100), nullable=True)
    fecha_creacion   = Column(DateTime, default=datetime.utcnow)
    fecha_completado = Column(DateTime, nullable=True)
    notas            = Column(Text, nullable=True)
