from sqlalchemy import Column, Integer, String, DateTime, Float, Text
from app.database import Base
from datetime import datetime, timezone, timedelta

TZ_LOCAL = timezone(timedelta(hours=-6))


class Devolucion(Base):
    __tablename__ = "devoluciones"

    id = Column(Integer, primary_key=True, index=True)
    devolucion_id = Column(String(50), unique=True, nullable=False, index=True)
    ov_id = Column(String(50), nullable=False, index=True)
    sku_producto = Column(String(100), nullable=False)
    nombre_producto = Column(String(200), nullable=True)
    cantidad_devuelta = Column(Float, nullable=False)
    motivo = Column(Text, nullable=False)
    lote_produccion_origen = Column(String(100), nullable=True)
    fecha_devolucion = Column(DateTime(timezone=True), default=lambda: datetime.now(TZ_LOCAL))
    estado_inspeccion = Column(String(50), default="Pendiente")
    # Estados: Pendiente, En Inspección, Finalizado
    disposicion_final = Column(Text, nullable=True)
    # Ejemplo: "Scrap: 10, Retrabajo: 5"
    cantidad_scrap = Column(Float, default=0)
    cantidad_retrabajo = Column(Float, default=0)
    procesado_por = Column(String(100), nullable=True)
    creado_por = Column(String(100), nullable=True)