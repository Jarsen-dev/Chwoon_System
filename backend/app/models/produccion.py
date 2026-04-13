from sqlalchemy import Column, Integer, String, DateTime, Float, ForeignKey
from app.database import Base

class RegistroProduccion(Base):
    __tablename__ = "registros_produccion"
    id = Column(Integer, primary_key=True)
    fecha = Column(String(20))
    hora = Column(String(20))
    turno = Column(String(10))
    maquina = Column(String(50))
    numero_parte = Column(String(50), ForeignKey("partes.numero_parte"))
    descripcion = Column(String(200))
    carrito_numero = Column(Integer)
    qty_bolsa = Column(Integer)
    total_acumulado = Column(Integer)

class PlanProduccion(Base):
    __tablename__ = "planes_produccion"
    id = Column(Integer, primary_key=True)
    numero_parte = Column(String(50), ForeignKey("partes.numero_parte"), unique=True)
    meta_piezas = Column(Integer)
    turno_objetivo = Column(String(10))
    created_at = Column(DateTime)

class ColaImpresion(Base):
    __tablename__ = "cola_impresion"
    id = Column(Integer, primary_key=True)
    parte_id = Column(Integer, ForeignKey("partes.id"))
    cantidad_etiquetas = Column(Integer)
    turno = Column(String(10))
    estado = Column(String(20), default="pendiente")
    created_at = Column(DateTime)

class RegistroParo(Base):
    __tablename__ = "registros_paros"
    id = Column(Integer, primary_key=True)
    fecha = Column(String(20))
    hora_inicio = Column(String(10))
    hora_fin = Column(String(10))
    duracion_minutos = Column(Float)
    maquina = Column(String(50))
    motivo = Column(String(100))
    comentario = Column(String(500))

class Anomalia(Base):
    __tablename__ = "anomalias"
    id = Column(Integer, primary_key=True)
    fecha = Column(String(20))
    hora = Column(String(20))
    numero_parte = Column(String(50))
    motivo = Column(String(500))
    tipo = Column(String(50))