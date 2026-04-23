import os
import io
import qrcode
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, and_, extract
from typing import Optional
from datetime import datetime, timezone, timedelta, date
from fastapi.responses import StreamingResponse
from reportlab.pdfgen import canvas as pdf_canvas
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader

from app.core.deps import get_db
from app.core.deps import get_current_user
from app.models.orden_compra import OrdenCompra, OrdenCompraItem, RecepcionCompra
from app.models.orden_venta import OrdenVenta, OrdenVentaItem, EnvioVenta
from app.models.devolucion import Devolucion
from app.models.plan_ventas import PlanVentas
from app.schemas.finanzas import (
    OrdenCompraCreate, OrdenCompraUpdate, OrdenCompraResponse,
    RecepcionCompraCreate, RecepcionCompraResponse,
    OrdenVentaCreate, OrdenVentaUpdate, OrdenVentaResponse,
    EnvioVentaCreate,
    DevolucionCreate, DevolucionResponse, DisposicionDevolucionCreate,
    PlanVentasImport, PlanVentasResponse, AutorizarVentasMasivo,
    FinanzasDashboardResponse,
    AprobarOrdenCompraRequest,
)

TZ_LOCAL = timezone(timedelta(hours=-6))

router = APIRouter(prefix="/finanzas", tags=["Finanzas"])


# ========================
# HELPERS
# ========================
def ahora_local():
    return datetime.now(TZ_LOCAL)


def require_finanzas_role(current_user):
    """Solo admin y finanzas pueden acceder."""
    if current_user.rol not in ("admin", "finanzas"):
        raise HTTPException(status_code=403, detail="Acceso denegado. Se requiere rol admin o finanzas.")
    return current_user


# ========================
# DASHBOARD
# ========================
@router.get("/dashboard", response_model=FinanzasDashboardResponse)
@router.get("/dashboard/", response_model=FinanzasDashboardResponse)
async def get_finanzas_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_finanzas_role(current_user)

    ahora = ahora_local()
    primer_dia_mes = ahora.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    total_oc = (await db.execute(select(func.count(OrdenCompra.id)))).scalar() or 0
    oc_pendientes = (await db.execute(
        select(func.count(OrdenCompra.id)).where(OrdenCompra.status.in_(["Creada", "Parcial"]))
    )).scalar() or 0
    oc_completadas = (await db.execute(
        select(func.count(OrdenCompra.id)).where(OrdenCompra.status == "Completada")
    )).scalar() or 0

    total_ov = (await db.execute(select(func.count(OrdenVenta.id)))).scalar() or 0
    ov_pendientes = (await db.execute(
        select(func.count(OrdenVenta.id)).where(OrdenVenta.estado == "Pendiente de Envío")
    )).scalar() or 0
    ov_enviadas = (await db.execute(
        select(func.count(OrdenVenta.id)).where(OrdenVenta.estado == "Enviado")
    )).scalar() or 0
    ov_stock_insuficiente = (await db.execute(
        select(func.count(OrdenVenta.id)).where(OrdenVenta.estado == "Stock Insuficiente")
    )).scalar() or 0

    total_devoluciones = (await db.execute(select(func.count(Devolucion.id)))).scalar() or 0
    devoluciones_pendientes = (await db.execute(
        select(func.count(Devolucion.id)).where(Devolucion.estado_inspeccion == "Pendiente")
    )).scalar() or 0

    valor_compras_result = await db.execute(
        select(func.sum(OrdenCompraItem.cantidad_requerida * OrdenCompraItem.precio_unitario))
        .join(OrdenCompra, OrdenCompraItem.orden_compra_id == OrdenCompra.id)
        .where(OrdenCompra.fecha_creacion >= primer_dia_mes)
    )
    valor_compras_mes = valor_compras_result.scalar() or 0

    valor_ventas_result = await db.execute(
        select(func.sum(OrdenVentaItem.cantidad * OrdenVentaItem.precio_unitario))
        .join(OrdenVenta, OrdenVentaItem.orden_venta_id == OrdenVenta.id)
        .where(OrdenVenta.fecha_creacion >= primer_dia_mes)
    )
    valor_ventas_mes = valor_ventas_result.scalar() or 0

    planes_activos = (await db.execute(select(func.count(PlanVentas.id)))).scalar() or 0

    return FinanzasDashboardResponse(
        total_oc=total_oc,
        oc_pendientes=oc_pendientes,
        oc_completadas=oc_completadas,
        total_ov=total_ov,
        ov_pendientes=ov_pendientes,
        ov_enviadas=ov_enviadas,
        ov_stock_insuficiente=ov_stock_insuficiente,
        total_devoluciones=total_devoluciones,
        devoluciones_pendientes=devoluciones_pendientes,
        valor_compras_mes=round(valor_compras_mes, 2),
        valor_ventas_mes=round(valor_ventas_mes, 2),
        planes_venta_activos=planes_activos,
    )


