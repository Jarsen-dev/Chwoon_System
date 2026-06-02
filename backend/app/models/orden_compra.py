from sqlalchemy import Column, Integer, String, DateTime, Float, Text, ForeignKey, Numeric, JSON
from sqlalchemy.orm import relationship
from app.database import Base
from datetime import datetime, timezone, timedelta
from uuid import uuid4

TZ_LOCAL = timezone(timedelta(hours=-6))


class Proveedor(Base):
    __tablename__ = "proveedores"

    id = Column(Integer, primary_key=True, index=True)
    uuid = Column(String(50), unique=True, nullable=False, default=lambda: f"PROV-{uuid4().hex[:6].upper()}")
    razon_social = Column(String(200), nullable=False)
    rfc = Column(String(13), unique=True, nullable=False, index=True)
    lead_time_dias = Column(Integer, default=7)
    condiciones_pago = Column(String(100), default="30 días")
    estatus_calidad = Column(String(50), default="Aprobado")  # Aprobado | Condicional | Suspendido
    direccion = Column(String(300), nullable=True)
    nombre_ventas = Column(String(100), nullable=True)
    numero_contacto = Column(String(20), nullable=True)
    correo_contacto = Column(String(100), nullable=True)
    notas = Column(Text, nullable=True)
    score_calidad = Column(Float, default=100.0)
    score_detalle = Column(JSON, default=dict)
    dias_credito = Column(Integer, default=30)
    score_updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(TZ_LOCAL))
    fecha_creacion = Column(DateTime(timezone=True), default=lambda: datetime.now(TZ_LOCAL))

    materiales = relationship("ProveedorMaterial", back_populates="proveedor", cascade="all, delete-orphan")
    ordenes_compra = relationship("OrdenCompra", back_populates="rel_proveedor")
    eventos = relationship("ProveedorEvento", back_populates="proveedor", cascade="all, delete-orphan")


class ProveedorEvento(Base):
    __tablename__ = "proveedor_eventos"

    id = Column(Integer, primary_key=True)
    proveedor_id = Column(Integer, ForeignKey("proveedores.id", ondelete="CASCADE"), nullable=False)
    tipo_evento = Column(String(50), nullable=False)
    impacto = Column(Float, nullable=False)
    referencia_id = Column(String(100), nullable=True)
    descripcion = Column(String(500), nullable=True)
    fecha = Column(DateTime(timezone=True), default=lambda: datetime.now(TZ_LOCAL))
    registrado_por = Column(String(100), nullable=True)

    proveedor = relationship("Proveedor", back_populates="eventos")


class ProveedorMaterial(Base):
    __tablename__ = "proveedor_materiales"

    id = Column(Integer, primary_key=True, index=True)
    proveedor_id = Column(Integer, ForeignKey("proveedores.id", ondelete="CASCADE"), nullable=False)
    sku_material = Column(String(100), nullable=False, index=True)  # Mapea con partes o productos
    codigo_proveedor = Column(String(100), nullable=True)  # SKU interno del proveedor
    costo_unitario = Column(Float, default=0.0)
    moneda = Column(String(10), default="MXN")

    proveedor = relationship("Proveedor", back_populates="materiales")


class OrdenCompra(Base):
    __tablename__ = "ordenes_compra"

    id = Column(Integer, primary_key=True, index=True)
    oc_id = Column(String(50), unique=True, nullable=False, index=True)
    
    # Llave foránea opcional para el flujo dinámico de Proveedores
    proveedor_id = Column(Integer, ForeignKey("proveedores.id", ondelete="SET NULL"), nullable=True)
    
    id_proveedor = Column(String(100), nullable=False)  # Mantiene compatibilidad ("POR-ASIGNAR")
    nombre_proveedor = Column(String(200), nullable=False)
    status = Column(String(50), default="Creada")
    origen = Column(String(50), default="FINANZAS")  # FINANZAS | PRODUCCION
    fecha_creacion = Column(DateTime(timezone=True), default=lambda: datetime.now(TZ_LOCAL))
    fecha_actualizacion = Column(DateTime(timezone=True), onupdate=lambda: datetime.now(TZ_LOCAL))
    notas = Column(Text, nullable=True)
    creado_por = Column(String(100), nullable=True)
    aprobado_por = Column(String(100), nullable=True)
    iva = Column(Float, default=0.0)

    rel_proveedor = relationship("Proveedor", back_populates="ordenes_compra")
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