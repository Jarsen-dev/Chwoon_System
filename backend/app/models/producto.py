from sqlalchemy import Column, Integer, String, DateTime, Text, JSON
from datetime import datetime
from app.database import Base


class Producto(Base):
    __tablename__ = "productos"

    id = Column(Integer, primary_key=True, index=True)
    sku = Column(String(50), unique=True, index=True, nullable=False)
    nombre = Column(String(300), default="")
    tipo = Column(String(50), default="")
    clase_producto = Column(String(50), default="")
    unidad_de_medida = Column(String(20), default="")
    descripcion = Column(Text, default="")
    cantidad_carrito = Column(Integer, default=0)
    proveedor = Column(String(100), default="")
    cliente_id = Column(String(100), default="")
    modelo = Column(String(100), default="")
    linea_produccion = Column(String(100), default="")
    ubicacion = Column(String(100), default="")
    status = Column(String(20), default="Activo")

    controles_calidad = Column(JSON, default=list)
    puntos_inspeccion_iqc = Column(JSON, default=list)
    puntos_inspeccion_lqc = Column(JSON, default=list)
    puntos_inspeccion_oqc = Column(JSON, default=list)
    bom = Column(JSON, default=list)
    caracteristicas_inyeccion = Column(JSON, default=dict)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)