# ========================
# ÓRDENES DE COMPRA — CRUD
# ========================
@router.get("/compras")
@router.get("/compras/")
async def listar_ordenes_compra(
    status: Optional[str] = None,
    limite: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_finanzas_role(current_user)

    query = select(OrdenCompra).order_by(OrdenCompra.fecha_creacion.desc()).limit(limite)
    if status:
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
                    "precio_unitario": item.precio_unitario,
                    "moneda": item.moneda,
                }
                for item in items
            ],
        })

    return response


@router.post("/compras")
@router.post("/compras/")
async def crear_orden_compra(
    data: OrdenCompraCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_finanzas_role(current_user)

    ahora = ahora_local()
    oc_id = f"OC-{ahora.strftime('%Y%m%d%H%M%S')}"

    orden = OrdenCompra(
        oc_id=oc_id,
        id_proveedor=data.id_proveedor,
        nombre_proveedor=data.nombre_proveedor,
        status="Creada",
        origen="FINANZAS",
        notas=data.notas,
        creado_por=current_user.username,
    )
    db.add(orden)
    await db.flush()

    for item_data in data.items:
        item = OrdenCompraItem(
            orden_compra_id=orden.id,
            sku_producto=item_data.sku_producto,
            nombre_producto=item_data.nombre_producto,
            cantidad_requerida=item_data.cantidad_requerida,
            cantidad_recibida=0,
            precio_unitario=item_data.precio_unitario,
            moneda=item_data.moneda,
        )
        db.add(item)

    await db.commit()
    return {"message": f"Orden de compra {oc_id} creada", "oc_id": oc_id, "id": orden.id}


@router.post("/compras/{oc_id}/aprobar")
@router.post("/compras/{oc_id}/aprobar/")
async def aprobar_orden_compra(
    oc_id: str,
    data: AprobarOrdenCompraRequest = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Aprueba una OC generada desde Producción: aplica ediciones y cambia status a 'Creada'."""
    require_finanzas_role(current_user)

    result = await db.execute(select(OrdenCompra).where(OrdenCompra.oc_id == oc_id))
    orden = result.scalar_one_or_none()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada")

    if orden.status != "Pendiente Aprobación":
        raise HTTPException(
            status_code=400,
            detail=f"Solo se pueden aprobar órdenes en 'Pendiente Aprobación'. Status actual: {orden.status}"
        )

    if data:
        if data.id_proveedor is not None:
            orden.id_proveedor = data.id_proveedor
        if data.nombre_proveedor is not None:
            orden.nombre_proveedor = data.nombre_proveedor
        if data.notas is not None:
            orden.notas = data.notas

        if data.items is not None:
            await db.execute(
                delete(OrdenCompraItem).where(OrdenCompraItem.orden_compra_id == orden.id)
            )
            for item_data in data.items:
                item = OrdenCompraItem(
                    orden_compra_id=orden.id,
                    sku_producto=item_data.sku_producto,
                    nombre_producto=item_data.nombre_producto,
                    cantidad_requerida=item_data.cantidad_requerida,
                    cantidad_recibida=0,
                    precio_unitario=item_data.precio_unitario,
                    moneda=item_data.moneda,
                )
                db.add(item)

    orden.status = "Creada"
    orden.aprobado_por = current_user.username
    await db.commit()

    return {"message": f"Orden {oc_id} aprobada exitosamente. Status: Creada"}


@router.get("/compras/{oc_id}")
@router.get("/compras/{oc_id}/")
async def obtener_orden_compra(
    oc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_finanzas_role(current_user)

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
                "precio_unitario": i.precio_unitario,
                "moneda": i.moneda,
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


@router.get("/compras/{oc_id}/pdf")
@router.get("/compras/{oc_id}/pdf/")
async def generar_pdf_orden_compra(
    oc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Genera PDF estilo original: Logo, QR, info básica, productos, valor total."""
    require_finanzas_role(current_user)

    result = await db.execute(select(OrdenCompra).where(OrdenCompra.oc_id == oc_id))
    orden = result.scalar_one_or_none()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada")

    items_result = await db.execute(
        select(OrdenCompraItem).where(OrdenCompraItem.orden_compra_id == orden.id)
    )
    items = items_result.scalars().all()

    buffer = io.BytesIO()
    c = pdf_canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    logo_path = os.path.join("static", "Logo.png")
    if os.path.exists(logo_path):
        c.drawImage(
            logo_path, inch, height - 1.5 * inch,
            width=1.5 * inch, height=0.75 * inch,
            preserveAspectRatio=True, mask="auto",
        )

    qr_img = qrcode.make(oc_id)
    qr_buffer = io.BytesIO()
    qr_img.save(qr_buffer, format="PNG")
    qr_buffer.seek(0)
    c.drawImage(
        ImageReader(qr_buffer),
        width - 1.75 * inch, height - 1.5 * inch,
        width=1.2 * inch, height=1.2 * inch,
    )

    c.setFont("Helvetica-Bold", 18)
    c.drawString(inch, height - 2.25 * inch, f"Orden de Compra: {oc_id}")

    c.setFont("Helvetica", 12)
    y = height - 2.6 * inch
    fecha_str = orden.fecha_creacion.strftime("%Y-%m-%d") if orden.fecha_creacion else "N/A"
    c.drawString(inch, y, f"Fecha de Creación: {fecha_str}")
    y -= 0.25 * inch
    c.drawString(inch, y, f"Proveedor: {orden.nombre_proveedor}")
    y -= 0.25 * inch
    c.drawString(inch, y, f"Estado: {orden.status}")

    y -= 0.7 * inch
    c.setFont("Helvetica-Bold", 14)
    c.drawString(inch, y, "Productos Solicitados")
    y -= 0.3 * inch

    for item in items:
        c.setStrokeColorRGB(0.8, 0.8, 0.8)
        c.line(inch, y, width - inch, y)
        y -= 0.25 * inch

        c.setFont("Helvetica-Bold", 11)
        c.drawString(inch, y, f"SKU: {item.sku_producto}")
        y -= 0.2 * inch

        c.setFont("Helvetica", 11)
        c.drawString(inch + 0.2 * inch, y, f"Nombre: {item.nombre_producto}")
        y -= 0.2 * inch
        c.drawString(inch + 0.2 * inch, y, f"Cantidad Requerida: {item.cantidad_requerida}")
        y -= 0.2 * inch
        c.drawString(inch + 0.2 * inch, y, f"Cantidad Recibida: {item.cantidad_recibida}")
        y -= 0.2 * inch
        c.drawString(inch + 0.2 * inch, y, f"Precio Unitario: ${item.precio_unitario:,.2f} {item.moneda}")
        y -= 0.4 * inch

        if y < inch:
            c.showPage()
            c.setFont("Helvetica-Bold", 12)
            c.drawString(inch, height - inch, f"Orden de Compra: {oc_id} (Continuación)")
            y = height - 1.5 * inch
            c.setFont("Helvetica", 11)

    valor_total = sum(i.cantidad_requerida * i.precio_unitario for i in items)
    y -= 0.2 * inch
    c.setStrokeColorRGB(0.3, 0.3, 0.3)
    c.line(inch, y, width - inch, y)
    y -= 0.3 * inch
    c.setFont("Helvetica-Bold", 12)
    c.drawString(inch, y, f"Valor Total: ${valor_total:,.2f} MXN")

    c.save()
    buffer.seek(0)

    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={oc_id}.pdf"},
    )


@router.put("/compras/{oc_id}")
@router.put("/compras/{oc_id}/")
async def actualizar_orden_compra(
    oc_id: str,
    data: OrdenCompraUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_finanzas_role(current_user)

    result = await db.execute(select(OrdenCompra).where(OrdenCompra.oc_id == oc_id))
    orden = result.scalar_one_or_none()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada")

    if data.nombre_proveedor is not None:
        orden.nombre_proveedor = data.nombre_proveedor
    if data.status is not None:
        orden.status = data.status
    if data.notas is not None:
        orden.notas = data.notas

    if data.items is not None:
        await db.execute(
            delete(OrdenCompraItem).where(OrdenCompraItem.orden_compra_id == orden.id)
        )
        for item_data in data.items:
            item = OrdenCompraItem(
                orden_compra_id=orden.id,
                sku_producto=item_data.sku_producto,
                nombre_producto=item_data.nombre_producto,
                cantidad_requerida=item_data.cantidad_requerida,
                cantidad_recibida=0,
                precio_unitario=item_data.precio_unitario,
                moneda=item_data.moneda,
            )
            db.add(item)

    await db.commit()
    return {"message": f"Orden {oc_id} actualizada"}


@router.delete("/compras/{oc_id}")
@router.delete("/compras/{oc_id}/")
async def eliminar_orden_compra(
    oc_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_finanzas_role(current_user)

    result = await db.execute(select(OrdenCompra).where(OrdenCompra.oc_id == oc_id))
    orden = result.scalar_one_or_none()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de compra no encontrada")

    rec_count = (await db.execute(
        select(func.count(RecepcionCompra.id)).where(RecepcionCompra.orden_compra_id == orden.id)
    )).scalar() or 0

    if rec_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"No se puede eliminar. La OC {oc_id} ya tiene {rec_count} recepciones registradas."
        )

    await db.delete(orden)
    await db.commit()
    return {"message": f"Orden {oc_id} eliminada"}


@router.get("/recepciones")
@router.get("/recepciones/")
async def listar_recepciones(
    limite: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_finanzas_role(current_user)

    result = await db.execute(
        select(RecepcionCompra).order_by(RecepcionCompra.fecha_recepcion.desc()).limit(limite)
    )
    recepciones = result.scalars().all()

    return [
        {
            "id": r.id,
            "recepcion_id": r.recepcion_id,
            "oc_id": r.oc_id,
            "sku_producto": r.sku_producto,
            "cantidad_recibida": r.cantidad_recibida,
            "fecha_recepcion": r.fecha_recepcion.isoformat() if r.fecha_recepcion else None,
            "recibido_por": r.recibido_por,
            "notas": r.notas,
        }
        for r in recepciones
    ]


# ========================
# ÓRDENES DE VENTA — CRUD
# ========================
@router.get("/ventas")
@router.get("/ventas/")
async def listar_ordenes_venta(
    estado: Optional[str] = None,
    limite: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_finanzas_role(current_user)

    query = select(OrdenVenta).order_by(OrdenVenta.fecha_creacion.desc()).limit(limite)
    if estado and estado != "Todos":
        query = query.where(OrdenVenta.estado == estado)

    result = await db.execute(query)
    ordenes = result.scalars().unique().all()

    response = []
    for orden in ordenes:
        items_result = await db.execute(
            select(OrdenVentaItem).where(OrdenVentaItem.orden_venta_id == orden.id)
        )
        items = items_result.scalars().all()

        total_items = len(items)
        valor_total = sum((i.cantidad * i.precio_unitario) for i in items)

        response.append({
            "id": orden.id,
            "ov_id": orden.ov_id,
            "cliente_id": orden.cliente_id,
            "nombre_cliente": orden.nombre_cliente,
            "estado": orden.estado,
            "fecha_creacion": orden.fecha_creacion.isoformat() if orden.fecha_creacion else None,
            "fecha_actualizacion": orden.fecha_actualizacion.isoformat() if orden.fecha_actualizacion else None,
            "notas": orden.notas,
            "creado_por": orden.creado_por,
            "total_items": total_items,
            "valor_total": round(valor_total, 2),
            "items": [
                {
                    "id": i.id,
                    "sku_producto": i.sku_producto,
                    "nombre_producto": i.nombre_producto,
                    "cantidad": i.cantidad,
                    "cantidad_enviada": i.cantidad_enviada,
                    "precio_unitario": i.precio_unitario,
                    "moneda": i.moneda,
                }
                for i in items
            ],
        })

    return response


@router.post("/ventas")
@router.post("/ventas/")
async def crear_orden_venta(
    data: OrdenVentaCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_finanzas_role(current_user)

    ahora = ahora_local()
    ov_id = f"OV-{ahora.strftime('%Y%m%d%H%M%S')}"

    orden = OrdenVenta(
        ov_id=ov_id,
        cliente_id=data.cliente_id,
        nombre_cliente=data.nombre_cliente,
        estado="Pendiente de Envío",
        notas=data.notas,
        creado_por=current_user.username,
    )
    db.add(orden)
    await db.flush()

    for item_data in data.items:
        item = OrdenVentaItem(
            orden_venta_id=orden.id,
            sku_producto=item_data.sku_producto,
            nombre_producto=item_data.nombre_producto,
            cantidad=item_data.cantidad,
            cantidad_enviada=0,
            precio_unitario=item_data.precio_unitario,
            moneda=item_data.moneda,
        )
        db.add(item)

    await db.commit()
    return {"message": f"Orden de venta {ov_id} creada", "ov_id": ov_id, "id": orden.id}


@router.get("/ventas/{ov_id}")
@router.get("/ventas/{ov_id}/")
async def obtener_orden_venta(
    ov_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_finanzas_role(current_user)

    result = await db.execute(select(OrdenVenta).where(OrdenVenta.ov_id == ov_id))
    orden = result.scalar_one_or_none()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de venta no encontrada")

    items_result = await db.execute(
        select(OrdenVentaItem).where(OrdenVentaItem.orden_venta_id == orden.id)
    )
    items = items_result.scalars().all()

    envios_result = await db.execute(
        select(EnvioVenta).where(EnvioVenta.orden_venta_id == orden.id)
        .order_by(EnvioVenta.fecha_envio.desc())
    )
    envios = envios_result.scalars().all()

    return {
        "id": orden.id,
        "ov_id": orden.ov_id,
        "cliente_id": orden.cliente_id,
        "nombre_cliente": orden.nombre_cliente,
        "estado": orden.estado,
        "fecha_creacion": orden.fecha_creacion.isoformat() if orden.fecha_creacion else None,
        "notas": orden.notas,
        "creado_por": orden.creado_por,
        "items": [
            {
                "id": i.id,
                "sku_producto": i.sku_producto,
                "nombre_producto": i.nombre_producto,
                "cantidad": i.cantidad,
                "cantidad_enviada": i.cantidad_enviada,
                "precio_unitario": i.precio_unitario,
                "moneda": i.moneda,
            }
            for i in items
        ],
        "envios": [
            {
                "id": e.id,
                "envio_id": e.envio_id,
                "fecha_envio": e.fecha_envio.isoformat() if e.fecha_envio else None,
                "autorizado_por": e.autorizado_por,
                "items_enviados": e.items_enviados,
                "notas": e.notas,
            }
            for e in envios
        ],
    }


@router.put("/ventas/{ov_id}")
@router.put("/ventas/{ov_id}/")
async def actualizar_orden_venta(
    ov_id: str,
    data: OrdenVentaUpdate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_finanzas_role(current_user)

    result = await db.execute(select(OrdenVenta).where(OrdenVenta.ov_id == ov_id))
    orden = result.scalar_one_or_none()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden de venta no encontrada")

    if data.nombre_cliente is not None:
        orden.nombre_cliente = data.nombre_cliente
    if data.estado is not None:
        orden.estado = data.estado
    if data.notas is not None:
        orden.notas = data.notas

    await db.commit()
    return {"message": f"Orden {ov_id} actualizada"}


@router.post("/ventas/{ov_id}/enviar")
@router.post("/ventas/{ov_id}/enviar/")
async def enviar_orden_venta(
    ov_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_finanzas_role(current_user)

    result = await db.execute(select(OrdenVenta).where(OrdenVenta.ov_id == ov_id))
    orden = result.scalar_one_or_none()
    if not orden:
        raise HTTPException(status_code=404, detail="Orden no encontrada")

    if orden.estado not in ("Pendiente de Envío",):
        raise HTTPException(status_code=400, detail=f"No se puede enviar. Estado actual: {orden.estado}")

    items_result = await db.execute(
        select(OrdenVentaItem).where(OrdenVentaItem.orden_venta_id == orden.id)
    )
    items = items_result.scalars().all()

    ahora = ahora_local()
    envio_id = f"ENV-{ahora.strftime('%Y%m%d%H%M%S')}"

    items_enviados = [{"sku_producto": i.sku_producto, "cantidad": i.cantidad} for i in items]

    envio = EnvioVenta(
        envio_id=envio_id,
        orden_venta_id=orden.id,
        ov_id=ov_id,
        autorizado_por=current_user.username,
        items_enviados=items_enviados,
    )
    db.add(envio)

    for item in items:
        item.cantidad_enviada = item.cantidad

    orden.estado = "Enviado"

    await db.commit()
    return {"message": f"Orden {ov_id} enviada", "envio_id": envio_id}


# ========================
# DEVOLUCIONES
# ========================
@router.get("/devoluciones")
@router.get("/devoluciones/")
async def listar_devoluciones(
    estado: Optional[str] = None,
    limite: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_finanzas_role(current_user)

    query = select(Devolucion).order_by(Devolucion.fecha_devolucion.desc()).limit(limite)
    if estado:
        query = query.where(Devolucion.estado_inspeccion == estado)

    result = await db.execute(query)
    devoluciones = result.scalars().all()

    return [
        {
            "id": d.id,
            "devolucion_id": d.devolucion_id,
            "ov_id": d.ov_id,
            "sku_producto": d.sku_producto,
            "nombre_producto": d.nombre_producto,
            "cantidad_devuelta": d.cantidad_devuelta,
            "motivo": d.motivo,
            "lote_produccion_origen": d.lote_produccion_origen,
            "fecha_devolucion": d.fecha_devolucion.isoformat() if d.fecha_devolucion else None,
            "estado_inspeccion": d.estado_inspeccion,
            "disposicion_final": d.disposicion_final,
            "cantidad_scrap": d.cantidad_scrap,
            "cantidad_retrabajo": d.cantidad_retrabajo,
            "procesado_por": d.procesado_por,
            "creado_por": d.creado_por,
        }
        for d in devoluciones
    ]


@router.post("/devoluciones")
@router.post("/devoluciones/")
async def registrar_devolucion(
    data: DevolucionCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_finanzas_role(current_user)

    ahora = ahora_local()
    fecha_str = ahora.strftime("%d%m%y%H%M")
    sku_suffix = data.sku_producto[-4:].upper()
    devolucion_id = f"DV{fecha_str}{sku_suffix}"

    devolucion = Devolucion(
        devolucion_id=devolucion_id,
        ov_id=data.ov_id,
        sku_producto=data.sku_producto,
        nombre_producto=data.nombre_producto,
        cantidad_devuelta=data.cantidad_devuelta,
        motivo=data.motivo,
        lote_produccion_origen=data.lote_produccion_origen,
        estado_inspeccion="Pendiente",
        creado_por=current_user.username,
    )
    db.add(devolucion)
    await db.commit()

    return {"message": f"Devolución {devolucion_id} registrada", "devolucion_id": devolucion_id}


@router.put("/devoluciones/{devolucion_id}/disposicion")
@router.put("/devoluciones/{devolucion_id}/disposicion/")
async def procesar_disposicion(
    devolucion_id: str,
    data: DisposicionDevolucionCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_finanzas_role(current_user)

    result = await db.execute(
        select(Devolucion).where(Devolucion.devolucion_id == devolucion_id)
    )
    devolucion = result.scalar_one_or_none()
    if not devolucion:
        raise HTTPException(status_code=404, detail="Devolución no encontrada")

    if devolucion.estado_inspeccion == "Finalizado":
        raise HTTPException(status_code=400, detail="Esta devolución ya fue procesada")

    total_disposicion = data.cantidad_scrap + data.cantidad_retrabajo
    if total_disposicion > devolucion.cantidad_devuelta:
        raise HTTPException(
            status_code=400,
            detail=f"La suma scrap+retrabajo ({total_disposicion}) supera la cantidad devuelta ({devolucion.cantidad_devuelta})"
        )

    devolucion.cantidad_scrap = data.cantidad_scrap
    devolucion.cantidad_retrabajo = data.cantidad_retrabajo
    devolucion.disposicion_final = f"Scrap: {data.cantidad_scrap}, Retrabajo: {data.cantidad_retrabajo}"
    devolucion.estado_inspeccion = "Finalizado"
    devolucion.procesado_por = current_user.username

    await db.commit()
    return {"message": f"Devolución {devolucion_id} procesada", "disposicion": devolucion.disposicion_final}


# ========================
# PLAN DE VENTAS
# ========================
@router.get("/plan-ventas")
@router.get("/plan-ventas/")
async def listar_planes_ventas(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_finanzas_role(current_user)

    result = await db.execute(
        select(PlanVentas).order_by(PlanVentas.fecha_inicio_semana.desc()).limit(20)
    )
    planes = result.scalars().all()

    return [
        {
            "id": p.id,
            "identificador_semana": p.identificador_semana,
            "fecha_inicio_semana": p.fecha_inicio_semana.isoformat(),
            "fecha_importacion": p.fecha_importacion.isoformat() if p.fecha_importacion else None,
            "items": p.items or [],
            "importado_por": p.importado_por,
            "total_skus": len(p.items) if p.items else 0,
        }
        for p in planes
    ]


@router.get("/plan-ventas/{identificador_semana}")
@router.get("/plan-ventas/{identificador_semana}/")
async def obtener_plan_ventas(
    identificador_semana: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_finanzas_role(current_user)

    result = await db.execute(
        select(PlanVentas).where(PlanVentas.identificador_semana == identificador_semana)
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan de ventas no encontrado")

    return {
        "id": plan.id,
        "identificador_semana": plan.identificador_semana,
        "fecha_inicio_semana": plan.fecha_inicio_semana.isoformat(),
        "fecha_importacion": plan.fecha_importacion.isoformat() if plan.fecha_importacion else None,
        "items": plan.items or [],
        "importado_por": plan.importado_por,
    }


@router.post("/plan-ventas/importar")
@router.post("/plan-ventas/importar/")
async def importar_plan_ventas(
    fecha_inicio_semana: str = Query(..., description="Fecha inicio semana YYYY-MM-DD"),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_finanzas_role(current_user)

    try:
        fecha_semana = date.fromisoformat(fecha_inicio_semana)
    except ValueError:
        raise HTTPException(status_code=400, detail="Formato de fecha inválido. Use YYYY-MM-DD")

    identificador_semana = fecha_semana.strftime("%Y-%W")

    contents = await file.read()
    try:
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(contents), dtype=str)
        else:
            df = pd.read_excel(io.BytesIO(contents), dtype=str)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error al leer archivo: {str(e)}")

    df.columns = [c.strip().upper() for c in df.columns]
    df = df.where(pd.notnull(df), "0")

    items = []
    for _, row in df.iterrows():
        sku = str(row.get("SKU", "")).strip().upper()
        if not sku:
            continue
        items.append({
            "sku": sku,
            "descripcion": str(row.get("DESCRIPCION", row.get("NOMBRE", ""))).strip(),
            "dias": {
                "LUNES": {"plan": int(row.get("LUNES", 0) or 0), "status": "Pendiente", "ov_generada": None},
                "MARTES": {"plan": int(row.get("MARTES", 0) or 0), "status": "Pendiente", "ov_generada": None},
                "MIERCOLES": {"plan": int(row.get("MIERCOLES", 0) or 0), "status": "Pendiente", "ov_generada": None},
                "JUEVES": {"plan": int(row.get("JUEVES", 0) or 0), "status": "Pendiente", "ov_generada": None},
                "VIERNES": {"plan": int(row.get("VIERNES", 0) or 0), "status": "Pendiente", "ov_generada": None},
            },
        })

    result = await db.execute(
        select(PlanVentas).where(PlanVentas.identificador_semana == identificador_semana)
    )
    plan_existente = result.scalar_one_or_none()

    if plan_existente:
        items_map_existente = {i["sku"]: i for i in (plan_existente.items or [])}
        for new_item in items:
            if new_item["sku"] in items_map_existente:
                for dia, info in new_item["dias"].items():
                    if info["plan"] > 0:
                        items_map_existente[new_item["sku"]]["dias"][dia] = info
            else:
                items_map_existente[new_item["sku"]] = new_item
        plan_existente.items = list(items_map_existente.values())
        plan_existente.importado_por = current_user.username
    else:
        plan = PlanVentas(
            identificador_semana=identificador_semana,
            fecha_inicio_semana=fecha_semana,
            items=items,
            importado_por=current_user.username,
        )
        db.add(plan)

    await db.commit()
    return {"message": f"Plan de ventas {identificador_semana} importado", "total_skus": len(items)}


@router.post("/plan-ventas/autorizar")
@router.post("/plan-ventas/autorizar/")
async def autorizar_ventas_masivo(
    data: AutorizarVentasMasivo,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_finanzas_role(current_user)

    result = await db.execute(
        select(PlanVentas).where(PlanVentas.identificador_semana == data.identificador_semana)
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="Plan no encontrado")

    resultados = []
    items_actualizados = plan.items or []
    items_map = {item["sku"]: item for item in items_actualizados}

    for venta in data.ventas:
        ahora = ahora_local()
        ov_id = f"OV-{ahora.strftime('%Y%m%d%H%M%S')}-{venta.sku[-4:]}"

        orden = OrdenVenta(
            ov_id=ov_id,
            cliente_id="PLAN_VENTAS",
            nombre_cliente=f"Autorización Plan {data.identificador_semana}",
            estado="Pendiente de Envío",
            creado_por=current_user.username,
        )
        db.add(orden)
        await db.flush()

        item_ov = OrdenVentaItem(
            orden_venta_id=orden.id,
            sku_producto=venta.sku,
            cantidad=venta.cantidad,
        )
        db.add(item_ov)

        if venta.sku in items_map:
            dias = items_map[venta.sku].get("dias", {})
            if venta.dia in dias:
                dias[venta.dia]["status"] = "Autorizado"
                dias[venta.dia]["ov_generada"] = ov_id

        resultados.append(f"SKU {venta.sku} ({venta.dia}): ✅ OV creada: {ov_id}")

    plan.items = list(items_map.values())
    await db.commit()

    return {"resultados": resultados}


# ========================
# LIMPIEZA DE DATOS
# ========================
@router.post("/limpiar/compras-completadas")
@router.post("/limpiar/compras-completadas/")
async def limpiar_compras_completadas(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_finanzas_role(current_user)
    if current_user.rol != "admin":
        raise HTTPException(status_code=403, detail="Solo admin puede realizar limpiezas")

    result = await db.execute(
        delete(OrdenCompra).where(OrdenCompra.status == "Completada")
    )
    await db.commit()
    return {"message": f"{result.rowcount} órdenes de compra completadas eliminadas"}


@router.post("/limpiar/devoluciones-finalizadas")
@router.post("/limpiar/devoluciones-finalizadas/")
async def limpiar_devoluciones_finalizadas(
    dias: int = Query(90, ge=1),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    require_finanzas_role(current_user)
    if current_user.rol != "admin":
        raise HTTPException(status_code=403, detail="Solo admin puede realizar limpiezas")

    fecha_limite = ahora_local() - timedelta(days=dias)
    result = await db.execute(
        delete(Devolucion).where(
            and_(
                Devolucion.estado_inspeccion == "Finalizado",
                Devolucion.fecha_devolucion < fecha_limite,
            )
        )
    )
    await db.commit()
    return {"message": f"{result.rowcount} devoluciones finalizadas eliminadas (>{dias} días)"}


@router.get("/lote/{lote_id}")
@router.get("/lote/{lote_id}/")
async def obtener_info_lote(
    lote_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Busca info de lote por Lote ID (formato: YYYYMMDD-XXXX-N)."""
    require_finanzas_role(current_user)

    partes = lote_id.split("-")
    if len(partes) != 3:
        raise HTTPException(status_code=400, detail="Formato de Lote ID inválido. Esperado: YYYYMMDD-XXXX-N")

    fecha_str, sku_suffix, rec_count_str = partes

    result = await db.execute(
        select(RecepcionCompra).where(
            RecepcionCompra.sku_producto.ilike(f"%{sku_suffix}")
        ).order_by(RecepcionCompra.fecha_recepcion.desc())
    )
    recepciones = result.scalars().all()

    if not recepciones:
        raise HTTPException(status_code=404, detail=f"No se encontraron recepciones para el lote {lote_id}")

    recepciones_filtradas = [
        r for r in recepciones
        if r.fecha_recepcion and r.fecha_recepcion.strftime("%Y%m%d") == fecha_str
    ]

    recs_finales = recepciones_filtradas if recepciones_filtradas else recepciones

    if not recs_finales:
        raise HTTPException(status_code=404, detail=f"No se encontraron recepciones para el lote {lote_id}")

    rec_principal = recs_finales[0]
    sku_completo = rec_principal.sku_producto
    oc_id = rec_principal.oc_id

    oc_result = await db.execute(select(OrdenCompra).where(OrdenCompra.oc_id == oc_id))
    orden = oc_result.scalar_one_or_none()

    item = None
    if orden:
        item_result = await db.execute(
            select(OrdenCompraItem).where(
                and_(
                    OrdenCompraItem.orden_compra_id == orden.id,
                    OrdenCompraItem.sku_producto == sku_completo,
                )
            )
        )
        item = item_result.scalar_one_or_none()

    cantidad_total = sum(r.cantidad_recibida for r in recs_finales if r.sku_producto == sku_completo)

    return {
        "lote_id": lote_id,
        "sku_producto": sku_completo,
        "nombre_producto": item.nombre_producto if item else None,
        "oc_id": oc_id,
        "nombre_proveedor": orden.nombre_proveedor if orden else None,
        "cantidad_total_recibida": cantidad_total,
        "cantidad_requerida": item.cantidad_requerida if item else None,
        "precio_unitario": item.precio_unitario if item else None,
        "moneda": item.moneda if item else "MXN",
        "status_oc": orden.status if orden else None,
        "total_recepciones": len(recs_finales),
        "recepciones": [
            {
                "recepcion_id": r.recepcion_id,
                "cantidad_recibida": r.cantidad_recibida,
                "fecha_recepcion": r.fecha_recepcion.isoformat() if r.fecha_recepcion else None,
                "recibido_por": r.recibido_por,
                "notas": r.notas,
            }
            for r in recs_finales
            if r.sku_producto == sku_completo
        ],
    }