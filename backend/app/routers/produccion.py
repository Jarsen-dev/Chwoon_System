from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import List, Dict
from datetime import datetime, timedelta
import json

from app.database import AsyncSessionLocal
from app.models.registro_produccion import RegistroProduccion
from app.models.plan_produccion import PlanProduccion
from app.models.anomalia import Anomalia
from app.models.parte import Parte
from app.schemas.produccion import (
    RegistroProduccion as RegistroSchema,
    RegistroProduccionCreate,
    PlanProduccion as PlanSchema,
    Anomalia as AnomaliaSchema
)

# Servicio de IA (placeholder)
# from app.services.ia_analitica import IAAnaliticaService

router = APIRouter(prefix="/produccion", tags=["produccion"])

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

def obtener_turno() -> str:
    """Determinar turno actual: DIA (7:30-19:30) o NOCHE"""
    ahora = datetime.now().time()
    inicio_dia = datetime.strptime("07:30", "%H:%M").time()
    fin_dia = datetime.strptime("19:30", "%H:%M").time()
    return "DIA" if inicio_dia <= ahora <= fin_dia else "NOCHE"

# ==================== REGISTROS DE PRODUCCIÓN ====================

@router.get("/registros/", response_model=List[RegistroSchema])
async def listar_registros(
    fecha: str = None,
    turno: str = None,
    db: AsyncSession = Depends(get_db)
):
    """Listar registros de producción, opcionalmente filtrados"""
    query = select(RegistroProduccion)
    
    if fecha:
        query = query.where(RegistroProduccion.fecha == fecha)
    if turno:
        query = query.where(RegistroProduccion.turno == turno)
    
    # Ordenar por fecha/hora descendente
    query = query.order_by(RegistroProduccion.fecha.desc(), RegistroProduccion.hora.desc())
    
    result = await db.execute(query)
    return result.scalars().all()

@router.post("/registros/", response_model=RegistroSchema)
async def crear_registro(registro: RegistroProduccionCreate, db: AsyncSession = Depends(get_db)):
    """Crear nuevo registro de producción (desde el escáner)"""
    db_registro = RegistroProduccion(**registro.model_dump())
    db.add(db_registro)
    await db.commit()
    await db.refresh(db_registro)
    return db_registro

# ==================== WEBSOCKET PARA ESCÁNER ====================

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: Dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()

@router.websocket("/ws/scanner")
async def websocket_scanner(websocket: WebSocket, db: AsyncSession = Depends(get_db)):
    """WebSocket para escáner de producción en tiempo real"""
    await manager.connect(websocket)
    
    try:
        while True:
            # Recibir código escaneado
            data = await websocket.receive_text()
            codigo = data.strip().upper()
            
            # Buscar parte
            result = await db.execute(select(Parte).where(Parte.numero_parte == codigo))
            parte = result.scalar_one_or_none()
            
            if not parte:
                await websocket.send_json({
                    "type": "error",
                    "message": f"Parte {codigo} no encontrada"
                })
                continue
            
            # Crear registro
            ahora = datetime.now()
            turno = obtener_turno()
            
            # Calcular conteos (simplificado - en producción hacer query)
            conteo_actual = 1  # TODO: calcular real
            
            registro = RegistroProduccion(
                fecha=ahora.strftime("%Y-%m-%d"),
                hora=ahora.strftime("%H:%M:%S"),
                turno=turno,
                maquina=parte.linea,
                numero_parte=parte.numero_parte,
                descripcion=parte.descripcion,
                carrito_numero=conteo_actual,
                qty_bolsa=int(parte.cantidad_por_etiqueta or 1),
                total_acumulado=conteo_actual * int(parte.cantidad_por_etiqueta or 1)
            )
            
            db.add(registro)
            await db.commit()
            
            # TODO: Análisis de IA aquí
            
            await websocket.send_json({
                "type": "scan_complete",
                "registro": {
                    "hora": registro.hora,
                    "maquina": registro.maquina,
                    "numero_parte": registro.numero_parte,
                    "carrito_numero": registro.carrito_numero,
                    "qty_bolsa": registro.qty_bolsa,
                    "total_acumulado": registro.total_acumulado
                },
                "alertas": []  # TODO: alertas de IA
            })
            
            # Broadcast a todos los clientes conectados
            await manager.broadcast({
                "type": "update",
                "data": "nuevo_escaneo"
            })
            
    except WebSocketDisconnect:
        manager.disconnect(websocket)

