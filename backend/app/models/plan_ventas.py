from sqlalchemy import Column, Integer, String, DateTime, Float, Text, JSON, Date
from app.database import Base
from datetime import datetime, timezone, timedelta

TZ_LOCAL = timezone(timedelta(hours=-6))


class PlanVentas(Base):
    __tablename__ = "planes_venta"

    id = Column(Integer, primary_key=True, index=True)
    identificador_semana = Column(String(20), unique=True, nullable=False, index=True)
    # Formato: YYYY-WW (ej: 2026-16)
    fecha_inicio_semana = Column(Date, nullable=False)
    fecha_importacion = Column(DateTime(timezone=True), default=lambda: datetime.now(TZ_LOCAL))
    items = Column(JSON, default=list)
    # Estructura items:
    # [
    #   {
    #     "sku": "ABC123",
    #     "descripcion": "Producto X",
    #     "stock_actual": 100,
    #     "dias": {
    #       "LUNES":     {"plan": 50, "status": "Pendiente", "ov_generada": null},
    #       "MARTES":    {"plan": 30, "status": "Autorizado", "ov_generada": "OV-20260416..."},
    #       ...
    #     }
    #   }
    # ]
    importado_por = Column(String(100), nullable=True)