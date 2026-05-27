from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, update, delete
from typing import Optional
from datetime import datetime, timedelta, timezone, time
from collections import defaultdict
from reportlab.pdfgen import canvas as pdf_canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
import io
import os
import qrcode
import math

from app.core.deps import get_db, get_current_user, get_current_admin
from app.models.usuario import Usuario, RolUsuario
from app.models.ubicacion import Ubicacion
from app.models.lote_inventario import LoteInventario, MovimientoLote
from app.models.orden_traslado import OrdenTraslado, OrdenTrasladoProduccion
from app.models.producto import Producto
from app.models.orden_compra import OrdenCompra, OrdenCompraItem, Proveedor
from app.services.proveedor_score import registrar_evento
from app.models.orden_venta import OrdenVenta, OrdenVentaItem
from app.schemas.almacen import (
    UbicacionCreate, UbicacionUpdate, UbicacionResponse,
    LoteInventarioResponse, MovimientoLoteResponse,
    TransferenciaItem, TransferenciaBatchRequest,
    AjusteLoteRequest, ScrapInventarioRequest,
    TransferenciaEntreUbicacionesRequest,
    ConsumoFifoRequest,
    InventarioConsolidadoResponse,
    CrearTrasladoProduccionRequest, EjecutarMovimientoParcialRequest,
    TrasladoProduccionResponse,
    IngresoCarritoEPSRequest,
    TrazabilidadResponse,
    AlmacenDashboard,
    RecepcionMaterialRequest,
)

router = APIRouter(prefix="/almacen", tags=["almacen"])

TZ_LOCAL = timezone(timedelta(hours=-6))


def ahora_local():
    return datetime.now(TZ_LOCAL)

def ahora_naive():
    """Retorna datetime local SIN timezone para columnas TIMESTAMP WITHOUT TZ."""
    return datetime.now(TZ_LOCAL).replace(tzinfo=None)


def require_almacen_role(user: Usuario):
    if user.rol not in [RolUsuario.admin, RolUsuario.almacen]:
        raise HTTPException(status_code=403, detail="Se requiere rol administrador o almacén")


async def _registrar_movimiento(db: AsyncSession, lote_id: str, tipo: str, cantidad: float, detalles: dict):
    mov = MovimientoLote(
        lote_id=lote_id,
        fecha=ahora_naive(),
        tipo=tipo.upper(),
        cantidad=cantidad,
        detalles=detalles,
    )
    db.add(mov)

async def _get_producto_map(db: AsyncSession) -> dict:
    result = await db.execute(select(Producto))
    return {p.sku: p for p in result.scalars().all()}


async def _get_ubicacion_map(db: AsyncSession) -> dict:
    result = await db.execute(select(Ubicacion))
    return {u.id: u for u in result.scalars().all()}


async def _get_ubicaciones_por_tipo(db: AsyncSession, tipo_zona: str) -> list:
    result = await db.execute(select(Ubicacion).where(Ubicacion.tipo_zona == tipo_zona))
    return result.scalars().all()


async def _get_ubicacion_by_nombre(db: AsyncSession, nombre: str) -> Optional[Ubicacion]:
    result = await db.execute(select(Ubicacion).where(Ubicacion.nombre == nombre))
    return result.scalar_one_or_none()


# ============================================================
# DASHBOARD
# ============================================================
@router.get("/dashboard", response_model=AlmacenDashboard)
@router.get("/dashboard/", response_model=AlmacenDashboard)
async def dashboard_almacen(
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)

    now = ahora_naive()
    hoy_inicio = now.replace(hour=0, minute=0, second=0, microsecond=0)

    total_lotes_activos = (await db.execute(
        select(func.count(LoteInventario.id)).where(LoteInventario.cantidad_actual > 0)
    )).scalar() or 0

    lotes_sin_ub = (await db.execute(
        select(func.count(LoteInventario.id)).where(
            and_(LoteInventario.ubicacion_id.is_(None), LoteInventario.estado_calidad == "Aprobado")
        )
    )).scalar() or 0

    lotes_cuarentena = (await db.execute(
        select(func.count(LoteInventario.id)).where(LoteInventario.estado_calidad == "Cuarentena")
    )).scalar() or 0

    lotes_pendiente_iqc = (await db.execute(
        select(func.count(LoteInventario.id)).where(LoteInventario.estado_calidad == "Pendiente IQC")
    )).scalar() or 0

    tr_pend = (await db.execute(
        select(func.count(OrdenTrasladoProduccion.id)).where(OrdenTrasladoProduccion.status == "Pendiente")
    )).scalar() or 0

    recepciones_hoy = (await db.execute(
        select(func.count(RecepcionCompra.id)).where(RecepcionCompra.fecha_recepcion >= hoy_inicio)
    )).scalar() or 0

    stock_total = (await db.execute(
        select(func.sum(LoteInventario.cantidad_actual))
    )).scalar() or 0

    # Lote mas antiguo aprobado con stock
    lote_mas_antiguo_res = await db.execute(
        select(LoteInventario.fecha_recepcion)
        .where(and_(LoteInventario.estado_calidad == "Aprobado", LoteInventario.cantidad_actual > 0))
        .order_by(LoteInventario.fecha_recepcion.asc())
        .limit(1)
    )
    lote_mas_antiguo = lote_mas_antiguo_res.scalar()
    lote_mas_antiguo_dias = 0
    if lote_mas_antiguo:
        delta = now - lote_mas_antiguo
        lote_mas_antiguo_dias = delta.days

    # Lotes sin movimiento 30d (simplificado: sin movimientos recientes)
    hace_30 = now - timedelta(days=30)
    subq_mov = select(MovimientoLote.lote_id).where(MovimientoLote.fecha >= hace_30).subquery()
    lotes_sin_mov_30 = (await db.execute(
        select(func.count(LoteInventario.id)).where(
            and_(
                LoteInventario.cantidad_actual > 0,
                LoteInventario.fecha_recepcion < hace_30,
                ~LoteInventario.lote_id.in_(subq_mov),
            )
        )
    )).scalar() or 0

    # Rotacion promedio (simplificada: dias desde recepcion de lotes aprobados activos)
    rot_res = await db.execute(
        select(func.avg(func.extract('epoch', now - LoteInventario.fecha_recepcion) / 86400))
        .where(and_(LoteInventario.estado_calidad == "Aprobado", LoteInventario.cantidad_actual > 0))
    )
    rotacion_promedio = rot_res.scalar() or 0

    # Stock por zona
    ub_map = await _get_ubicacion_map(db)
    stock_por_zona = {}
    result = await db.execute(select(LoteInventario).where(LoteInventario.cantidad_actual > 0))
    for lote in result.scalars().all():
        ub = ub_map.get(lote.ubicacion_id)
        zona = ub.tipo_zona if ub else "SIN_UBICACION"
        if zona not in stock_por_zona:
            stock_por_zona[zona] = {"lotes": 0, "kg": 0.0}
        stock_por_zona[zona]["lotes"] += 1
        stock_por_zona[zona]["kg"] += lote.cantidad_actual or 0

    # Alertas lotes bloqueados > 3 dias en cuarentena (simplificado)
    hace_3 = now - timedelta(days=3)
    alertas_bloqueados = []
    bloq_res = await db.execute(
        select(LoteInventario.lote_id, LoteInventario.sku_producto)
        .where(and_(LoteInventario.estado_calidad == "Pendiente IQC", LoteInventario.fecha_recepcion < hace_3))
        .limit(20)
    )
    for row in bloq_res.all():
        alertas_bloqueados.append({"lote_id": row.lote_id, "sku": row.sku_producto})

    return AlmacenDashboard(
        total_lotes_activos=total_lotes_activos,
        lotes_sin_ubicacion=lotes_sin_ub,
        lotes_cuarentena=lotes_cuarentena,
        lotes_pendiente_iqc=lotes_pendiente_iqc,
        valor_stock_estimado=0.0,
        lote_mas_antiguo_dias=lote_mas_antiguo_dias,
        lotes_sin_movimiento_30d=lotes_sin_mov_30,
        rotacion_promedio_dias=round(float(rotacion_promedio), 1),
        recepciones_hoy=recepciones_hoy,
        picking_pendientes=0,
        picking_completados_hoy=0,
        traslados_pendientes=tr_pend,
        alertas_stock_minimo=[],
        alertas_lotes_bloqueados=alertas_bloqueados,
        stock_por_zona=stock_por_zona,
    )


