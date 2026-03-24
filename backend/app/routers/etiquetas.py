from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from typing import List

from app.database import AsyncSessionLocal
from app.models.cola_impresion import ColaImpresion
from app.models.parte import Parte
from app.schemas.cola import ColaItem, ColaItemCreate

# Servicio PDF (placeholder, luego lo implementamos)
from app.services.pdf_generator import generar_pdf_etiquetas

router = APIRouter(prefix="/etiquetas", tags=["etiquetas"])

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

@router.get("/cola/", response_model=List[ColaItem])
async def obtener_cola(db: AsyncSession = Depends(get_db)):
    """Obtener todos los items en cola de impresión"""
    result = await db.execute(
        select(ColaImpresion, Parte)
        .join(Parte, ColaImpresion.parte_id == Parte.id)
        .where(ColaImpresion.estado == "pendiente")
    )
    
    cola_items = []
    for cola, parte in result.all():
        cola_items.append({
            "id": cola.id,
            "parte_id": cola.parte_id,
            "numero_parte": parte.numero_parte,
            "descripcion": parte.descripcion,
            "cantidad_etiquetas": cola.cantidad_etiquetas,
            "turno": cola.turno,
            "estado": cola.estado
        })
    return cola_items

@router.post("/cola/", response_model=ColaItem)
async def agregar_a_cola(item: ColaItemCreate, db: AsyncSession = Depends(get_db)):
    """Agregar item a la cola de impresión"""
    # Verificar que la parte existe
    result = await db.execute(select(Parte).where(Parte.id == item.parte_id))
    parte = result.scalar_one_or_none()
    if not parte:
        raise HTTPException(status_code=404, detail="Parte no encontrada")
    
    db_item = ColaImpresion(**item.model_dump())
    db.add(db_item)
    await db.commit()
    await db.refresh(db_item)
    return db_item

@router.delete("/cola/{item_id}")
async def eliminar_de_cola(item_id: int, db: AsyncSession = Depends(get_db)):
    """Eliminar item de la cola"""
    result = await db.execute(select(ColaImpresion).where(ColaImpresion.id == item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Item no encontrado")
    
    await db.delete(item)
    await db.commit()
    return {"message": "Item eliminado de la cola"}

@router.delete("/cola/")
async def limpiar_cola(db: AsyncSession = Depends(get_db)):
    """Limpiar toda la cola de impresión"""
    await db.execute(delete(ColaImpresion).where(ColaImpresion.estado == "pendiente"))
    await db.commit()
    return {"message": "Cola limpiada"}

@router.post("/generar/")
async def generar_pdf(db: AsyncSession = Depends(get_db)):
    """Generar PDF con todas las etiquetas en cola"""
    result = await db.execute(
        select(ColaImpresion, Parte)
        .join(Parte, ColaImpresion.parte_id == Parte.id)
        .where(ColaImpresion.estado == "pendiente")
    )
    
    registros = result.all()
    
    items_cola = []
    for cola, parte in registros:
        items_cola.append({
            "numero_parte": parte.numero_parte,
            "descripcion": parte.descripcion,
            "cantidad_por_etiqueta": int(parte.cantidad_por_etiqueta or 1),
            "cliente_lg": parte.cliente_lg,
            "linea": parte.linea,
            "turno": cola.turno,
            "cantidad_etiquetas": cola.cantidad_etiquetas
        })
        cola.estado = "generado"
    
    if not items_cola:
        raise HTTPException(status_code=400, detail="No hay etiquetas en la cola")
    
    pdf_bytes = await generar_pdf_etiquetas(items_cola)
    
    await db.commit()
    
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": "attachment; filename=lote_etiquetas.pdf"}
    )