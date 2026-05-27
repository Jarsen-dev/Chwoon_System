from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import Optional, List
from datetime import datetime

from app.core.deps import get_db, get_current_user, get_current_admin
from app.models.usuario import Usuario, RolUsuario
from app.models.orden_picking import OrdenPicking
from app.models.lote_inventario import LoteInventario
from app.schemas.almacen import (
    OrdenPickingCreate, OrdenPickingResponse, ConfirmarLotePickingRequest,
)
from app.routers.almacen import _consumir_stock_fifo_v2, ahora_local, ahora_naive

router = APIRouter(prefix="/almacen/picking", tags=["picking"])


def require_almacen_role(user: Usuario):
    if user.rol not in [RolUsuario.admin, RolUsuario.almacen]:
        raise HTTPException(status_code=403, detail="Se requiere rol administrador o almacén")


@router.post("/crear", response_model=OrdenPickingResponse)
async def crear_picking(
    data: OrdenPickingCreate,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    now = ahora_local()
    picking_id = f"PK-{now.strftime('%Y%m%d%H%M%S')}"

    # Pre-asignar lotes via FIFO para cada item
    items_pre = []
    for item in data.items:
        plan = await _consumir_stock_fifo_v2(
            db, item.sku, item.cantidad_requerida,
            detalles={"picking_id": picking_id, "modo": "RESERVA"},
            zonas_prioridad=["PICKING", "APROBADO"],
        )
        lotes_asignados = [{"lote_id": p["lote_id"], "cantidad": p["cantidad_consumida"], "ubicacion": p["almacen_origen"]} for p in plan]
        items_pre.append({
            "sku": item.sku,
            "cantidad_requerida": item.cantidad_requerida,
            "cantidad_picking": 0,
            "lotes_asignados": lotes_asignados,
        })
        # Bloquear lotes
        for p in plan:
            lote_res = await db.execute(select(LoteInventario).where(LoteInventario.lote_id == p["lote_id"]))
            lote = lote_res.scalar_one_or_none()
            if lote:
                lote.bloqueado_por = picking_id

    picking = OrdenPicking(
        picking_id=picking_id,
        tipo_origen=data.tipo_origen,
        origen_id=data.origen_id,
        cliente_id=data.cliente_id,
        status="Pendiente",
        items=items_pre,
        zona_staging=data.zona_staging,
        creado_por=user.username,
        asignado_a=data.asignado_a,
    )
    db.add(picking)
    await db.commit()
    await db.refresh(picking)
    return picking


@router.get("/", response_model=List[OrdenPickingResponse])
async def listar_picking(
    status: Optional[str] = None,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    query = select(OrdenPicking)
    if status:
        query = query.where(OrdenPicking.status == status)
    result = await db.execute(query.order_by(OrdenPicking.fecha_creacion.desc()))
    return result.scalars().all()


@router.get("/{picking_id}", response_model=OrdenPickingResponse)
async def obtener_picking(
    picking_id: str,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    result = await db.execute(select(OrdenPicking).where(OrdenPicking.picking_id == picking_id))
    picking = result.scalar_one_or_none()
    if not picking:
        raise HTTPException(status_code=404, detail="Picking no encontrado")
    return picking


@router.post("/{picking_id}/confirmar-lote", response_model=OrdenPickingResponse)
async def confirmar_lote_picking(
    picking_id: str,
    data: ConfirmarLotePickingRequest,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    result = await db.execute(select(OrdenPicking).where(OrdenPicking.picking_id == picking_id))
    picking = result.scalar_one_or_none()
    if not picking:
        raise HTTPException(status_code=404, detail="Picking no encontrado")
    if picking.status not in ("Pendiente", "En Picking"):
        raise HTTPException(status_code=400, detail=f"Picking en status: {picking.status}")

    items = list(picking.items or [])
    for item in items:
        if item["sku"] == data.sku:
            item["cantidad_picking"] = item.get("cantidad_picking", 0) + data.cantidad_confirmada
            for la in item.get("lotes_asignados", []):
                if la["lote_id"] == data.lote_id:
                    la["confirmado"] = True
                    la["confirmado_por"] = user.username
                    la["fecha_confirmacion"] = ahora_local().isoformat()

    # Actualizar lote: mover a zona staging si aplica, liberar bloqueo parcial
    lote_res = await db.execute(select(LoteInventario).where(LoteInventario.lote_id == data.lote_id))
    lote = lote_res.scalar_one_or_none()
    if lote and lote.bloqueado_por == picking_id:
        lote.bloqueado_por = None

    picking.status = "En Picking"
    picking.items = items
    await db.commit()
    await db.refresh(picking)
    return picking


@router.post("/{picking_id}/completar", response_model=OrdenPickingResponse)
async def completar_picking(
    picking_id: str,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    result = await db.execute(select(OrdenPicking).where(OrdenPicking.picking_id == picking_id))
    picking = result.scalar_one_or_none()
    if not picking:
        raise HTTPException(status_code=404, detail="Picking no encontrado")

    # Liberar todos los bloqueos de esta orden
    lote_ids = []
    for item in (picking.items or []):
        for la in item.get("lotes_asignados", []):
            lote_ids.append(la["lote_id"])

    if lote_ids:
        lotes_res = await db.execute(select(LoteInventario).where(LoteInventario.lote_id.in_(lote_ids)))
        for lote in lotes_res.scalars().all():
            if lote.bloqueado_por == picking_id:
                lote.bloqueado_por = None

    picking.status = "Completado"
    picking.fecha_completado = ahora_naive()
    await db.commit()
    await db.refresh(picking)
    return picking


@router.post("/{picking_id}/cancelar", response_model=OrdenPickingResponse)
async def cancelar_picking(
    picking_id: str,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    result = await db.execute(select(OrdenPicking).where(OrdenPicking.picking_id == picking_id))
    picking = result.scalar_one_or_none()
    if not picking:
        raise HTTPException(status_code=404, detail="Picking no encontrado")

    # Liberar bloqueos
    lote_ids = []
    for item in (picking.items or []):
        for la in item.get("lotes_asignados", []):
            lote_ids.append(la["lote_id"])
    if lote_ids:
        lotes_res = await db.execute(select(LoteInventario).where(LoteInventario.lote_id.in_(lote_ids)))
        for lote in lotes_res.scalars().all():
            if lote.bloqueado_por == picking_id:
                lote.bloqueado_por = None

    picking.status = "Cancelado"
    await db.commit()
    await db.refresh(picking)
    return picking
