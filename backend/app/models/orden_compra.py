from sqlalchemy import Column, Integer, String, DateTime, Float, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base
from datetime import datetime, timezone, timedelta

TZ_LOCAL = timezone(timedelta(hours=-6))


class OrdenCompra(Base):
    __tablename__ = "ordenes_compra"

    id = Column(Integer, primary_key=True, index=True)
    oc_id = Column(String(50), unique=True, nullable=False, index=True)
    id_proveedor = Column(String(100), nullable=False)
    nombre_proveedor = Column(String(200), nullable=False)
    status = Column(String(50), default="Creada")
    origen = Column(String(50), default="FINANZAS")  # FINANZAS | PRODUCCION
    fecha_creacion = Column(DateTime(timezone=True), default=lambda: datetime.now(TZ_LOCAL))
    fecha_actualizacion = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(TZ_LOCAL))
    notas = Column(Text, nullable=True)
    creado_por = Column(String(100), nullable=True)
    aprobado_por = Column(String(100), nullable=True)

    items = relationship("OrdenCompraItem", back_populates="orden_compra", cascade="all, delete-orphan")
    recepciones = relationship("RecepcionCompra", back_populates="orden_compra", cascade="all, delete-orphan")


class OrdenCompraItem(Base):
    __tablename__ = "ordenes_compra_items"

    id = Column(Integer, primary_key=True, index=True)
    orden_compra_id = Column(Integer, ForeignKey("ordenes_compra.id", ondelete="CASCADE"), nullable=False)
    sku_producto = Column(String(100), nullable=False)
    nombre_producto = Column(String(200), nullable=False)
    cantidad_requerida = Column(Float, nullable=False)
    cantidad_recibida = Column(Float, default=0)
    precio_unitario = Column(Float, default=0)
    moneda = Column(String(10), default="MXN")

    orden_compra = relationship("OrdenCompra", back_populates="items")


class RecepcionCompra(Base):
    __tablename__ = "recepciones_compra"

    id = Column(Integer, primary_key=True, index=True)
    recepcion_id = Column(String(50), unique=True, nullable=False, index=True)
    orden_compra_id = Column(Integer, ForeignKey("ordenes_compra.id", ondelete="CASCADE"), nullable=False)
    oc_id = Column(String(50), nullable=False)
    sku_producto = Column(String(100), nullable=False)
    cantidad_recibida = Column(Float, nullable=False)
    fecha_recepcion = Column(DateTime(timezone=True), default=lambda: datetime.now(TZ_LOCAL))
    recibido_por = Column(String(100), nullable=True)
    notas = Column(Text, nullable=True)

    orden_compra = relationship("OrdenCompra", back_populates="recepciones")