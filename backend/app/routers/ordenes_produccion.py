"""
Router para Órdenes de Producción unificadas:
PRE-EXPANSION, INYECCION, ASSY
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func, or_
from typing import List, Optional
from datetime import datetime, timedelta, timezone
import math

from app.database import AsyncSessionLocal
from app.models.orden_compra import OrdenCompra as OCModel, OrdenCompraItem as OCItemModel
from app.models.lote_inventario import LoteInventario, MovimientoLote
from app.models.orden_produccion import OrdenProduccion
from app.models.producto import Producto
from app.models.ubicacion import Ubicacion
from app.models.usuario import Usuario
from app.core.deps import get_current_user
from app.schemas.ordenes_produccion import (
    OrdenProduccionResponse,
    OrdenUnificadaResponse,
    IniciarPreExpansionRequest,
    RegistroParciallPreExpRequest,
    FinalizarPreExpansionRequest,
    IniciarInyeccionRequest,
    RegistrarPiezaRequest,
    FinalizarInyeccionRequest,
    IniciarAssyRequest,
    FinalizarAssyRequest,
    RegistrarParoRequest,
)

router = APIRouter(prefix="/ordenes-produccion", tags=["ordenes-produccion"])

TZ_LOCAL = timezone(timedelta(hours=-6))


# ── Helpers ──────────────────────────────────────────────────────

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


def _ahora_local() -> datetime:
    return datetime.now(TZ_LOCAL)


def _require_prod_role(user: Usuario):
    if user.rol.value not in ("admin", "supervisor", "operador"):
        raise HTTPException(status_code=403, detail="Sin permisos para órdenes de producción")


async def _generar_op_id(db: AsyncSession, sku: str, clase: str) -> str:
    """Genera OP ID con formato: NN+DDMMYY+XXXX"""
    ahora = _ahora_local()
    
    # ✅ Usar naive datetime para comparar con la DB (que guarda UTC naive)
    inicio_dia_local = ahora.replace(hour=0, minute=0, second=0, microsecond=0)
    # Convertir a UTC naive para que sea compatible con fecha_inicio (utcnow)
    inicio_dia_utc = inicio_dia_local.astimezone(timezone.utc).replace(tzinfo=None)

    result = await db.execute(
        select(func.count(OrdenProduccion.id)).where(
            OrdenProduccion.fecha_inicio >= inicio_dia_utc
        )
    )
    num_hoy = (result.scalar() or 0) + 1
    numero_trabajo = f"{num_hoy:02d}"

    sufijo_sku = sku[-4:] if len(sku) >= 4 else sku
    fecha_str = ahora.strftime("%d%m%y")

    prefijo = ""
    if clase == "PRE-EXPANSION":
        prefijo = "PE-"
    elif clase == "INYECCION":
        prefijo = "INY-"

    return f"{prefijo}{numero_trabajo}{fecha_str}{sufijo_sku}"


async def _get_producto(db: AsyncSession, sku: str) -> Producto:
    result = await db.execute(
        select(Producto).where(Producto.sku == sku)
    )
    producto = result.scalar_one_or_none()
    if not producto:
        raise HTTPException(status_code=404, detail=f"Producto '{sku}' no encontrado")
    return producto


async def _consultar_stock_aprobado(db: AsyncSession, sku: str) -> float:
    result = await db.execute(
        select(func.coalesce(func.sum(LoteInventario.cantidad_actual), 0)).where(
            and_(
                LoteInventario.sku_producto == sku,
                LoteInventario.estado_calidad == "Aprobado",
                LoteInventario.cantidad_actual > 0,
            )
        )
    )
    return float(result.scalar() or 0)


async def _consumir_stock_fifo(
    db: AsyncSession,
    sku: str,
    cantidad: float,
    detalles: dict,
    ubicacion_priorizada: str = None,
) -> list:
    """Consume stock FIFO. Retorna lista de lotes consumidos."""
    prioritized_id = None
    if ubicacion_priorizada:
        res = await db.execute(
            select(Ubicacion).where(Ubicacion.nombre == ubicacion_priorizada)
        )
        ub = res.scalar_one_or_none()
        if ub:
            prioritized_id = ub.id

    # Lotes prioritarios
    lotes_prio = []
    if prioritized_id:
        res = await db.execute(
            select(LoteInventario).where(
                and_(
                    LoteInventario.sku_producto == sku,
                    LoteInventario.estado_calidad == "Aprobado",
                    LoteInventario.ubicacion_id == prioritized_id,
                    LoteInventario.cantidad_actual > 0,
                )
            ).order_by(LoteInventario.fecha_recepcion)
        )
        lotes_prio = list(res.scalars().all())

    ids_prio = {l.id for l in lotes_prio}

    # Lotes generales
    res = await db.execute(
        select(LoteInventario).where(
            and_(
                LoteInventario.sku_producto == sku,
                LoteInventario.estado_calidad == "Aprobado",
                LoteInventario.cantidad_actual > 0,
            )
        ).order_by(LoteInventario.fecha_recepcion)
    )
    lotes_generales = [l for l in res.scalars().all() if l.id not in ids_prio]
    todos = lotes_prio + lotes_generales

    restante = cantidad
    plan = []

    for lote in todos:
        if restante <= 0:
            break
        tomar = min(lote.cantidad_actual, restante)
        plan.append({
            "lote_id": lote.lote_id,
            "sku_producto": sku,
            "cantidad_consumida": tomar,
            "oc_origen": lote.oc_origen or "N/A",
        })
        lote.cantidad_actual -= tomar

        db.add(MovimientoLote(
            lote_id=lote.lote_id,
            fecha=datetime.utcnow(),
            tipo="CONSUMO_PRODUCCION",
            cantidad=-tomar,
            detalles=detalles,
        ))
        restante -= tomar

    if restante > 0.001:
        raise HTTPException(
            status_code=400,
            detail=f"Stock insuficiente para {sku}. Faltan {restante:.2f}"
        )

    return plan


async def _crear_lote_produccion(
    db: AsyncSession,
    sku: str,
    cantidad: float,
    op_origen: str,
) -> str:
    """Crea un lote de producto terminado en inventario."""
    ahora = _ahora_local()
    sufijo = sku[-4:] if len(sku) >= 4 else sku
    lote_id = f"PROD-{ahora.strftime('%d%m%y%H%M%S')}-{sufijo}"

    lote = LoteInventario(
        lote_id=lote_id,
        sku_producto=sku,
        cantidad_actual=cantidad,
        cantidad_inicial=cantidad,
        fecha_recepcion=datetime.utcnow(),
        op_origen=op_origen,
        estado_calidad="Aprobado",
    )
    db.add(lote)

    db.add(MovimientoLote(
        lote_id=lote_id,
        fecha=datetime.utcnow(),
        tipo="PRODUCCION",
        cantidad=cantidad,
        detalles={"op_origen": op_origen, "sku": sku},
    ))

    return lote_id


# ══════════════════════════════════════════════════════════════════
# VISTA UNIFICADA
# ══════════════════════════════════════════════════════════════════

@router.get("/", response_model=List[OrdenProduccionResponse])
@router.get("", response_model=List[OrdenProduccionResponse])
async def listar_ordenes(
    clase: Optional[str] = None,
    status: Optional[str] = None,
    activas: Optional[bool] = None,
    limite: int = 200,
    db: AsyncSession = Depends(get_db),
):
    query = select(OrdenProduccion)
    if clase:
        query = query.where(OrdenProduccion.clase_produccion == clase.upper())
    if status:
        query = query.where(OrdenProduccion.status == status)
    if activas is True:
        query = query.where(OrdenProduccion.status != "Finalizado")
    elif activas is False:
        query = query.where(OrdenProduccion.status == "Finalizado")

    query = query.order_by(OrdenProduccion.fecha_inicio.desc()).limit(limite)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/unificadas")
@router.get("/unificadas/")
async def listar_ordenes_unificadas(
    activas: bool = True,
    limite: int = 200,
    db: AsyncSession = Depends(get_db),
):
    query = select(OrdenProduccion)
    if activas:
        query = query.where(OrdenProduccion.status != "Finalizado")
    else:
        query = query.where(OrdenProduccion.status == "Finalizado")

    query = query.order_by(OrdenProduccion.fecha_inicio.desc()).limit(limite)
    result = await db.execute(query)
    ordenes = result.scalars().all()

    unificadas = []
    for op in ordenes:
        if op.clase_produccion == "PRE-EXPANSION":
            progreso = f"{op.cantidad_producida:.2f} / {op.cantidad_a_producir:.2f} kg"
        else:
            progreso = f"{int(op.cantidad_producida)} / {int(op.cantidad_a_producir)}"

        unificadas.append({
            "id": op.op_id,
            "tipo": op.clase_produccion,
            "sku": op.sku_producto,
            "nombre": op.nombre_producto or "",
            "progreso": progreso,
            "status": op.status,
            "fecha": op.fecha_inicio,
            "linea": op.linea_produccion,
            "operador": op.operador,
        })

    return unificadas


@router.get("/{op_id}", response_model=OrdenProduccionResponse)
@router.get("/{op_id}/", response_model=OrdenProduccionResponse)
async def obtener_orden(op_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(OrdenProduccion).where(OrdenProduccion.op_id == op_id)
    )
    op = result.scalar_one_or_none()
    if not op:
        raise HTTPException(status_code=404, detail="Orden de producción no encontrada")
    return op


# ══════════════════════════════════════════════════════════════════
# PRE-EXPANSIÓN
# ══════════════════════════════════════════════════════════════════

@router.post("/pre-expansion/iniciar")
@router.post("/pre-expansion/iniciar/")
async def iniciar_pre_expansion(
    data: IniciarPreExpansionRequest,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_prod_role(user)

    if data.cantidad_usada <= 0 or data.cantidad_a_producir <= 0:
        raise HTTPException(status_code=400, detail="Las cantidades deben ser mayores a cero")

    # Verificar stock disponible (informativo, no bloquea)
    stock = await _consultar_stock_aprobado(db, data.sku_materia_prima)
    mensaje_stock = ""
    oc_generada = None

    if stock < data.cantidad_usada:
        faltante = data.cantidad_usada - stock

        # ── Auto-generar Orden de Compra ──
        ahora = _ahora_local()
        oc_id = f"OC-PROD-{ahora.strftime('%Y%m%d%H%M%S')}"

        # Buscar nombre de la materia prima
        nombre_mp = data.sku_materia_prima
        prod_mp = await db.execute(
            select(Producto).where(Producto.sku == data.sku_materia_prima)
        )
        prod_mp_obj = prod_mp.scalar_one_or_none()
        if prod_mp_obj and prod_mp_obj.nombre:
            nombre_mp = prod_mp_obj.nombre

        nueva_oc = OCModel(
            oc_id=oc_id,
            id_proveedor="POR-ASIGNAR",
            nombre_proveedor="Por asignar",
            status="Pendiente Aprobación",
            origen="PRODUCCION",
            notas=f"Generada automáticamente desde Pre-Expansión. "
                  f"Materia prima: {data.sku_materia_prima}. "
                  f"Stock actual: {stock:.2f} kg, requerido: {data.cantidad_usada:.2f} kg, "
                  f"faltante: {faltante:.2f} kg. Operador: {data.operador or 'N/A'}.",
            creado_por=f"SISTEMA (Pre-Expansión - {user.username})",
        )
        db.add(nueva_oc)
        await db.flush()

        item_oc = OCItemModel(
            orden_compra_id=nueva_oc.id,
            sku_producto=data.sku_materia_prima,
            nombre_producto=nombre_mp,
            cantidad_requerida=faltante,
            cantidad_recibida=0,
            precio_unitario=0,
            moneda="MXN",
        )
        db.add(item_oc)

        oc_generada = oc_id
        mensaje_stock = (
            f" ⚠️ Stock insuficiente de {data.sku_materia_prima} "
            f"(disponible: {stock:.2f}, requerido: {data.cantidad_usada:.2f}). "
            f"Se generó la orden de compra {oc_id} pendiente de aprobación por Compras."
        )

    op_id = await _generar_op_id(db, data.sku_producto_resina, "PRE-EXPANSION")

    orden = OrdenProduccion(
        op_id=op_id,
        clase_produccion="PRE-EXPANSION",
        sku_producto=data.sku_producto_resina,
        nombre_producto="",
        sku_materia_prima=data.sku_materia_prima,
        cantidad_a_producir=data.cantidad_a_producir,
        cantidad_usada_requerida=data.cantidad_usada,
        operador=data.operador,
        ubicacion_destino=data.ubicacion_destino or "PISO",
        status="En Proceso",
        fecha_inicio=datetime.utcnow(),
        creado_por=user.username,
    )
    db.add(orden)

    # Buscar nombre del producto
    producto = await db.execute(
        select(Producto).where(Producto.sku == data.sku_producto_resina)
    )
    prod = producto.scalar_one_or_none()
    if prod:
        orden.nombre_producto = prod.nombre or ""

    await db.commit()
    await db.refresh(orden)

    return {
        "message": f"Lote de pre-expansión {op_id} iniciado.{mensaje_stock}",
        "op_id": op_id,
        "oc_generada": oc_generada,
    }


@router.post("/pre-expansion/{op_id}/produccion-parcial")
@router.post("/pre-expansion/{op_id}/produccion-parcial/")
async def registrar_produccion_parcial(
    op_id: str,
    data: RegistroParciallPreExpRequest,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_prod_role(user)

    result = await db.execute(
        select(OrdenProduccion).where(
            and_(
                OrdenProduccion.op_id == op_id,
                OrdenProduccion.clase_produccion == "PRE-EXPANSION",
            )
        )
    )
    op = result.scalar_one_or_none()
    if not op:
        raise HTTPException(status_code=404, detail="Lote de pre-expansión no encontrado")

    if op.status == "Finalizado":
        raise HTTPException(status_code=400, detail="El lote ya está finalizado")

    if data.cantidad_parcial_producida <= 0:
        raise HTTPException(status_code=400, detail="La cantidad debe ser mayor a cero")

    if op.cantidad_a_producir == 0:
        raise HTTPException(status_code=400, detail="La cantidad a producir no puede ser cero")

    # Calcular materia prima proporcional a consumir
    cantidad_a_consumir = math.ceil(
        (data.cantidad_parcial_producida * op.cantidad_usada_requerida) / op.cantidad_a_producir
    )

    # Consumir materia prima FIFO
    plan_consumo = await _consumir_stock_fifo(
        db, op.sku_materia_prima, cantidad_a_consumir,
        {"op_id": op_id, "tipo": "PRE-EXPANSION"}
    )

    # Registrar parcial
    registro = {
        "fecha": datetime.utcnow().isoformat(),
        "cantidad_producida": data.cantidad_parcial_producida,
        "cantidad_consumida": cantidad_a_consumir,
        "lotes_materia_prima_usados": plan_consumo,
    }

    parciales = list(op.registros_parciales or [])
    parciales.append(registro)
    op.registros_parciales = parciales
    op.cantidad_producida += data.cantidad_parcial_producida
    op.cantidad_total_consumida += cantidad_a_consumir

    await db.commit()

    return {
        "message": f"Producción parcial registrada: {data.cantidad_parcial_producida} kg",
        "op_id": op_id,
        "cantidad_total_producida": op.cantidad_producida,
        "cantidad_total_consumida": op.cantidad_total_consumida,
    }


@router.post("/pre-expansion/{op_id}/finalizar")
@router.post("/pre-expansion/{op_id}/finalizar/")
async def finalizar_pre_expansion(
    op_id: str,
    data: FinalizarPreExpansionRequest,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_prod_role(user)

    result = await db.execute(
        select(OrdenProduccion).where(
            and_(
                OrdenProduccion.op_id == op_id,
                OrdenProduccion.clase_produccion == "PRE-EXPANSION",
            )
        )
    )
    op = result.scalar_one_or_none()
    if not op:
        raise HTTPException(status_code=404, detail="Lote de pre-expansión no encontrado")

    destino = data.ubicacion_destino_final or op.ubicacion_destino
    if not destino:
        raise HTTPException(status_code=400, detail="No se especificó ubicación de destino")

    lote_inv_id = None
    if op.cantidad_producida > 0:
        lote_inv_id = await _crear_lote_produccion(
            db, op.sku_producto, op.cantidad_producida, op_id
        )

    op.status = "Finalizado"
    op.fecha_fin = datetime.utcnow()
    op.lote_inventario_generado = lote_inv_id
    op.ubicacion_destino = destino

    await db.commit()

    return {
        "message": f"Lote {op_id} finalizado",
        "op_id": op_id,
        "lote_inventario_generado": lote_inv_id,
    }


# ══════════════════════════════════════════════════════════════════
# INYECCIÓN
# ══════════════════════════════════════════════════════════════════

@router.post("/inyeccion/iniciar")
@router.post("/inyeccion/iniciar/")
async def iniciar_inyeccion(
    data: IniciarInyeccionRequest,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_prod_role(user)

    producto = await _get_producto(db, data.sku_producto)
    bom = producto.bom or []

    # Buscar componente tipo RESINA en el BOM
    componente_resina = None
    for comp in bom:
        sku_comp = comp.get("sku_componente")
        if sku_comp:
            res_prod = await db.execute(
                select(Producto).where(Producto.sku == sku_comp)
            )
            prod_comp = res_prod.scalar_one_or_none()
            if prod_comp and (prod_comp.tipo or "").upper() == "RESINA":
                componente_resina = comp
                break

    if not componente_resina:
        raise HTTPException(
            status_code=400,
            detail="No se encontró componente tipo 'RESINA' en el BOM del producto"
        )

    sku_resina = componente_resina["sku_componente"]
    cantidad_por_unidad = componente_resina.get("cantidad", 0)
    cantidad_resina_necesaria = math.ceil(data.cantidad_a_producir * cantidad_por_unidad)

    op_id = await _generar_op_id(db, data.sku_producto, "INYECCION")

    # Verificar stock
    stock = await _consultar_stock_aprobado(db, sku_resina)

    orden = OrdenProduccion(
        op_id=op_id,
        clase_produccion="INYECCION",
        sku_producto=data.sku_producto,
        nombre_producto=producto.nombre or "",
        linea_produccion=data.linea_produccion,
        cantidad_a_producir=data.cantidad_a_producir,
        cantidad_carrito=data.cantidad_carrito,
        operador=data.operador,
        fecha_inicio=datetime.utcnow(),
        creado_por=user.username,
    )

    if stock >= cantidad_resina_necesaria:
        consumo = await _consumir_stock_fifo(
            db, sku_resina, cantidad_resina_necesaria,
            {"op_id": op_id, "tipo": "INYECCION"},
            data.linea_produccion,
        )
        orden.status = "En Proceso"
        orden.material_consumido = consumo
        db.add(orden)
        await db.commit()
        await db.refresh(orden)

        return {
            "message": f"Orden {op_id} iniciada. Se consumieron {cantidad_resina_necesaria} kg de {sku_resina}.",
            "op_id": op_id,
            "status": "En Proceso",
        }
    else:
        orden.status = "Pendiente Material"
        orden.material_consumido = []
        db.add(orden)
        await db.commit()
        await db.refresh(orden)

        faltante = cantidad_resina_necesaria - stock
        return {
            "message": f"Orden {op_id} creada 'Pendiente Material'. Faltan {faltante:.2f} kg de {sku_resina}.",
            "op_id": op_id,
            "status": "Pendiente Material",
            "faltante": faltante,
            "sku_resina": sku_resina,
        }


@router.post("/inyeccion/{op_id}/pieza")
@router.post("/inyeccion/{op_id}/pieza/")
async def registrar_pieza_inyeccion(
    op_id: str,
    data: RegistrarPiezaRequest,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_prod_role(user)

    result = await db.execute(
        select(OrdenProduccion).where(
            and_(
                OrdenProduccion.op_id == op_id,
                OrdenProduccion.clase_produccion == "INYECCION",
            )
        )
    )
    op = result.scalar_one_or_none()
    if not op:
        raise HTTPException(status_code=404, detail="Orden de inyección no encontrada")

    if op.status == "Finalizado":
        raise HTTPException(status_code=400, detail="La orden ya está finalizada")

    cantidad_antes = op.cantidad_producida
    op.cantidad_producida += data.cantidad

    carrito_completado = False
    numero_carrito = 0
    if op.cantidad_carrito > 0 and op.cantidad_producida > 0:
        carritos_antes = int(cantidad_antes // op.cantidad_carrito)
        carritos_despues = int(op.cantidad_producida // op.cantidad_carrito)
        if carritos_despues > carritos_antes:
            carrito_completado = True
            numero_carrito = carritos_despues

    await db.commit()

    return {
        "message": f"Pieza registrada. Total: {int(op.cantidad_producida)}",
        "cantidad_producida": int(op.cantidad_producida),
        "carrito_completado": carrito_completado,
        "numero_carrito": numero_carrito,
    }


@router.post("/inyeccion/{op_id}/finalizar")
@router.post("/inyeccion/{op_id}/finalizar/")
async def finalizar_inyeccion(
    op_id: str,
    data: FinalizarInyeccionRequest,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_prod_role(user)

    result = await db.execute(
        select(OrdenProduccion).where(
            and_(
                OrdenProduccion.op_id == op_id,
                OrdenProduccion.clase_produccion == "INYECCION",
            )
        )
    )
    op = result.scalar_one_or_none()
    if not op:
        raise HTTPException(status_code=404, detail="Orden de inyección no encontrada")

    # Crear lote de producto terminado
    lote_inv_id = None
    if op.cantidad_producida > 0:
        lote_inv_id = await _crear_lote_produccion(
            db, op.sku_producto, op.cantidad_producida, op_id
        )

    op.status = "Finalizado"
    op.fecha_fin = datetime.utcnow()
    op.scrap_reportado = data.scrap_data
    op.lote_inventario_generado = lote_inv_id

    await db.commit()

    return {
        "message": f"Orden {op_id} finalizada",
        "op_id": op_id,
        "lote_inventario_generado": lote_inv_id,
    }


# ══════════════════════════════════════════════════════════════════
# ENSAMBLE (ASSY)
# ══════════════════════════════════════════════════════════════════

@router.post("/assy/iniciar")
@router.post("/assy/iniciar/")
async def iniciar_assy(
    data: IniciarAssyRequest,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_prod_role(user)

    producto = await _get_producto(db, data.sku_producto)
    bom = producto.bom or []
    if not bom:
        raise HTTPException(
            status_code=400,
            detail=f"El producto {data.sku_producto} no tiene BOM definido"
        )

    # Fase 1: Validar stock de todos los componentes
    componentes_faltantes = []
    plan_de_consumo = []

    for comp in bom:
        sku_comp = comp.get("sku_componente")
        cantidad_total = math.ceil(data.cantidad_a_producir * comp.get("cantidad", 0))
        if not sku_comp or cantidad_total <= 0:
            continue

        stock = await _consultar_stock_aprobado(db, sku_comp)
        if stock < cantidad_total:
            faltante = cantidad_total - stock
            componentes_faltantes.append({
                "sku": sku_comp,
                "requerido": cantidad_total,
                "disponible": stock,
                "faltante": faltante,
            })
        else:
            plan_de_consumo.append({"sku": sku_comp, "cantidad": cantidad_total})

    # Fase 2: Crear orden
    op_id = await _generar_op_id(db, data.sku_producto, "ASSY")

    orden = OrdenProduccion(
        op_id=op_id,
        clase_produccion="ASSY",
        sku_producto=data.sku_producto,
        nombre_producto=producto.nombre or "",
        linea_produccion=data.linea_produccion,
        cantidad_a_producir=data.cantidad_a_producir,
        cantidad_carrito=data.cantidad_carrito,
        uph_esperado=data.uph_esperado,
        metodo_conteo=data.metodo_conteo,
        operador=data.operador,
        fecha_inicio=datetime.utcnow(),
        creado_por=user.username,
    )

    if componentes_faltantes:
        # No hay suficiente stock
        orden.status = "Pendiente Material"
        orden.material_consumido = []
        db.add(orden)
        await db.commit()
        await db.refresh(orden)

        return {
            "message": f"Orden {op_id} creada 'Pendiente Material'",
            "op_id": op_id,
            "status": "Pendiente Material",
            "componentes_faltantes": componentes_faltantes,
        }
    else:
        # Consumir todo
        material_consumido = []
        for item in plan_de_consumo:
            consumo = await _consumir_stock_fifo(
                db, item["sku"], item["cantidad"],
                {"op_id": op_id, "tipo": "ASSY"},
                data.linea_produccion,
            )
            material_consumido.extend(consumo)

        orden.status = "En Proceso"
        orden.material_consumido = material_consumido
        db.add(orden)
        await db.commit()
        await db.refresh(orden)

        return {
            "message": f"Orden {op_id} iniciada. Material consumido del inventario.",
            "op_id": op_id,
            "status": "En Proceso",
        }


@router.post("/assy/{op_id}/pieza")
@router.post("/assy/{op_id}/pieza/")
async def registrar_pieza_assy(
    op_id: str,
    data: RegistrarPiezaRequest,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_prod_role(user)

    result = await db.execute(
        select(OrdenProduccion).where(
            and_(
                OrdenProduccion.op_id == op_id,
                OrdenProduccion.clase_produccion == "ASSY",
            )
        )
    )
    op = result.scalar_one_or_none()
    if not op:
        raise HTTPException(status_code=404, detail="Orden de ensamble no encontrada")

    if op.status == "Finalizado":
        raise HTTPException(status_code=400, detail="La orden ya está finalizada")

    cantidad_antes = op.cantidad_producida
    op.cantidad_producida += data.cantidad

    carrito_completado = False
    numero_carrito = 0
    if op.cantidad_carrito > 0 and op.cantidad_producida > 0:
        carritos_antes = int(cantidad_antes // op.cantidad_carrito)
        carritos_despues = int(op.cantidad_producida // op.cantidad_carrito)
        if carritos_despues > carritos_antes:
            carrito_completado = True
            numero_carrito = carritos_despues

    await db.commit()

    return {
        "message": f"Pieza registrada. Total: {int(op.cantidad_producida)}",
        "cantidad_producida": int(op.cantidad_producida),
        "carrito_completado": carrito_completado,
        "numero_carrito": numero_carrito,
    }


@router.post("/assy/{op_id}/finalizar")
@router.post("/assy/{op_id}/finalizar/")
async def finalizar_assy(
    op_id: str,
    data: FinalizarAssyRequest,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_prod_role(user)

    result = await db.execute(
        select(OrdenProduccion).where(
            and_(
                OrdenProduccion.op_id == op_id,
                OrdenProduccion.clase_produccion == "ASSY",
            )
        )
    )
    op = result.scalar_one_or_none()
    if not op:
        raise HTTPException(status_code=404, detail="Orden de ensamble no encontrada")

    lote_inv_id = None
    if op.cantidad_producida > 0:
        lote_inv_id = await _crear_lote_produccion(
            db, op.sku_producto, op.cantidad_producida, op_id
        )

    op.status = "Finalizado"
    op.fecha_fin = datetime.utcnow()
    op.scrap_reportado = data.scrap_data
    op.lote_inventario_generado = lote_inv_id

    await db.commit()

    return {
        "message": f"Orden {op_id} finalizada",
        "op_id": op_id,
        "lote_inventario_generado": lote_inv_id,
    }


# ══════════════════════════════════════════════════════════════════
# SURTIR MATERIAL PENDIENTE (cualquier clase)
# ══════════════════════════════════════════════════════════════════

@router.post("/{op_id}/surtir-material")
@router.post("/{op_id}/surtir-material/")
async def surtir_material_pendiente(
    op_id: str,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_prod_role(user)

    result = await db.execute(
        select(OrdenProduccion).where(OrdenProduccion.op_id == op_id)
    )
    op = result.scalar_one_or_none()
    if not op:
        raise HTTPException(status_code=404, detail="Orden no encontrada")

    if op.status != "Pendiente Material":
        raise HTTPException(status_code=400, detail="La orden no está pendiente de material")

    producto = await _get_producto(db, op.sku_producto)
    bom = producto.bom or []
    if not bom:
        raise HTTPException(status_code=400, detail="Producto sin BOM")

    # Verificar disponibilidad
    plan_de_consumo = []
    for comp in bom:
        sku_comp = comp.get("sku_componente")
        cantidad_total = math.ceil(op.cantidad_a_producir * comp.get("cantidad", 0))
        if not sku_comp or cantidad_total <= 0:
            continue

        stock = await _consultar_stock_aprobado(db, sku_comp)
        if stock < cantidad_total:
            raise HTTPException(
                status_code=400,
                detail=f"Aún falta material: {sku_comp} (disponible: {stock:.2f}, requerido: {cantidad_total:.2f})"
            )
        plan_de_consumo.append({"sku": sku_comp, "cantidad": cantidad_total})

    # Consumir todo
    material_consumido = []
    for item in plan_de_consumo:
        consumo = await _consumir_stock_fifo(
            db, item["sku"], item["cantidad"],
            {"op_id": op_id, "tipo": op.clase_produccion},
            op.linea_produccion,
        )
        material_consumido.extend(consumo)

    op.status = "En Proceso"
    op.material_consumido = material_consumido

    await db.commit()

    return {
        "message": f"Material surtido. Orden {op_id} ahora 'En Proceso'.",
        "op_id": op_id,
        "status": "En Proceso",
    }


# ══════════════════════════════════════════════════════════════════
# PAROS
# ══════════════════════════════════════════════════════════════════

@router.post("/{op_id}/paro/iniciar")
@router.post("/{op_id}/paro/iniciar/")
async def iniciar_paro(
    op_id: str,
    data: RegistrarParoRequest,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_prod_role(user)

    result = await db.execute(
        select(OrdenProduccion).where(OrdenProduccion.op_id == op_id)
    )
    op = result.scalar_one_or_none()
    if not op:
        raise HTTPException(status_code=404, detail="Orden no encontrada")

    paros = list(op.paros or [])

    # Verificar que no haya paro activo
    paro_activo = next((p for p in paros if p.get("status") == "Activo"), None)
    if paro_activo:
        raise HTTPException(status_code=400, detail="Ya hay un paro activo en esta orden")

    import uuid
    nuevo_paro = {
        "id": str(uuid.uuid4()),
        "motivo": data.motivo,
        "inicio": datetime.utcnow().isoformat(),
        "fin": None,
        "duracion_segundos": 0,
        "status": "Activo",
    }
    paros.append(nuevo_paro)
    op.paros = paros

    await db.commit()

    return {"message": "Paro iniciado", "paro_id": nuevo_paro["id"]}


@router.post("/{op_id}/paro/finalizar")
@router.post("/{op_id}/paro/finalizar/")
async def finalizar_paro(
    op_id: str,
    user: Usuario = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_prod_role(user)

    result = await db.execute(
        select(OrdenProduccion).where(OrdenProduccion.op_id == op_id)
    )
    op = result.scalar_one_or_none()
    if not op:
        raise HTTPException(status_code=404, detail="Orden no encontrada")

    paros = list(op.paros or [])
    paro_activo = next((p for p in paros if p.get("status") == "Activo"), None)

    if not paro_activo:
        raise HTTPException(status_code=400, detail="No hay paro activo en esta orden")

    ahora = datetime.utcnow()
    paro_activo["status"] = "Finalizado"
    paro_activo["fin"] = ahora.isoformat()

    try:
        inicio = datetime.fromisoformat(paro_activo["inicio"])
        paro_activo["duracion_segundos"] = (ahora - inicio).total_seconds()
    except Exception:
        paro_activo["duracion_segundos"] = 0

    op.paros = paros

    await db.commit()

    return {
        "message": "Paro finalizado",
        "duracion_segundos": paro_activo["duracion_segundos"],
    }