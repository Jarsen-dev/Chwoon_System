from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List
from datetime import datetime
import pandas as pd
import io
import math

from app.database import AsyncSessionLocal
from app.models.plan_produccion import PlanProduccion
from app.models.parte import Parte
from app.models.cola_impresion import ColaImpresion
from app.schemas.produccion import (
    PlanProduccion as PlanSchema,
    PlanProduccionCreate,
)

router = APIRouter(prefix="/plan", tags=["plan"])

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session

# ==================== CRUD PLAN ====================

@router.get("/", response_model=List[PlanSchema])
async def obtener_plan(db: AsyncSession = Depends(get_db)):
    """Obtener plan de producción actual"""
    result = await db.execute(select(PlanProduccion))
    return result.scalars().all()

@router.post("/", response_model=PlanSchema)
async def agregar_al_plan(
    plan: PlanProduccionCreate,
    db: AsyncSession = Depends(get_db)
):
    """Agregar o actualizar una parte en el plan"""
    # Verificar que la parte existe
    result = await db.execute(
        select(Parte).where(Parte.numero_parte == plan.numero_parte)
    )
    parte = result.scalar_one_or_none()
    if not parte:
        raise HTTPException(status_code=404, detail=f"Parte '{plan.numero_parte}' no encontrada")

    # Verificar si ya existe en el plan
    result = await db.execute(
        select(PlanProduccion).where(PlanProduccion.numero_parte == plan.numero_parte)
    )
    existente = result.scalar_one_or_none()

    if existente:
        existente.meta_piezas = plan.meta_piezas
        existente.turno_objetivo = plan.turno_objetivo
        await db.commit()
        await db.refresh(existente)
        return existente
    else:
        db_plan = PlanProduccion(
            numero_parte=plan.numero_parte,
            meta_piezas=plan.meta_piezas,
            turno_objetivo=plan.turno_objetivo,
            created_at=datetime.utcnow()
        )
        db.add(db_plan)
        await db.commit()
        await db.refresh(db_plan)
        return db_plan

@router.delete("/{numero_parte}")
async def eliminar_del_plan(
    numero_parte: str,
    db: AsyncSession = Depends(get_db)
):
    """Eliminar parte del plan"""
    result = await db.execute(
        select(PlanProduccion).where(PlanProduccion.numero_parte == numero_parte)
    )
    plan = result.scalar_one_or_none()
    if not plan:
        raise HTTPException(status_code=404, detail="No encontrado en plan")

    await db.delete(plan)
    await db.commit()
    return {"message": f"Parte '{numero_parte}' eliminada del plan"}

# ==================== IMPORTAR EXCEL ====================

