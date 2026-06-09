from sqlalchemy import Column, Integer, String, DateTime, Float, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base
from datetime import datetime, timezone, timedelta
from uuid import uuid4

TZ_LOCAL = timezone(timedelta(hours=-6))


class Cliente(Base):
    __tablename__ = "clientes"

    id = Column(Integer, primary_key=True, index=True)
    cliente_id = Column(String(50), unique=True, nullable=False, index=True,
                        default=lambda: f"CLI-{uuid4().hex[:6].upper()}")
    razon_social = Column(String(200), nullable=False)
    rfc = Column(String(13), nullable=True)
    contacto_nombre = Column(String(100), nullable=True)
    contacto_email = Column(String(100), nullable=True)
    contacto_telefono = Column(String(20), nullable=True)
    direccion = Column(String(300), nullable=True)
    condiciones_pago = Column(String(100), default="30 días")
    dias_credito = Column(Integer, default=30)
    estatus = Column(String(50), default="Activo")  # Activo | Inactivo | VIP
    notas = Column(Text, nullable=True)
    score_cliente = Column(Float, default=100.0)
    fecha_creacion = Column(DateTime(timezone=True), default=lambda: datetime.now(TZ_LOCAL))

    eventos = relationship("ClienteEvento", back_populates="cliente", cascade="all, delete-orphan")


class ClienteEvento(Base):
    __tablename__ = "cliente_eventos"

    id = Column(Integer, primary_key=True)
    cliente_id_fk = Column(Integer, ForeignKey("clientes.id", ondelete="CASCADE"), nullable=False)
    tipo_evento = Column(String(50), nullable=False)
    impacto = Column(Float, nullable=False)
    referencia_id = Column(String(100), nullable=True)
    descripcion = Column(String(500), nullable=True)
    fecha = Column(DateTime(timezone=True), default=lambda: datetime.now(TZ_LOCAL))
    registrado_por = Column(String(100), nullable=True)

    cliente = relationship("Cliente", back_populates="eventos")
