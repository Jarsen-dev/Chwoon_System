from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional, List
from datetime import datetime

from app.core.deps import get_db, get_current_user, get_current_admin
from app.models.usuario import Usuario, RolUsuario
from app.models.conteo_fisico import ConteoFisico
from app.models.lote_inventario import LoteInventario, MovimientoLote
from app.schemas.almacen import (
    ConteoFisicoCreate, ConteoFisicoResponse, RegistrarConteoRequest, AprobarConteoRequest,
)
from app.routers.almacen import _registrar_movimiento, ahora_local, ahora_naive

router = APIRouter(prefix="/almacen/conteo", tags=["conteo_fisico"])


def require_almacen_role(user: Usuario):
    if user.rol not in [RolUsuario.admin, RolUsuario.almacen]:
        raise HTTPException(status_code=403, detail="Se requiere rol administrador o almacén")


@router.post("/crear", response_model=ConteoFisicoResponse)
async def crear_conteo(
    data: ConteoFisicoCreate,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    now = ahora_local()
    conteo_id = f"CF-{now.strftime('%Y%m%d%H%M%S')}"

    # Obtener stock actual de la zona
    from app.models.ubicacion import Ubicacion
    ub_res = await db.execute(select(Ubicacion).where(Ubicacion.tipo_zona == data.zona))
    ubs = ub_res.scalars().all()
    ids_zona = {u.id for u in ubs}

    items_sistema = []
    if ids_zona:
        lote_res = await db.execute(
            select(LoteInventario).where(LoteInventario.ubicacion_id.in_(ids_zona), LoteInventario.cantidad_actual > 0)
        )
        for lote in lote_res.scalars().all():
            items_sistema.append({
                "lote_id": lote.lote_id,
                "sku": lote.sku_producto,
                "cantidad_sistema": lote.cantidad_actual,
                "cantidad_contada": None,
                "diferencia": None,
                "contado_por": None,
            })

    conteo = ConteoFisico(
        conteo_id=conteo_id,
        zona=data.zona,
        status="En Proceso",
        items=items_sistema,
        creado_por=user.username,
    )
    db.add(conteo)
    await db.commit()
    await db.refresh(conteo)
    return conteo


@router.get("/", response_model=List[ConteoFisicoResponse])
async def listar_conteos(
    status: Optional[str] = None,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    query = select(ConteoFisico)
    if status:
        query = query.where(ConteoFisico.status == status)
    result = await db.execute(query.order_by(ConteoFisico.fecha_inicio.desc()))
    return result.scalars().all()


@router.get("/{conteo_id}", response_model=ConteoFisicoResponse)
async def obtener_conteo(
    conteo_id: str,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    result = await db.execute(select(ConteoFisico).where(ConteoFisico.conteo_id == conteo_id))
    conteo = result.scalar_one_or_none()
    if not conteo:
        raise HTTPException(status_code=404, detail="Conteo no encontrado")
    return conteo


@router.post("/{conteo_id}/registrar", response_model=ConteoFisicoResponse)
async def registrar_conteo(
    conteo_id: str,
    data: RegistrarConteoRequest,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    result = await db.execute(select(ConteoFisico).where(ConteoFisico.conteo_id == conteo_id))
    conteo = result.scalar_one_or_none()
    if not conteo:
        raise HTTPException(status_code=404, detail="Conteo no encontrado")
    if conteo.status != "En Proceso":
        raise HTTPException(status_code=400, detail=f"Conteo {conteo.status}")

    items = list(conteo.items or [])
    total_diferencia = 0.0
    for item in items:
        if item["lote_id"] == data.lote_id:
            item["cantidad_contada"] = data.cantidad_contada
            item["diferencia"] = data.cantidad_contada - item["cantidad_sistema"]
            item["contado_por"] = user.username
            total_diferencia = abs(item["diferencia"])

    conteo.items = items
    conteo.total_diferencia = total_diferencia
    await db.commit()
    await db.refresh(conteo)
    return conteo


@router.post("/{conteo_id}/aprobar", response_model=ConteoFisicoResponse)
async def aprobar_conteo(
    conteo_id: str,
    data: AprobarConteoRequest,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    result = await db.execute(select(ConteoFisico).where(ConteoFisico.conteo_id == conteo_id))
    conteo = result.scalar_one_or_none()
    if not conteo:
        raise HTTPException(status_code=404, detail="Conteo no encontrado")

    items = list(conteo.items or [])
    for item in items:
        if item.get("diferencia") and item["diferencia"] != 0:
            lote_res = await db.execute(select(LoteInventario).where(LoteInventario.lote_id == item["lote_id"]))
            lote = lote_res.scalar_one_or_none()
            if lote:
                nueva_cantidad = item["cantidad_contada"]
                dif = nueva_cantidad - lote.cantidad_actual
                lote.cantidad_actual = nueva_cantidad
                await _registrar_movimiento(db, item["lote_id"], "AJUSTE_CONTEO_FISICO", dif, {
                    "conteo_id": conteo_id,
                    "aprobado_por": user.username,
                    "motivo": data.motivo,
                })

    conteo.status = "Aprobado"
    conteo.fecha_cierre = ahora_naive()
    conteo.aprobado_por = user.username
    await db.commit()
    await db.refresh(conteo)
    return conteo