@router.post("/importar-excel")
async def importar_plan_excel(
    file: UploadFile = File(...),
    turno: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Migra: importar_plan() + _ask_turno_dialog_for_plan()
    Importa plan desde Excel y opcionalmente añade a cola de impresión
    """
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

        # Mapeo flexible de columnas
        col_parte = next(
            (col for col in df.columns if any(
                k in col.lower() for k in ['parte', 'numero', 'part']
            )),
            df.columns[0]
        )
        col_meta = next(
            (col for col in df.columns if any(
                k in col.lower() for k in ['meta', 'plan', 'cantidad', 'qty']
            )),
            df.columns[1]
        )

        plan_importado = {}
        errores = []

        for idx, row in df.iterrows():
            parte_str = str(row[col_parte]).strip().upper()
            if not parte_str or parte_str == 'NAN':
                continue
            try:
                meta = int(float(str(row[col_meta])))
                if meta > 0:
                    plan_importado[parte_str] = meta
            except (ValueError, TypeError):
                errores.append(f"Fila {idx + 2}: Meta inválida para '{parte_str}'")

        if not plan_importado:
            raise HTTPException(
                status_code=400,
                detail="No se encontraron datos válidos en el archivo"
            )

        # Insertar/actualizar plan en DB
        items_cola = []
        count = 0

        for parte_num, meta in plan_importado.items():
            # Verificar que la parte existe en BD
            result = await db.execute(
                select(Parte).where(Parte.numero_parte == parte_num)
            )
            parte = result.scalar_one_or_none()
            if not parte:
                errores.append(f"Parte '{parte_num}' no encontrada en BD, omitida")
                continue

            # Upsert plan
            result = await db.execute(
                select(PlanProduccion).where(PlanProduccion.numero_parte == parte_num)
            )
            existente = result.scalar_one_or_none()

            if existente:
                existente.meta_piezas = meta
                existente.turno_objetivo = turno
            else:
                db_plan = PlanProduccion(
                    numero_parte=parte_num,
                    meta_piezas=meta,
                    turno_objetivo=turno,
                    created_at=datetime.utcnow()
                )
                db.add(db_plan)

            # Calcular etiquetas para la cola
            try:
                qtu = int(parte.cantidad_por_etiqueta or 1)
                if qtu <= 0:
                    qtu = 1
            except (ValueError, TypeError):
                qtu = 1

            num_etiquetas = math.ceil(meta / qtu)
            if num_etiquetas > 0:
                items_cola.append({
                    "parte_id": parte.id,
                    "numero_parte": parte_num,
                    "cantidad_etiquetas": num_etiquetas,
                    "turno": turno
                })

            count += 1

        await db.commit()

        # Añadir a cola de impresión
        cola_agregada = 0
        for item in items_cola:
            db_cola = ColaImpresion(
                parte_id=item["parte_id"],
                cantidad_etiquetas=item["cantidad_etiquetas"],
                turno=item["turno"],
                estado="pendiente",
                created_at=datetime.utcnow()
            )
            db.add(db_cola)
            cola_agregada += 1

        await db.commit()

        return {
            "message": "Plan importado correctamente",
            "partes_importadas": count,
            "etiquetas_en_cola": cola_agregada,
            "errores": errores
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==================== SUGERIR PLAN POR IA ====================

@router.post("/sugerir-ia")
async def sugerir_plan_ia(db: AsyncSession = Depends(get_db)):
    """
    Migra: sugerir_plan_ia()
    Analiza historial de producción y sugiere metas por parte
    """
    from app.models.registro_produccion import RegistroProduccion
    from app.models.registro_paro import RegistroParo
    from sqlalchemy import func

    try:
        # Obtener historial de producción
        result = await db.execute(
            select(
                RegistroProduccion.numero_parte,
                RegistroProduccion.fecha,
                RegistroProduccion.maquina,
                func.max(RegistroProduccion.total_acumulado).label("total_dia")
            )
            .group_by(
                RegistroProduccion.numero_parte,
                RegistroProduccion.fecha,
                RegistroProduccion.maquina
            )
        )
        historial = result.all()

        if not historial:
            raise HTTPException(
                status_code=400,
                detail="No hay suficiente historial de producción para sugerir un plan"
            )

        # Obtener paros por fecha y máquina
        result_paros = await db.execute(
            select(
                RegistroParo.fecha,
                RegistroParo.maquina,
                func.sum(RegistroParo.duracion_minutos).label("total_paros")
            )
            .group_by(RegistroParo.fecha, RegistroParo.maquina)
        )
        paros_dict = {
            (row.fecha, row.maquina): row.total_paros
            for row in result_paros.all()
        }

        # Calcular ritmo ajustado por parte
        duracion_turno_min = 720  # 12 horas
        factor_seguridad = 0.9
        
        ritmos_por_parte: dict = {}

        for row in historial:
            paros_min = paros_dict.get((row.fecha, row.maquina), 0)
            tiempo_productivo = max(duracion_turno_min - paros_min, 1)
            ritmo = row.total_dia / tiempo_productivo  # piezas/minuto

            if row.numero_parte not in ritmos_por_parte:
                ritmos_por_parte[row.numero_parte] = []
            ritmos_por_parte[row.numero_parte].append(ritmo)

        # Generar sugerencias
        sugerencias = []
        for parte, ritmos in ritmos_por_parte.items():
            ritmo_promedio = sum(ritmos) / len(ritmos)
            meta_raw = ritmo_promedio * duracion_turno_min * factor_seguridad
            # Redondear al múltiplo de 50 más cercano
            meta_sugerida = max(50, int(round(meta_raw / 50)) * 50)
            sugerencias.append({
                "numero_parte": parte,
                "meta_sugerida": meta_sugerida,
                "ritmo_promedio_pz_min": round(ritmo_promedio, 3),
                "dias_analizados": len(ritmos)
            })

        return {
            "sugerencias": sugerencias,
            "nota": "Basado en historial real ajustado por paros. Factor de seguridad: 90%"
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))