from datetime import datetime, timezone, timedelta

from sqlalchemy import Column, Integer, String, Date, DateTime, Numeric, ForeignKey
from sqlalchemy.orm import relationship

from app.database import Base

TZ_LOCAL = timezone(timedelta(hours=-6))


class RemisionEtiqueta(Base):
    """Etiqueta de lote impresa para una partida de una remisión.

    Una partida puede repartirse en varias etiquetas (una por bulto/caja); la
    suma de sus cantidades nunca excede la cantidad recibida en la remisión.
    """
    __tablename__ = "remisiones_etiquetas"

    id = Column(Integer, primary_key=True, index=True)
    remision_id = Column(
        Integer,
        ForeignKey("remisiones_recepcion.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    item_id = Column(
        Integer,
        ForeignKey("remisiones_recepcion_items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # {YYYYMMDD}_{últimos4 remisión}_{últimos4 no. parte}_{secuencia}
    lote_id = Column(String(120), nullable=False, unique=True, index=True)
    # Snapshot al momento de imprimir: la etiqueta física ya no cambia
    numero_parte = Column(String(50), nullable=False, index=True)
    descripcion = Column(String(255), nullable=True)
    cantidad = Column(Numeric(12, 2), nullable=False)
    unidad_de_medida = Column(String(50), nullable=True)
    secuencia = Column(Integer, nullable=False)
    fecha_recepcion = Column(Date, nullable=False)
    creado_por = Column(String(100), nullable=False)
    creado_en = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(TZ_LOCAL),
        nullable=False,
    )

    remision = relationship("RemisionRecepcion", back_populates="etiquetas")
    trabajos = relationship(
        "ImpresionTrabajo",
        back_populates="etiqueta",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="ImpresionTrabajo.id",
    )

    @property
    def estado_impresion(self) -> str:
        """Estado del último intento de impresión (lo lee EtiquetaOut).

        Sin esto, con el agente apagado la impresión fallaría en silencio: la
        UI mostraría las etiquetas creadas sin ninguna señal de que no salieron.
        """
        return self.trabajos[-1].estado if self.trabajos else "pendiente"
