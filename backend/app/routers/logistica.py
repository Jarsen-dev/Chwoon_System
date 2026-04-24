from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, delete
from typing import Optional
from datetime import datetime, timedelta, timezone, time

from app.core.deps import get_db, get_current_user, get_current_admin
from app.models.usuario import Usuario, RolUsuario
from app.models.embarque import Embarque
from app.models.lote_inventario import LoteInventario, MovimientoLote
from app.models.producto import Producto
from app.models.orden_venta import OrdenVenta, OrdenVentaItem
from app.schemas.logistica import (
    CrearEmbarqueRequest,
    SalidaEmbarqueRequest,
    EmbarqueResponse,
    ReporteEmbarqueItem,
    LogisticaDashboard,
)

router = APIRouter(prefix="/logistica", tags=["logistica"])

TZ_LOCAL = timezone(timedelta(hours=-6))


def ahora_local():
    return datetime.now(TZ_LOCAL)


def ahora_naive():
    """Retorna datetime local SIN timezone para columnas TIMESTAMP WITHOUT TZ."""
    return datetime.now(TZ_LOCAL).replace(tzinfo=None)


def require_logistica_role(user: Usuario):
    if user.rol not in [RolUsuario.admin, RolUsuario.logistica]:
        raise HTTPException(status_code=403, detail="Se requiere rol administrador o logística")


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


