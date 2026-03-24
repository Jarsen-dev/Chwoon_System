from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.database import AsyncSessionLocal
from app.models.parte import Parte
from app.schemas.partes import Parte as ParteSchema, ParteCreate, ParteUpdate

router = APIRouter(prefix="/partes", tags=["partes"])

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

@router.get("/", response_model=List[ParteSchema])
async def listar_partes(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Parte))
    return result.scalars().all()

@router.post("/", response_model=ParteSchema)
async def crear_parte(parte: ParteCreate, db: AsyncSession = Depends(get_db)):
    db_parte = Parte(**parte.model_dump())
    db.add(db_parte)
    await db.commit()
    await db.refresh(db_parte)
    return db_parte

@router.get("/{numero_parte}", response_model=ParteSchema)
async def obtener_parte(numero_parte: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Parte).where(Parte.numero_parte == numero_parte))
    parte = result.scalar_one_or_none()
    if not parte:
        raise HTTPException(status_code=404, detail="Parte no encontrada")
    return parte

@router.put("/{numero_parte}", response_model=ParteSchema)
async def actualizar_parte(numero_parte: str, parte_update: ParteUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Parte).where(Parte.numero_parte == numero_parte))
    parte = result.scalar_one_or_none()
    if not parte:
        raise HTTPException(status_code=404, detail="Parte no encontrada")
    
    for field, value in parte_update.model_dump(exclude_unset=True).items():
        setattr(parte, field, value)
    
    await db.commit()
    await db.refresh(parte)
    return parte

@router.delete("/{numero_parte}")
async def eliminar_parte(numero_parte: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Parte).where(Parte.numero_parte == numero_parte))
    parte = result.scalar_one_or_none()
    if not parte:
        raise HTTPException(status_code=404, detail="Parte no encontrada")
    
    await db.delete(parte)
    await db.commit()
    return {"message": "Parte eliminada"}