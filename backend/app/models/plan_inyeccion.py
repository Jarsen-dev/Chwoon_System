from sqlalchemy import Column, Integer, String, DateTime, Boolean, JSON
from datetime import datetime
from app.database import Base


class PlanInyeccion(Base):
    """
    Plan de producción para el área de Inyección.
    """
    __tablename__ = "plan_inyeccion"

    id = Column(Integer, primary_key=True, index=True)
    maquina = Column(String(50), nullable=False, index=True)
    prioridad = Column(Integer, nullable=False, index=True)
    numero_parte = Column(String(100), nullable=False, index=True)
    plan_piezas = Column(Integer, nullable=False)
    piezas_producidas = Column(Integer, default=0)
    cav = Column(Integer, nullable=False, default=1)
    orden_secuencia = Column(Integer, default=0)
    status = Column(String(20), default="Pendiente", index=True)

    # Control de tiempo
    hora_inicio = Column(DateTime, nullable=True)
    hora_ultimo_inicio = Column(DateTime, nullable=True)
    tiempo_acumulado_seg = Column(Integer, default=0)
    en_paro = Column(Boolean, default=False)

    # Paros vinculados (lista de dicts con motivo, comentarios, etc.)
    paros = Column(JSON, default=list)

    # Silo Aux para suministro de material
    aux_silo = Column(String(100), nullable=True)

    # Finalización
    hora_fin = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)