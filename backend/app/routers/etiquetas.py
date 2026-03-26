from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List
from datetime import datetime

from app.database import AsyncSessionLocal
from app.models.cola_impresion import ColaImpresion
from app.models.parte import Parte
from app.schemas.cola import ColaItem, ColaItemCreate
from app.services.pdf_generator import generar_pdf_etiquetas

router = APIRouter(prefix="/etiquetas", tags=["etiquetas"])

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

# ==========================================
# HELPER: construir respuesta con JOIN
# ==========================================
def _build_cola_item(cola: ColaImpresion, parte: Parte) -> dict:
    """
    Siempre devuelve un dict completo con numero_parte y descripcion.
    Evita que el frontend reciba None en esos campos.
    """
    return {
        "id":                 cola.id,
        "parte_id":           cola.parte_id,
        "numero_parte":       parte.numero_parte,
        "descripcion":        parte.descripcion or "",
        "cantidad_etiquetas": cola.cantidad_etiquetas,
        "turno":              cola.turno,
        "estado":             cola.estado,
    }

# ==========================================
# GET /cola/
# ==========================================
@router.get("/cola/", response_model=List[ColaItem])
async def obtener_cola(db: AsyncSession = Depends(get_db)):
    """Obtener todos los items pendientes con datos de la parte"""
    result = await db.execute(
        select(ColaImpresion, Parte)
        .join(Parte, ColaImpresion.parte_id == Parte.id)
        .where(ColaImpresion.estado == "pendiente")
        .order_by(ColaImpresion.id.asc())
    )
    return [_build_cola_item(cola, parte) for cola, parte in result.all()]

# ==========================================
# POST /cola/
# ==========================================
@router.post("/cola/", response_model=ColaItem)
async def agregar_a_cola(
    item: ColaItemCreate,
    db:   AsyncSession = Depends(get_db)
):
    """Agregar item a la cola verificando que la parte existe"""
    # Verificar que la parte existe
    result = await db.execute(
        select(Parte).where(Parte.id == item.parte_id)
    )
    parte = result.scalar_one_or_none()
    if not parte:
        raise HTTPException(
            status_code=404,
            detail=f"Parte con id={item.parte_id} no encontrada"
        )

    db_item = ColaImpresion(
        parte_id=          item.parte_id,
        cantidad_etiquetas=item.cantidad_etiquetas,
        turno=             item.turno,
        estado=            "pendiente",
        created_at=        datetime.utcnow()
    )
    db.add(db_item)
    await db.commit()
    await db.refresh(db_item)

    return _build_cola_item(db_item, parte)

# ==========================================
# DELETE /cola/{item_id}
# ==========================================
@router.delete("/cola/{item_id}")
async def eliminar_de_cola(
    item_id: int,
    db:      AsyncSession = Depends(get_db)
):
    """Eliminar un item específico de la cola"""
    result = await db.execute(
        select(ColaImpresion).where(ColaImpresion.id == item_id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(
            status_code=404,
            detail=f"Item {item_id} no encontrado en la cola"
        )

    await db.delete(item)
    await db.commit()
    return {"message": f"Item {item_id} eliminado de la cola"}

# ==========================================
# DELETE /cola/limpiar/
# Ruta específica ANTES de /{item_id}
# para evitar conflicto de rutas
# ==========================================
@router.delete("/cola/limpiar/")
async def limpiar_cola(db: AsyncSession = Depends(get_db)):
    """Limpiar toda la cola de impresión pendiente"""
    result = await db.execute(
        delete(ColaImpresion).where(ColaImpresion.estado == "pendiente")
    )
    await db.commit()
    return {
        "message": "Cola limpiada",
        "eliminados": result.rowcount
    }

# ==========================================
# POST /generar/
# ==========================================
@router.post("/generar/")
async def generar_pdf(db: AsyncSession = Depends(get_db)):
    """Generar PDF con todas las etiquetas pendientes"""
    result = await db.execute(
        select(ColaImpresion, Parte)
        .join(Parte, ColaImpresion.parte_id == Parte.id)
        .where(ColaImpresion.estado == "pendiente")
        .order_by(ColaImpresion.id.asc())
    )
    registros = result.all()

    if not registros:
        raise HTTPException(
            status_code=400,
            detail="No hay etiquetas pendientes en la cola"
        )

    # Construir lista para el generador PDF
    items_cola = []
    for cola, parte in registros:
        items_cola.append({
            "numero_parte":        parte.numero_parte,
            "descripcion":         parte.descripcion or "",
            "cantidad_por_etiqueta": int(parte.cantidad_por_etiqueta or 1),
            "cliente_lg":          parte.cliente_lg or "",
            "linea":               parte.linea or "",
            "id_interno":          parte.id_interno or "",
            "turno":               cola.turno,
            "cantidad_etiquetas":  cola.cantidad_etiquetas
        })
        # Marcar como generado
        cola.estado = "generado"

    pdf_bytes = await generar_pdf_etiquetas(items_cola)
    await db.commit()

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": "attachment; filename=lote_etiquetas.pdf"
        }
    )