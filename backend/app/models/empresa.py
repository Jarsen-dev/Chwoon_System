from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime
from sqlalchemy.sql import func

from app.database import Base


class ConfiguracionEmpresa(Base):
    """Registro único con los datos generales de la empresa."""
    __tablename__ = "configuracion_empresa"

    id                  = Column(Integer, primary_key=True, index=True)
    nombre              = Column(String(200), nullable=False)
    rfc                 = Column(String(20),  nullable=True)
    direccion           = Column(Text,         nullable=True)
    telefono            = Column(String(20),   nullable=True)
    email               = Column(String(100),  nullable=True)
    logo_url            = Column(String(500),  nullable=True)
    representante_legal = Column(String(200),  nullable=True)
    regimen_fiscal      = Column(String(200),  nullable=True)
    cp                  = Column(String(10),   nullable=True)
    ciudad              = Column(String(100),  nullable=True)
    estado              = Column(String(100),  nullable=True)
    pais                = Column(String(100),  nullable=True, default="México")
    banco               = Column(String(200),  nullable=True)
    cuenta              = Column(String(50),   nullable=True)
    clabe               = Column(String(18),   nullable=True)
    created_at          = Column(DateTime(timezone=True), server_default=func.now())
    updated_at          = Column(DateTime(timezone=True), onupdate=func.now())


class ContactoEmpresa(Base):
    """Directorio de contactos por área. Varios por área, uno marcable como principal."""
    __tablename__ = "contactos_empresa"

    id           = Column(Integer, primary_key=True, index=True)
    area         = Column(String(100), nullable=False, index=True)
    nombre       = Column(String(200), nullable=False)
    puesto       = Column(String(200), nullable=True)
    telefono     = Column(String(20),  nullable=True)
    ext          = Column(String(10),  nullable=True)
    celular      = Column(String(20),  nullable=True)
    email        = Column(String(100), nullable=True)
    es_principal = Column(Boolean, default=False, nullable=False)
    horario      = Column(String(200), nullable=True)
    notas        = Column(Text,        nullable=True)
    activo       = Column(Boolean, default=True, nullable=False)
    created_at   = Column(DateTime(timezone=True), server_default=func.now())
    updated_at   = Column(DateTime(timezone=True), onupdate=func.now())