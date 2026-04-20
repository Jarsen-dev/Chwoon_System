from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum
from datetime import datetime
import enum
from app.database import Base


class RolUsuario(str, enum.Enum):
    admin = "admin"
    supervisor = "supervisor"
    operador = "operador"
    finanzas = "finanzas"
    calidad = "calidad"


class Usuario(Base):
    __tablename__ = "usuarios"

    id              = Column(Integer, primary_key=True, index=True)
    username        = Column(String(50), unique=True, nullable=False, index=True)
    email           = Column(String(100), unique=True, nullable=False)
    hashed_password = Column(String(200), nullable=False)
    rol             = Column(Enum(RolUsuario), default=RolUsuario.operador)
    activo          = Column(Boolean, default=True)
    created_at      = Column(DateTime, default=datetime.utcnow)