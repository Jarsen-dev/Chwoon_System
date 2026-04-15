from sqlalchemy import Column, Integer, String, DateTime, Text, JSON
from datetime import datetime
from app.database import Base


class Producto(Base):
    __tablename__ = "productos"

    id = Column(Integer, primary_key=True, index=True)
    sku = Column(String(50), unique=True, index=True, nullable=False)
    nombre = Column(String(200), nullable=False)
    tipo = Column(String(50), default="")
    clase_producto = Column(String(50), default="")
    unidad_de_medida = Column(String(20), default="")
    descripcion = Column(Text, default="")
    cantidad_carrito = Column(Integer, default=0)
    proveedor = Column(String(100), default="")
    cliente_id = Column(String(100), default="")
    cliente_asociado = Column(String(100), default="")
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

    # Controles de calidad como JSON array: ["IQC"], ["LQC","OQC"], etc.
    controles_calidad = Column(JSON, default=list)

    # Puntos de inspección como JSON arrays
    puntos_inspeccion_iqc = Column(JSON, default=list)
    puntos_inspeccion_lqc = Column(JSON, default=list)
    puntos_inspeccion_oqc = Column(JSON, default=list)

    # BOM como JSON array de objetos: [{"sku_componente":"X","cantidad":5}, ...]
    bom = Column(JSON, default=list)

    # Características de inyección como JSON object
    caracteristicas_inyeccion = Column(JSON, default=dict)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)