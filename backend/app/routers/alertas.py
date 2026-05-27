from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import Optional, List
from datetime import datetime, timedelta

from app.core.deps import get_db, get_current_user
from app.models.usuario import Usuario, RolUsuario
from app.models.config_alerta_stock import ConfigAlertaStock
from app.models.lote_inventario import LoteInventario

router = APIRouter(prefix="/almacen/alertas", tags=["alertas"])


def require_almacen_role(user: Usuario):
    if user.rol not in [RolUsuario.admin, RolUsuario.almacen]:
        raise HTTPException(status_code=403, detail="Se requiere rol administrador o almacén")


@router.post("/config", response_model=dict)
async def crear_config_alerta(
    data: dict,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    cfg = ConfigAlertaStock(
        sku=data["sku"],
        stock_minimo=data.get("stock_minimo", 0),
        stock_maximo=data.get("stock_maximo"),
        dias_rotacion=data.get("dias_rotacion"),
        activa=data.get("activa", True),
        notificar_a=data.get("notificar_a", []),
    )
    db.add(cfg)
    await db.commit()
    await db.refresh(cfg)
    return {"id": cfg.id, "sku": cfg.sku}


@router.get("/config", response_model=List[dict])
async def listar_config_alertas(
    sku: Optional[str] = None,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    query = select(ConfigAlertaStock)
    if sku:
        query = query.where(ConfigAlertaStock.sku == sku)
    result = await db.execute(query)
    return [
        {
            "id": r.id,
            "sku": r.sku,
            "stock_minimo": r.stock_minimo,
            "stock_maximo": r.stock_maximo,
            "dias_rotacion": r.dias_rotacion,
            "activa": r.activa,
            "notificar_a": r.notificar_a,
        }
        for r in result.scalars().all()
    ]


@router.put("/config/{config_id}", response_model=dict)
async def actualizar_config_alerta(
    config_id: int,
    data: dict,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    result = await db.execute(select(ConfigAlertaStock).where(ConfigAlertaStock.id == config_id))
    cfg = result.scalar_one_or_none()
    if not cfg:
        raise HTTPException(status_code=404, detail="Config no encontrada")
    for k, v in data.items():
        if hasattr(cfg, k):
            setattr(cfg, k, v)
    await db.commit()
    return {"message": "Actualizado"}


@router.delete("/config/{config_id}")
async def eliminar_config_alerta(
    config_id: int,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    result = await db.execute(select(ConfigAlertaStock).where(ConfigAlertaStock.id == config_id))
    cfg = result.scalar_one_or_none()
    if not cfg:
        raise HTTPException(status_code=404, detail="Config no encontrada")
    await db.delete(cfg)
    await db.commit()
    return {"message": "Eliminado"}


@router.get("/evaluar")
async def evaluar_alertas(
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)
    alertas = []
    now = datetime.utcnow()
    hace_30 = now - timedelta(days=30)

    # Stock minimo
    configs = (await db.execute(select(ConfigAlertaStock).where(ConfigAlertaStock.activa == True))).scalars().all()
    for cfg in configs:
        stock_res = await db.execute(
            select(func.sum(LoteInventario.cantidad_actual)).where(
                and_(LoteInventario.sku_producto == cfg.sku, LoteInventario.estado_calidad == "Aprobado")
            )
        )
        stock = stock_res.scalar() or 0
        if stock < cfg.stock_minimo:
            alertas.append({
                "tipo": "STOCK_MINIMO",
                "sku": cfg.sku,
                "stock_actual": stock,
                "stock_minimo": cfg.stock_minimo,
            })

    # Lotes sin movimiento 30d (simplificado: fecha_recepcion < hace_30)
    if True:
        lote_res = await db.execute(
            select(LoteInventario).where(
                and_(
                    LoteInventario.cantidad_actual > 0,
                    LoteInventario.estado_calidad == "Aprobado",
                    LoteInventario.fecha_recepcion < hace_30,
                )
            ).limit(50)
        )
        for lote in lote_res.scalars().all():
            alertas.append({
                "tipo": "SIN_MOVIMIENTO_30D",
                "lote_id": lote.lote_id,
                "sku": lote.sku_producto,
                "cantidad": lote.cantidad_actual,
            })

    # Lotes en cuarentena > 3 dias
    hace_3 = now - timedelta(days=3)
    cuarentena_res = await db.execute(
        select(LoteInventario).where(
            and_(
                LoteInventario.estado_calidad == "Pendiente IQC",
                LoteInventario.fecha_recepcion < hace_3,
            )
        ).limit(50)
    )
    for lote in cuarentena_res.scalars().all():
        alertas.append({
            "tipo": "CUARENTENA_BLOQUEADA",
            "lote_id": lote.lote_id,
            "sku": lote.sku_producto,
        })

    return {"alertas": alertas, "total": len(alertas)}
