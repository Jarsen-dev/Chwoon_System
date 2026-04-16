from sqlalchemy import Column, Integer, String, DateTime, Float, Text, JSON, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base
from datetime import datetime, timezone, timedelta

TZ_LOCAL = timezone(timedelta(hours=-6))


class OrdenVenta(Base):
    __tablename__ = "ordenes_venta"

    id = Column(Integer, primary_key=True, index=True)
    ov_id = Column(String(50), unique=True, nullable=False, index=True)
    cliente_id = Column(String(100), nullable=False)
    nombre_cliente = Column(String(200), nullable=True)
    estado = Column(String(50), default="Pendiente de Envío")
    # Estados: Pendiente de Envío, Stock Insuficiente, Enviado, Embarque Parcial,
    #          Devolución Parcial, Cancelada
    fecha_creacion = Column(DateTime(timezone=True), default=lambda: datetime.now(TZ_LOCAL))
    fecha_actualizacion = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(TZ_LOCAL))
    notas = Column(Text, nullable=True)
    creado_por = Column(String(100), nullable=True)

    items = relationship("OrdenVentaItem", back_populates="orden_venta", cascade="all, delete-orphan")
    envios = relationship("EnvioVenta", back_populates="orden_venta", cascade="all, delete-orphan")


class OrdenVentaItem(Base):
    __tablename__ = "ordenes_venta_items"

    id = Column(Integer, primary_key=True, index=True)
    orden_venta_id = Column(Integer, ForeignKey("ordenes_venta.id", ondelete="CASCADE"), nullable=False)
    sku_producto = Column(String(100), nullable=False)
    nombre_producto = Column(String(200), nullable=True)
    cantidad = Column(Float, nullable=False)
    cantidad_enviada = Column(Float, default=0)
    precio_unitario = Column(Float, default=0)
    moneda = Column(String(10), default="MXN")

    orden_venta = relationship("OrdenVenta", back_populates="items")


class EnvioVenta(Base):
    __tablename__ = "envios_venta"

    id = Column(Integer, primary_key=True, index=True)
    envio_id = Column(String(50), unique=True, nullable=False, index=True)
    orden_venta_id = Column(Integer, ForeignKey("ordenes_venta.id", ondelete="CASCADE"), nullable=False)
    ov_id = Column(String(50), nullable=False)
    fecha_envio = Column(DateTime(timezone=True), default=lambda: datetime.now(TZ_LOCAL))
    autorizado_por = Column(String(100), nullable=True)
    items_enviados = Column(JSON, default=list)  # [{sku, cantidad}]
    notas = Column(Text, nullable=True)

    orden_venta = relationship("OrdenVenta", back_populates="envios")