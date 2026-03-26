from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import pandas as pd
import io

from app.database import AsyncSessionLocal
from app.models.parte import Parte

router = APIRouter(prefix="/importar", tags=["importar"])

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

@router.post("/partes/excel")
async def importar_partes_excel(file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    if not file.filename.endswith(('.xlsx', '.xls')):
        raise HTTPException(status_code=400, detail="El archivo debe ser un Excel (.xlsx o .xls)")

    contents = await file.read()
    try:
        # Leer excel en memoria
        df = pd.read_excel(io.BytesIO(contents), dtype=str)
        df.fillna('', inplace=True)

        # Mapeo exacto a las columnas de la imagen
        column_map = {
            'Número de Parte': 'numero_parte',
            'Descripción': 'descripcion',
            'Línea': 'linea',
            'ID': 'id_interno',
            'Cantidad': 'cantidad_por_etiqueta',
            'Cliente (LG)': 'cliente_lg',
            'Cliente (I': 'cliente_lg', # Por si viene cortado como en la imagen
            'Ayuda Visual': 'ayuda_visual'
        }

        df.rename(columns={k: v for k, v in column_map.items() if k in df.columns}, inplace=True)

        if 'numero_parte' not in df.columns:
            raise HTTPException(status_code=400, detail="Falta la columna 'Número de Parte' en el Excel")

        imported_count = 0
        for _, row in df.iterrows():
            num_parte = str(row.get('numero_parte', '')).strip().upper()
            if not num_parte: continue

            # Buscar si la parte ya existe
            result = await db.execute(select(Parte).where(Parte.numero_parte == num_parte))
            parte_existente = result.scalar_one_or_none()

            datos = {
                'descripcion': str(row.get('descripcion', '')).strip(),
                'linea': str(row.get('linea', '')).strip(),
                'id_interno': str(row.get('id_interno', 'assy')).strip(),
                'cantidad_por_etiqueta': str(row.get('cantidad_por_etiqueta', '45')).strip(),
                'cliente_lg': str(row.get('cliente_lg', 'R1')).strip(),
                'ayuda_visual': str(row.get('ayuda_visual', '')).strip()
            }

            if parte_existente:
                for k, v in datos.items():
                    setattr(parte_existente, k, v)
            else:
                nueva_parte = Parte(numero_parte=num_parte, **datos)
                db.add(nueva_parte)

            imported_count += 1

        await db.commit()
        return {"message": "Éxito", "count": imported_count}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
