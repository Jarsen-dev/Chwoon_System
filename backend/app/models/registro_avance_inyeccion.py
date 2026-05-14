from sqlalchemy import Column, Integer, String, DateTime, Float, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base


class RegistroAvanceInyeccion(Base):
    """
    Registro de avance para Inyección.
    Contiene: tiempo_ciclo, contador_hora, producción_total (contador_hora * cav)
    """
    __tablename__ = "registro_avance_inyeccion"

    id = Column(Integer, primary_key=True, index=True)
    plan_inyeccion_id = Column(Integer, ForeignKey("plan_inyeccion.id", ondelete="CASCADE"), nullable=False, index=True)
    tiempo_ciclo = Column(Float, nullable=False)
    contador_hora = Column(Integer, nullable=False, default=0)
    produccion_total = Column(Integer, nullable=False, default=0)
    timestamp = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)

    plan_inyeccion = relationship("PlanInyeccion", backref="avances")