from sqlalchemy import Column, Integer, String, DateTime, Float, Text, JSON, Date
from app.database import Base
from datetime import datetime, timezone, timedelta

TZ_LOCAL = timezone(timedelta(hours=-6))


class PlanVentas(Base):
    __tablename__ = "planes_venta"

    id = Column(Integer, primary_key=True, index=True)
    identificador_semana = Column(String(20), unique=True, nullable=False, index=True)
    # Formato: YYYY-WW (ej: 2026-23)
    fecha_inicio_semana = Column(Date, nullable=False)
    fecha_importacion = Column(DateTime(timezone=True), default=lambda: datetime.now(TZ_LOCAL))
    importado_por = Column(String(100), nullable=True)

    # ------------------------------------------------------------------ #
    # items — estructura extendida para CW PLAN                           #
    # ------------------------------------------------------------------ #
    # Los campos nuevos (stock_lg, cw_line, model, id1) son ADITIVOS:
    # los registros anteriores sin esos campos siguen funcionando,
    # el frontend los trata como None y no rompe.
    #
    # Estructura completa:
    # [
    #   {
    #     "sku":          "ABQ73946703",
    #     "descripcion":  "CASE ASSY CONTROL",
    #     "linea":        "R1",
    #     "cw_line":      "L5",            # NUEVO — línea CW (L2/L3/L5/L6)
    #     "model":        "QUANTUM-T",     # NUEVO — modelo LG
    #     "id1":          "Control Box",   # NUEVO — agrupación funcional
    #     "stock_actual": 400,             # INV. CW — inventario en planta CW
    #     "stock_lg":     733,             # NUEVO — INV. LG — stock en planta LG
    #     "dias": {
    #       "VIERNES":    {"plan": 1144, "status": "Autorizado",  "ov_generada": "OV-20260605-001"},
    #       "LUNES":      {"plan": 1032, "status": "Autorizado",  "ov_generada": "OV-20260608-001"},
    #       "MARTES":     {"plan": 1200, "status": "Pendiente",   "ov_generada": null},
    #       "MIERCOLES":  {"plan": 1298, "status": "Pendiente",   "ov_generada": null},
    #       "JUEVES":     {"plan":  995, "status": "Pendiente",   "ov_generada": null},
    #     }
    #   },
    #   ...
    # ]
    #
    # Nota sobre DIF:
    #   DIF_dia = stock_lg - sum(plan para ese día y anteriores de la semana)
    #   NO se almacena — se calcula en el frontend para ser siempre fresco.
    items = Column(JSON, default=list)