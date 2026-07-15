from sqlalchemy import Column, Integer, String, Boolean, DateTime
from datetime import datetime
from app.database import Base


class AyudaVisual(Base):
    __tablename__ = "ayudas_visuales"

    id = Column(Integer, primary_key=True, index=True)
    sku = Column(String(50), index=True, nullable=False)
    nombre_archivo = Column(String(300), nullable=False)
    # Ruta del PDF relativa a static/ayudas_visuales/ — clave de upsert del reindexado
    ruta = Column(String(600), unique=True, nullable=False)
    codigo_av = Column(String(120), default="")
    tiene_thumbnail = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