# ==================== PLAN DE PRODUCCIÓN ====================

@router.get("/plan/", response_model=List[PlanSchema])
async def obtener_plan(db: AsyncSession = Depends(get_db)):
    """Obtener plan de producción actual"""
    result = await db.execute(select(PlanProduccion))
    return result.scalars().all()

@router.post("/plan/", response_model=PlanSchema)
async def agregar_al_plan(plan: PlanSchema, db: AsyncSession = Depends(get_db)):
    """Agregar o actualizar plan de producción"""
    # Verificar si existe
    result = await db.execute(
        select(PlanProduccion).where(PlanProduccion.numero_parte == plan.numero_parte)
    )
    existente = result.scalar_one_or_none()
    
    if existente:
        existente.meta_piezas = plan.meta_piezas
        existente.turno_objetivo = plan.turno_objetivo
    else:
        db_plan = PlanProduccion(**plan.model_dump())
        db.add(db_plan)
    
    await db.commit()
    return plan

@router.delete("/plan/{numero_parte}")
async def eliminar_del_plan(numero_parte: str, db: AsyncSession = Depends(get_db)):
    """Eliminar parte del plan"""
    result = await db.execute(
        select(PlanProduccion).where(PlanProduccion.numero_parte == numero_parte)
    )
    plan = result.scalar_one_or_none()
    
    if not plan:
        raise HTTPException(status_code=404, detail="No encontrado en plan")
    
    await db.delete(plan)
    await db.commit()
    return {"message": "Eliminado del plan"}

# ==================== PROYECCIÓN Y ANÁLISIS ====================

@router.get("/proyeccion/{turno}")
async def obtener_proyeccion(turno: str, db: AsyncSession = Depends(get_db)):
    """Obtener proyección de cierre de turno"""
    fecha_hoy = datetime.now().strftime("%Y-%m-%d")
    
    # Producción actual del turno
    result = await db.execute(
        select(
            RegistroProduccion.numero_parte,
            func.max(RegistroProduccion.total_acumulado).label("total"),
            func.count(RegistroProduccion.id).label("carritos")
        )
        .where(RegistroProduccion.fecha == fecha_hoy)
        .where(RegistroProduccion.turno == turno)
        .group_by(RegistroProduccion.numero_parte)
    )
    
    produccion_actual = {row.numero_parte: row.total for row in result.all()}
    
    # Plan de producción
    result_plan = await db.execute(select(PlanProduccion))
    planes = result_plan.scalars().all()
    
    proyecciones = []
    for plan in planes:
        producido = produccion_actual.get(plan.numero_parte, 0)
        faltan = max(0, plan.meta_piezas - producido)
        
        # Calcular ritmo y tiempo estimado
        # TODO: cálculo real basado en historial
        
        proyecciones.append({
            "numero_parte": plan.numero_parte,
            "producido": producido,
            "ritmo_por_hora": 0,  # TODO
            "meta_plan": plan.meta_piezas,
            "faltan": faltan,
            "tiempo_estimado": "Calculando..."  # TODO
        })
    
    return {
        "turno": turno,
        "proyecciones": proyecciones,
        "alertas_plan": []  # TODO: alertas de lentitud
    }

@router.get("/salud-maquinas/")
async def salud_maquinas(db: AsyncSession = Depends(get_db)):
    """Obtener estado de salud de máquinas (mantenimiento predictivo)"""
    # TODO: Implementar análisis de gaps entre escaneos
    return [
        {
            "maquina": "maquina 01",
            "ultimo_ciclo_segundos": 45,
            "tendencia": "+2.5 seg/ciclo",
            "estado": "🟢 Estable"
        }
    ]

# ==================== ANOMALÍAS ====================

@router.get("/anomalias/", response_model=List[AnomaliaSchema])
async def listar_anomalias(
    limite: int = 100,
    db: AsyncSession = Depends(get_db)
):
    """Listar anomalías detectadas"""
    result = await db.execute(
        select(Anomalia)
        .order_by(Anomalia.fecha.desc(), Anomalia.hora.desc())
        .limit(limite)
    )
    return result.scalars().all()

@router.post("/anomalias/")
async def registrar_anomalia(
    anomalia: AnomaliaSchema,
    db: AsyncSession = Depends(get_db)
):
    """Registrar nueva anomalía (desde IA)"""
    db_anomalia = Anomalia(**anomalia.model_dump())
    db.add(db_anomalia)
    await db.commit()
    return {"message": "Anomalía registrada"}