from datetime import datetime, timezone, timedelta

from sqlalchemy import Column, Integer, String, Date, DateTime, Numeric, ForeignKey, JSON
from sqlalchemy.orm import relationship

from app.database import Base

TZ_LOCAL = timezone(timedelta(hours=-6))


class RemisionRecepcion(Base):
    """Recepción capturada desde foto de remisión física (flujo OCR de Almacén).

    Independiente del flujo de Compras/OC (`recepciones_compra`): aquí el origen
    es la hoja física del proveedor, no una orden de compra del sistema.
    """
    __tablename__ = "remisiones_recepcion"

    id = Column(Integer, primary_key=True, index=True)
    # Texto libre tal como aparece en la hoja — NO es FK a proveedores
    proveedor = Column(String(200), nullable=False)
    numero_remision = Column(String(100), nullable=False, index=True)
    po = Column(String(100), nullable=True)
    fecha = Column(Date, nullable=False)
    tipo_documento = Column(String(80), nullable=False)
    # Ruta relativa a static/ (ej. "remisiones/<uuid>.jpg") — evidencia de auditoría
    foto_path = Column(String(255), nullable=False)
    # Extracción original del OCR (sin correcciones del usuario) — auditoría
    ocr_raw = Column(JSON, nullable=True)
    # Rutas de campos que el OCR devolvió en null al momento de extraer
    advertencias = Column(JSON, nullable=True)
    creado_por = Column(String(100), nullable=False)
    fecha_captura = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(TZ_LOCAL),
        nullable=False,
        index=True,
    )

    items = relationship(
        "RemisionRecepcionItem",
        back_populates="remision",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    # selectin: el listado necesita saber si ya se imprimieron etiquetas para
    # ocultar el botón, sin una segunda llamada por renglón
    etiquetas = relationship(
        "RemisionEtiqueta",
        back_populates="remision",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="RemisionEtiqueta.id",
    )


class RemisionRecepcionItem(Base):
    __tablename__ = "remisiones_recepcion_items"

    id = Column(Integer, primary_key=True, index=True)
    remision_id = Column(
        Integer,
        ForeignKey("remisiones_recepcion.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Validado contra productos.sku al guardar
    numero_parte = Column(String(50), nullable=False, index=True)
    cantidad = Column(Numeric(12, 2), nullable=False)
    # Snapshot del catálogo de productos al momento de guardar (no editable en UI)
    descripcion = Column(String(255), nullable=True)
    unidad_de_medida = Column(String(50), nullable=True)

    remision = relationship("RemisionRecepcion", back_populates="items")