# ============================================================
# SILOS — Endpoint de solo lectura para producción
# Accesible por cualquier usuario autenticado (operador, supervisor, etc.)
# ============================================================
@router.get("/ubicaciones/silos-produccion", response_model=list[UbicacionResponse])
@router.get("/ubicaciones/silos-produccion/", response_model=list[UbicacionResponse])
async def listar_silos_para_produccion(
    user: Usuario = Depends(get_current_user),   # ← cualquier rol autenticado
    db: AsyncSession = Depends(get_db),
):
    """
    Retorna únicamente las sub-ubicaciones bajo 'SILOS' (excluyendo AUX).
    Usado por Pre-Expansión para que operadores puedan seleccionar silo destino.
    No requiere rol almacen — solo estar autenticado.
    """
    # Buscar padre "SILOS"
    result = await db.execute(
        select(Ubicacion).where(func.upper(Ubicacion.nombre) == 'SILOS')
    )
    padre = result.scalar_one_or_none()
    if not padre:
        return []

    # Solo hijos principales (sin AUX)
    result = await db.execute(
        select(Ubicacion)
        .where(Ubicacion.parent_id == padre.id)
        .order_by(Ubicacion.nombre)
    )
    hijos = result.scalars().all()
    return [u for u in hijos if 'AUX' not in u.nombre.upper()]

