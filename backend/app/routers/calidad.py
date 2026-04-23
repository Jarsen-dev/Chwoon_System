from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, cast, Date
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core.deps import get_db, get_current_user
from app.models.usuario import Usuario, RolUsuario
from app.models.inspeccion import Inspeccion, TipoInspeccion, ResultadoInspeccion
from app.models.registro_scrap import RegistroScrap
from app.models.producto import Producto
from app.models.lote_inventario import LoteInventario, MovimientoLote
from app.schemas.calidad import (
    InspeccionCreate, InspeccionResponse,
    ScrapCreate, ScrapResponse,
    CalidadDashboard,
)
from app.services.calidad_pdf import generar_pdf_inspeccion, generar_pdf_scrap

router = APIRouter(prefix="/calidad", tags=["calidad"])

TZ_LOCAL = timezone(timedelta(hours=-6))


# ── Helper: verificar rol calidad ─────────────────────────────────────
def require_calidad_role(user: Usuario):
    if user.rol not in [RolUsuario.admin, RolUsuario.calidad]:
        raise HTTPException(status_code=403, detail="Se requiere rol admin o calidad")


def ahora_local():
    return datetime.now(TZ_LOCAL).replace(tzinfo=None)


def generar_inspeccion_id(tipo: str) -> str:
    now = ahora_local()
    return f"INS-{tipo}-{now.strftime('%d%m%y%H%M%S')}"


def generar_scrap_id() -> str:
    now = ahora_local()
    return f"SCRAP-{now.strftime('%d%m%y%H%M%S')}"


# ══════════════════════════════════════════════════════════════════════
# DASHBOARD
# ══════════════════════════════════════════════════════════════════════

@router.get("/dashboard")
@router.get("/dashboard/")
async def get_calidad_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    require_calidad_role(current_user)

    hoy = ahora_local().date()
    inicio_mes = hoy.replace(day=1)

    # Total inspecciones
    total_q = await db.execute(select(func.count(Inspeccion.id)))
    total_inspecciones = total_q.scalar() or 0

    # Inspecciones hoy
    hoy_q = await db.execute(
        select(func.count(Inspeccion.id)).where(
            cast(Inspeccion.fecha, Date) == hoy
        )
    )
    inspecciones_hoy = hoy_q.scalar() or 0

    # IQC
    iqc_total = (await db.execute(
        select(func.count(Inspeccion.id)).where(Inspeccion.tipo_inspeccion == TipoInspeccion.IQC)
    )).scalar() or 0
    iqc_aprobadas = (await db.execute(
        select(func.count(Inspeccion.id)).where(
            and_(Inspeccion.tipo_inspeccion == TipoInspeccion.IQC,
                 Inspeccion.resultado_final == ResultadoInspeccion.Aprobado)
        )
    )).scalar() or 0

    # LQC
    lqc_total = (await db.execute(
        select(func.count(Inspeccion.id)).where(Inspeccion.tipo_inspeccion == TipoInspeccion.LQC)
    )).scalar() or 0
    lqc_aprobadas = (await db.execute(
        select(func.count(Inspeccion.id)).where(
            and_(Inspeccion.tipo_inspeccion == TipoInspeccion.LQC,
                 Inspeccion.resultado_final == ResultadoInspeccion.Aprobado)
        )
    )).scalar() or 0

    # OQC
    oqc_total = (await db.execute(
        select(func.count(Inspeccion.id)).where(Inspeccion.tipo_inspeccion == TipoInspeccion.OQC)
    )).scalar() or 0
    oqc_aprobadas = (await db.execute(
        select(func.count(Inspeccion.id)).where(
            and_(Inspeccion.tipo_inspeccion == TipoInspeccion.OQC,
                 Inspeccion.resultado_final == ResultadoInspeccion.Aprobado)
        )
    )).scalar() or 0

    # Devoluciones
    dev_total = (await db.execute(
        select(func.count(Inspeccion.id)).where(Inspeccion.tipo_inspeccion == TipoInspeccion.DEVOLUCION)
    )).scalar() or 0

    # Scrap hoy
    scrap_hoy_q = await db.execute(
        select(func.coalesce(func.sum(RegistroScrap.cantidad), 0)).where(
            cast(RegistroScrap.fecha, Date) == hoy
        )
    )
    scrap_hoy = float(scrap_hoy_q.scalar() or 0)

    # Scrap mes
    scrap_mes_q = await db.execute(
        select(func.coalesce(func.sum(RegistroScrap.cantidad), 0)).where(
            cast(RegistroScrap.fecha, Date) >= inicio_mes
        )
    )
    scrap_mes = float(scrap_mes_q.scalar() or 0)

    # Tasa aprobación
    tasa = 0.0
    if total_inspecciones > 0:
        total_aprobadas = (await db.execute(
            select(func.count(Inspeccion.id)).where(
                Inspeccion.resultado_final == ResultadoInspeccion.Aprobado
            )
        )).scalar() or 0
        tasa = round((total_aprobadas / total_inspecciones) * 100, 1)

    return CalidadDashboard(
        total_inspecciones=total_inspecciones,
        inspecciones_hoy=inspecciones_hoy,
        iqc_total=iqc_total,
        iqc_aprobadas=iqc_aprobadas,
        iqc_rechazadas=iqc_total - iqc_aprobadas,
        lqc_total=lqc_total,
        lqc_aprobadas=lqc_aprobadas,
        lqc_rechazadas=lqc_total - lqc_aprobadas,
        oqc_total=oqc_total,
        oqc_aprobadas=oqc_aprobadas,
        oqc_rechazadas=oqc_total - oqc_aprobadas,
        dev_total=dev_total,
        scrap_hoy=scrap_hoy,
        scrap_mes=scrap_mes,
        tasa_aprobacion=tasa,
    )


