"""
Router para Reporte Manual de Inyeccion.
CRUD + importacion masiva via Excel.
"""
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from typing import List, Optional
from datetime import datetime, timedelta, timezone
import pandas as pd
import io

from app.database import AsyncSessionLocal
from app.models.reporte_manual_inyeccion import ReporteManualInyeccion
from app.core.deps import get_current_user
from app.models.usuario import Usuario
from app.schemas.reporte_manual_inyeccion import (
    ReporteManualInyeccionCreate,
    ReporteManualInyeccionResponse,
    DashboardResponse,
    DashboardPeriodoItem,
    DashboardMaquinaItem,
    DashboardTurnoItem,
    DashboardMotivoItem,
)

router = APIRouter(prefix="/reporte-manual-inyeccion", tags=["reporte-manual-inyeccion"])


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


# ══════════════════════════════════════════════════════════════════
# Helper: recalcular campos derivados
# ══════════════════════════════════════════════════════════════════
import math

def _g(obj, attr, default=0):
    val = getattr(obj, attr, default)
    if val is None:
        return default
    # Sanitize NaN/inf to default
    try:
        if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
            return default
    except Exception:
        pass
    return val


def recalcular(reporte: ReporteManualInyeccion) -> None:
    # Ensure defaults for any None/NaN fields
    for attr in [
        'scrap_falta_llenado', 'scrap_cruda', 'scrap_quebrada', 'scrap_hinchada',
        'scrap_arranque', 'scrap_fuera_dimension', 'scrap_pandeada', 'scrap_aplastada_molde',
        'cambio_molde', 'ajustes', 'arranque_paro', 'mantenimiento', 'molde_danado',
        'falta_personal', 'falta_material', 'otro_paro',
        'soldar_puerta_ejector', 'estopero', 'bomba_hidraulica', 'motor_hidraulico',
        'manguera_hidraulica', 'valvula_hidraulica', 'reloj', 'caldera',
        'sensor_seguridad', 'falta_aire', 'fuga_aceite', 'electrico',
        'tolva_tapada', 'extra',
        'tiempo_trabajo', 'ciclo', 'ciclo_real', 'cav_bom', 'cav_real', 'peso', 'produccion_total',
    ]:
        val = getattr(reporte, attr, None)
        if val is None or (isinstance(val, float) and (math.isnan(val) or math.isinf(val))):
            setattr(reporte, attr, 0)

    # Scrap
    reporte.scrap_total = (
        _g(reporte, 'scrap_falta_llenado') + _g(reporte, 'scrap_cruda') +
        _g(reporte, 'scrap_quebrada') + _g(reporte, 'scrap_hinchada') +
        _g(reporte, 'scrap_arranque') + _g(reporte, 'scrap_fuera_dimension') +
        _g(reporte, 'scrap_pandeada') + _g(reporte, 'scrap_aplastada_molde')
    )
    reporte.scrap_kg = reporte.scrap_total * _g(reporte, 'peso', 0.0)

    # Paros
    reporte.tiempo_paro_total = (
        _g(reporte, 'cambio_molde', 0.0) + _g(reporte, 'ajustes', 0.0) +
        _g(reporte, 'arranque_paro', 0.0) + _g(reporte, 'mantenimiento', 0.0) +
        _g(reporte, 'molde_danado', 0.0) + _g(reporte, 'falta_personal', 0.0) +
        _g(reporte, 'falta_material', 0.0) + _g(reporte, 'otro_paro', 0.0) +
        _g(reporte, 'soldar_puerta_ejector', 0.0) + _g(reporte, 'estopero', 0.0) +
        _g(reporte, 'bomba_hidraulica', 0.0) + _g(reporte, 'motor_hidraulico', 0.0) +
        _g(reporte, 'manguera_hidraulica', 0.0) + _g(reporte, 'valvula_hidraulica', 0.0) +
        _g(reporte, 'reloj', 0.0) + _g(reporte, 'caldera', 0.0) +
        _g(reporte, 'sensor_seguridad', 0.0) + _g(reporte, 'falta_aire', 0.0) +
        _g(reporte, 'fuga_aceite', 0.0) + _g(reporte, 'electrico', 0.0) +
        _g(reporte, 'tolva_tapada', 0.0) + _g(reporte, 'extra', 0.0)
    )

    # C/M: 1.0 si cambio_molde > 0
    reporte.cm = 1.0 if _g(reporte, 'cambio_molde', 0.0) > 0 else 0.0

    # Produccion
    reporte.produccion_buena = _g(reporte, 'produccion_total') - reporte.scrap_total
    reporte.produccion_kg = reporte.produccion_buena * _g(reporte, 'peso', 0.0)

    # Meta Total: (3600 / ciclo * cav_real * (tiempo_trabajo - cm))
    ef_horas = max(0.0, _g(reporte, 'tiempo_trabajo', 0.0) - reporte.cm)
    ciclo_val = _g(reporte, 'ciclo', 0.0)
    if ciclo_val > 0:
        reporte.produccion_meta_total = (3600.0 / ciclo_val) * _g(reporte, 'cav_real', 0) * ef_horas
    else:
        reporte.produccion_meta_total = 0.0
    reporte.produccion_meta_kg = reporte.produccion_meta_total * _g(reporte, 'peso', 0.0)

    if reporte.produccion_meta_total > 0:
        reporte.produccion_porcentaje = round(
            (reporte.produccion_buena / reporte.produccion_meta_total) * 100, 1
        )
    else:
        reporte.produccion_porcentaje = 0.0

    if reporte.produccion_buena > 0:
        reporte.scrap_porcentaje = round(
            (reporte.scrap_total / reporte.produccion_buena) * 100, 1
        )
    else:
        reporte.scrap_porcentaje = 0.0


