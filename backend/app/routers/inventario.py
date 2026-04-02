from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.database import AsyncSessionLocal
from app.models.inventario import InventarioPlanta
from app.schemas.inventario import Inventario, InventarioCreate, InventarioUpdate

router = APIRouter(prefix="/inventario", tags=["inventario"])

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

@router.get("/", response_model=List[Inventario])
async def listar_inventario(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(InventarioPlanta))
    return result.scalars().all()

@router.get("/{codigo}", response_model=Inventario)
async def obtener_inventario(
    codigo: str,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(InventarioPlanta).where(InventarioPlanta.codigo == codigo)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Código no encontrado")
    return item

@router.post("/", response_model=Inventario)
async def crear_inventario(
    item: InventarioCreate,
    db: AsyncSession = Depends(get_db)
):
    db_item = InventarioPlanta(**item.model_dump())
    db.add(db_item)
    await db.commit()
    await db.refresh(db_item)
    return db_item

@router.put("/{codigo}", response_model=Inventario)
async def actualizar_inventario(
    codigo: str,
    item_update: InventarioUpdate,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(InventarioPlanta).where(InventarioPlanta.codigo == codigo)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Código no encontrado")

    for field, value in item_update.model_dump(exclude_unset=True).items():
        setattr(item, field, value)

    await db.commit()
    await db.refresh(item)
    return item

@router.delete("/{codigo}")
async def eliminar_inventario(
    codigo: str,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(InventarioPlanta).where(InventarioPlanta.codigo == codigo)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Código no encontrado")

    await db.delete(item)
    await db.commit()
    return {"message": f"Código '{codigo}' eliminado del inventario"}