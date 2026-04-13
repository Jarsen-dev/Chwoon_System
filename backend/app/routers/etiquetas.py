from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List
from datetime import datetime

from app.database import AsyncSessionLocal
from app.models.cola_impresion import ColaImpresion
from app.models.inventario     import InventarioPlanta
from app.schemas.cola          import ColaItem, ColaItemCreate
from app.services.pdf_generator import generar_pdf_etiquetas
from app.core.deps             import get_current_user
from app.models.usuario        import Usuario

router = APIRouter(prefix="/etiquetas", tags=["etiquetas"])


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


def _build_cola_item(cola: ColaImpresion, inv: InventarioPlanta) -> dict:
    return {
        "id":                 cola.id,
        "codigo_inventario":  cola.codigo_inventario,
        "numero_parte":       inv.codigo,
        "descripcion":        inv.descripcion or "",
        "cantidad_etiquetas": cola.cantidad_etiquetas,
        "turno":              cola.turno,
        "estado":             cola.estado,
        "user":               cola.usuario,
    }


# ── GET /cola/ — sin auth ─────────────────────────────────────────────
@router.get("/cola/", response_model=List[ColaItem])
@router.get("/cola",  response_model=List[ColaItem])
async def obtener_cola(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(ColaImpresion, InventarioPlanta)
        .join(
            InventarioPlanta,
            ColaImpresion.codigo_inventario == InventarioPlanta.codigo,
        )
        .where(ColaImpresion.estado == "pendiente")
        .order_by(ColaImpresion.id.asc())
    )
    return [_build_cola_item(cola, inv) for cola, inv in result.all()]


# ── POST /cola/ — requiere auth ───────────────────────────────────────
@router.post("/cola/", response_model=ColaItem)
@router.post("/cola",  response_model=ColaItem)
async def agregar_a_cola(
    item:         ColaItemCreate,
    db:           AsyncSession = Depends(get_db),
    current_user: Usuario      = Depends(get_current_user),
):
    result = await db.execute(
        select(InventarioPlanta).where(
            InventarioPlanta.codigo == item.codigo_inventario
        )
    )
    inv = result.scalar_one_or_none()
    if not inv:
        raise HTTPException(
            status_code=404,
            detail=f"Código '{item.codigo_inventario}' no encontrado en inventario",
        )

    db_item = ColaImpresion(
        codigo_inventario  = item.codigo_inventario,
        cantidad_etiquetas = item.cantidad_etiquetas,
        turno              = item.turno,
        estado             = "pendiente",
        created_at         = datetime.utcnow(),
        usuario            = current_user.username,
    )
    db.add(db_item)
    await db.commit()
    await db.refresh(db_item)

    return _build_cola_item(db_item, inv)


# ── DELETE /cola/limpiar — sin auth ───────────────────────────────────
@router.delete("/cola/limpiar/")
@router.delete("/cola/limpiar")
async def limpiar_cola(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        delete(ColaImpresion).where(ColaImpresion.estado == "pendiente")
    )
    await db.commit()
    return {"message": "Cola limpiada", "eliminados": result.rowcount}


# ── DELETE /cola/{item_id} — sin auth ────────────────────────────────
@router.delete("/cola/{item_id}")
async def eliminar_de_cola(
    item_id: int,
    db:      AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ColaImpresion).where(ColaImpresion.id == item_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=404,
            detail=f"Item {item_id} no encontrado en la cola",
        )
    await db.delete(item)
    await db.commit()
    return {"message": f"Item {item_id} eliminado de la cola"}


# ── POST /generar/ — requiere auth ────────────────────────────────────
@router.post("/generar/")
@router.post("/generar")
async def generar_pdf(
    db:           AsyncSession = Depends(get_db),
    current_user: Usuario      = Depends(get_current_user),
):
    result = await db.execute(
        select(ColaImpresion, InventarioPlanta)
        .join(
            InventarioPlanta,
            ColaImpresion.codigo_inventario == InventarioPlanta.codigo,
        )
        .where(ColaImpresion.estado == "pendiente")
        .order_by(ColaImpresion.id.asc())
    )
    registros = result.all()

    if not registros:
        raise HTTPException(
            status_code=400,
            detail="No hay etiquetas pendientes en la cola",
        )

    items_cola = []
    for cola, inv in registros:
        items_cola.append({
            "numero_parte":          inv.codigo,
            "descripcion":           inv.descripcion           or "",
            "cantidad_por_etiqueta": int(inv.qtu              or 1),
            "cliente_lg":            inv.linea_lg              or "",
            "linea":                 inv.linea                 or "",
            "id_interno":            inv.tipo                  or "",
            "turno":                 cola.turno,
            "cantidad_etiquetas":    cola.cantidad_etiquetas,
            "usuario":               cola.usuario,
        })
        cola.estado = "generado"

    pdf_bytes = await generar_pdf_etiquetas(items_cola)
    await db.commit()

    return Response(
        content     = pdf_bytes,
        media_type  = "application/pdf",
        headers     = {
            "Content-Disposition": (
                f"attachment; filename=lote_etiquetas_{current_user.username}.pdf"
            )
        },
    )