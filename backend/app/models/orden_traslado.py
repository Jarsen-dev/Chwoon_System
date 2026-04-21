from sqlalchemy import Column, Integer, String, DateTime, JSON
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


class OrdenTrasladoProduccion(Base):
    """Traslados de material hacia líneas de producción."""
    __tablename__ = "ordenes_traslado_produccion"

    id                       = Column(Integer, primary_key=True, index=True)
    id_traslado              = Column(String(100), unique=True, nullable=False, index=True)
    op_id_origen             = Column(String(100), nullable=False)
    linea_produccion_destino = Column(String(200), nullable=True)
    fecha_creacion           = Column(DateTime, default=datetime.utcnow)
    status                   = Column(String(50), default="Pendiente", index=True)
    items                    = Column(JSON, default=list)
    historial                = Column(JSON, default=list)
    creado_por               = Column(String(50), nullable=True)