# ══════════════════════════════════════════════════════════════════════
# INSPECCIONES — CRUD
# ══════════════════════════════════════════════════════════════════════

@router.post("/inspecciones")
@router.post("/inspecciones/")
async def registrar_inspeccion(
    data: InspeccionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    require_calidad_role(current_user)

    inspeccion_id = generar_inspeccion_id(data.tipo_inspeccion)

    inspeccion = Inspeccion(
        inspeccion_id=inspeccion_id,
        lote_id=data.lote_id,
        sku_producto=data.sku_producto,
        nombre_producto=data.nombre_producto,
        tipo_inspeccion=data.tipo_inspeccion,
        fecha=ahora_local(),
        inspector=current_user.username,
        resultado_final=data.resultado_final,
        resultados_puntos=[p.dict() for p in data.resultados_puntos],
        oc_origen=data.oc_origen,
        op_origen=data.op_origen,
        cantidad_inspeccionada=data.cantidad_inspeccionada or 0,
        notas=data.notas,
    )
    db.add(inspeccion)

    # ── Si es IQC, actualizar o crear lote en inventario ──
    lote_actualizado = False
    lote_creado = False
    if data.tipo_inspeccion == "IQC" and data.lote_id:
        lote_result = await db.execute(
            select(LoteInventario).where(LoteInventario.lote_id == data.lote_id)
        )
        lote = lote_result.scalar_one_or_none()

        if lote:
            # Lote existe → actualizar estado
            lote.estado_calidad = data.resultado_final
            lote_actualizado = True
        else:
            # Lote NO existe (recepción anterior al cambio) → crear
            nuevo_lote = LoteInventario(
                lote_id=data.lote_id,
                sku_producto=data.sku_producto,
                cantidad_actual=data.cantidad_inspeccionada or 0,
                cantidad_inicial=data.cantidad_inspeccionada or 0,
                ubicacion_id=None,
                fecha_recepcion=ahora_local(),
                oc_origen=data.oc_origen,
                estado_calidad=data.resultado_final,
            )
            db.add(nuevo_lote)
            lote_actualizado = True
            lote_creado = True

        # Registrar movimiento de inspección
        mov = MovimientoLote(
            lote_id=data.lote_id,
            fecha=ahora_local(),
            tipo="INSPECCION_IQC",
            cantidad=0,
            detalles={
                "inspeccion_id": inspeccion_id,
                "resultado": data.resultado_final,
                "inspector": current_user.username,
                "sku_producto": data.sku_producto,
                "lote_creado_en_inspeccion": lote_creado,
            },
        )
        db.add(mov)

    await db.commit()
    await db.refresh(inspeccion)

    response = {
        "message": f"Inspección {data.tipo_inspeccion} registrada",
        "inspeccion_id": inspeccion_id,
        "resultado": data.resultado_final,
    }

    if data.tipo_inspeccion == "IQC":
        response["lote_actualizado"] = lote_actualizado
        response["lote_creado"] = lote_creado
        if lote_actualizado and data.resultado_final == "Aprobado":
            response["message"] += " — Lote aprobado y disponible para ubicar en almacén"

    return response


@router.get("/inspecciones", response_model=list[InspeccionResponse])
@router.get("/inspecciones/", response_model=list[InspeccionResponse])
async def listar_inspecciones(
    tipo: Optional[str] = Query(None),
    resultado: Optional[str] = Query(None),
    fecha_desde: Optional[str] = Query(None),
    fecha_hasta: Optional[str] = Query(None),
    limite: int = Query(200),
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    require_calidad_role(current_user)

    query = select(Inspeccion)

    if tipo:
        query = query.where(Inspeccion.tipo_inspeccion == tipo)
    if resultado:
        query = query.where(Inspeccion.resultado_final == resultado)
    if fecha_desde:
        query = query.where(cast(Inspeccion.fecha, Date) >= fecha_desde)
    if fecha_hasta:
        query = query.where(cast(Inspeccion.fecha, Date) <= fecha_hasta)

    query = query.order_by(Inspeccion.fecha.desc()).limit(limite)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/inspecciones/{inspeccion_id}")
@router.get("/inspecciones/{inspeccion_id}/")
async def obtener_inspeccion(
    inspeccion_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    require_calidad_role(current_user)

    result = await db.execute(
        select(Inspeccion).where(Inspeccion.inspeccion_id == inspeccion_id)
    )
    inspeccion = result.scalar_one_or_none()
    if not inspeccion:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")

    return inspeccion


# ══════════════════════════════════════════════════════════════════════
# PDF INSPECCIÓN
# ══════════════════════════════════════════════════════════════════════

@router.get("/inspecciones/{inspeccion_id}/pdf")
@router.get("/inspecciones/{inspeccion_id}/pdf/")
async def descargar_pdf_inspeccion(
    inspeccion_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    require_calidad_role(current_user)

    result = await db.execute(
        select(Inspeccion).where(Inspeccion.inspeccion_id == inspeccion_id)
    )
    insp = result.scalar_one_or_none()
    if not insp:
        raise HTTPException(status_code=404, detail="Inspección no encontrada")

    data = {
        "tipo_inspeccion": insp.tipo_inspeccion.value if insp.tipo_inspeccion else "QC",
        "resultado_final": insp.resultado_final.value if insp.resultado_final else "N/A",
        "lote_id": insp.lote_id,
        "sku_producto": insp.sku_producto,
        "nombre_producto": insp.nombre_producto,
        "oc_origen": insp.oc_origen,
        "op_origen": insp.op_origen,
        "fecha": insp.fecha,
        "inspector": insp.inspector,
        "cantidad_inspeccionada": insp.cantidad_inspeccionada,
        "resultados_puntos": insp.resultados_puntos or [],
        "notas": insp.notas,
    }

    pdf_buf = generar_pdf_inspeccion(data)
    filename = f"{insp.tipo_inspeccion.value}_{insp.resultado_final.value}_{inspeccion_id}.pdf"

    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ══════════════════════════════════════════════════════════════════════
# PUNTOS DE INSPECCIÓN (desde productos)
# ══════════════════════════════════════════════════════════════════════

@router.get("/puntos-inspeccion/{sku}")
@router.get("/puntos-inspeccion/{sku}/")
async def obtener_puntos_inspeccion(
    sku: str,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    """Obtiene los puntos de inspección IQC/LQC/OQC de un producto por SKU."""
    require_calidad_role(current_user)

    result = await db.execute(
        select(Producto).where(Producto.sku == sku)
    )
    producto = result.scalar_one_or_none()
    if not producto:
        raise HTTPException(status_code=404, detail=f"Producto {sku} no encontrado")

    return {
        "sku": producto.sku,
        "nombre": producto.nombre,
        "tipo": producto.tipo,
        "controles_calidad": producto.controles_calidad or [],
        "puntos_inspeccion_iqc": producto.puntos_inspeccion_iqc or [],
        "puntos_inspeccion_lqc": producto.puntos_inspeccion_lqc or [],
        "puntos_inspeccion_oqc": producto.puntos_inspeccion_oqc or [],
    }


# ══════════════════════════════════════════════════════════════════════
# SCRAP
# ══════════════════════════════════════════════════════════════════════

@router.post("/scrap")
@router.post("/scrap/")
async def registrar_scrap(
    data: ScrapCreate,
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    require_calidad_role(current_user)

    scrap = RegistroScrap(
        scrap_id=generar_scrap_id(),
        fecha=ahora_local(),
        sku_producto=data.sku_producto,
        nombre_producto=data.nombre_producto,
        lote_id=data.lote_id,
        cantidad=data.cantidad,
        motivo=data.motivo,
        origen=data.origen,
        referencia=data.referencia,
        registrado_por=current_user.username,
    )
    db.add(scrap)
    await db.commit()
    await db.refresh(scrap)

    return {"message": "Scrap registrado", "scrap_id": scrap.scrap_id}


@router.get("/scrap", response_model=list[ScrapResponse])
@router.get("/scrap/", response_model=list[ScrapResponse])
async def listar_scrap(
    fecha: Optional[str] = Query(None),
    sku: Optional[str] = Query(None),
    origen: Optional[str] = Query(None),
    limite: int = Query(200),
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    require_calidad_role(current_user)

    query = select(RegistroScrap)

    if fecha:
        query = query.where(cast(RegistroScrap.fecha, Date) == fecha)
    if sku:
        query = query.where(RegistroScrap.sku_producto.ilike(f"%{sku}%"))
    if origen:
        query = query.where(RegistroScrap.origen == origen)

    query = query.order_by(RegistroScrap.fecha.desc()).limit(limite)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/scrap/pdf")
@router.get("/scrap/pdf/")
async def descargar_pdf_scrap(
    fecha: Optional[str] = Query(None),
    sku: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    require_calidad_role(current_user)

    query = select(RegistroScrap)
    if fecha:
        query = query.where(cast(RegistroScrap.fecha, Date) == fecha)
    if sku:
        query = query.where(RegistroScrap.sku_producto.ilike(f"%{sku}%"))
    query = query.order_by(RegistroScrap.fecha.desc())

    result = await db.execute(query)
    items = result.scalars().all()

    items_dict = [
        {
            "fecha": s.fecha,
            "sku_producto": s.sku_producto,
            "lote_id": s.lote_id,
            "cantidad": s.cantidad,
            "origen": s.origen,
            "referencia": s.referencia,
        }
        for s in items
    ]

    pdf_buf = generar_pdf_scrap(
        {"fecha": fecha or "Todas", "sku_filtro": sku or "Todos"},
        items_dict,
    )

    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": 'attachment; filename="reporte_scrap.pdf"'},
    )


# ══════════════════════════════════════════════════════════════════════
# LIMPIEZA (solo admin)
# ══════════════════════════════════════════════════════════════════════

@router.post("/limpiar/inspecciones")
@router.post("/limpiar/inspecciones/")
async def limpiar_inspecciones_antiguas(
    dias: int = Query(90),
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if current_user.rol != RolUsuario.admin:
        raise HTTPException(status_code=403, detail="Solo admin")

    limite = ahora_local() - timedelta(days=dias)
    result = await db.execute(
        select(Inspeccion).where(Inspeccion.fecha < limite)
    )
    items = result.scalars().all()
    count = len(items)
    for item in items:
        await db.delete(item)
    await db.commit()

    return {"message": f"{count} inspecciones eliminadas (>{dias} días)"}


@router.post("/limpiar/scrap")
@router.post("/limpiar/scrap/")
async def limpiar_scrap_antiguo(
    dias: int = Query(90),
    db: AsyncSession = Depends(get_db),
    current_user: Usuario = Depends(get_current_user),
):
    if current_user.rol != RolUsuario.admin:
        raise HTTPException(status_code=403, detail="Solo admin")

    limite = ahora_local() - timedelta(days=dias)
    result = await db.execute(
        select(RegistroScrap).where(RegistroScrap.fecha < limite)
    )
    items = result.scalars().all()
    count = len(items)
    for item in items:
        await db.delete(item)
    await db.commit()

    return {"message": f"{count} registros de scrap eliminados (>{dias} días)"}