# ══════════════════════════════════════════════════════════════════
# CREATE
# ══════════════════════════════════════════════════════════════════
@router.post("", response_model=ReporteManualInyeccionResponse)
@router.post("/", response_model=ReporteManualInyeccionResponse)
async def crear_reporte_manual(
    data: ReporteManualInyeccionCreate,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    reporte = ReporteManualInyeccion(**data.model_dump())
    recalcular(reporte)
    db.add(reporte)
    await db.commit()
    await db.refresh(reporte)
    return reporte


# ══════════════════════════════════════════════════════════════════
# LIST
# ══════════════════════════════════════════════════════════════════
@router.get("", response_model=List[ReporteManualInyeccionResponse])
@router.get("/", response_model=List[ReporteManualInyeccionResponse])
async def listar_reportes_manuales(
    fecha: Optional[str] = None,
    turno: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    stmt = select(ReporteManualInyeccion)
    filtros = []
    if fecha:
        try:
            d = datetime.strptime(fecha, "%Y-%m-%d")
            filtros.append(ReporteManualInyeccion.fecha >= d)
            filtros.append(ReporteManualInyeccion.fecha < d + timedelta(days=1))
        except ValueError:
            raise HTTPException(status_code=400, detail="Formato de fecha invalido. Use YYYY-MM-DD")
    if turno:
        filtros.append(ReporteManualInyeccion.turno == turno)
    if filtros:
        stmt = stmt.where(and_(*filtros))
    stmt = stmt.order_by(ReporteManualInyeccion.created_at.desc())
    res = await db.execute(stmt)
    return res.scalars().all()


# ══════════════════════════════════════════════════════════════════
# DASHBOARD
# ══════════════════════════════════════════════════════════════════
PARO_MOTIVOS = [
    ("Cambio de Molde", "cambio_molde"),
    ("Ajustes", "ajustes"),
    ("Arranque", "arranque_paro"),
    ("Mantenimiento", "mantenimiento"),
    ("Molde Danado", "molde_danado"),
    ("Falta Personal", "falta_personal"),
    ("Falta Material", "falta_material"),
    ("Otro", "otro_paro"),
    ("Soldar Puerta Ejector", "soldar_puerta_ejector"),
    ("Estopero", "estopero"),
    ("Bomba Hidraulica", "bomba_hidraulica"),
    ("Motor Hidraulico", "motor_hidraulico"),
    ("Manguera Hidraulica", "manguera_hidraulica"),
    ("Valvula Hidraulica", "valvula_hidraulica"),
    ("Reloj", "reloj"),
    ("Caldera", "caldera"),
    ("Sensor Seguridad", "sensor_seguridad"),
    ("Falta Aire", "falta_aire"),
    ("Fuga Aceite", "fuga_aceite"),
    ("Electrico", "electrico"),
    ("Tolva Tapada", "tolva_tapada"),
    ("Extra", "extra"),
]

SCRAP_MOTIVOS = [
    ("Falta Llenado", "scrap_falta_llenado"),
    ("Cruda", "scrap_cruda"),
    ("Quebrada", "scrap_quebrada"),
    ("Hinchada", "scrap_hinchada"),
    ("Arranque", "scrap_arranque"),
    ("Fuera Dimension", "scrap_fuera_dimension"),
    ("Pandeada", "scrap_pandeada"),
    ("Aplastada Molde", "scrap_aplastada_molde"),
]


@router.get("/dashboard", response_model=DashboardResponse)
async def dashboard_reporte_manual(
    group_by: str = "day",
    fecha_desde: Optional[str] = None,
    fecha_hasta: Optional[str] = None,
    turno: Optional[str] = None,
    numero_parte: Optional[str] = None,
    cliente: Optional[str] = None,
    maquina: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    """
    Dashboard de reportes manuales de inyeccion.
    group_by: day | week | month
    """
    stmt = select(ReporteManualInyeccion)
    filtros = []

    if fecha_desde:
        try:
            d = datetime.strptime(fecha_desde, "%Y-%m-%d")
            filtros.append(ReporteManualInyeccion.fecha >= d)
        except ValueError:
            raise HTTPException(status_code=400, detail="fecha_desde invalida. Use YYYY-MM-DD")
    if fecha_hasta:
        try:
            d = datetime.strptime(fecha_hasta, "%Y-%m-%d") + timedelta(days=1)
            filtros.append(ReporteManualInyeccion.fecha < d)
        except ValueError:
            raise HTTPException(status_code=400, detail="fecha_hasta invalida. Use YYYY-MM-DD")
    if turno:
        filtros.append(ReporteManualInyeccion.turno == turno)
    if numero_parte:
        filtros.append(ReporteManualInyeccion.numero_parte.ilike(f"%{numero_parte}%"))
    if cliente:
        filtros.append(ReporteManualInyeccion.cliente.ilike(f"%{cliente}%"))
    if maquina:
        filtros.append(ReporteManualInyeccion.maquina.ilike(f"%{maquina}%"))

    if filtros:
        stmt = stmt.where(and_(*filtros))
    stmt = stmt.order_by(ReporteManualInyeccion.fecha.asc())
    res = await db.execute(stmt)
    registros = res.scalars().all()

    def _get_periodo(r):
        f = r.fecha
        if not f:
            return ""
        if group_by == "week":
            cal = f.isocalendar()
            return f"{cal.year}-W{cal.week:02d}"
        elif group_by == "month":
            return f.strftime("%Y-%m")
        return f.strftime("%Y-%m-%d")

    # ── Agregaciones ──
    por_periodo_map = {}
    por_maquina_map = {}
    por_turno_map = {}
    por_motivo_paro_map = {m: 0.0 for m, _ in PARO_MOTIVOS}
    por_motivo_scrap_map = {m: 0 for m, _ in SCRAP_MOTIVOS}

    total_produccion = 0
    total_buena = 0
    total_scrap = 0
    total_paro = 0.0
    total_meta = 0.0
    count = 0

    for r in registros:
        p = _get_periodo(r)
        if p not in por_periodo_map:
            por_periodo_map[p] = {
                "periodo": p,
                "produccion_total": 0,
                "produccion_buena": 0,
                "scrap_total": 0,
                "tiempo_paro_total": 0.0,
                "produccion_porcentaje_sum": 0.0,
                "scrap_porcentaje_sum": 0.0,
                "cantidad_registros": 0,
            }
        pm = por_periodo_map[p]
        pm["produccion_total"] += r.produccion_total or 0
        pm["produccion_buena"] += r.produccion_buena or 0
        pm["scrap_total"] += r.scrap_total or 0
        pm["tiempo_paro_total"] += r.tiempo_paro_total or 0.0
        pm["produccion_porcentaje_sum"] += r.produccion_porcentaje or 0.0
        pm["scrap_porcentaje_sum"] += r.scrap_porcentaje or 0.0
        pm["cantidad_registros"] += 1

        m = r.maquina or "Sin Maquina"
        if m not in por_maquina_map:
            por_maquina_map[m] = {
                "maquina": m,
                "produccion_total": 0,
                "produccion_buena": 0,
                "scrap_total": 0,
                "tiempo_paro_total": 0.0,
                "produccion_porcentaje_sum": 0.0,
                "count": 0,
            }
        pmaq = por_maquina_map[m]
        pmaq["produccion_total"] += r.produccion_total or 0
        pmaq["produccion_buena"] += r.produccion_buena or 0
        pmaq["scrap_total"] += r.scrap_total or 0
        pmaq["tiempo_paro_total"] += r.tiempo_paro_total or 0.0
        pmaq["produccion_porcentaje_sum"] += r.produccion_porcentaje or 0.0
        pmaq["count"] += 1

        t = r.turno or "Sin Turno"
        if t not in por_turno_map:
            por_turno_map[t] = {
                "turno": t,
                "produccion_total": 0,
                "produccion_buena": 0,
                "scrap_total": 0,
                "tiempo_paro_total": 0.0,
            }
        pt = por_turno_map[t]
        pt["produccion_total"] += r.produccion_total or 0
        pt["produccion_buena"] += r.produccion_buena or 0
        pt["scrap_total"] += r.scrap_total or 0
        pt["tiempo_paro_total"] += r.tiempo_paro_total or 0.0

        for label, attr in PARO_MOTIVOS:
            val = getattr(r, attr, 0) or 0
            if val:
                por_motivo_paro_map[label] += float(val)

        for label, attr in SCRAP_MOTIVOS:
            val = getattr(r, attr, 0) or 0
            if val:
                por_motivo_scrap_map[label] += int(val)

        total_produccion += r.produccion_total or 0
        total_buena += r.produccion_buena or 0
        total_scrap += r.scrap_total or 0
        total_paro += r.tiempo_paro_total or 0.0
        total_meta += r.produccion_meta_total or 0.0
        count += 1

    por_periodo = []
    for p in sorted(por_periodo_map.keys()):
        d = por_periodo_map[p]
        n = d["cantidad_registros"]
        por_periodo.append(DashboardPeriodoItem(
            periodo=d["periodo"],
            produccion_total=d["produccion_total"],
            produccion_buena=d["produccion_buena"],
            scrap_total=d["scrap_total"],
            tiempo_paro_total=round(d["tiempo_paro_total"], 2),
            produccion_porcentaje=round(d["produccion_porcentaje_sum"] / n, 1) if n > 0 else 0.0,
            scrap_porcentaje=round(d["scrap_porcentaje_sum"] / n, 1) if n > 0 else 0.0,
            cantidad_registros=n,
        ))

    por_maquina = []
    for m in sorted(por_maquina_map.keys(), key=lambda x: -por_maquina_map[x]["produccion_total"]):
        d = por_maquina_map[m]
        n = d["count"]
        por_maquina.append(DashboardMaquinaItem(
            maquina=d["maquina"],
            produccion_total=d["produccion_total"],
            produccion_buena=d["produccion_buena"],
            scrap_total=d["scrap_total"],
            tiempo_paro_total=round(d["tiempo_paro_total"], 2),
            produccion_porcentaje=round(d["produccion_porcentaje_sum"] / n, 1) if n > 0 else 0.0,
        ))

    por_turno = []
    for t in sorted(por_turno_map.keys()):
        d = por_turno_map[t]
        por_turno.append(DashboardTurnoItem(
            turno=d["turno"],
            produccion_total=d["produccion_total"],
            produccion_buena=d["produccion_buena"],
            scrap_total=d["scrap_total"],
            tiempo_paro_total=round(d["tiempo_paro_total"], 2),
        ))

    por_motivo_paro = [DashboardMotivoItem(motivo=m, valor=round(v, 2)) for m, v in por_motivo_paro_map.items() if v > 0]
    por_motivo_paro.sort(key=lambda x: -x.valor)

    por_motivo_scrap = [DashboardMotivoItem(motivo=m, valor=v) for m, v in por_motivo_scrap_map.items() if v > 0]
    por_motivo_scrap.sort(key=lambda x: -x.valor)

    totales = {
        "produccion_total": total_produccion,
        "produccion_buena": total_buena,
        "scrap_total": total_scrap,
        "tiempo_paro_total": round(total_paro, 2) if total_paro else 0.0,
        "produccion_porcentaje_promedio": round(total_meta / total_buena * 100, 1) if total_buena > 0 else 0.0,
        "scrap_porcentaje_promedio": round(total_scrap / total_buena * 100, 1) if total_buena > 0 else 0.0,
        "cantidad_registros": count,
    }

    return DashboardResponse(
        periodo=group_by,
        fecha_desde=fecha_desde or "",
        fecha_hasta=fecha_hasta or "",
        totales=totales,
        por_periodo=por_periodo,
        por_maquina=por_maquina,
        por_turno=por_turno,
        por_motivo_paro=por_motivo_paro,
        por_motivo_scrap=por_motivo_scrap,
        registros_detalle=[ReporteManualInyeccionResponse.model_validate(r) for r in registros],
    )
# ══════════════════════════════════════════════════════════════════
# GET ONE
# ══════════════════════════════════════════════════════════════════
@router.get("/{id}", response_model=ReporteManualInyeccionResponse)
async def obtener_reporte_manual(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    res = await db.execute(select(ReporteManualInyeccion).where(ReporteManualInyeccion.id == id))
    reporte = res.scalar_one_or_none()
    if not reporte:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    return reporte


# ══════════════════════════════════════════════════════════════════
# DELETE
# ══════════════════════════════════════════════════════════════════
@router.delete("/{id}")
async def eliminar_reporte_manual(
    id: int,
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    res = await db.execute(select(ReporteManualInyeccion).where(ReporteManualInyeccion.id == id))
    reporte = res.scalar_one_or_none()
    if not reporte:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    await db.delete(reporte)
    await db.commit()
    return {"message": "Reporte eliminado correctamente"}


# ══════════════════════════════════════════════════════════════════
# IMPORTAR EXCEL
# ══════════════════════════════════════════════════════════════════
EXCEL_COLS = [
    "Turno", "No_Parte", "Descripcion", "Cliente", "Resina", "Proceso", "Peso",
    "Cav_BOM", "Ciclo", "Type", "Maquina", "Cav_Real", "Ciclo_Real",
    "Tiempo_Trabajo", "Produccion_Total", "Cambio_Molde", "Ajustes", "Arranque",
    "Mantenimiento", "Molde_Dañado", "Falta_Personal", "Falta_Material",
    "Soldar_Puerta_Ejector", "Estopero", "Bomba_Hidraulica", "Motor_Hidraulico",
    "Manguera_Hidraulica", "Valvula_Hidraulica", "Reloj", "Caldera",
    "Sensor_Seguridad", "Falla_Aire", "Fuga_Aceite", "Electrico", "Tolva_Tapada",
    "Extra", "Falta_Llenado", "Cruda", "Quebrada", "Hinchada", "Arranque_Scrap",
    "Fuera_Dimension", "Pandeada", "Aplastada_Molde"
]

PARO_COLS_MAP = {
    "Cambio_Molde": "cambio_molde",
    "Ajustes": "ajustes",
    "Arranque": "arranque_paro",
    "Mantenimiento": "mantenimiento",
    "Molde_Dañado": "molde_danado",
    "Falta_Personal": "falta_personal",
    "Falta_Material": "falta_material",
    "Soldar_Puerta_Ejector": "soldar_puerta_ejector",
    "Estopero": "estopero",
    "Bomba_Hidraulica": "bomba_hidraulica",
    "Motor_Hidraulico": "motor_hidraulico",
    "Manguera_Hidraulica": "manguera_hidraulica",
    "Valvula_Hidraulica": "valvula_hidraulica",
    "Reloj": "reloj",
    "Caldera": "caldera",
    "Sensor_Seguridad": "sensor_seguridad",
    "Falla_Aire": "falta_aire",
    "Fuga_Aceite": "fuga_aceite",
    "Electrico": "electrico",
    "Tolva_Tapada": "tolva_tapada",
    "Extra": "extra",
}

SCRAP_COLS_MAP = {
    "Falta_Llenado": "scrap_falta_llenado",
    "Cruda": "scrap_cruda",
    "Quebrada": "scrap_quebrada",
    "Hinchada": "scrap_hinchada",
    "Arranque_Scrap": "scrap_arranque",
    "Fuera_Dimension": "scrap_fuera_dimension",
    "Pandeada": "scrap_pandeada",
    "Aplastada_Molde": "scrap_aplastada_molde",
}


def _safe_float(v):
    try:
        return float(v)
    except (ValueError, TypeError):
        return 0.0


def _safe_int(v):
    try:
        return int(v)
    except (ValueError, TypeError):
        return 0


@router.post("/importar-excel")
async def importar_excel_reporte_manual(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: Usuario = Depends(get_current_user),
):
    if not file.filename.endswith((".xlsx", ".xls", ".csv")):
        raise HTTPException(status_code=400, detail="Archivo no valido. Use .xlsx, .xls o .csv")

    contents = await file.read()
    try:
        if file.filename.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(contents))
        else:
            df = pd.read_excel(io.BytesIO(contents))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo archivo: {e}")

    df.columns = [str(c).strip() for c in df.columns]
    faltantes = [c for c in EXCEL_COLS if c not in df.columns]
    if faltantes:
        raise HTTPException(status_code=400, detail=f"Columnas faltantes: {', '.join(faltantes)}")

    creados = 0
    errores = []
    for idx, row in df.iterrows():
        try:
            reporte = ReporteManualInyeccion(
                turno=str(row.get("Turno", "")).strip().upper(),
                numero_parte=str(row.get("No_Parte", "")).strip(),
                descripcion=str(row.get("Descripcion", "")).strip(),
                cliente=str(row.get("Cliente", "")).strip(),
                resina=str(row.get("Resina", "")).strip().upper(),
                proceso=str(row.get("Proceso", "")).strip().upper(),
                peso=_safe_float(row.get("Peso")),
                cav_bom=_safe_int(row.get("Cav_BOM")),
                ciclo=_safe_float(row.get("Ciclo")),
                type=str(row.get("Type", "")).strip(),
                maquina=str(row.get("Maquina", "")).strip(),
                cav_real=_safe_int(row.get("Cav_Real")),
                ciclo_real=_safe_float(row.get("Ciclo_Real")),
                tiempo_trabajo=_safe_float(row.get("Tiempo_Trabajo")),
                produccion_total=_safe_int(row.get("Produccion_Total")),
            )
            for col, attr in PARO_COLS_MAP.items():
                setattr(reporte, attr, _safe_float(row.get(col)))
            for col, attr in SCRAP_COLS_MAP.items():
                setattr(reporte, attr, _safe_int(row.get(col)))

            recalcular(reporte)
            db.add(reporte)
            creados += 1
        except Exception as e:
            errores.append(f"Fila {idx + 2}: {str(e)}")

    if creados > 0:
        await db.commit()

    return {
        "message": f"{creados} registros creados.",
        "creados": creados,
        "errores": errores,
    }


