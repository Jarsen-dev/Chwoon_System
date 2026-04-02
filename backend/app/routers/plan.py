from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from datetime import datetime
import pandas as pd
import io
import math

from app.database import AsyncSessionLocal
from app.models.plan_produccion import PlanProduccion
from app.models.inventario import InventarioPlanta
from app.models.cola_impresion import ColaImpresion

router = APIRouter(prefix="/plan", tags=["plan"])

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

# ==================== GET PLAN CON QTU ====================

@router.get("/")
async def obtener_plan(db: AsyncSession = Depends(get_db)):
    """Retorna el plan con qtu del inventario para calcular etiquetas"""
    result = await db.execute(
        select(PlanProduccion, InventarioPlanta.qtu)
        .join(
            InventarioPlanta,
            PlanProduccion.numero_parte == InventarioPlanta.codigo,
            isouter=True
        )
        .order_by(PlanProduccion.id.asc())
    )
    rows = result.all()
    return [
        {
            "id":             plan.id,
            "numero_parte":   plan.numero_parte,
            "meta_piezas":    plan.meta_piezas,
            "turno_objetivo": plan.turno_objetivo,
            "estado":         plan.estado or "pendiente",
            "qtu":            qtu or 1,
            "created_at":     plan.created_at,
        }
        for plan, qtu in rows
    ]

# ==================== DELETE ====================

@router.delete("/{numero_parte}")
async def eliminar_del_plan(
    numero_parte: str,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(PlanProduccion).where(
            PlanProduccion.numero_parte == numero_parte
        )
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="No encontrado en plan")
    await db.delete(plan)
    await db.commit()
    return {"message": f"'{numero_parte}' eliminada del plan"}

# ==================== IMPORTAR EXCEL ====================

@router.post("/importar-excel")
async def importar_plan_excel(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db)
):
    if not file.filename.endswith(('.xlsx', '.xls', '.csv')):
        raise HTTPException(
            status_code=400,
            detail="El archivo debe ser Excel (.xlsx, .xls) o CSV"
        )

    contents = await file.read()

    try:
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))

        df.dropna(how='all', inplace=True)

        col_parte = next(
            (col for col in df.columns if any(
                k in col.lower() for k in ['parte', 'numero', 'part', 'codigo']
            )),
            df.columns[0]
        )
        col_turno = next(
            (col for col in df.columns if any(
                k in col.lower() for k in ['turno', 'shift', 'objetivo']
            )),
            None
        )
        col_meta = next(
            (col for col in df.columns if any(
                k in col.lower() for k in ['meta', 'plan', 'cantidad', 'qty', 'piezas']
            )),
            df.columns[2] if col_turno else df.columns[1]
        )

        if col_turno is None:
            raise HTTPException(
                status_code=400,
                detail="No se encontró columna de Turno en el Excel."
            )

        plan_importado = {}
        errores        = []

        for idx, row in df.iterrows():
            parte_str = str(row[col_parte]).strip().upper()
            if not parte_str or parte_str == 'NAN':
                continue

            turno_str = str(row[col_turno]).strip() if col_turno else 'Día'
            if turno_str.upper() in ['NAN', '', 'NONE']:
                turno_str = 'Día'

            try:
                meta = int(float(str(row[col_meta])))
                if meta > 0:
                    plan_importado[parte_str] = {
                        "meta":  meta,
                        "turno": turno_str
                    }
            except (ValueError, TypeError):
                errores.append(f"Fila {idx + 2}: Meta inválida para '{parte_str}'")

        if not plan_importado:
            raise HTTPException(
                status_code=400,
                detail="No se encontraron datos válidos en el archivo"
            )

        items_cola = []
        count      = 0

        for codigo, datos in plan_importado.items():
            meta  = datos["meta"]
            turno = datos["turno"]

            result = await db.execute(
                select(InventarioPlanta).where(InventarioPlanta.codigo == codigo)
            )
            inventario = result.scalar_one_or_none()

            if not inventario:
                errores.append(f"Código '{codigo}' no encontrado en inventario, omitido")
                continue

            result = await db.execute(
                select(PlanProduccion).where(PlanProduccion.numero_parte == codigo)
            )
            existente = result.scalar_one_or_none()

            if existente:
                existente.meta_piezas    = meta
                existente.turno_objetivo = turno
                existente.estado         = "pendiente"
            else:
                db_plan = PlanProduccion(
                    numero_parte=   codigo,
                    meta_piezas=    meta,
                    turno_objetivo= turno,
                    estado=         "pendiente",
                    created_at=     datetime.utcnow()
                )
                db.add(db_plan)

            try:
                qtu = int(inventario.qtu or 1)
                if qtu <= 0:
                    qtu = 1
            except (ValueError, TypeError):
                qtu = 1

            num_etiquetas = math.ceil(meta / qtu)
            if num_etiquetas > 0:
                items_cola.append({
                    "codigo":             codigo,
                    "cantidad_etiquetas": num_etiquetas,
                    "turno":              turno
                })

            count += 1

        await db.commit()

        cola_agregada = 0
        for item in items_cola:
            db_cola = ColaImpresion(
                codigo_inventario=  item["codigo"],
                cantidad_etiquetas= item["cantidad_etiquetas"],
                turno=              item["turno"],
                estado=             "pendiente",
                created_at=         datetime.utcnow()
            )
            db.add(db_cola)
            cola_agregada += 1

        await db.commit()

        return {
            "message":           "Plan importado correctamente",
            "partes_importadas": count,
            "etiquetas_en_cola": cola_agregada,
            "errores":           errores
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))