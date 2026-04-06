from sqlalchemy import Column, Integer, String, DateTime
from app.database import Base
from datetime import datetime

class ContadorCarrito(Base):
    __tablename__ = "contador_carritos"

    id           = Column(Integer, primary_key=True, index=True)
    numero_parte = Column(String,  unique=True, nullable=False, index=True)
    turno_hora   = Column(String,  nullable=False)   # 'D' o 'N'
    count        = Column(Integer, nullable=False, default=1)
    updated_at   = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)