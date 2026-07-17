from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from typing import List, Optional
import pandas as pd
import io

from app.database import AsyncSessionLocal
from app.models.producto import Producto
from app.schemas.productos import (
    Producto as ProductoSchema,
    ProductoCreate,
    ProductoUpdate,
    ProductoBomUpdate,
    PuntosInspeccionUpdate,
    ProductoStatusUpdate,
    ProductoListPage,
)

router = APIRouter(prefix="/productos", tags=["productos"])


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


def asignar_controles(tipo: str, clase_producto: str = "", id_proceso: str = "") -> list:
    t = (tipo or "").strip().upper()
    c = (clase_producto or "").strip().upper()
    p = (id_proceso or "").strip().upper()
    
    if t == "COMPONENTE" and c == "INYECCIÓN" and p in ("ASSY", "BLOCK"):
        return ["LQC"]

    if t == "COMPONENTE" and c == "INYECCIÓN" and p == "PACKING":
        return ["OQC"]
    
    if t == "PRODUCTO FINAL":
        return ["OQC"]
    
    if t in ["COMPONENTE", "RESINA"]:
        return ["IQC"]
    elif t == "PRODUCTO FINAL":
        return ["LQC", "OQC"]
    
    return []


@router.get("/", response_model=ProductoListPage)
async def listar_productos(
    search: Optional[str] = Query(None, description="Busca en SKU, modelo, descripción y cliente"),
    tipo: Optional[str] = Query(None),
    clase: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    filtros = []
    if search and search.strip():
        q = f"%{search.strip()}%"
        filtros.append(or_(
            Producto.sku.ilike(q),
            Producto.modelo.ilike(q),
            Producto.descripcion.ilike(q),
            Producto.cliente.ilike(q),
            Producto.cliente_id.ilike(q),
        ))
    if tipo:
        filtros.append(Producto.tipo == tipo)
    if clase:
        filtros.append(Producto.clase_producto == clase)
    if status:
        filtros.append(Producto.status == status)

    total = (await db.execute(
        select(func.count()).select_from(Producto).where(*filtros)
    )).scalar_one()

    result = await db.execute(
        select(
            Producto.id,
            Producto.sku,
            Producto.nombre,
            Producto.tipo,
            Producto.clase_producto,
            Producto.unidad_de_medida,
            Producto.descripcion,
            Producto.cantidad_carrito,
            Producto.proveedor,
            Producto.cliente,
            Producto.cliente_id,
            Producto.modelo,
            Producto.linea_produccion,
            Producto.ubicacion,
            Producto.status,
            Producto.controles_calidad,
            func.coalesce(func.json_array_length(Producto.bom), 0).label("bom_count"),
        )
        .where(*filtros)
        .order_by(Producto.sku, Producto.id)
        .limit(limit)
        .offset(offset)
    )
    items = [dict(r) for r in result.mappings().all()]
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/search/sku", response_model=List[ProductoSchema])
async def buscar_producto_por_sku(
    q: str = Query(..., min_length=2, description="Texto a buscar en SKU"),
    tipo: Optional[str] = Query(None, description="Filtrar por tipo de producto"),
    db: AsyncSession = Depends(get_db)
):
    """Busca productos cuyo SKU contenga el texto proporcionado (case-insensitive)."""
    search = q.strip().upper()
    query = select(Producto).where(Producto.sku.ilike(f"%{search}%"))
    if tipo:
        query = query.where(Producto.tipo.ilike(f"%{tipo.strip().upper()}%"))
    query = query.order_by(func.length(Producto.sku)).limit(20)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/", response_model=ProductoSchema)
async def crear_producto(data: ProductoCreate, db: AsyncSession = Depends(get_db)):
    d = data.model_dump()
    d["sku"] = d["sku"].strip().upper()
    d["modelo"] = (d.get("modelo") or "").strip().upper()
    d["tipo"] = (d.get("tipo") or "").strip().upper()

    existing = await db.execute(
        select(Producto).where(Producto.sku == d["sku"], Producto.modelo == d["modelo"])
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, f"Ya existe un producto con SKU {d['sku']} y Modelo {d['modelo']}")
    
    # Extraer clase e id_proceso para asignar controles
    clase = (d.get("clase_producto") or "").strip().upper()
    caract = d.get("caracteristicas_inyeccion") or {}
    id_proceso = (caract.get("id_proceso") or "").strip().upper()
    
    d["controles_calidad"] = asignar_controles(d["tipo"], clase, id_proceso)
    d.setdefault("puntos_inspeccion_iqc", [])
    d.setdefault("puntos_inspeccion_lqc", [])
    d.setdefault("puntos_inspeccion_oqc", [])
    d.setdefault("bom", [])
    d.setdefault("caracteristicas_inyeccion", {})
    d.setdefault("caracteristicas_resina", {})
    d["status"] = "Activo"

    db_obj = Producto(**d)
    db.add(db_obj)
    await db.commit()
    await db.refresh(db_obj)
    return db_obj


@router.get("/id/{producto_id}", response_model=ProductoSchema)
async def obtener_producto_por_id(producto_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Producto).where(Producto.id == producto_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Producto no encontrado")
    return p


@router.get("/{sku}", response_model=ProductoSchema)
async def obtener_producto(sku: str, db: AsyncSession = Depends(get_db)):
    # Puede haber varios productos con el mismo SKU (unicidad por sku+modelo);
    # se devuelve el primero por modelo para las pantallas que buscan solo por SKU.
    result = await db.execute(
        select(Producto).where(Producto.sku == sku.upper()).order_by(Producto.modelo)
    )
    p = result.scalars().first()
    if not p:
        raise HTTPException(404, "Producto no encontrado")
    return p


@router.put("/{producto_id}", response_model=ProductoSchema)
async def actualizar_producto(producto_id: int, data: ProductoUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Producto).where(Producto.id == producto_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Producto no encontrado")

    upd = data.model_dump(exclude_unset=True)
    if "modelo" in upd:
        upd["modelo"] = (upd["modelo"] or "").strip().upper()
    if "tipo" in upd:
        upd["tipo"] = (upd["tipo"] or "").strip().upper()
    
    # Recalcular controles si cambia tipo, clase o características de inyección
    tipo_actual = upd.get("tipo", p.tipo)
    clase_actual = upd.get("clase_producto", p.clase_producto)
    caract_actual = upd.get("caracteristicas_inyeccion", p.caracteristicas_inyeccion) or {}
    id_proceso_actual = (caract_actual.get("id_proceso") or "").strip().upper()
    
    upd["controles_calidad"] = asignar_controles(tipo_actual, clase_actual, id_proceso_actual)

    for field, value in upd.items():
        setattr(p, field, value)

    await db.commit()
    await db.refresh(p)
    return p


@router.delete("/{producto_id}")
async def eliminar_producto(producto_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Producto).where(Producto.id == producto_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Producto no encontrado")
    sku = p.sku
    await db.delete(p)
    await db.commit()
    return {"message": f"Producto {sku} eliminado"}


@router.post("/delete-batch")
async def eliminar_batch(data: dict, db: AsyncSession = Depends(get_db)):
    ids = data.get("ids", [])
    deleted = 0
    for producto_id in ids:
        result = await db.execute(select(Producto).where(Producto.id == producto_id))
        p = result.scalar_one_or_none()
        if p:
            await db.delete(p)
            deleted += 1
    await db.commit()
    return {"message": f"{deleted} eliminado(s)"}


@router.post("/status-batch")
async def cambiar_status(data: ProductoStatusUpdate, db: AsyncSession = Depends(get_db)):
    updated = 0
    for producto_id in data.ids:
        result = await db.execute(select(Producto).where(Producto.id == producto_id))
        p = result.scalar_one_or_none()
        if p:
            p.status = data.status
            updated += 1
    await db.commit()
    return {"message": f"{updated} actualizado(s)"}


@router.put("/{producto_id}/puntos-inspeccion")
async def update_puntos(producto_id: int, data: PuntosInspeccionUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Producto).where(Producto.id == producto_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Producto no encontrado")

    campo = f"puntos_inspeccion_{data.tipo_control.lower()}"
    if not hasattr(p, campo):
        raise HTTPException(400, f"Control inválido: {data.tipo_control}")

    setattr(p, campo, data.puntos)
    await db.commit()
    await db.refresh(p)
    return {"message": f"Puntos {data.tipo_control.upper()} actualizados"}


@router.put("/{producto_id}/bom")
async def update_bom(producto_id: int, data: ProductoBomUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Producto).where(Producto.id == producto_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(404, "Producto no encontrado")

    p.bom = [item.model_dump() for item in data.bom]
    await db.commit()
    await db.refresh(p)
    return {"message": f"BOM actualizado para {p.sku}"}


@router.post("/importar")
async def importar_productos(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents), dtype=str)
        df = df.where(pd.notnull(df), "")

        df.columns = (
            df.columns
            .str.strip()
            .str.lower()
            .str.replace(" ", "_", regex=False)
            .str.replace("á", "a", regex=False)
            .str.replace("é", "e", regex=False)
            .str.replace("í", "i", regex=False)
            .str.replace("ó", "o", regex=False)
            .str.replace("ú", "u", regex=False)
            .str.replace("ñ", "n", regex=False)
        )

        for col in df.columns:
            if df[col].dtype == "object":
                df[col] = df[col].str.strip().str.upper()

        CLASE_MAP = {
            "INYECCION": "INYECCIÓN",
            "INYECCIÓN": "INYECCIÓN",
            "PRE EXPANSION": "PRE EXPANSIÓN",
            "PRE EXPANSIÓN": "PRE EXPANSIÓN",
            "ASSY": "ASSY",
        }

        count = 0
        omitidos = 0
        sin_sku = 0
        for _, row in df.iterrows():
            sku = (row.get("sku") or row.get("numero_parte") or "").strip()
            modelo = (row.get("modelo") or row.get("nombre") or "").strip()

            if not sku:
                sin_sku += 1
                continue

            result = await db.execute(
                select(Producto).where(Producto.sku == sku, Producto.modelo == modelo)
            )
            if result.scalar_one_or_none():
                omitidos += 1
                continue

            tipo = row.get("tipo") or ""
            clase = (row.get("clase_producto") or row.get("clase") or "").strip().upper()

            # Extraer id_proceso de características si es inyección
            id_proceso = ""
            if clase in ("INYECCIÓN", "INYECCION"):
                id_proceso = (row.get("id_proceso") or "").strip().upper()

            controles = asignar_controles(tipo, clase, id_proceso)

            clase_raw = (row.get("clase_producto") or row.get("clase") or "").strip()
            clase = CLASE_MAP.get(clase_raw, clase_raw)

            unidad = row.get("unidad_de_medida") or row.get("unidad") or ""
            descripcion = row.get("descripcion") or ""
            proveedor = row.get("proveedor") or ""
            cliente = row.get("cliente") or ""
            cliente_id = row.get("cliente_id") or ""
            linea = row.get("linea_produccion") or row.get("linea") or ""
            ubicacion = row.get("ubicacion") or ""

            try:
                cant_carrito = int(float(row.get("cantidad_por_carrito") or row.get("cantidad_carrito") or 0))
            except (ValueError, TypeError):
                cant_carrito = 0

            caract = {}
            if clase in ("INYECCIÓN", "INYECCION"):
                try:
                    densidad = float(row.get("densidad") or 0)
                except (ValueError, TypeError):
                    densidad = 0.0
                try:
                    peso_spec = float(row.get("peso_spec") or row.get("peso") or 0)
                except (ValueError, TypeError):
                    peso_spec = 0.0
                try:
                    peso_seco = float(row.get("peso_seco") or 0)
                except (ValueError, TypeError):
                    peso_seco = 0.0
                try:
                    cav = int(float(row.get("cav") or row.get("cavidades") or 0))
                except (ValueError, TypeError):
                    cav = 0

                caract = {
                    "id_proceso": row.get("id_proceso") or "",
                    "tipo_resina": row.get("tipo_resina") or "",
                    "resina": row.get("resina") or "",
                    "densidad": densidad,
                    "peso_spec": peso_spec,
                    "peso_seco": peso_seco,
                    "cav": cav,
                }

            db.add(Producto(
                sku=sku,
                tipo=tipo,
                clase_producto=clase,
                unidad_de_medida=unidad,
                descripcion=descripcion,
                cantidad_carrito=cant_carrito,
                proveedor=proveedor,
                cliente=cliente,
                cliente_id=cliente_id,
                modelo=modelo,
                linea_produccion=linea,
                ubicacion=ubicacion,
                status="Activo",
                controles_calidad=controles,
                puntos_inspeccion_iqc=[],
                puntos_inspeccion_lqc=[],
                puntos_inspeccion_oqc=[],
                bom=[],
                caracteristicas_inyeccion=caract if caract else {},
            ))
            count += 1

        await db.commit()
        return {
            "message": (
                f"{count} producto(s) nuevo(s) importado(s). {omitidos} ya existían y se omitieron. "
                f"{sin_sku} fila(s) sin SKU fueron ignoradas."
            ),
            "count": count,
            "omitidos": omitidos,
            "sin_sku": sin_sku,
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(400, str(e))

@router.post("/importar-bom")
async def importar_bom(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    try:
        contents = await file.read()
        df = pd.read_excel(io.BytesIO(contents), dtype=str)
        df = df.where(pd.notnull(df), "")

        cache: dict = {}
        for _, row in df.iterrows():
            padre = (row.get("sku_producto_padre", "") or "").strip().upper()
            comp = (row.get("sku_componente", "") or "").strip().upper()
            cant = float(row.get("cantidad_necesaria", 0) or 0)
            if not padre or not comp or cant <= 0:
                continue

            if padre not in cache:
                result = await db.execute(select(Producto).where(Producto.sku == padre))
                p = result.scalar_one_or_none()
                if not p:
                    continue
                cache[padre] = {"producto": p, "bom": list(p.bom or [])}

            bom = cache[padre]["bom"]
            if not any(b["sku_componente"] == comp for b in bom):
                bom.append({"sku_componente": comp, "cantidad": cant})

        count = 0
        for data in cache.values():
            data["producto"].bom = data["bom"]
            count += 1

        await db.commit()
        return {"message": f"BOM para {count} producto(s)", "count": count}
    except Exception as e:
        raise HTTPException(400, str(e))