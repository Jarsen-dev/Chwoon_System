"""Router de máquinas EPS — ingesta de eventos PLC/HMI y estado en vivo.

Arquitectura:
  PLC LS ──Cnet──> HMI Weintek ──Modbus TCP──> script gateway (Python)
      ──HTTP POST /maquinas/evento──> este router ──WS /maquinas/ws──> frontend

El gateway autentica con API key (X-API-Key). El frontend consulta y se
suscribe con el token JWT normal.
"""
from datetime import datetime
from typing import Dict, List, Optional

from fastapi import (
    APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect,
)
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.core.deps import get_db, get_current_user, verify_gateway_key
from app.core.turnos import get_turno_actual, get_fecha_turno, ahora_local
from app.models.maquina import Maquina
from app.models.maquina_evento import MaquinaEvento
from app.models.usuario import Usuario
from app.schemas.maquina import EventoIn, EventoOut, MaquinaEstadoOut

router = APIRouter(prefix="/maquinas", tags=["maquinas"])


# ── WebSocket manager (patrón de routers/produccion.py) ───────────────

class MaquinaConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for conn in list(self.active_connections):
            try:
                await conn.send_json(message)
            except Exception:
                pass


manager = MaquinaConnectionManager()

# Snapshot en vivo por código de máquina (se reconstruye con cada evento;
# no es persistente — sobrevive mientras corre el proceso).
estado_vivo: Dict[str, dict] = {}


def _estado_default() -> dict:
    return {
        "counter": None,
        "process_no": None,
        "meta_h": None,
        "estado_actual": None,
        "incidencias_activas": [],
        "ultima_actualizacion": None,
    }


def _aplicar_evento_a_estado(codigo: str, ev: EventoIn) -> dict:
    """Actualiza el snapshot en vivo de la máquina según el evento recibido."""
    st = estado_vivo.setdefault(codigo, _estado_default())
    meta = ev.metadata or {}

    if ev.tipo_evento == "PIEZA":
        if ev.valor is not None:
            st["counter"] = ev.valor
        if "process_no" in meta:
            st["process_no"] = meta["process_no"]
        if "meta_h" in meta:
            st["meta_h"] = meta["meta_h"]
    elif ev.tipo_evento == "CAMBIO_ESTADO":
        if ev.estado:
            st["estado_actual"] = ev.estado
    elif ev.tipo_evento == "INCIDENCIA_INICIO":
        inc = meta.get("incidencia")
        if inc and inc not in st["incidencias_activas"]:
            st["incidencias_activas"].append(inc)
    elif ev.tipo_evento == "INCIDENCIA_FIN":
        inc = meta.get("incidencia")
        if inc and inc in st["incidencias_activas"]:
            st["incidencias_activas"].remove(inc)

    # process_no / meta_h pueden venir en cualquier evento como telemetría
    if ev.tipo_evento != "PIEZA":
        if "process_no" in meta:
            st["process_no"] = meta["process_no"]
        if "meta_h" in meta:
            st["meta_h"] = meta["meta_h"]

    st["ultima_actualizacion"] = ahora_local().isoformat()
    return st


async def _contar_piezas_turno(db: AsyncSession, maquina_id: int,
                               fecha_turno: str, turno: str) -> int:
    result = await db.execute(
        select(func.count(MaquinaEvento.id))
        .where(MaquinaEvento.maquina_id == maquina_id)
        .where(MaquinaEvento.tipo_evento == "PIEZA")
        .where(MaquinaEvento.fecha_turno == fecha_turno)
        .where(MaquinaEvento.turno == turno)
    )
    return result.scalar() or 0


# ── Ingesta de eventos (gateway, API key) ─────────────────────────────

