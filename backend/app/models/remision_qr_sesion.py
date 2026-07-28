from datetime import datetime, timezone, timedelta

from sqlalchemy import Column, String, DateTime

from app.database import Base

TZ_LOCAL = timezone(timedelta(hours=-6))

# Estados: pendiente (esperando foto del celular) → subida (foto recibida)
#          → usada (el desktop ya corrió el OCR con ella)
ESTADO_PENDIENTE = "pendiente"
ESTADO_SUBIDA = "subida"
ESTADO_USADA = "usada"


class RemisionQrSesion(Base):
    """Sesión temporal para el handoff celular↔computadora vía QR.

    Sin Redis en el stack, vive en Postgres; las filas expiradas se limpian
    de forma lazy al crear sesiones nuevas. La seguridad del upload público
    recae en el UUID no adivinable + expiración corta + un solo uso.
    """
    __tablename__ = "remision_qr_sesiones"

    id = Column(String(36), primary_key=True)  # uuid4 generado por el servidor
    estado = Column(String(20), nullable=False, default=ESTADO_PENDIENTE)
    foto_path = Column(String(255), nullable=True)
    creado_por = Column(String(100), nullable=False)
    creado_en = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(TZ_LOCAL),
        nullable=False,
    )
    expira_en = Column(DateTime(timezone=True), nullable=False)
