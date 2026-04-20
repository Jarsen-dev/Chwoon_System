from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
import pandas as pd
import io

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

@router.post("/importar-excel")
async def importar_excel(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="El archivo debe ser Excel (.xlsx o .xls)")

    contents = await file.read()
    df = pd.read_excel(io.BytesIO(contents))

    # --- NORMALIZAR COLUMNAS ---
    df.columns = (
        df.columns
        .str.strip()
        .str.lower()
        .str.replace(' ', '_')
        .str.replace('á', 'a')
        .str.replace('é', 'e')
        .str.replace('í', 'i')
        .str.replace('ó', 'o')
        .str.replace('ú', 'u')
        .str.replace('ñ', 'n')
        .str.replace('°', '')
        .str.replace('#', '')
        .str.replace('.', '')
    )

    # Mapeo de variantes comunes → nombre esperado
    column_map = {
        'n_parte': 'codigo',
        'no_parte': 'codigo',
        'numero_parte': 'codigo',
        'num_parte': 'codigo',
        'parte': 'codigo',
        'part_number': 'codigo',
        'n__parte': 'codigo',
        'no__parte': 'codigo',
        'description': 'descripcion',
        'maquina': 'linea',
        'line': 'linea',
        'type': 'tipo',
        'qty': 'qtu',
        'quantity': 'qtu',
        'piezas_por_carrito': 'qtu',
        'lg': 'linea_lg',
        'ayuda_visual_(link)': 'ayuda_visual',
        'ayuda_visual_link': 'ayuda_visual',
        'link': 'ayuda_visual',
    }

    df.rename(columns={k: v for k, v in column_map.items() if k in df.columns}, inplace=True)

    # Validar columna obligatoria
    if 'codigo' not in df.columns:
        raise HTTPException(
            status_code=400,
            detail=f"Columna 'codigo' no encontrada. Columnas detectadas: {list(df.columns)}"
        )

    # Columnas esperadas
    columnas = ['codigo', 'descripcion', 'linea', 'tipo', 'qtu', 'linea_lg', 'ayuda_visual']

    registros_creados = 0
    registros_actualizados = 0

    for _, row in df.iterrows():
        codigo = str(row['codigo']).strip()
        if not codigo or codigo == 'nan':
            continue

        result = await db.execute(
            select(InventarioPlanta).where(InventarioPlanta.codigo == codigo)
        )
        existing = result.scalar_one_or_none()

        if existing:
            for col in columnas:
                if col != 'codigo' and col in df.columns:
                    val = row[col]
                    if pd.isna(val):
                        val = None
                    setattr(existing, col, val)
            registros_actualizados += 1
        else:
            data = {}
            for col in columnas:
                if col in df.columns:
                    val = row[col]
                    data[col] = None if pd.isna(val) else val
            item = InventarioPlanta(**data)
            db.add(item)
            registros_creados += 1

    await db.commit()
    return {
        "message": "Importación exitosa",
        "creados": registros_creados,
        "actualizados": registros_actualizados
    }