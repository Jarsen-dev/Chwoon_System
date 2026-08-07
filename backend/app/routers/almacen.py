from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, update, delete, cast, literal, String, Date
from typing import Optional
from datetime import datetime, timedelta, timezone, time, date
import io
import math

from app.core.deps import get_db, get_current_user, get_current_admin
from app.models.usuario import Usuario, RolUsuario
from app.models.ubicacion import Ubicacion
from app.models.lote_inventario import LoteInventario, MovimientoLote
from app.models.orden_traslado import OrdenTraslado, RegistroSalidaProduccion
from app.models.producto import Producto
from app.models.remision_recepcion import RemisionRecepcion
from app.models.orden_venta import OrdenVenta, OrdenVentaItem
from app.schemas.almacen import (
    UbicacionCreate, UbicacionUpdate, UbicacionResponse, LoteEnUbicacion,
    LoteInventarioResponse, LotesInventarioPage, MovimientoLoteResponse,
    TransferenciaItem, TransferenciaBatchRequest,
    AjusteLoteRequest, ScrapInventarioRequest, SolicitudModificacionRequest,
    TransferenciaEntreUbicacionesRequest,
    ConsumoFifoRequest,
    VerificarLoteTrasladoResponse, SurtirMaterialRequest,
    RegistroSalidaProduccionResponse, RegistrosSalidaProduccionPage,
    IngresoCarritoEPSRequest,
    TrazabilidadResponse,
    AlmacenDashboard,
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
    # `productos.sku` no es único: se ordena para que, entre duplicados, el
    # último en sobrescribir el dict sea el que trae nombre/descripcion.
    nombre_expr = func.coalesce(func.nullif(Producto.nombre, ""), func.nullif(Producto.descripcion, ""))
    result = await db.execute(
        select(Producto).order_by(Producto.sku, nombre_expr.is_(None).desc(), Producto.id)
    )
    return {p.sku: p for p in result.scalars().all()}


def _nombre_producto(prod: Optional[Producto]) -> str:
    """`nombre` suele venir vacío en el catálogo real: mismo fallback a
    `descripcion` que usan productos.py y finanzas.py."""
    if not prod:
        return "N/A"
    return prod.nombre or prod.descripcion or "N/A"


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

    # Remisiones capturadas hoy en Recepciones (flujo por foto).
    # `fecha_captura` es TIMESTAMPTZ, así que el corte tiene que llevar tzinfo.
    hoy_inicio_tz = hoy_inicio.replace(tzinfo=TZ_LOCAL)
    recepciones_hoy = (await db.execute(
        select(func.count(RemisionRecepcion.id)).where(RemisionRecepcion.fecha_captura >= hoy_inicio_tz)
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
        traslados_pendientes=0,
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
    ubicaciones = (
        await db.execute(select(Ubicacion).order_by(Ubicacion.nombre))
    ).scalars().all()

    # Lotes activos por ubicación: alimenta el indicador visual de
    # disponible/ocupado en la tab de Ubicaciones.
    lotes_result = await db.execute(
        select(LoteInventario)
        .where(LoteInventario.ubicacion_id.isnot(None), LoteInventario.cantidad_actual > 0)
        .order_by(LoteInventario.fecha_recepcion.desc())
    )
    por_ubicacion: dict[int, list] = {}
    for lote in lotes_result.scalars().all():
        por_ubicacion.setdefault(lote.ubicacion_id, []).append(LoteEnUbicacion(
            lote_id=lote.lote_id,
            sku_producto=lote.sku_producto,
            cantidad_actual=lote.cantidad_actual,
            fecha_recepcion=lote.fecha_recepcion,
        ))

    return [
        UbicacionResponse(
            id=u.id,
            nombre=u.nombre,
            parent_id=u.parent_id,
            tipo_zona=u.tipo_zona,
            capacidad_max=u.capacidad_max,
            permite_mixing=u.permite_mixing,
            activa=u.activa,
            lotes=por_ubicacion.get(u.id, []),
        )
        for u in ubicaciones
    ]


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
        permite_mixing=data.permite_mixing if data.permite_mixing is not None else True,
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
@router.get("/inventario", response_model=LotesInventarioPage)
@router.get("/inventario/", response_model=LotesInventarioPage)
async def listar_inventario(
    estado: Optional[str] = None,
    sku: Optional[str] = None,
    ubicacion_id: Optional[int] = None,
    search: Optional[str] = None,
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    orden: str = "recientes",
    limit: int = 50,
    offset: int = 0,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)

    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    # `productos.sku` no es único (hay SKUs repetidos en catálogo): DISTINCT ON
    # deja un solo producto por SKU para que el join no duplique lotes.
    # `nombre` normalmente viene vacío en el catálogo real: mismo fallback a
    # `descripcion` que usan productos.py y finanzas.py. Entre duplicados del
    # mismo SKU se prefiere el que sí trae texto (los primeros suelen venir vacíos).
    nombre_expr = func.coalesce(func.nullif(Producto.nombre, ""), func.nullif(Producto.descripcion, ""))
    prod = (
        select(
            Producto.sku,
            nombre_expr.label("nombre"),
            Producto.tipo,
            Producto.clase_producto,
        )
        .distinct(Producto.sku)
        .order_by(Producto.sku, nombre_expr.is_(None), Producto.id.desc())
        .subquery()
    )

    filtros = []
    if estado:
        filtros.append(LoteInventario.estado_calidad == estado)
    if sku:
        filtros.append(LoteInventario.sku_producto.ilike(f"%{sku.strip()}%"))
    if ubicacion_id is not None:
        filtros.append(LoteInventario.ubicacion_id == ubicacion_id)
    # Un lote agotado (cantidad_actual = 0) ya no debe aparecer en Todos los
    # Lotes ni en el FIFO Viewer — mismo criterio que Ubicaciones y FIFO.
    filtros.append(LoteInventario.cantidad_actual > 0)
    if fecha_inicio:
        filtros.append(cast(LoteInventario.fecha_recepcion, Date) >= fecha_inicio)
    if fecha_fin:
        filtros.append(cast(LoteInventario.fecha_recepcion, Date) <= fecha_fin)
    if search and search.strip():
        q = f"%{search.strip()}%"
        filtros.append(or_(
            LoteInventario.sku_producto.ilike(q),
            prod.c.nombre.ilike(q),
            cast(LoteInventario.cantidad_actual, String).ilike(q),
            Ubicacion.nombre.ilike(q),
            # los lotes sin ubicación se muestran como "IQC": que la búsqueda los alcance
            and_(LoteInventario.ubicacion_id.is_(None), literal("IQC").ilike(q)),
            LoteInventario.numero_remision.ilike(q),
        ))

    # El join reemplaza a _get_producto_map/_get_ubicacion_map: permite buscar por
    # descripción y ubicación sin traerse las tablas completas en cada request.
    def con_joins(stmt):
        return (
            stmt
            .outerjoin(prod, prod.c.sku == LoteInventario.sku_producto)
            .outerjoin(Ubicacion, Ubicacion.id == LoteInventario.ubicacion_id)
            .where(*filtros)
        )

    base = con_joins(select(
        LoteInventario, prod.c.nombre, prod.c.tipo, prod.c.clase_producto, Ubicacion
    ))

    total = (await db.execute(
        con_joins(select(func.count()).select_from(LoteInventario))
    )).scalar() or 0

    fecha_col = (
        LoteInventario.fecha_recepcion.asc()
        if orden == "antiguos"
        else LoteInventario.fecha_recepcion.desc()
    )
    result = await db.execute(
        base.order_by(fecha_col, LoteInventario.id).offset(offset).limit(limit)
    )

    items = []
    for lote, nombre_prod, tipo_prod, clase_prod, ub in result.all():
        items.append(LoteInventarioResponse(
            id=lote.id,
            lote_id=lote.lote_id,
            sku_producto=lote.sku_producto,
            cantidad_actual=lote.cantidad_actual,
            cantidad_inicial=lote.cantidad_inicial,
            ubicacion_id=lote.ubicacion_id,
            nombre_ubicacion=ub.nombre if ub else "IQC",
            nombre_producto=nombre_prod or "N/A",
            tipo_producto=tipo_prod or "N/A",
            clase_producto=clase_prod or "N/A",
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
    return LotesInventarioPage(items=items, total=total)


@router.get("/inventario/aprobados-sin-ubicacion", response_model=list[LoteInventarioResponse])
@router.get("/inventario/aprobados-sin-ubicacion/", response_model=list[LoteInventarioResponse])
async def lotes_aprobados_sin_ubicacion(
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)

    result = await db.execute(
        select(LoteInventario)
        .where(
            and_(
                LoteInventario.estado_calidad == "Aprobado",
                LoteInventario.ubicacion_id.is_(None),
            )
        )
        .order_by(LoteInventario.fecha_recepcion.desc(), LoteInventario.id)
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
            nombre_ubicacion="IQC",
            nombre_producto=_nombre_producto(prod),
            tipo_producto=prod.tipo if prod else "N/A",
            clase_producto=prod.clase_producto if prod else "N/A",
            fecha_recepcion=lote.fecha_recepcion,
            oc_origen=lote.oc_origen,
            op_origen=lote.op_origen,
            ov_origen=lote.ov_origen,
            estado_calidad=lote.estado_calidad,
            numero_remision=lote.numero_remision,
            bultos=lote.bultos,
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
    # ordenes_traslado.fecha es TIMESTAMP WITHOUT TIME ZONE: guardar naive
    now = ahora_naive()
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


@router.post("/inventario/{lote_id}/solicitud-modificacion")
@router.post("/inventario/{lote_id}/solicitud-modificacion/")
async def solicitar_modificacion_lote(
    lote_id: str,
    data: SolicitudModificacionRequest,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Levanta una solicitud de modificación sobre un lote.

    Por ahora solo queda asentada en el historial del lote; el destino final
    (bandeja, correo, etc.) se define después y se engancha aquí.
    """
    require_almacen_role(user)

    result = await db.execute(select(LoteInventario).where(LoteInventario.lote_id == lote_id))
    lote = result.scalar_one_or_none()
    if not lote:
        raise HTTPException(status_code=404, detail="Lote no encontrado.")

    await _registrar_movimiento(db, lote_id, "SOLICITUD_MODIFICACION", 0, {
        "motivo": data.motivo,
        "mensaje": data.mensaje,
        "solicitante": user.username,
    })
    await db.commit()
    return {"message": f"Solicitud registrada para el lote {lote_id}"}


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
# TRASLADOS A PRODUCCIÓN (escaneo FIFO)
# ============================================================
async def _lote_mas_viejo_y_stock(db: AsyncSession, sku: str):
    """Lote más viejo disponible (aprobado, ya ubicado, con stock) de un SKU,
    más el stock total disponible de ese SKU. Mismo criterio que el FIFO Viewer
    de Inventario (VistaFifo / orden=antiguos)."""
    filtros = and_(
        LoteInventario.sku_producto == sku,
        LoteInventario.estado_calidad == "Aprobado",
        LoteInventario.ubicacion_id.isnot(None),
        LoteInventario.cantidad_actual > 0,
    )
    result = await db.execute(
        select(LoteInventario).where(filtros).order_by(LoteInventario.fecha_recepcion.asc(), LoteInventario.id.asc()).limit(1)
    )
    mas_viejo = result.scalar_one_or_none()

    stock_total = (await db.execute(
        select(func.coalesce(func.sum(LoteInventario.cantidad_actual), 0)).where(filtros)
    )).scalar() or 0

    return mas_viejo, float(stock_total)


@router.get("/traslados/verificar-lote/{lote_id}", response_model=VerificarLoteTrasladoResponse)
@router.get("/traslados/verificar-lote/{lote_id}/", response_model=VerificarLoteTrasladoResponse)
async def verificar_lote_traslado(
    lote_id: str,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)

    result = await db.execute(select(LoteInventario).where(LoteInventario.lote_id == lote_id))
    lote = result.scalar_one_or_none()
    if not lote:
        raise HTTPException(status_code=404, detail="Lote no encontrado.")
    if lote.ubicacion_id is None:
        raise HTTPException(status_code=400, detail="Este lote aún no tiene ubicación asignada.")
    if lote.estado_calidad != "Aprobado":
        raise HTTPException(status_code=400, detail="Este lote no está aprobado por calidad.")
    if lote.cantidad_actual <= 0:
        raise HTTPException(status_code=400, detail="Este lote no tiene stock disponible.")

    ub_map = await _get_ubicacion_map(db)
    prod_map = await _get_producto_map(db)
    ub_lote = ub_map.get(lote.ubicacion_id)
    prod = prod_map.get(lote.sku_producto)

    lote_resp = LoteInventarioResponse(
        id=lote.id,
        lote_id=lote.lote_id,
        sku_producto=lote.sku_producto,
        cantidad_actual=lote.cantidad_actual,
        cantidad_inicial=lote.cantidad_inicial,
        ubicacion_id=lote.ubicacion_id,
        nombre_ubicacion=ub_lote.nombre if ub_lote else "IQC",
        nombre_producto=_nombre_producto(prod),
        tipo_producto=prod.tipo if prod else "N/A",
        clase_producto=prod.clase_producto if prod else "N/A",
        fecha_recepcion=lote.fecha_recepcion,
        oc_origen=lote.oc_origen,
        op_origen=lote.op_origen,
        ov_origen=lote.ov_origen,
        estado_calidad=lote.estado_calidad,
        numero_remision=lote.numero_remision,
        bultos=lote.bultos,
    )

    mas_viejo, stock_total = await _lote_mas_viejo_y_stock(db, lote.sku_producto)
    es_mas_antiguo = bool(mas_viejo and mas_viejo.id == lote.id)

    lote_prioritario_id = None
    lote_prioritario_ubicacion = None
    if not es_mas_antiguo and mas_viejo:
        lote_prioritario_id = mas_viejo.lote_id
        ub_prio = ub_map.get(mas_viejo.ubicacion_id)
        lote_prioritario_ubicacion = ub_prio.nombre if ub_prio else "IQC"

    return VerificarLoteTrasladoResponse(
        lote=lote_resp,
        stock_total_sku=stock_total,
        es_mas_antiguo=es_mas_antiguo,
        lote_prioritario_id=lote_prioritario_id,
        lote_prioritario_ubicacion=lote_prioritario_ubicacion,
    )


@router.post("/traslados/surtir")
@router.post("/traslados/surtir/")
async def surtir_material(
    data: SurtirMaterialRequest,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)

    if not data.items:
        raise HTTPException(status_code=400, detail="No hay materiales para surtir.")

    result = await db.execute(select(Ubicacion).where(Ubicacion.id == data.ubicacion_produccion_id))
    destino = result.scalar_one_or_none()
    if not destino:
        raise HTTPException(status_code=404, detail="Ubicación de producción no encontrada.")
    if destino.tipo_zona != "PRODUCCION":
        raise HTTPException(status_code=400, detail="La ubicación seleccionada no es una ubicación de producción.")

    now = ahora_naive()
    registrados = 0
    for item in data.items:
        result = await db.execute(select(LoteInventario).where(LoteInventario.lote_id == item.lote_id))
        lote = result.scalar_one_or_none()
        if not lote:
            raise HTTPException(status_code=404, detail=f"Lote {item.lote_id} no encontrado.")
        if item.cantidad <= 0:
            raise HTTPException(status_code=400, detail=f"Cantidad inválida para {item.lote_id}.")
        if lote.cantidad_actual < item.cantidad:
            raise HTTPException(
                status_code=400,
                detail=f"Stock insuficiente para {item.lote_id}: quedan {lote.cantidad_actual}.",
            )

        ub_origen = await db.get(Ubicacion, lote.ubicacion_id) if lote.ubicacion_id else None
        origen_nombre = ub_origen.nombre if ub_origen else "IQC"

        lote.cantidad_actual -= item.cantidad
        await _registrar_movimiento(db, lote.lote_id, "SALIDA_PRODUCCION", -item.cantidad, {
            "destino": destino.nombre,
            "usuario": user.username,
        })

        db.add(RegistroSalidaProduccion(
            fecha=now,
            lote_id=lote.lote_id,
            sku_producto=lote.sku_producto,
            cantidad=item.cantidad,
            ubicacion_almacen_nombre=origen_nombre,
            ubicacion_produccion_nombre=destino.nombre,
            creado_por=user.username,
        ))
        registrados += 1

    await db.commit()
    return {"message": "Material surtido correctamente", "registrados": registrados}


@router.get("/traslados/registros", response_model=RegistrosSalidaProduccionPage)
@router.get("/traslados/registros/", response_model=RegistrosSalidaProduccionPage)
async def listar_registros_salida_produccion(
    search: Optional[str] = None,
    fecha_inicio: Optional[date] = None,
    fecha_fin: Optional[date] = None,
    limit: int = 50,
    offset: int = 0,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_almacen_role(user)

    limit = max(1, min(limit, 200))
    offset = max(0, offset)

    nombre_expr = func.coalesce(func.nullif(Producto.nombre, ""), func.nullif(Producto.descripcion, ""))
    prod = (
        select(Producto.sku, nombre_expr.label("nombre"))
        .distinct(Producto.sku)
        .order_by(Producto.sku, nombre_expr.is_(None), Producto.id.desc())
        .subquery()
    )

    filtros = []
    if fecha_inicio:
        filtros.append(cast(RegistroSalidaProduccion.fecha, Date) >= fecha_inicio)
    if fecha_fin:
        filtros.append(cast(RegistroSalidaProduccion.fecha, Date) <= fecha_fin)
    if search and search.strip():
        q = f"%{search.strip()}%"
        filtros.append(or_(
            RegistroSalidaProduccion.sku_producto.ilike(q),
            prod.c.nombre.ilike(q),
            cast(RegistroSalidaProduccion.cantidad, String).ilike(q),
            RegistroSalidaProduccion.ubicacion_almacen_nombre.ilike(q),
            RegistroSalidaProduccion.ubicacion_produccion_nombre.ilike(q),
        ))

    def con_joins(stmt):
        return (
            stmt
            .outerjoin(prod, prod.c.sku == RegistroSalidaProduccion.sku_producto)
            .where(*filtros)
        )

    total = (await db.execute(
        con_joins(select(func.count()).select_from(RegistroSalidaProduccion))
    )).scalar() or 0

    result = await db.execute(
        con_joins(select(RegistroSalidaProduccion, prod.c.nombre))
        .order_by(RegistroSalidaProduccion.fecha.desc(), RegistroSalidaProduccion.id.desc())
        .offset(offset).limit(limit)
    )

    items = [
        RegistroSalidaProduccionResponse(
            id=reg.id,
            fecha=reg.fecha,
            lote_id=reg.lote_id,
            sku_producto=reg.sku_producto,
            nombre_producto=nombre_prod or "N/A",
            cantidad=reg.cantidad,
            ubicacion_almacen_nombre=reg.ubicacion_almacen_nombre,
            ubicacion_produccion_nombre=reg.ubicacion_produccion_nombre,
        )
        for reg, nombre_prod in result.all()
    ]
    return RegistrosSalidaProduccionPage(items=items, total=total)


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
            nombre_producto=_nombre_producto(prod),
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
            "nombre_producto": _nombre_producto(prod),
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
        delete(RegistroSalidaProduccion).where(RegistroSalidaProduccion.fecha < fecha_limite)
    )
    await db.commit()
    return {"message": f"Eliminados {result.rowcount} registros de salida a producción con más de {dias} días"}


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