@router.get("/ubicaciones/silos-aux", response_model=list[UbicacionResponse])
@router.get("/ubicaciones/silos-aux/", response_model=list[UbicacionResponse])
async def listar_silos_aux_para_produccion(
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    Retorna únicamente los AUX bajo 'SILOS'.
    Usado por Suministro en Pre-Expansión.
    """
    result = await db.execute(
        select(Ubicacion).where(func.upper(Ubicacion.nombre) == 'SILOS')
    )
    padre = result.scalar_one_or_none()
    if not padre:
        return []

    result = await db.execute(
        select(Ubicacion)
        .where(Ubicacion.parent_id == padre.id)
        .order_by(Ubicacion.nombre)
    )
    hijos = result.scalars().all()
    return [u for u in hijos if 'AUX' in u.nombre.upper()]


# ============================================================
# UBICACIONES
# ============================================================
@router.get("/ubicaciones", response_model=list[UbicacionResponse])
@router.get("/ubicaciones/", response_model=list[UbicacionResponse])
async def listar_ubicaciones(
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    result = await db.execute(select(Ubicacion).order_by(Ubicacion.nombre))
    return result.scalars().all()


@router.post("/ubicaciones", response_model=UbicacionResponse)
@router.post("/ubicaciones/", response_model=UbicacionResponse)
async def crear_ubicacion(
    data: UbicacionCreate,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    nombre = data.nombre.strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="El nombre es obligatorio.")

    existing = await _get_ubicacion_by_nombre(db, nombre)
    if existing:
        raise HTTPException(status_code=400, detail=f"La ubicación '{nombre}' ya existe.")

    ub = Ubicacion(
        nombre=nombre,
        parent_id=data.parent_id,
        tipo_zona=data.tipo_zona or "ALMACEN",
        capacidad_max=data.capacidad_max,
        permite_mixing=data.permite_mixing if data.permite_mixing is not None else False,
        activa=data.activa if data.activa is not None else True,
    )
    db.add(ub)
    await db.commit()
    await db.refresh(ub)
    return ub


@router.put("/ubicaciones/{ubicacion_id}", response_model=UbicacionResponse)
@router.put("/ubicaciones/{ubicacion_id}/", response_model=UbicacionResponse)
async def actualizar_ubicacion(
    ubicacion_id: int,
    data: UbicacionUpdate,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    result = await db.execute(select(Ubicacion).where(Ubicacion.id == ubicacion_id))
    ub = result.scalar_one_or_none()
    if not ub:
        raise HTTPException(status_code=404, detail="Ubicación no encontrada.")

    nuevo_nombre = data.nombre.strip()
    if not nuevo_nombre:
        raise HTTPException(status_code=400, detail="El nombre no puede estar vacío.")

    dup = await _get_ubicacion_by_nombre(db, nuevo_nombre)
    if dup and dup.id != ubicacion_id:
        raise HTTPException(status_code=400, detail=f"'{nuevo_nombre}' ya está en uso.")

    ub.nombre = nuevo_nombre
    if data.tipo_zona is not None:
        ub.tipo_zona = data.tipo_zona
    if data.capacidad_max is not None:
        ub.capacidad_max = data.capacidad_max
    if data.permite_mixing is not None:
        ub.permite_mixing = data.permite_mixing
    if data.activa is not None:
        ub.activa = data.activa
    await db.commit()
    await db.refresh(ub)
    return ub


@router.delete("/ubicaciones/{ubicacion_id}")
@router.delete("/ubicaciones/{ubicacion_id}/")
async def eliminar_ubicacion(
    ubicacion_id: int,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)

    hijos = (await db.execute(
        select(func.count(Ubicacion.id)).where(Ubicacion.parent_id == ubicacion_id)
    )).scalar() or 0
    if hijos > 0:
        raise HTTPException(status_code=400, detail="Tiene sub-ubicaciones asignadas.")

    en_uso = (await db.execute(
        select(func.count(LoteInventario.id)).where(LoteInventario.ubicacion_id == ubicacion_id)
    )).scalar() or 0
    if en_uso > 0:
        raise HTTPException(status_code=400, detail="La ubicación tiene lotes asignados.")

    await db.execute(delete(Ubicacion).where(Ubicacion.id == ubicacion_id))
    await db.commit()
    return {"message": "Ubicación eliminada"}


@router.post("/ubicaciones/importar")
@router.post("/ubicaciones/importar/")
async def importar_ubicaciones(
    file: UploadFile = File(...),
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    import pandas as pd

    contents = await file.read()
    if file.filename.endswith(".csv"):
        df = pd.read_csv(io.BytesIO(contents), dtype=str)
    else:
        df = pd.read_excel(io.BytesIO(contents), dtype=str)

    df = df.where(pd.notnull(df), "")
    df.columns = [c.strip().lower() for c in df.columns]

    if "nombre" not in df.columns:
        raise HTTPException(status_code=400, detail="Columna 'nombre' requerida.")

    result = await db.execute(select(Ubicacion))
    existing = {u.nombre: u.id for u in result.scalars().all()}

    created = 0
    # Padres primero
    if "padre" in df.columns:
        for _, row in df.iterrows():
            padre = row.get("padre", "").strip()
            if padre and padre not in existing:
                ub = Ubicacion(nombre=padre, parent_id=None)
                db.add(ub)
                await db.flush()
                existing[padre] = ub.id
                created += 1

    for _, row in df.iterrows():
        nombre = row.get("nombre", "").strip()
        padre = row.get("padre", "").strip() if "padre" in df.columns else ""
        if nombre and nombre not in existing:
            parent_id = existing.get(padre) if padre else None
            ub = Ubicacion(nombre=nombre, parent_id=parent_id)
            db.add(ub)
            await db.flush()
            existing[nombre] = ub.id
            created += 1

    await db.commit()
    return {"message": f"{created} ubicaciones importadas"}


# ============================================================
# INVENTARIO DE LOTES
# ============================================================
@router.get("/inventario", response_model=list[LoteInventarioResponse])
@router.get("/inventario/", response_model=list[LoteInventarioResponse])
async def listar_inventario(
    estado: Optional[str] = None,
    sku: Optional[str] = None,
    ubicacion_id: Optional[int] = None,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)

    query = select(LoteInventario)
    if estado:
        query = query.where(LoteInventario.estado_calidad == estado)
    if sku:
        query = query.where(LoteInventario.sku_producto == sku)
    if ubicacion_id is not None:
        query = query.where(LoteInventario.ubicacion_id == ubicacion_id)

    result = await db.execute(query.order_by(LoteInventario.fecha_recepcion.desc()))
    lotes = result.scalars().all()

    prod_map = await _get_producto_map(db)
    ub_map = await _get_ubicacion_map(db)

    items = []
    for lote in lotes:
        prod = prod_map.get(lote.sku_producto)
        ub = ub_map.get(lote.ubicacion_id)
        items.append(LoteInventarioResponse(
            id=lote.id,
            lote_id=lote.lote_id,
            sku_producto=lote.sku_producto,
            cantidad_actual=lote.cantidad_actual,
            cantidad_inicial=lote.cantidad_inicial,
            ubicacion_id=lote.ubicacion_id,
            nombre_ubicacion=ub.nombre if ub else "Área de Calidad",
            nombre_producto=prod.nombre if prod else "N/A",
            tipo_producto=prod.tipo if prod else "N/A",
            clase_producto=prod.clase_producto if prod else "N/A",
            fecha_recepcion=lote.fecha_recepcion,
            oc_origen=lote.oc_origen,
            op_origen=lote.op_origen,
            ov_origen=lote.ov_origen,
            estado_calidad=lote.estado_calidad,
            carrito_id=lote.carrito_id,
            lote_produccion_origen=lote.lote_produccion_origen,
            motivo_devolucion=lote.motivo_devolucion,
            bloqueado_por=lote.bloqueado_por,
            numero_remision=lote.numero_remision,
            fecha_caducidad=lote.fecha_caducidad,
            lote_proveedor=lote.lote_proveedor,
            bultos=lote.bultos,
        ))
    return items


@router.get("/inventario/consolidado", response_model=list[InventarioConsolidadoResponse])
@router.get("/inventario/consolidado/", response_model=list[InventarioConsolidadoResponse])
async def inventario_consolidado(
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)

    prod_map = await _get_producto_map(db)
    ub_map = await _get_ubicacion_map(db)

    # Función para encontrar el padre raíz
    def get_root_name(uid):
        if not uid or uid not in ub_map:
            return None
        current = ub_map[uid]
        while current.parent_id and current.parent_id in ub_map:
            current = ub_map[current.parent_id]
        return current.nombre

    consolidado = {}
    for sku, prod in prod_map.items():
        consolidado[sku] = {
            "sku": sku,
            "nombre": prod.nombre,
            "tipo": prod.tipo,
            "clase_producto": prod.clase_producto,
            "stock_total": 0.0,
            "stock_por_ubicacion_agregado": defaultdict(float),
            "stock_por_ubicacion_detalle": defaultdict(float),
            "en_compra": 0.0,
            "en_produccion": 0.0,
        }

    result = await db.execute(select(LoteInventario))
    for lote in result.scalars().all():
        if lote.sku_producto in consolidado:
            cant = lote.cantidad_actual or 0
            consolidado[lote.sku_producto]["stock_total"] += cant
            root = get_root_name(lote.ubicacion_id)
            if root:
                consolidado[lote.sku_producto]["stock_por_ubicacion_agregado"][root] += cant
            ub = ub_map.get(lote.ubicacion_id)
            if ub and ub.nombre != "Área de Calidad":
                consolidado[lote.sku_producto]["stock_por_ubicacion_detalle"][ub.nombre] += cant

    # OC pendientes
    oc_result = await db.execute(
        select(OrdenCompra).where(OrdenCompra.status != "Completada")
    )
    for oc in oc_result.scalars().all():
        items_result = await db.execute(
            select(OrdenCompraItem).where(OrdenCompraItem.oc_db_id == oc.id)
        )
        for item in items_result.scalars().all():
            if item.sku_producto in consolidado and consolidado[item.sku_producto]["tipo"] == "COMPONENTE":
                pendiente = (item.cantidad_requerida or 0) - (item.cantidad_recibida or 0)
                if pendiente > 0:
                    consolidado[item.sku_producto]["en_compra"] += pendiente

    response = []
    for data in consolidado.values():
        response.append(InventarioConsolidadoResponse(
            sku=data["sku"],
            nombre=data["nombre"],
            tipo=data["tipo"],
            clase_producto=data["clase_producto"],
            stock_total=data["stock_total"],
            stock_por_ubicacion_agregado=dict(data["stock_por_ubicacion_agregado"]),
            stock_por_ubicacion_detalle=dict(data["stock_por_ubicacion_detalle"]),
            en_compra=data["en_compra"],
            en_produccion=data["en_produccion"],
        ))
    return response


@router.get("/inventario/aprobados-sin-ubicacion", response_model=list[LoteInventarioResponse])
@router.get("/inventario/aprobados-sin-ubicacion/", response_model=list[LoteInventarioResponse])
async def lotes_aprobados_sin_ubicacion(
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)

    result = await db.execute(
        select(LoteInventario).where(
            and_(
                LoteInventario.estado_calidad == "Aprobado",
                LoteInventario.ubicacion_id.is_(None),
            )
        )
    )
    lotes = result.scalars().all()
    prod_map = await _get_producto_map(db)

    items = []
    for lote in lotes:
        prod = prod_map.get(lote.sku_producto)
        items.append(LoteInventarioResponse(
            id=lote.id,
            lote_id=lote.lote_id,
            sku_producto=lote.sku_producto,
            cantidad_actual=lote.cantidad_actual,
            cantidad_inicial=lote.cantidad_inicial,
            ubicacion_id=None,
            nombre_ubicacion="Área de Calidad",
            nombre_producto=prod.nombre if prod else "N/A",
            tipo_producto=prod.tipo if prod else "N/A",
            clase_producto=prod.clase_producto if prod else "N/A",
            fecha_recepcion=lote.fecha_recepcion,
            oc_origen=lote.oc_origen,
            op_origen=lote.op_origen,
            estado_calidad=lote.estado_calidad,
        ))
    return items


@router.get("/inventario/{lote_id}/historial", response_model=list[MovimientoLoteResponse])
@router.get("/inventario/{lote_id}/historial/", response_model=list[MovimientoLoteResponse])
async def historial_lote(
    lote_id: str,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    result = await db.execute(
        select(MovimientoLote)
        .where(MovimientoLote.lote_id == lote_id)
        .order_by(MovimientoLote.fecha.desc())
    )
    return result.scalars().all()


# ============================================================
# TRANSFERENCIAS Y AJUSTES DE LOTES
# ============================================================
@router.post("/inventario/transferir")
@router.post("/inventario/transferir/")
async def transferir_lotes(
    data: TransferenciaBatchRequest,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    now = ahora_local()
    traslado_id = f"OT-{now.strftime('%Y%m%d%H%M%S')}"

    items_traslado = []
    for trans in data.transferencias:
        result = await db.execute(
            select(LoteInventario).where(LoteInventario.lote_id == trans.lote_id)
        )
        lote = result.scalar_one_or_none()
        if not lote:
            raise HTTPException(status_code=404, detail=f"Lote {trans.lote_id} no encontrado.")

        lote.ubicacion_id = trans.destino_id
        await _registrar_movimiento(db, trans.lote_id, "TRASLADO", 0, {
            "origen": "IQC",
            "destino": trans.destino_nombre,
        })

        items_traslado.append({
            "lote_id": trans.lote_id,
            "sku_producto": trans.sku_producto,
            "ubicacion_origen_nombre": "IQC",
            "ubicacion_destino_nombre": trans.destino_nombre,
        })

    ot = OrdenTraslado(
        traslado_id=traslado_id,
        fecha=now,
        items=items_traslado,
        creado_por=user.username,
    )
    db.add(ot)
    await db.commit()

    return {"message": "Transferencia completada", "traslado_id": traslado_id}


@router.put("/inventario/{lote_id}/ajustar")
@router.put("/inventario/{lote_id}/ajustar/")
async def ajustar_lote(
    lote_id: str,
    data: AjusteLoteRequest,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)

    result = await db.execute(select(LoteInventario).where(LoteInventario.lote_id == lote_id))
    lote = result.scalar_one_or_none()
    if not lote:
        raise HTTPException(status_code=404, detail="Lote no encontrado.")

    lote.cantidad_actual = data.nueva_cantidad
    await _registrar_movimiento(db, lote_id, "AJUSTE", data.nueva_cantidad, {
        "motivo": data.motivo,
        "responsable": data.responsable,
    })
    await db.commit()
    return {"message": f"Lote {lote_id} ajustado a {data.nueva_cantidad}"}


@router.post("/inventario/{lote_id}/scrap")
@router.post("/inventario/{lote_id}/scrap/")
async def scrap_inventario(
    lote_id: str,
    data: ScrapInventarioRequest,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)

    result = await db.execute(select(LoteInventario).where(LoteInventario.lote_id == lote_id))
    lote = result.scalar_one_or_none()
    if not lote:
        raise HTTPException(status_code=404, detail="Lote no encontrado.")

    if data.cantidad_scrap > lote.cantidad_actual:
        raise HTTPException(
            status_code=400,
            detail=f"Solo hay {lote.cantidad_actual} disponible.",
        )

    lote.cantidad_actual -= data.cantidad_scrap
    await _registrar_movimiento(db, lote_id, "SCRAP_INVENTARIO", -data.cantidad_scrap, {
        "motivo": data.motivo,
        "responsable": data.responsable,
    })
    await db.commit()
    return {"message": f"Scrap registrado: {data.cantidad_scrap} unidades del lote {lote_id}"}


@router.post("/inventario/transferir-entre-ubicaciones")
@router.post("/inventario/transferir-entre-ubicaciones/")
async def transferir_entre_ubicaciones(
    data: TransferenciaEntreUbicacionesRequest,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)

    origen = await _get_ubicacion_by_nombre(db, data.origen_nombre)
    destino = await _get_ubicacion_by_nombre(db, data.destino_nombre)
    if not origen or not destino:
        raise HTTPException(status_code=404, detail="Ubicación de origen o destino no encontrada.")

    result = await db.execute(
        select(LoteInventario)
        .where(
            and_(
                LoteInventario.sku_producto == data.sku,
                LoteInventario.ubicacion_id == origen.id,
            )
        )
        .order_by(LoteInventario.fecha_recepcion)
        .limit(1)
    )
    lote_origen = result.scalar_one_or_none()
    if not lote_origen:
        raise HTTPException(status_code=404, detail=f"No hay stock de {data.sku} en {data.origen_nombre}.")

    if data.cantidad > lote_origen.cantidad_actual:
        raise HTTPException(status_code=400, detail=f"Solo hay {lote_origen.cantidad_actual} disponible.")

    now = ahora_local()
    ts = int(now.timestamp() * 1000000)
    nuevo_lote_id = f"TRASL-{data.sku[-4:]}-{now.strftime('%d%m%y')}-{ts % 1000}"

    lote_origen.cantidad_actual -= data.cantidad

    nuevo = LoteInventario(
        lote_id=nuevo_lote_id,
        sku_producto=data.sku,
        cantidad_actual=data.cantidad,
        cantidad_inicial=data.cantidad,
        ubicacion_id=destino.id,
        fecha_recepcion=now,
        oc_origen=f"TRASLADO_DE_{lote_origen.lote_id}",
        estado_calidad="Aprobado",
    )
    db.add(nuevo)

    await _registrar_movimiento(db, lote_origen.lote_id, "TRASLADO_SALIDA", -data.cantidad, {"destino": data.destino_nombre})
    await _registrar_movimiento(db, nuevo_lote_id, "TRASLADO_ENTRADA", data.cantidad, {"origen": data.origen_nombre})
    await db.commit()

    return {"message": "Transferencia completada", "nuevo_lote_id": nuevo_lote_id}


# ============================================================
# CONSUMO FIFO V2 — con locking y zonas
# ============================================================
async def _consumir_stock_fifo_v2(
    db: AsyncSession,
    sku: str,
    cantidad: float,
    detalles: dict,
    zonas_prioridad: list = None,
    excluir_zonas: list = None,
):
    if zonas_prioridad is None:
        zonas_prioridad = ["PICKING", "APROBADO"]
    if excluir_zonas is None:
        excluir_zonas = []

    ub_map = await _get_ubicacion_map(db)
    ids_excluir = set()
    for tz in excluir_zonas:
        ubs = await _get_ubicaciones_por_tipo(db, tz)
        ids_excluir |= {u.id for u in ubs}

    todos_los_lotes = []
    ids_usados = set()
    for zona_tipo in zonas_prioridad:
        if zona_tipo in excluir_zonas:
            continue
        ubs = await _get_ubicaciones_por_tipo(db, zona_tipo)
        ids_zona = {u.id for u in ubs}
        if ids_excluir:
            ids_zona -= ids_excluir
        if not ids_zona:
            continue
        res = await db.execute(
            select(LoteInventario)
            .where(
                and_(
                    LoteInventario.sku_producto == sku,
                    or_(LoteInventario.estado_calidad == "Aprobado", LoteInventario.estado_calidad == "Pendiente IQC"),
                    LoteInventario.cantidad_actual > 0,
                    LoteInventario.ubicacion_id.in_(ids_zona),
                    LoteInventario.bloqueado_por.is_(None),
                )
            )
            .order_by(LoteInventario.fecha_recepcion.asc())
            .with_for_update(skip_locked=True)
        )
        for lote in res.scalars().all():
            if lote.id not in ids_usados:
                ids_usados.add(lote.id)
                todos_los_lotes.append(lote)

    # Fallback: cualquier ubicacion aprobada si zonas no cubrieron
    if not todos_los_lotes:
        res = await db.execute(
            select(LoteInventario)
            .where(
                and_(
                    LoteInventario.sku_producto == sku,
                    or_(LoteInventario.estado_calidad == "Aprobado", LoteInventario.estado_calidad == "Pendiente IQC"),
                    LoteInventario.cantidad_actual > 0,
                    LoteInventario.bloqueado_por.is_(None),
                )
            )
            .order_by(LoteInventario.fecha_recepcion.asc())
            .with_for_update(skip_locked=True)
        )
        todos_los_lotes = res.scalars().all()

    restante = cantidad
    plan = []
    for lote in todos_los_lotes:
        if restante <= 0:
            break
        tomar = min(lote.cantidad_actual, restante)
        lote.cantidad_actual -= tomar
        restante -= tomar
        ub = ub_map.get(lote.ubicacion_id)
        plan.append({
            "lote_id": lote.lote_id,
            "sku_producto": sku,
            "cantidad_consumida": tomar,
            "almacen_origen": ub.nombre if ub else "Área de Calidad",
            "oc_origen": lote.oc_origen or "N/A",
        })
        await _registrar_movimiento(db, lote.lote_id, "CONSUMO_PRODUCCION", -tomar, detalles)

    if restante > 0.001:
        raise HTTPException(status_code=400, detail=f"Stock insuficiente para {sku}. Faltan {restante:.2f}")

    return plan


@router.post("/inventario/consumir-fifo")
@router.post("/inventario/consumir-fifo/")
async def consumir_fifo(
    data: ConsumoFifoRequest,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)

    zonas = data.zonas_prioridad if data.zonas_prioridad else ["PICKING", "APROBADO"]
    if data.ubicacion_priorizada:
        ub = await _get_ubicacion_by_nombre(db, data.ubicacion_priorizada)
        if ub and ub.tipo_zona and ub.tipo_zona not in zonas:
            zonas.insert(0, ub.tipo_zona)

    plan = await _consumir_stock_fifo_v2(
        db, data.sku, data.cantidad, data.detalles,
        zonas_prioridad=zonas,
        excluir_zonas=data.excluir_zonas,
    )
    await db.commit()
    return {"message": "Consumo FIFO ejecutado", "plan": plan}


# ============================================================
# TRASLADOS A PRODUCCIÓN
# ============================================================
@router.get("/traslados-produccion", response_model=list[TrasladoProduccionResponse])
@router.get("/traslados-produccion/", response_model=list[TrasladoProduccionResponse])
async def listar_traslados_produccion(
    status: Optional[str] = None,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    query = select(OrdenTrasladoProduccion)
    if status:
        query = query.where(OrdenTrasladoProduccion.status == status)
    result = await db.execute(query.order_by(OrdenTrasladoProduccion.fecha_creacion.desc()))
    return result.scalars().all()


@router.get("/traslados-produccion/historial", response_model=list[TrasladoProduccionResponse])
@router.get("/traslados-produccion/historial/", response_model=list[TrasladoProduccionResponse])
async def historial_traslados_produccion(
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    result = await db.execute(
        select(OrdenTrasladoProduccion).order_by(OrdenTrasladoProduccion.fecha_creacion.desc())
    )
    return result.scalars().all()


@router.post("/traslados-produccion")
@router.post("/traslados-produccion/")
async def crear_traslado_produccion(
    data: CrearTrasladoProduccionRequest,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)

    traslado_id = f"TR-PROD-{data.op_id}"
    items = [{"sku_componente": i.sku, "cantidad_requerida": i.cantidad, "cantidad_movida": 0} for i in data.plan_de_consumo]

    ot = OrdenTrasladoProduccion(
        id_traslado=traslado_id,
        op_id_origen=data.op_id,
        linea_produccion_destino=data.linea_produccion or "ALMACEN DE ENSAMBLE",
        fecha_creacion=ahora_local(),
        status="Pendiente",
        items=items,
        historial=[],
        creado_por=user.username,
    )
    db.add(ot)
    await db.commit()
    return {"message": "Traslado creado", "id_traslado": traslado_id}


@router.post("/traslados-produccion/{traslado_id}/ejecutar")
@router.post("/traslados-produccion/{traslado_id}/ejecutar/")
async def ejecutar_movimiento_parcial(
    traslado_id: str,
    data: EjecutarMovimientoParcialRequest,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)

    result = await db.execute(
        select(OrdenTrasladoProduccion).where(OrdenTrasladoProduccion.id_traslado == traslado_id)
    )
    traslado = result.scalar_one_or_none()
    if not traslado:
        raise HTTPException(status_code=404, detail="Traslado no encontrado.")

    lotes_consumidos = {}

    for mov in data.movimientos:
        plan = await _consumir_stock_fifo_v2(
            db, mov.sku, mov.cantidad_a_mover,
            detalles={"op_id": traslado_id, "autorizador": data.autorizador},
            zonas_prioridad=["APROBADO"],
        )
        lotes_consumidos[mov.sku] = plan

    # Actualizar traslado
    items_actualizados = list(traslado.items or [])
    total_req = 0
    total_mov = 0
    for item_db in items_actualizados:
        sku_db = item_db.get("sku_componente")
        movido_ahora = next((m.cantidad_a_mover for m in data.movimientos if m.sku == sku_db), 0)
        item_db["cantidad_movida"] = item_db.get("cantidad_movida", 0) + movido_ahora
        total_req += item_db.get("cantidad_requerida", 0)
        total_mov += item_db.get("cantidad_movida", 0)

    nuevo_estado = "En Proceso"
    if total_mov >= total_req:
        nuevo_estado = "Completado"

    historial = list(traslado.historial or [])
    historial.append({
        "fecha": ahora_local().isoformat(),
        "autorizador": data.autorizador,
        "movimientos": [{"sku": m.sku, "cantidad_a_mover": m.cantidad_a_mover} for m in data.movimientos],
        "lotes_consumidos": lotes_consumidos,
    })

    traslado.items = items_actualizados
    traslado.status = nuevo_estado
    traslado.historial = historial
    await db.commit()

    return {"message": "Movimiento ejecutado", "nuevo_status": nuevo_estado}


# ============================================================
# ALMACÉN EPS
# ============================================================
@router.get("/eps/ubicaciones", response_model=list[UbicacionResponse])
@router.get("/eps/ubicaciones/", response_model=list[UbicacionResponse])
async def ubicaciones_eps(
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    padre = await _get_ubicacion_by_nombre(db, "ALMACEN EPS")
    if not padre:
        return []

    result = await db.execute(
        select(Ubicacion).where(Ubicacion.parent_id == padre.id)
    )
    return result.scalars().all()


@router.get("/eps/inventario", response_model=list[LoteInventarioResponse])
@router.get("/eps/inventario/", response_model=list[LoteInventarioResponse])
async def inventario_eps(
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    padre = await _get_ubicacion_by_nombre(db, "ALMACEN EPS")
    if not padre:
        return []

    hijos_result = await db.execute(
        select(Ubicacion.id).where(Ubicacion.parent_id == padre.id)
    )
    ids_eps = {padre.id} | {r for r in hijos_result.scalars().all()}

    result = await db.execute(
        select(LoteInventario).where(LoteInventario.ubicacion_id.in_(ids_eps))
    )
    lotes = result.scalars().all()
    prod_map = await _get_producto_map(db)
    ub_map = await _get_ubicacion_map(db)

    items = []
    for lote in lotes:
        prod = prod_map.get(lote.sku_producto)
        ub = ub_map.get(lote.ubicacion_id)
        items.append(LoteInventarioResponse(
            id=lote.id,
            lote_id=lote.lote_id,
            sku_producto=lote.sku_producto,
            cantidad_actual=lote.cantidad_actual,
            cantidad_inicial=lote.cantidad_inicial,
            ubicacion_id=lote.ubicacion_id,
            nombre_ubicacion=ub.nombre if ub else "N/A",
            nombre_producto=prod.nombre if prod else "N/A",
            tipo_producto=prod.tipo if prod else "N/A",
            clase_producto=prod.clase_producto if prod else "N/A",
            fecha_recepcion=lote.fecha_recepcion,
            estado_calidad=lote.estado_calidad,
            carrito_id=lote.carrito_id,
            op_origen=lote.op_origen,
        ))
    return items


@router.post("/eps/ingresar")
@router.post("/eps/ingresar/")
async def ingresar_carrito_eps(
    data: IngresoCarritoEPSRequest,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)

    # Verificar que el lote no exista ya
    existing = await db.execute(
        select(LoteInventario).where(LoteInventario.lote_id == data.carrito_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"El lote {data.carrito_id} ya existe en inventario.")

    now = ahora_local()
    traslado_id = f"{now.strftime('%Y%m%d%H%M%S')}-{data.carrito_id[:8]}"

    nuevo = LoteInventario(
        lote_id=data.carrito_id,
        sku_producto=data.sku_producto,
        cantidad_actual=data.cantidad,
        cantidad_inicial=data.cantidad,
        ubicacion_id=data.ubicacion_id,
        fecha_recepcion=now,
        op_origen=f"OP-{data.op_id}",
        estado_calidad="Aprobado",
        carrito_id=data.carrito_id,
    )
    db.add(nuevo)

    await _registrar_movimiento(db, data.carrito_id, "ENTRADA_EPS", data.cantidad, {
        "origen": "Cuarto de Secado",
        "destino": data.ubicacion_nombre,
        "traslado_id": traslado_id,
    })
    await db.commit()

    return {"message": "Carrito ingresado al almacén EPS", "traslado_id": traslado_id}


# ============================================================
# TRAZABILIDAD
# ============================================================
@router.get("/trazabilidad/{lote_id}")
@router.get("/trazabilidad/{lote_id}/")
async def obtener_trazabilidad(
    lote_id: str,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)

    historial = {}

    # Buscar como lote de inventario
    result = await db.execute(select(LoteInventario).where(LoteInventario.lote_id == lote_id))
    lote = result.scalar_one_or_none()

    if lote:
        prod_map = await _get_producto_map(db)
        ub_map = await _get_ubicacion_map(db)
        prod = prod_map.get(lote.sku_producto)
        ub = ub_map.get(lote.ubicacion_id)

        historial["info_lote"] = {
            "id": lote.lote_id,
            "sku_producto": lote.sku_producto,
            "nombre_producto": prod.nombre if prod else "N/A",
            "cantidad_actual": lote.cantidad_actual,
            "cantidad_inicial": lote.cantidad_inicial,
            "ubicacion": ub.nombre if ub else "Sin ubicación",
            "estado_calidad": lote.estado_calidad,
            "fecha_recepcion": lote.fecha_recepcion.isoformat() if lote.fecha_recepcion else None,
            "oc_origen": lote.oc_origen,
            "op_origen": lote.op_origen,
            "ov_origen": lote.ov_origen,
        }

        # Historial de movimientos
        mov_result = await db.execute(
            select(MovimientoLote)
            .where(MovimientoLote.lote_id == lote_id)
            .order_by(MovimientoLote.fecha.desc())
        )
        historial["movimientos"] = [
            {
                "tipo": m.tipo,
                "cantidad": m.cantidad,
                "fecha": m.fecha.isoformat() if m.fecha else None,
                "detalles": m.detalles or {},
            }
            for m in mov_result.scalars().all()
        ]

        return historial

    return {"error": f"No se encontró lote con ID: {lote_id}"}


# ============================================================
# HISTORIAL DE TRASLADOS (Órdenes de traslado IQC→Ubicación)
# ============================================================
@router.get("/traslados-historial")
@router.get("/traslados-historial/")
async def historial_traslados(
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    result = await db.execute(
        select(OrdenTraslado).order_by(OrdenTraslado.fecha.desc())
    )
    traslados = result.scalars().all()
    return [
        {
            "traslado_id": t.traslado_id,
            "fecha": t.fecha.isoformat() if t.fecha else None,
            "items": t.items or [],
            "creado_por": t.creado_por,
        }
        for t in traslados
    ]


# ============================================================
# EPS — Historial de movimientos
# ============================================================
@router.get("/eps/historial-movimientos")
@router.get("/eps/historial-movimientos/")
async def historial_movimientos_eps(
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    result = await db.execute(
        select(MovimientoLote)
        .where(MovimientoLote.tipo == "ENTRADA_EPS")
        .order_by(MovimientoLote.fecha.desc())
    )
    movimientos = result.scalars().all()

    # Enriquecer con SKU
    lote_ids = list({m.lote_id for m in movimientos})
    lotes_result = await db.execute(
        select(LoteInventario).where(LoteInventario.lote_id.in_(lote_ids))
    ) if lote_ids else None
    lotes_map = {}
    if lotes_result:
        lotes_map = {l.lote_id: l.sku_producto for l in lotes_result.scalars().all()}

    return [
        {
            "fecha": m.fecha.isoformat() if m.fecha else None,
            "id_traslado": (m.detalles or {}).get("traslado_id"),
            "id_carrito": m.lote_id,
            "sku": lotes_map.get(m.lote_id, "N/A"),
            "cantidad": m.cantidad,
            "destino": (m.detalles or {}).get("destino"),
            "origen": (m.detalles or {}).get("origen"),
        }
        for m in movimientos
    ]

# ============================================================
# RECEPCIONES DE COMPRA
# ============================================================
from app.models.orden_compra import OrdenCompra, OrdenCompraItem, RecepcionCompra
from app.schemas.almacen import (
    RecepcionAlmacenCreate,
)


@router.get("/recepciones/ordenes-compra")
@router.get("/recepciones/ordenes-compra/")
async def listar_ordenes_compra_almacen(
    status: Optional[str] = None,
    limite: int = Query(100, ge=1, le=500),
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lista OC para almacén — sin precios ni costos."""
    require_almacen_role(user)

    query = select(OrdenCompra).order_by(OrdenCompra.fecha_creacion.desc()).limit(limite)
    if status and status != "Todos":
        query = query.where(OrdenCompra.status == status)

    result = await db.execute(query)
    ordenes = result.scalars().unique().all()

    response = []
    for orden in ordenes:
        items_result = await db.execute(
            select(OrdenCompraItem).where(OrdenCompraItem.orden_compra_id == orden.id)
        )
        items = items_result.scalars().all()

        response.append({
            "id": orden.id,
            "oc_id": orden.oc_id,
            "id_proveedor": orden.id_proveedor,
            "nombre_proveedor": orden.nombre_proveedor,
            "status": orden.status,
            "origen": orden.origen or "FINANZAS",
            "fecha_creacion": orden.fecha_creacion.isoformat() if orden.fecha_creacion else None,
            "fecha_actualizacion": orden.fecha_actualizacion.isoformat() if orden.fecha_actualizacion else None,
            "notas": orden.notas,
            "creado_por": orden.creado_por,
            "aprobado_por": orden.aprobado_por,
            "items": [
                {
                    "id": item.id,
                    "sku_producto": item.sku_producto,
                    "nombre_producto": item.nombre_producto,
                    "cantidad_requerida": item.cantidad_requerida,
                    "cantidad_recibida": item.cantidad_recibida,
                }
                for item in items
            ],
        })

    return response


@router.get("/recepciones/ordenes-compra/{oc_id}")
@router.get("/recepciones/ordenes-compra/{oc_id}/")
async def obtener_orden_compra_almacen(
    oc_id: str,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Detalle de OC para almacén — sin precios ni costos."""
    require_almacen_role(user)

    result = await db.execute(select(OrdenCompra).where(OrdenCompra.oc_id == oc_id))
    orden = result.scalar_one_or_none()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada")

    items_result = await db.execute(
        select(OrdenCompraItem).where(OrdenCompraItem.orden_compra_id == orden.id)
    )
    items = items_result.scalars().all()

    recepciones_result = await db.execute(
        select(RecepcionCompra).where(RecepcionCompra.orden_compra_id == orden.id)
        .order_by(RecepcionCompra.fecha_recepcion.desc())
    )
    recepciones = recepciones_result.scalars().all()

    return {
        "id": orden.id,
        "oc_id": orden.oc_id,
        "id_proveedor": orden.id_proveedor,
        "nombre_proveedor": orden.nombre_proveedor,
        "status": orden.status,
        "origen": orden.origen or "FINANZAS",
        "fecha_creacion": orden.fecha_creacion.isoformat() if orden.fecha_creacion else None,
        "notas": orden.notas,
        "creado_por": orden.creado_por,
        "aprobado_por": orden.aprobado_por,
        "items": [
            {
                "id": i.id,
                "sku_producto": i.sku_producto,
                "nombre_producto": i.nombre_producto,
                "cantidad_requerida": i.cantidad_requerida,
                "cantidad_recibida": i.cantidad_recibida,
            }
            for i in items
        ],
        "recepciones": [
            {
                "id": r.id,
                "recepcion_id": r.recepcion_id,
                "sku_producto": r.sku_producto,
                "cantidad_recibida": r.cantidad_recibida,
                "fecha_recepcion": r.fecha_recepcion.isoformat() if r.fecha_recepcion else None,
                "recibido_por": r.recibido_por,
                "notas": r.notas,
            }
            for r in recepciones
        ],
    }


@router.post("/recepciones/recepcion-lote")
@router.post("/recepciones/recepcion-lote/")
async def registrar_recepcion_lote_almacen(
    data: list[RecepcionAlmacenCreate],
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Registra recepciones para múltiples SKUs de una misma OC (desde almacén).
    Crea LoteInventario con estado 'Pendiente IQC' para cada recepción."""
    require_almacen_role(user)

    if not data:
        raise HTTPException(status_code=400, detail="Lista de recepciones vacía")

    oc_ids = set(item.oc_id for item in data)
    if len(oc_ids) > 1:
        raise HTTPException(status_code=400, detail="Todas las recepciones deben ser de la misma OC")

    oc_id_str = data[0].oc_id

    result = await db.execute(select(OrdenCompra).where(OrdenCompra.oc_id == oc_id_str))
    orden = result.scalar_one_or_none()
    if not orden:
        raise HTTPException(status_code=404, detail=f"Orden {oc_id_str} no encontrada")

    if orden.status in ("Pendiente Aprobación", "Cancelada"):
        raise HTTPException(
            status_code=400,
            detail=f"No se pueden registrar recepciones. Status actual: {orden.status}"
        )

    recepciones_creadas = []
    lotes_creados = []

    for rec_data in data:
        if rec_data.cantidad_recibida <= 0:
            continue

        item_result = await db.execute(
            select(OrdenCompraItem).where(
                and_(
                    OrdenCompraItem.orden_compra_id == orden.id,
                    OrdenCompraItem.sku_producto == rec_data.sku_producto,
                )
            )
        )
        item = item_result.scalar_one_or_none()
        if not item:
            continue

        now = ahora_local()
        recepcion_id = f"REC-{now.strftime('%Y%m%d%H%M%S')}-{rec_data.sku_producto[-4:]}"

        recepcion = RecepcionCompra(
            recepcion_id=recepcion_id,
            orden_compra_id=orden.id,
            oc_id=oc_id_str,
            sku_producto=rec_data.sku_producto,
            cantidad_recibida=rec_data.cantidad_recibida,
            recibido_por=user.username,
            notas=rec_data.notas,
            cantidad_bultos=rec_data.cantidad_bultos,
            numero_remision=rec_data.numero_remision,
            temperatura=rec_data.temperatura,
            recibido_en_zona=rec_data.recibido_en_zona or "DOCK",
        )
        db.add(recepcion)

        item.cantidad_recibida = (item.cantidad_recibida or 0) + rec_data.cantidad_recibida

        # ── Registrar evento de puntualidad ──
        if orden.proveedor_id:
            prov_result = await db.execute(select(Proveedor).where(Proveedor.id == orden.proveedor_id))
            prov = prov_result.scalar_one_or_none()
            if prov and prov.lead_time_dias is not None and orden.fecha_creacion:
                fecha_esperada = orden.fecha_creacion + timedelta(days=prov.lead_time_dias)
                if now > fecha_esperada:
                    await registrar_evento(
                        proveedor_id=prov.id,
                        tipo_evento="PUNTUALIDAD_TARDE",
                        impacto=-8.0,
                        referencia_id=recepcion_id,
                        descripcion=f"Entrega tarde. Esperada: {fecha_esperada.isoformat()}",
                        registrado_por=user.username,
                        db=db,
                    )
                else:
                    await registrar_evento(
                        proveedor_id=prov.id,
                        tipo_evento="PUNTUALIDAD_A_TIEMPO",
                        impacto=3.0,
                        referencia_id=recepcion_id,
                        descripcion="Entrega dentro del lead time",
                        registrado_por=user.username,
                        db=db,
                    )

        # ── Crear LoteInventario para esta recepción ──
        await db.flush()

        fecha_lote = now.strftime("%Y%m%d")
        sku_suffix = rec_data.sku_producto[-4:].upper()
        ts_micro = int(now.timestamp() * 1000000)
        sec = ts_micro % 10000
        lote_id = f"{fecha_lote}-{sku_suffix}-{sec:04d}"

        # Evitar colisión
        for _ in range(100):
            existing_check = await db.execute(select(LoteInventario).where(LoteInventario.lote_id == lote_id))
            if not existing_check.scalar_one_or_none():
                break
            sec += 1
            lote_id = f"{fecha_lote}-{sku_suffix}-{sec:04d}"
        else:
            raise HTTPException(status_code=500, detail="No se pudo generar lote_id único")

        now_naive = ahora_naive()

        nuevo_lote = LoteInventario(
            lote_id=lote_id,
            sku_producto=rec_data.sku_producto,
            cantidad_actual=rec_data.cantidad_recibida,
            cantidad_inicial=rec_data.cantidad_recibida,
            ubicacion_id=None,
            fecha_recepcion=now_naive,
            oc_origen=oc_id_str,
            estado_calidad="Pendiente IQC",
            numero_remision=rec_data.numero_remision,
            bultos=rec_data.cantidad_bultos or 1,
        )
        db.add(nuevo_lote)

        await _registrar_movimiento(db, lote_id, "RECEPCION_COMPRA", rec_data.cantidad_recibida, {
            "oc_id": oc_id_str,
            "sku": rec_data.sku_producto,
            "recepcion_id": recepcion_id,
            "recibido_por": user.username,
        })

        recepciones_creadas.append(recepcion_id)
        lotes_creados.append(lote_id)

    # Verificar status de la OC
    all_items_result = await db.execute(
        select(OrdenCompraItem).where(OrdenCompraItem.orden_compra_id == orden.id)
    )
    all_items = all_items_result.scalars().all()
    todos_completos = all(i.cantidad_recibida >= i.cantidad_requerida for i in all_items)
    alguno_parcial = any(i.cantidad_recibida > 0 for i in all_items)

    if todos_completos:
        orden.status = "Completada"
    elif alguno_parcial:
        orden.status = "Parcial"

    await db.commit()
    return {
        "message": f"{len(recepciones_creadas)} recepciones registradas, {len(lotes_creados)} lotes creados",
        "recepciones": recepciones_creadas,
        "lotes_creados": lotes_creados,
        "nuevo_status_oc": orden.status,
    }


@router.get("/recepciones/ordenes-compra/{oc_id}/etiqueta-lote/{sku}")
@router.get("/recepciones/ordenes-compra/{oc_id}/etiqueta-lote/{sku}/")
async def generar_etiqueta_lote_almacen(
    oc_id: str,
    sku: str,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Genera PDF de etiqueta de lote IQC desde almacén."""
    require_almacen_role(user)

    result = await db.execute(select(OrdenCompra).where(OrdenCompra.oc_id == oc_id))
    orden = result.scalar_one_or_none()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden no encontrada")

    item_result = await db.execute(
        select(OrdenCompraItem).where(
            and_(
                OrdenCompraItem.orden_compra_id == orden.id,
                OrdenCompraItem.sku_producto == sku,
            )
        )
    )
    item = item_result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail=f"SKU {sku} no encontrado en la orden")

    rec_count_result = await db.execute(
        select(func.count(RecepcionCompra.id)).where(
            and_(
                RecepcionCompra.orden_compra_id == orden.id,
                RecepcionCompra.sku_producto == sku,
            )
        )
    )
    rec_count = rec_count_result.scalar() or 0

    if rec_count == 0:
        raise HTTPException(status_code=400, detail="No hay recepciones registradas para este SKU")

    last_rec_result = await db.execute(
        select(RecepcionCompra).where(
            and_(
                RecepcionCompra.orden_compra_id == orden.id,
                RecepcionCompra.sku_producto == sku,
            )
        ).order_by(RecepcionCompra.fecha_recepcion.desc()).limit(1)
    )
    last_rec = last_rec_result.scalar_one_or_none()
    fecha_recibo_display = last_rec.fecha_recepcion.strftime("%Y-%m-%d") if last_rec and last_rec.fecha_recepcion else ahora_local().strftime("%Y-%m-%d")
    fecha_lote = last_rec.fecha_recepcion.strftime("%Y%m%d") if last_rec and last_rec.fecha_recepcion else ahora_local().strftime("%Y%m%d")

    sku_suffix = sku[-4:].upper()
    lote_id = f"{fecha_lote}-{sku_suffix}-{rec_count}"

    page_w = 4.1 * inch
    page_h = 2.9 * inch

    buffer = io.BytesIO()
    c = pdf_canvas.Canvas(buffer, pagesize=(page_w, page_h))

    margin = 0.25 * inch
    qr_size = 0.95 * inch
    qr_col_x = page_w - margin - qr_size

    c.setFont("Helvetica-Bold", 13)
    c.drawString(margin, page_h - margin - 0.13 * inch, "ETIQUETA DE LOTE (IQC)")

    qr_lote_buf = io.BytesIO()
    qrcode.make(lote_id).save(qr_lote_buf, format="PNG")
    qr_lote_buf.seek(0)
    qr_lote_y = page_h - margin - 0.05 * inch - qr_size
    c.drawImage(ImageReader(qr_lote_buf), qr_col_x, qr_lote_y, width=qr_size, height=qr_size)
    c.setFont("Helvetica-Bold", 7)
    c.drawCentredString(qr_col_x + qr_size / 2, qr_lote_y - 0.11 * inch, "LOTE ID")

    qr_gap = 0.18 * inch
    qr_sku_y = qr_lote_y - 0.11 * inch - qr_gap - qr_size
    qr_sku_buf = io.BytesIO()
    qrcode.make(sku).save(qr_sku_buf, format="PNG")
    qr_sku_buf.seek(0)
    c.drawImage(ImageReader(qr_sku_buf), qr_col_x, qr_sku_y, width=qr_size, height=qr_size)
    c.setFont("Helvetica-Bold", 7)
    c.drawCentredString(qr_col_x + qr_size / 2, qr_sku_y - 0.11 * inch, "SKU")

    label_x = margin
    value_x = margin + 0.9 * inch
    y = page_h - margin - 0.5 * inch
    line_h = 0.2 * inch

    data_lines = [
        ("SKU:", sku),
        ("Producto:", item.nombre_producto[:28]),
        ("Cantidad:", str(item.cantidad_recibida)),
        ("Fecha Recibo:", fecha_recibo_display),
        ("OC Origen:", oc_id),
        ("Lote ID:", lote_id),
    ]

    for label, value in data_lines:
        c.setFont("Helvetica-Bold", 8)
        c.drawString(label_x, y, label)
        c.setFont("Helvetica", 8)
        c.drawString(value_x, y, value)
        y -= line_h

    c.save()
    buffer.seek(0)

    filename = f"ETIQUETA_LOTE_{lote_id}.pdf"
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"},
    )


@router.get("/recepciones/ordenes-compra/{oc_id}/pdf-detalle")
@router.get("/recepciones/ordenes-compra/{oc_id}/pdf-detalle/")
async def generar_pdf_detalle_oc_almacen(
    oc_id: str,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Genera PDF detalle de OC para almacén — sin precios ni valores."""
    require_almacen_role(user)

    result = await db.execute(select(OrdenCompra).where(OrdenCompra.oc_id == oc_id))
    orden = result.scalar_one_or_none()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada")

    items_result = await db.execute(
        select(OrdenCompraItem).where(OrdenCompraItem.orden_compra_id == orden.id)
    )
    items = items_result.scalars().all()

    recepciones_result = await db.execute(
        select(RecepcionCompra).where(RecepcionCompra.orden_compra_id == orden.id)
        .order_by(RecepcionCompra.fecha_recepcion.desc())
    )
    recepciones = recepciones_result.scalars().all()

    def calcular_lote_id(sku_param: str) -> str:
        recs_sku = [r for r in recepciones if r.sku_producto == sku_param]
        if not recs_sku:
            return "—"
        recs_sku.sort(key=lambda r: r.fecha_recepcion, reverse=True)
        fecha = recs_sku[0].fecha_recepcion.strftime("%Y%m%d")
        return f"{fecha}-{sku_param[-4:].upper()}-{len(recs_sku)}"

    buffer = io.BytesIO()
    c = pdf_canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    margin = 0.6 * inch
    right_margin = width - margin

    logo_path = os.path.join("static", "Logo.png")
    if os.path.exists(logo_path):
        c.drawImage(logo_path, margin, height - 1.5 * inch, width=1.5 * inch,
                     height=0.75 * inch, preserveAspectRatio=True, mask="auto")

    c.setFont("Helvetica-Bold", 18)
    c.drawString(margin, height - 2.25 * inch, f"Recepción: {oc_id}")

    c.setFont("Helvetica", 12)
    y = height - 2.6 * inch
    fecha_str = orden.fecha_creacion.strftime("%Y-%m-%d %H:%M") if orden.fecha_creacion else "N/A"
    c.drawString(margin, y, f"Fecha de Creación: {fecha_str}")
    y -= 0.25 * inch
    c.drawString(margin, y, f"Proveedor: {orden.nombre_proveedor}")
    y -= 0.25 * inch
    c.drawString(margin, y, f"Estado: {orden.status}")
    y -= 0.25 * inch
    c.drawString(margin, y, f"Creado por: {orden.creado_por or 'N/A'}")

    if orden.notas:
        y -= 0.25 * inch
        c.drawString(margin, y, f"Notas: {orden.notas}")

    # Tabla de Productos (sin precio, sin valor total)
    y -= 0.6 * inch
    c.setFont("Helvetica-Bold", 14)
    c.drawString(margin, y, "Productos")
    y -= 0.35 * inch

    table_width = right_margin - margin
    col_x = [
        margin,
        margin + table_width * 0.15,
        margin + table_width * 0.45,
        margin + table_width * 0.60,
        margin + table_width * 0.75,
    ]
    headers = ["SKU", "Nombre", "Requerida", "Recibida", "Lote"]
    c.setFont("Helvetica-Bold", 10)
    for i, h in enumerate(headers):
        c.drawString(col_x[i], y, h)
    y -= 0.15 * inch
    c.setStrokeColorRGB(0.6, 0.6, 0.6)
    c.line(margin, y, right_margin, y)
    y -= 0.22 * inch

    c.setFont("Helvetica", 9)
    for item in items:
        lote_id_calc = calcular_lote_id(item.sku_producto)

        c.drawString(col_x[0], y, str(item.sku_producto)[:14])
        c.drawString(col_x[1], y, str(item.nombre_producto)[:28])
        c.drawString(col_x[2], y, str(item.cantidad_requerida))
        c.drawString(col_x[3], y, str(item.cantidad_recibida))
        c.drawString(col_x[4], y, lote_id_calc)
        y -= 0.24 * inch
        if y < inch:
            c.showPage()
            c.setFont("Helvetica", 9)
            y = height - inch

    # Historial de Recepciones
    if recepciones:
        y -= 0.6 * inch
        if y < 2 * inch:
            c.showPage()
            y = height - inch

        c.setFont("Helvetica-Bold", 14)
        c.drawString(margin, y, "Historial de Recepciones")
        y -= 0.35 * inch

        c.setFont("Helvetica", 9)
        for rec in recepciones:
            if y < inch:
                c.showPage()
                c.setFont("Helvetica", 9)
                y = height - inch

            fecha_rec = rec.fecha_recepcion.strftime("%Y-%m-%d %H:%M") if rec.fecha_recepcion else "N/A"
            c.setFont("Helvetica-Bold", 9)
            c.drawString(margin, y, rec.recepcion_id)
            c.setFont("Helvetica", 8)
            c.drawString(right_margin - 1.5 * inch, y, fecha_rec)
            y -= 0.18 * inch

            c.drawString(margin + 0.15 * inch, y,
                          f"{rec.sku_producto} — Cantidad: {rec.cantidad_recibida} — {rec.recibido_por or 'N/A'}")
            y -= 0.18 * inch

            if rec.notas:
                c.setFont("Helvetica-Oblique", 8)
                c.drawString(margin + 0.15 * inch, y, f"Nota: {rec.notas}")
                y -= 0.18 * inch
                c.setFont("Helvetica", 9)

            y -= 0.12 * inch

    c.save()
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={oc_id}_recepcion.pdf"},
    )


# ============================================================
# LIMPIEZA (solo admin)
# ============================================================
@router.post("/limpiar/traslados-completados")
@router.post("/limpiar/traslados-completados/")
async def limpiar_traslados_completados(
    dias: int = Query(default=90),
    user: Usuario = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    fecha_limite = ahora_local() - timedelta(days=dias)
    result = await db.execute(
        delete(OrdenTrasladoProduccion).where(
            and_(
                OrdenTrasladoProduccion.status == "Completado",
                OrdenTrasladoProduccion.fecha_creacion < fecha_limite,
            )
        )
    )
    await db.commit()
    return {"message": f"Eliminados {result.rowcount} traslados completados con más de {dias} días"}


@router.post("/limpiar/movimientos-antiguos")
@router.post("/limpiar/movimientos-antiguos/")
async def limpiar_movimientos_antiguos(
    dias: int = Query(default=180),
    user: Usuario = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    fecha_limite = ahora_local() - timedelta(days=dias)
    result = await db.execute(
        delete(MovimientoLote).where(MovimientoLote.fecha < fecha_limite)
    )
    await db.commit()
    return {"message": f"Eliminados {result.rowcount} movimientos con más de {dias} días"}