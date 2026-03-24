from fastapi import APIRouter, Depends, UploadFile, File
import pandas as pd

@router.post("/importar-excel")
async def importar_plan_excel(
    file: UploadFile = File(...),
    turno: str = Form(...),
    db: AsyncSession = Depends(get_db)
):
    """
    Migra: importar_plan() + _ask_turno_dialog_for_plan
    """
    df = pd.read_excel(await file.read())
    
    # Mapear columnas
    # Validar
    # Insertar en DB
    # Opcional: añadir a cola de impresión automáticamente
    
    return {"imported": count, "added_to_queue": queue_items}

@router.post("/sugerir-ia")
async def sugerir_plan_ia(db: AsyncSession = Depends(get_db)):
    """
    Migra: sugerir_plan_ia()
    """
    # Cargar historial
    # Llamar IAAnaliticaService.sugerir_plan_produccion
    # Retornar sugerencia
    pass