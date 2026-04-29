from sqlalchemy import Column, Integer, String, Float, DateTime, JSON
from datetime import datetime
from app.database import Base


class SuministroSilo(Base):
    """
    Registra cada suministro de material desde un SILO principal hacia un AUX.
    """
    __tablename__ = "suministros_silo"

    id                  = Column(Integer, primary_key=True, index=True)
    suministro_id       = Column(String(150), unique=True, nullable=False, index=True)
    
    # Origen
    silo_origen         = Column(String(100), nullable=False)       # Nombre del SILO (ej: "SILO A")
    silo_origen_op_id   = Column(String(150), nullable=True)        # OP que llenó ese silo
    
    # Destino
    aux_destino         = Column(String(100), nullable=False)       # Nombre del AUX (ej: "AUX 1")
    
    # Datos de la resina (copiados del silo en el momento del suministro)
    sku_resina          = Column(String(100), nullable=True)
    nombre_resina       = Column(String(300), nullable=True)
    grado               = Column(String(100), nullable=True)
    
    # Mediciones
    densidad            = Column(Float, default=0)                  # g/cm³ nueva medición
    kg_suministrados    = Column(Float, default=0)
    kg_restantes        = Column(Float, default=0) 
    tiempo_reposo_horas = Column(Float, default=0)                  # Horas de reposo del silo al momento del suministro
    
    # Máquinas de inyección
    maquinas_inyeccion  = Column(JSON, default=list)                # ["MAQ-1", "MAQ-3", ...]
    
    # Timestamps
    fecha_suministro    = Column(DateTime, default=datetime.utcnow)
    creado_por          = Column(String(100), nullable=True)