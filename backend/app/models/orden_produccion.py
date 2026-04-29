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
    clase_produccion        = Column(String(50), nullable=False, index=True)
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
    
    # ── NUEVOS campos Pre-Expansión ──
    grado                   = Column(String(100), nullable=True)        # Grado de resina (reemplaza BOM)
    numero_costal           = Column(String(100), nullable=True)        # Número de costal
    hora_inicio_real        = Column(DateTime, nullable=True)           # Hora real de inicio del proceso
    densidad                = Column(Float, nullable=True)              # g/cm³
    pantalla_peso           = Column(Float, nullable=True)              # Peso pantalla kg
    ciclo_seg               = Column(Float, nullable=True)              # Ciclo en segundos
    counter_tiro            = Column(Float, nullable=True)              # Counter tiro al finalizar
    hora_finalizacion       = Column(DateTime, nullable=True)           # Hora exacta de finalización (para reposo)
    silo_destino            = Column(String(200), nullable=True)        # Silo específico donde se almacena

    # Inyección específicos
    uph_esperado            = Column(Float, default=0)
    metodo_conteo           = Column(String(50), nullable=True)

    # JSON fields para datos complejos
    registros_parciales     = Column(JSON, default=list)
    material_consumido      = Column(JSON, default=list)
    paros                   = Column(JSON, default=list)
    etiquetas_generadas     = Column(JSON, default=list)
    scrap_reportado         = Column(JSON, default=list)
    componentes_consumidos  = Column(JSON, default=dict)

    creado_por              = Column(String(100), nullable=True)