# ============================================================
# DASHBOARD
# ============================================================
@router.get("/dashboard", response_model=LogisticaDashboard)
@router.get("/dashboard/", response_model=LogisticaDashboard)
async def dashboard_logistica(
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_logistica_role(user)

    now = ahora_local()
    today_start = datetime.combine(now.date(), time.min).replace(tzinfo=TZ_LOCAL)

    # Total embarques
    total = (await db.execute(select(func.count(Embarque.id)))).scalar() or 0

    # Por status
    surtidos = (await db.execute(
        select(func.count(Embarque.id)).where(Embarque.status == "Surtido")
    )).scalar() or 0

    en_transito = (await db.execute(
        select(func.count(Embarque.id)).where(Embarque.status == "En Tránsito")
    )).scalar() or 0

    entregados = (await db.execute(
        select(func.count(Embarque.id)).where(Embarque.status == "Entregado")
    )).scalar() or 0

    # Embarques creados hoy
    embarques_hoy = (await db.execute(
        select(func.count(Embarque.id)).where(Embarque.fecha_creacion >= today_start)
    )).scalar() or 0

    # Entregas hoy (status Entregado y creado hoy — aproximación)
    entregas_hoy = (await db.execute(
        select(func.count(Embarque.id)).where(
            and_(
                Embarque.status == "Entregado",
                Embarque.fecha_creacion >= today_start,
            )
        )
    )).scalar() or 0

    return LogisticaDashboard(
        total_embarques=total,
        embarques_surtidos=surtidos,
        embarques_en_transito=en_transito,
        embarques_entregados=entregados,
        embarques_hoy=embarques_hoy,
        entregas_hoy=entregas_hoy,
    )


# ============================================================
# EMBARQUES
# ============================================================
@router.get("/embarques", response_model=list[EmbarqueResponse])
@router.get("/embarques/", response_model=list[EmbarqueResponse])
async def listar_embarques(
    status: Optional[str] = None,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_logistica_role(user)
    query = select(Embarque)
    if status:
        query = query.where(Embarque.status == status)
    result = await db.execute(query.order_by(Embarque.fecha_creacion.desc()))
    embarques = result.scalars().all()

    prod_map = await _get_producto_map(db)
    items = []
    for e in embarques:
        sku = None
        nombre_prod = None
        if e.items and len(e.items) > 0:
            sku = e.items[0].get("sku")
            if sku:
                prod = prod_map.get(sku)
                nombre_prod = prod.nombre if prod else "N/A"

        items.append(EmbarqueResponse(
            id=e.id,
            numero_embarque=e.numero_embarque,
            ov_id=e.ov_id,
            cliente_id=e.cliente_id,
            fecha_creacion=e.fecha_creacion,
            status=e.status,
            items=e.items or [],
            camion=e.camion,
            chofer=e.chofer,
            departure=e.departure,
            sku=sku,
            nombre_producto=nombre_prod,
            creado_por=e.creado_por,
        ))
    return items


@router.post("/embarques")
@router.post("/embarques/")
async def crear_embarque(
    data: CrearEmbarqueRequest,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_logistica_role(user)

    # Verificar OV
    ov_result = await db.execute(select(OrdenVenta).where(OrdenVenta.ov_id == data.ov_id))
    ov = ov_result.scalar_one_or_none()
    if not ov:
        raise HTTPException(status_code=404, detail="Orden de venta no encontrada.")

    # Generar número
    now = ahora_local()
    today_start = datetime.combine(now.date(), time.min).replace(tzinfo=TZ_LOCAL)
    count = (await db.execute(
        select(func.count(Embarque.id)).where(Embarque.fecha_creacion >= today_start)
    )).scalar() or 0
    numero = f"CW{now.strftime('%d%m%y')}-{count + 1}"

    # Consumir lotes
    for item in data.items:
        lote_result = await db.execute(
            select(LoteInventario).where(LoteInventario.lote_id == item.lote_id)
        )
        lote = lote_result.scalar_one_or_none()
        if not lote:
            raise HTTPException(status_code=404, detail=f"Lote {item.lote_id} no encontrado.")
        if item.cantidad > lote.cantidad_actual:
            raise HTTPException(
                status_code=400,
                detail=f"Lote {item.lote_id}: solo hay {lote.cantidad_actual} disponible.",
            )
        lote.cantidad_actual -= item.cantidad
        await _registrar_movimiento(db, item.lote_id, "CONSUMO_EMBARQUE", -item.cantidad, {
            "ov_id": data.ov_id,
            "embarque_id": numero,
        })

    emb = Embarque(
        numero_embarque=numero,
        ov_id=data.ov_id,
        cliente_id=ov.cliente_id,
        fecha_creacion=now,
        status="Surtido",
        items=[{"lote_id": i.lote_id, "sku": i.sku, "cantidad": i.cantidad} for i in data.items],
        creado_por=user.username,
    )
    db.add(emb)
    await db.commit()

    return {"message": "Embarque creado", "numero_embarque": numero}


@router.put("/embarques/{numero}/salida")
@router.put("/embarques/{numero}/salida/")
async def registrar_salida(
    numero: str,
    data: SalidaEmbarqueRequest,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_logistica_role(user)
    result = await db.execute(select(Embarque).where(Embarque.numero_embarque == numero))
    emb = result.scalar_one_or_none()
    if not emb:
        raise HTTPException(status_code=404, detail="Embarque no encontrado.")
    if emb.status != "Surtido":
        raise HTTPException(status_code=400, detail="Solo embarques 'Surtido' pueden registrar salida.")

    emb.status = "En Tránsito"
    emb.camion = data.camion
    emb.chofer = data.chofer
    emb.departure = data.departure
    await db.commit()
    return {"message": "Salida registrada"}


@router.put("/embarques/{numero}/confirmar-entrega")
@router.put("/embarques/{numero}/confirmar-entrega/")
async def confirmar_entrega(
    numero: str,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_logistica_role(user)
    result = await db.execute(select(Embarque).where(Embarque.numero_embarque == numero))
    emb = result.scalar_one_or_none()
    if not emb:
        raise HTTPException(status_code=404, detail="Embarque no encontrado.")
    if emb.status != "En Tránsito":
        raise HTTPException(status_code=400, detail="Solo embarques 'En Tránsito' pueden confirmar entrega.")

    emb.status = "Entregado"
    await db.commit()
    return {"message": "Entrega confirmada"}


# ============================================================
# REPORTE EMBARQUES
# ============================================================
@router.get("/reporte-embarques", response_model=list[ReporteEmbarqueItem])
@router.get("/reporte-embarques/", response_model=list[ReporteEmbarqueItem])
async def reporte_embarques(
    fecha: str = Query(..., description="Fecha YYYY-MM-DD"),
    clase: Optional[str] = None,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_logistica_role(user)

    try:
        fecha_dt = datetime.strptime(fecha, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")

    start_day = datetime.combine(fecha_dt, time.min).replace(tzinfo=TZ_LOCAL)
    end_day = datetime.combine(fecha_dt, time.max).replace(tzinfo=TZ_LOCAL)

    # OVs creadas en esa fecha
    ov_result = await db.execute(
        select(OrdenVenta).where(
            and_(
                OrdenVenta.fecha_creacion >= start_day,
                OrdenVenta.fecha_creacion <= end_day,
            )
        )
    )
    ordenes_del_dia = ov_result.scalars().all()

    prod_map = await _get_producto_map(db)

    # Filtrar por clase si se especifica
    if clase and clase != "TODAS LAS CLASES":
        skus_filtrados = {
            sku for sku, p in prod_map.items()
            if (p.clase_producto or "").upper() == clase
        }
        ordenes_filtradas = []
        for ov in ordenes_del_dia:
            items_res = await db.execute(
                select(OrdenVentaItem).where(
                    and_(
                        OrdenVentaItem.ov_db_id == ov.id,
                        OrdenVentaItem.sku_producto.in_(skus_filtrados),
                    )
                )
            )
            items_f = items_res.scalars().all()
            if items_f:
                ordenes_filtradas.append((ov, items_f))
    else:
        ordenes_filtradas = []
        for ov in ordenes_del_dia:
            items_res = await db.execute(
                select(OrdenVentaItem).where(OrdenVentaItem.ov_db_id == ov.id)
            )
            ordenes_filtradas.append((ov, items_res.scalars().all()))

    # Todos los embarques
    emb_result = await db.execute(select(Embarque))
    todos_embarques = emb_result.scalars().all()

    reporte = []
    for ov, items_ov in ordenes_filtradas:
        embarques_ov = [e for e in todos_embarques if e.ov_id == ov.ov_id]

        # Total embarcado histórico
        total_embarcado_historico = sum(
            item.get("cantidad", 0)
            for e in embarques_ov
            for item in (e.items or [])
        )

        # Embarques del día del reporte (por departure)
        embarques_del_dia = []
        for e in embarques_ov:
            if e.departure:
                try:
                    dep_date = datetime.strptime(e.departure.split(" ")[0], "%Y-%m-%d").date()
                    if dep_date == fecha_dt:
                        embarques_del_dia.append(e)
                except (ValueError, TypeError):
                    continue

        embarques_por_hora = {h: 0 for h in range(7, 20)}
        for e in embarques_del_dia:
            try:
                dep_time = datetime.strptime(e.departure, "%Y-%m-%d %H:%M")
                hour = dep_time.hour
                if 7 <= hour < 20:
                    embarques_por_hora[hour] += sum(
                        item.get("cantidad", 0) for item in (e.items or [])
                    )
            except (ValueError, TypeError):
                continue

        for item_ov in items_ov:
            sku = item_ov.sku_producto
            solicitado = item_ov.cantidad

            enviado_total = sum(
                item_emb.get("cantidad", 0)
                for e in embarques_ov
                for item_emb in (e.items or [])
                if item_emb.get("sku") == sku
            )

            diferencia = solicitado - enviado_total
            porcentaje = (enviado_total / solicitado * 100) if solicitado > 0 else 0

            reporte.append(ReporteEmbarqueItem(
                item_id=f"{ov.ov_id}_{sku}",
                sku=sku,
                cantidad_solicitada=solicitado,
                cantidad_enviada=enviado_total,
                diferencia=diferencia,
                porcentaje_en_transito=f"{porcentaje:.1f}%",
                total_embarcado_dia=sum(embarques_por_hora.values()),
                embarques_por_hora={str(k): v for k, v in embarques_por_hora.items()},
            ))

    return reporte


# ============================================================
# LIMPIEZA (solo admin)
# ============================================================
@router.post("/limpiar/embarques-entregados")
@router.post("/limpiar/embarques-entregados/")
async def limpiar_embarques_entregados(
    dias: int = Query(default=30, ge=1),
    user: Usuario = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    limite = ahora_naive() - timedelta(days=dias)
    result = await db.execute(
        delete(Embarque).where(
            and_(
                Embarque.status == "Entregado",
                Embarque.fecha_creacion < limite,
            )
        )
    )
    await db.commit()
    return {"message": f"Embarques entregados > {dias} días eliminados", "eliminados": result.rowcount}