@router.post("/evento")
async def registrar_evento(
    body: EventoIn,
    db: AsyncSession = Depends(get_db),
    _: None = Depends(verify_gateway_key),
):
    result = await db.execute(
        select(Maquina).where(Maquina.codigo == body.maquina_codigo)
    )
    maquina = result.scalar_one_or_none()
    if not maquina:
        raise HTTPException(
            status_code=404,
            detail=f"Máquina '{body.maquina_codigo}' no registrada",
        )

    turno = get_turno_actual()
    fecha_turno = get_fecha_turno()

    evento = MaquinaEvento(
        maquina_id=maquina.id,
        tipo_evento=body.tipo_evento,
        valor=body.valor,
        estado=body.estado,
        operador=body.operador,
        turno=turno,
        fecha_turno=fecha_turno,
        meta=body.metadata or {},
        created_at=ahora_local(),
    )
    db.add(evento)
    await db.commit()
    await db.refresh(evento)

    # Actualizar snapshot en vivo + avance del turno
    st = _aplicar_evento_a_estado(maquina.codigo, body)
    piezas_turno = await _contar_piezas_turno(db, maquina.id, fecha_turno, turno)

    await manager.broadcast({
        "type": "maquina_update",
        "maquina": maquina.codigo,
        "tipo_evento": body.tipo_evento,
        "estado": dict(st, piezas_turno=piezas_turno),
    })

    return {"ok": True, "id": evento.id}


# ── Consulta de máquinas + estado en vivo (frontend) ──────────────────

@router.get("/", response_model=List[MaquinaEstadoOut])
async def listar_maquinas(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    result = await db.execute(
        select(Maquina).where(Maquina.activa == True)  # noqa: E712
    )
    maquinas = result.scalars().all()

    turno = get_turno_actual()
    fecha_turno = get_fecha_turno()

    salida: List[MaquinaEstadoOut] = []
    for m in maquinas:
        st = estado_vivo.get(m.codigo, _estado_default())
        piezas_turno = await _contar_piezas_turno(db, m.id, fecha_turno, turno)
        ua = st.get("ultima_actualizacion")
        salida.append(MaquinaEstadoOut(
            id=m.id,
            codigo=m.codigo,
            nombre=m.nombre,
            linea=m.linea,
            tipo=m.tipo,
            marca_plc=m.marca_plc,
            ip_hmi=m.ip_hmi,
            umbral_incidencia_seg=m.umbral_incidencia_seg,
            activa=m.activa,
            counter=st.get("counter"),
            process_no=st.get("process_no"),
            meta_h=st.get("meta_h"),
            estado_actual=st.get("estado_actual"),
            incidencias_activas=st.get("incidencias_activas", []),
            piezas_turno=piezas_turno,
            ultima_actualizacion=datetime.fromisoformat(ua) if ua else None,
        ))
    return salida


@router.get("/{codigo}/eventos", response_model=List[EventoOut])
async def historial_eventos(
    codigo: str,
    limite: int = 100,
    tipo: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_user),
):
    result = await db.execute(
        select(Maquina).where(Maquina.codigo == codigo)
    )
    maquina = result.scalar_one_or_none()
    if not maquina:
        raise HTTPException(status_code=404, detail="Máquina no encontrada")

    query = (
        select(MaquinaEvento)
        .where(MaquinaEvento.maquina_id == maquina.id)
        .order_by(MaquinaEvento.id.desc())
        .limit(min(limite, 500))
    )
    if tipo:
        query = query.where(MaquinaEvento.tipo_evento == tipo)

    result = await db.execute(query)
    return result.scalars().all()


# ── WebSocket en vivo (frontend) ──────────────────────────────────────

@router.websocket("/ws")
async def websocket_maquinas(websocket: WebSocket, token: str = None):
    await manager.connect(websocket)

    # Snapshot inicial para que el cliente nuevo no espere al primer evento
    try:
        async with AsyncSessionLocal() as db:
            turno = get_turno_actual()
            fecha_turno = get_fecha_turno()
            result = await db.execute(
                select(Maquina).where(Maquina.activa == True)  # noqa: E712
            )
            snapshot = []
            for m in result.scalars().all():
                st = estado_vivo.get(m.codigo, _estado_default())
                piezas_turno = await _contar_piezas_turno(db, m.id, fecha_turno, turno)
                snapshot.append({
                    "maquina": m.codigo,
                    "estado": dict(st, piezas_turno=piezas_turno),
                })
        await websocket.send_json({"type": "snapshot", "maquinas": snapshot})
    except Exception:
        pass

    try:
        while True:
            # No esperamos mensajes del cliente; solo mantenemos viva la conexión.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception:
        manager.disconnect(websocket)
