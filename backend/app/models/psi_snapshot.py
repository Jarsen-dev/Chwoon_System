from sqlalchemy import Column, Integer, Float, Date, DateTime, String, JSON
from app.database import Base


class PsiSnapshot(Base):
    """
    Snapshot diario de PSI Coverage importado desde la hoja PSI RESUME
    del archivo PLAN EMBARQUE. Guarda los valores oficiales de LG para
    cobertura de inventario (Ref y Oven, D-Day y D+1).
    """
    __tablename__ = "psi_snapshots"

    id                  = Column(Integer, primary_key=True, index=True)
    fecha               = Column(Date, nullable=False, unique=True, index=True)

    # PSI Coverage rates (fracción 0.0–2.0)
    coverage_ref_dday   = Column(Float, default=0.0)
    coverage_ref_d1     = Column(Float, default=0.0)
    coverage_oven_dday  = Column(Float, default=0.0)
    coverage_oven_d1    = Column(Float, default=0.0)

    # Need / Covered raw counts (para auditoría)
    ref_need_dday       = Column(Integer, default=0)
    ref_covered_dday    = Column(Integer, default=0)
    ref_need_d1         = Column(Integer, default=0)
    ref_covered_d1      = Column(Integer, default=0)
    oven_need_dday      = Column(Integer, default=0)
    oven_covered_dday   = Column(Integer, default=0)
    oven_need_d1        = Column(Integer, default=0)
    oven_covered_d1     = Column(Integer, default=0)

    importado_por       = Column(String(100), nullable=True)
    fecha_importacion   = Column(DateTime(timezone=True), nullable=True)
    raw_data            = Column(JSON, nullable=True)  # fila PSI RESUME completa
