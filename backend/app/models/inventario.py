from sqlalchemy import Column, String, Integer
from app.database import Base

class InventarioPlanta(Base):
    __tablename__ = "inventario_planta"

    codigo              = Column(String(50), primary_key=True)
    descripcion         = Column(String(100), nullable=False)
    linea               = Column(String(50), nullable=False)
    tipo                = Column(String(20), nullable=False)
    qtu                 = Column(Integer, nullable=False, default=1)
    linea_lg            = Column(String(20), nullable=False)
    ayuda_visual        = Column(String(255), default='')