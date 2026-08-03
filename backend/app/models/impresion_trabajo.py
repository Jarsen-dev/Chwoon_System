from datetime import datetime, timezone, timedelta

from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base

TZ_LOCAL = timezone(timedelta(hours=-6))

ESTADO_PENDIENTE = "pendiente"
ESTADO_ENVIADO = "enviado"
ESTADO_IMPRESO = "impreso"
ESTADO_ERROR = "error"

# Zebra: ZPL encolado que recoge el agente de Windows
FORMATO_ZPL = "zpl"
# HP de red: PDF en hoja carta que manda el propio backend por TCP 9100
FORMATO_PDF = "pdf"


class ImpresionTrabajo(Base):
    """Trabajo de impresión de una etiqueta, con el estado de cómo le fue.

    Dos caminos según `formato`:

    - `zpl` — la Zebra cuelga de un USB en la PC de Windows, el contenedor no la
      alcanza. El trabajo queda `pendiente` y `gateway/agente_impresion.py` lo
      reclama por HTTP y lo manda con win32print.
    - `pdf` — la HP está en la red y el contenedor sí la alcanza, así que el
      backend imprime en línea y el trabajo nace ya resuelto (`impreso`). El PDF
      no se guarda: se regenera del snapshot de `remisiones_etiquetas`.
    """
    __tablename__ = "impresion_trabajos"

    id = Column(Integer, primary_key=True, index=True)
    etiqueta_id = Column(
        Integer,
        ForeignKey("remisiones_etiquetas.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    impresora = Column(String(120), nullable=False, index=True)
    formato = Column(String(10), nullable=False, default=FORMATO_ZPL, index=True)
    # Solo los trabajos ZPL: se guarda ya generado para reimprimir idéntico y
    # auditar. Los de hoja carta van sin nada — el PDF no llega a persistirse.
    zpl = Column(Text, nullable=True)
    estado = Column(String(20), nullable=False, default=ESTADO_PENDIENTE, index=True)
    error = Column(Text, nullable=True)
    creado_por = Column(String(100), nullable=False)
    creado_en = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(TZ_LOCAL),
        nullable=False,
    )
    enviado_en = Column(DateTime(timezone=True), nullable=True)
    terminado_en = Column(DateTime(timezone=True), nullable=True)

    etiqueta = relationship("RemisionEtiqueta", back_populates="trabajos")
