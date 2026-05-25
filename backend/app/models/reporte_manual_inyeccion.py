from sqlalchemy import Column, Integer, String, DateTime, Float
from datetime import datetime
from app.database import Base


class ReporteManualInyeccion(Base):
    """
    Reporte manual de inyeccion con datos ingresados manualmente
    y campos calculados automaticamente.
    """
    __tablename__ = "reportes_manuales_inyeccion"

    id = Column(Integer, primary_key=True, index=True)
    fecha = Column(DateTime, default=datetime.utcnow)
    turno = Column(String(10), nullable=False)
    numero_parte = Column(String(100), nullable=False, index=True)
    descripcion = Column(String(300), default="")
    cliente = Column(String(200), default="")
    resina = Column(String(10), nullable=False)
    proceso = Column(String(20), nullable=False)
    peso = Column(Float, nullable=False, default=0)
    cav_bom = Column(Integer, nullable=False, default=0)
    ciclo = Column(Float, nullable=False, default=0)
    type = Column(String(50), default="")
    maquina = Column(String(50), nullable=False, default="")
    cav_real = Column(Integer, nullable=False, default=0)
    ciclo_real = Column(Float, nullable=False, default=0)
    tiempo_trabajo = Column(Float, nullable=False, default=0)
    produccion_total = Column(Integer, nullable=False, default=0)

    # Paros (tiempo en horas)
    cambio_molde = Column(Float, default=0)
    ajustes = Column(Float, default=0)
    arranque_paro = Column(Float, default=0)
    mantenimiento = Column(Float, default=0)
    molde_danado = Column(Float, default=0)
    falta_personal = Column(Float, default=0)
    falta_material = Column(Float, default=0)
    otro_paro = Column(Float, default=0)

    # Sub-motivos de mantenimiento (tiempo en horas)
    soldar_puerta_ejector = Column(Float, default=0)
    estopero = Column(Float, default=0)
    bomba_hidraulica = Column(Float, default=0)
    motor_hidraulico = Column(Float, default=0)
    manguera_hidraulica = Column(Float, default=0)
    valvula_hidraulica = Column(Float, default=0)
    reloj = Column(Float, default=0)
    caldera = Column(Float, default=0)
    sensor_seguridad = Column(Float, default=0)
    falta_aire = Column(Float, default=0)
    fuga_aceite = Column(Float, default=0)
    electrico = Column(Float, default=0)
    tolva_tapada = Column(Float, default=0)
    extra = Column(Float, default=0)

    # Scrap (cantidad en piezas)
    scrap_falta_llenado = Column(Integer, default=0)
    scrap_cruda = Column(Integer, default=0)
    scrap_quebrada = Column(Integer, default=0)
    scrap_hinchada = Column(Integer, default=0)
    scrap_arranque = Column(Integer, default=0)
    scrap_fuera_dimension = Column(Integer, default=0)
    scrap_pandeada = Column(Integer, default=0)
    scrap_aplastada_molde = Column(Integer, default=0)

    # Campos calculados
    scrap_total = Column(Integer, default=0)
    scrap_kg = Column(Float, default=0)
    tiempo_paro_total = Column(Float, default=0)
    cm = Column(Float, default=0)
    produccion_buena = Column(Integer, default=0)
    produccion_kg = Column(Float, default=0)
    produccion_meta_total = Column(Float, default=0)
    produccion_meta_kg = Column(Float, default=0)
    produccion_porcentaje = Column(Float, default=0)
    scrap_porcentaje = Column(Float, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
