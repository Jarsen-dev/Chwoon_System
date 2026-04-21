from sqlalchemy import Column, Integer, String, DateTime, JSON
from datetime import datetime
from app.database import Base


class Embarque(Base):
    __tablename__ = "embarques"

    id               = Column(Integer, primary_key=True, index=True)
    numero_embarque  = Column(String(100), unique=True, nullable=False, index=True)
    ov_id            = Column(String(100), nullable=False, index=True)
    cliente_id       = Column(String(100), nullable=True)
    fecha_creacion   = Column(DateTime, default=datetime.utcnow)
    status           = Column(String(50), default="Surtido", index=True)
    items            = Column(JSON, default=list)
    camion           = Column(String(200), nullable=True)
    chofer           = Column(String(200), nullable=True)
    departure        = Column(String(100), nullable=True)
    creado_por       = Column(String(50), nullable=True)