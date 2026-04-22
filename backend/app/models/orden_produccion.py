from sqlalchemy import Column, Integer, String, Float, DateTime, JSON
from datetime import datetime
from app.database import Base


class OrdenProduccion(Base):
    """
    Tabla unificada para órdenes de producción de todos los tipos:
    PRE-EXPANSION, INYECCION, ASSY
    """
    __tablename__ = "ordenes_produccion"

    id                      = Column(Integer, primary_key=True, index=True)
    op_id                   = Column(String(150), unique=True, nullable=False, index=True)
    clase_produccion        = Column(String(50), nullable=False, index=True)  # PRE-EXPANSION, INYECCION, ASSY
    sku_producto            = Column(String(100), nullable=False, index=True)
    nombre_producto         = Column(String(300), default="")
    linea_produccion        = Column(String(100), nullable=True)
    cantidad_a_producir     = Column(Float, default=0)
    cantidad_producida      = Column(Float, default=0)
    cantidad_carrito        = Column(Float, default=0)
    operador                = Column(String(100), nullable=True)
    status                  = Column(String(50), default="En Proceso", index=True)
    fecha_inicio            = Column(DateTime, default=datetime.utcnow)
    fecha_fin               = Column(DateTime, nullable=True)

    # Pre-Expansión específicos
    sku_materia_prima       = Column(String(100), nullable=True)
    cantidad_usada_requerida = Column(Float, default=0)
    cantidad_total_consumida = Column(Float, default=0)
    ubicacion_destino       = Column(String(200), nullable=True)
    lote_inventario_generado = Column(String(150), nullable=True)

    # Inyección específicos
    uph_esperado            = Column(Float, default=0)
    metodo_conteo           = Column(String(50), nullable=True)

    # JSON fields para datos complejos
    registros_parciales     = Column(JSON, default=list)    # Pre-exp: registros parciales
    material_consumido      = Column(JSON, default=list)    # ASSY/INY: lotes consumidos
    paros                   = Column(JSON, default=list)    # Paros registrados
    etiquetas_generadas     = Column(JSON, default=list)    # Etiquetas de carrito
    scrap_reportado         = Column(JSON, default=list)    # Scrap al finalizar
    componentes_consumidos  = Column(JSON, default=dict)    # ASSY: consumo por componente

    creado_por              = Column(String(100), nullable=True)