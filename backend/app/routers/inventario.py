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

    # Eliminar columnas duplicadas
    df = df.loc[:, ~df.columns.duplicated()]

    # Normalizar nombres de columnas
    df.columns = (
        df.columns
        .astype(str)
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

    # Mapeo de variantes
        # Mapeo de variantes
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
        'type': 'tipo',
        'qty': 'qtu',
        'quantity': 'qtu',
        'piezas_por_carrito': 'qtu',
        'lg': 'linea_lg',
        'ayuda_visual_(link)': 'ayuda_visual',
        'ayuda_visual_link': 'ayuda_visual',
        'link': 'ayuda_visual',
    }

    # Si existe 'maquina' Y 'line', entonces line = tipo (no linea)
    if 'maquina' in df.columns and 'line' in df.columns:
        column_map['line'] = 'tipo'
    elif 'line' in df.columns:
        column_map['line'] = 'linea'

    df.rename(columns={k: v for k, v in column_map.items() if k in df.columns}, inplace=True)

    # Eliminar duplicados post-rename
    df = df.loc[:, ~df.columns.duplicated()]

    # Log columnas para debug
    print(f"COLUMNAS DETECTADAS: {list(df.columns)}")

    if 'codigo' not in df.columns:
        raise HTTPException(
            status_code=400,
            detail=f"Columna 'codigo' no encontrada. Columnas detectadas: {list(df.columns)}"
        )

    columnas = ['codigo', 'descripcion', 'linea', 'tipo', 'qtu', 'linea_lg', 'ayuda_visual']

    def safe_val(val, col):
        """Extrae valor seguro, maneja Series, NaN, None"""
        if isinstance(val, pd.Series):
            val = val.iloc[0]
        if val is None:
            return '' if col != 'qtu' else 0
        try:
            if pd.isna(val):
                return '' if col != 'qtu' else 0
        except (ValueError, TypeError):
            pass
        if col == 'qtu':
            try:
                return int(float(val))
            except (ValueError, TypeError):
                return 0
        return str(val).strip()

    registros_creados = 0
    registros_actualizados = 0
    errores = []

    for idx, row in df.iterrows():
        try:
            codigo = safe_val(row.get('codigo', None), 'codigo')
            if not codigo or codigo == 'nan' or codigo == 'None':
                continue

            result = await db.execute(
                select(InventarioPlanta).where(InventarioPlanta.codigo == codigo)
            )
            existing = result.scalar_one_or_none()

            if existing:
                for col in columnas:
                    if col != 'codigo':
                        val = row.get(col, None) if col in df.columns else None
                        setattr(existing, col, safe_val(val, col))
                registros_actualizados += 1
            else:
                data = {}
                for col in columnas:
                    if col in df.columns:
                        data[col] = safe_val(row.get(col, None), col)
                    else:
                        data[col] = '' if col != 'qtu' else 0
                item = InventarioPlanta(**data)
                db.add(item)
                registros_creados += 1

        except Exception as e:
            errores.append(f"Fila {idx + 2}: {str(e)}")
            continue

    await db.commit()
    resultado = {
        "message": "Importación exitosa",
        "creados": registros_creados,
        "actualizados": registros_actualizados
    }
    if errores:
        resultado["errores"] = errores[:10]
    return resultado