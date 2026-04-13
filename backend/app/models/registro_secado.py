from sqlalchemy import Column, Integer, String, DateTime
from datetime import datetime
from app.database import Base

class RegistroSecado(Base):
    __tablename__ = "registros_secado"

    id               = Column(Integer,     primary_key=True)
    fecha            = Column(String(20),  nullable=False)
    turno            = Column(String(5),   nullable=False)
    numero_parte     = Column(String(50),  nullable=False)
    descripcion      = Column(String(200), nullable=True)
    maquina          = Column(String(100), nullable=True)   # ← NUEVO
    carrito          = Column(String(50),  nullable=False)
    hora_entrada     = Column(String(10),  nullable=False)
    hora_salida      = Column(String(10),  nullable=True)
    tiempo_en_camara = Column(String(30),  nullable=True)
    qty_total        = Column(Integer,     nullable=True)   # ← NUEVO (inventario.qtu)
    estado           = Column(String(10),  default="dentro")
    usuario          = Column(String(100), nullable=True)
    created_at       = Column(DateTime,    default=datetime.utcnow)