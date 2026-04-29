import sqlalchemy
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text
from datetime import datetime, timedelta, timezone

from app.database import AsyncSessionLocal
from app.models.usuario import Usuario
from app.models.inventario import InventarioPlanta
from app.models.plan_produccion import PlanProduccion
from app.models.cola_impresion import ColaImpresion
from app.models.registro_produccion import RegistroProduccion
from app.models.registro_secado import RegistroSecado
from app.models.anomalia import Anomalia
from app.core.deps import get_current_admin

router = APIRouter(prefix="/api/admin", tags=["admin"])

TZ_LOCAL = timezone(timedelta(hours=-6))

def ahora_local() -> datetime:
    return datetime.now(TZ_LOCAL)

def get_fecha_turno() -> str:
    now = ahora_local()
    total_min = now.hour * 60 + now.minute
    if total_min < 450:
        return (now - timedelta(days=1)).strftime("%Y-%m-%d")
    return now.strftime("%Y-%m-%d")

def get_turno_actual() -> str:
    now = ahora_local()
    total_min = now.hour * 60 + now.minute
    return "DIA" if 450 <= total_min < 1170 else "NOCHE"

async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


# ── GET /api/admin/dashboard ─────────────────────────────────────────
@router.get("/dashboard")
@router.get("/dashboard/")
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    fecha = get_fecha_turno()
    turno = get_turno_actual()

    # Usuarios
    total_usuarios = (await db.execute(
        select(func.count(Usuario.id))
    )).scalar() or 0

    usuarios_activos = (await db.execute(
        select(func.count(Usuario.id)).where(Usuario.activo == True)
    )).scalar() or 0

    # Partes en inventario
    total_partes = (await db.execute(
        select(func.count(InventarioPlanta.codigo))
    )).scalar() or 0

    # Plan de producción
    total_plan = (await db.execute(
        select(func.count(PlanProduccion.id))
    )).scalar() or 0

    plan_pendiente = (await db.execute(
        select(func.count(PlanProduccion.id)).where(
            PlanProduccion.estado == "pendiente"
        )
    )).scalar() or 0

    plan_en_proceso = (await db.execute(
        select(func.count(PlanProduccion.id)).where(
            PlanProduccion.estado == "en_proceso"
        )
    )).scalar() or 0

    # Cola de impresión
    cola_pendiente = (await db.execute(
        select(func.count(ColaImpresion.id)).where(
            ColaImpresion.estado == "pendiente"
        )
    )).scalar() or 0

    cola_generado = (await db.execute(
        select(func.count(ColaImpresion.id)).where(
            ColaImpresion.estado == "generado"
        )
    )).scalar() or 0

    # Escaneos del turno actual
    escaneos_turno = (await db.execute(
        select(func.count(RegistroProduccion.id)).where(
            RegistroProduccion.fecha == fecha,
            RegistroProduccion.turno == turno,
        )
    )).scalar() or 0

    # Piezas del turno
    piezas_turno = (await db.execute(
        select(func.coalesce(func.sum(RegistroProduccion.qty_bolsa), 0)).where(
            RegistroProduccion.fecha == fecha,
            RegistroProduccion.turno == turno,
        )
    )).scalar() or 0

    # Secado
    secado_dentro = (await db.execute(
        select(func.count(RegistroSecado.id)).where(
            RegistroSecado.fecha == fecha,
            RegistroSecado.turno == turno,
            RegistroSecado.estado == "dentro",
        )
    )).scalar() or 0

    secado_salidos = (await db.execute(
        select(func.count(RegistroSecado.id)).where(
            RegistroSecado.fecha == fecha,
            RegistroSecado.turno == turno,
            RegistroSecado.estado == "salido",
        )
    )).scalar() or 0

    # Anomalías recientes (últimos 7 días)
    hace_7_dias = (ahora_local() - timedelta(days=7)).strftime("%Y-%m-%d")
    anomalias_recientes = (await db.execute(
        select(func.count(Anomalia.id)).where(
            Anomalia.fecha >= hace_7_dias
        )
    )).scalar() or 0

    return {
        "turno_actual":       turno,
        "fecha_turno":        fecha,
        "usuarios": {
            "total":          total_usuarios,
            "activos":        usuarios_activos,
        },
        "partes": {
            "total":          total_partes,
        },
        "plan": {
            "total":          total_plan,
            "pendiente":      plan_pendiente,
            "en_proceso":     plan_en_proceso,
        },
        "cola": {
            "pendiente":      cola_pendiente,
            "generado":       cola_generado,
        },
        "produccion": {
            "escaneos_turno": escaneos_turno,
            "piezas_turno":   piezas_turno,
        },
        "secado": {
            "dentro":         secado_dentro,
            "salidos":        secado_salidos,
        },
        "anomalias": {
            "recientes_7d":   anomalias_recientes,
        },
    }

# ── GET /api/admin/logs ──────────────────────────────────────────────
@router.get("/logs")
@router.get("/logs/")
async def get_activity_logs(
    limite: int = 200,
    fecha: str | None = None,
    hora_desde: str | None = None,
    hora_hasta: str | None = None,
    modulo: str | None = None,
    usuario: str | None = None,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    logs = []

    # ── Escaneos de producción ───────────────────────────────────
    if not modulo or modulo == "produccion":
        query_prod = select(RegistroProduccion).order_by(RegistroProduccion.created_at.desc())
        if fecha:
            query_prod = query_prod.where(RegistroProduccion.fecha == fecha)
        if usuario:
            query_prod = query_prod.where(RegistroProduccion.usuario == usuario)
        if hora_desde:
            query_prod = query_prod.where(RegistroProduccion.hora >= hora_desde)
        if hora_hasta:
            query_prod = query_prod.where(RegistroProduccion.hora <= hora_hasta)
        query_prod = query_prod.limit(limite)

        result = await db.execute(query_prod)
        for r in result.scalars().all():
            logs.append({
                "fecha":      r.fecha or "",
                "hora":       r.hora or "",
                "usuario":    r.usuario or "—",
                "accion":     "Escaneo Producción",
                "detalle":    f"{r.numero_parte} carrito #{r.carrito_numero}",
                "modulo":     "produccion",
                "created_at": str(r.created_at) if r.created_at else "",
            })

    # ── Registros de secado ──────────────────────────────────────
    if not modulo or modulo == "secado":
        query_sec = select(RegistroSecado).order_by(RegistroSecado.created_at.desc())
        if fecha:
            query_sec = query_sec.where(RegistroSecado.fecha == fecha)
        if usuario:
            query_sec = query_sec.where(RegistroSecado.usuario == usuario)
        if hora_desde:
            query_sec = query_sec.where(RegistroSecado.hora_entrada >= hora_desde)
        if hora_hasta:
            query_sec = query_sec.where(RegistroSecado.hora_entrada <= hora_hasta)
        query_sec = query_sec.limit(limite)

        result = await db.execute(query_sec)
        for r in result.scalars().all():
            accion = "Entrada Secado" if r.estado == "dentro" else "Salida Secado"
            logs.append({
                "fecha":      r.fecha or "",
                "hora":       r.hora_entrada if r.estado == "dentro" else (r.hora_salida or r.hora_entrada),
                "usuario":    r.usuario or "—",
                "accion":     accion,
                "detalle":    f"{r.numero_parte} carrito #{r.carrito}" + (
                    f" · {r.tiempo_en_camara}" if r.tiempo_en_camara and r.estado == "salido" else ""
                ),
                "modulo":     "secado",
                "created_at": str(r.created_at) if r.created_at else "",
            })

    # ── Etiquetas ────────────────────────────────────────────────
    if not modulo or modulo == "etiquetas":
        query_cola = select(ColaImpresion).order_by(ColaImpresion.created_at.desc())
        if fecha:
            query_cola = query_cola.where(
                func.cast(ColaImpresion.created_at, sqlalchemy.String).like(f"{fecha}%")
            )
        if usuario:
            query_cola = query_cola.where(ColaImpresion.usuario == usuario)
        if hora_desde:
            query_cola = query_cola.where(
                func.substring(func.cast(ColaImpresion.created_at, sqlalchemy.String), 12, 8) >= hora_desde
            )
        if hora_hasta:
            query_cola = query_cola.where(
                func.substring(func.cast(ColaImpresion.created_at, sqlalchemy.String), 12, 8) <= hora_hasta
            )
        query_cola = query_cola.limit(limite)

        result = await db.execute(query_cola)
        for r in result.scalars().all():
            logs.append({
                "fecha":      str(r.created_at)[:10] if r.created_at else "",
                "hora":       str(r.created_at)[11:19] if r.created_at else "",
                "usuario":    r.usuario or "—",
                "accion":     f"Etiqueta ({r.estado})",
                "detalle":    f"{r.codigo_inventario or '—'} × {r.cantidad_etiquetas}",
                "modulo":     "etiquetas",
                "created_at": str(r.created_at) if r.created_at else "",
            })

    # Ordenar todos por created_at DESC
    logs.sort(key=lambda x: x["created_at"], reverse=True)

    return logs[:limite]

# ── GET /api/admin/logs/usuarios — lista de usuarios únicos en logs
@router.get("/logs/usuarios")
@router.get("/logs/usuarios/")
async def get_log_usuarios(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """Retorna lista de usuarios únicos que aparecen en los logs"""
    usuarios_set: set[str] = set()

    # Producción
    result = await db.execute(
        select(RegistroProduccion.usuario).where(
            RegistroProduccion.usuario.isnot(None),
            RegistroProduccion.usuario != "",
        ).distinct()
    )
    for row in result.scalars().all():
        if row and row.strip():
            usuarios_set.add(row.strip())

    # Secado
    result = await db.execute(
        select(RegistroSecado.usuario).where(
            RegistroSecado.usuario.isnot(None),
            RegistroSecado.usuario != "",
        ).distinct()
    )
    for row in result.scalars().all():
        if row and row.strip():
            usuarios_set.add(row.strip())

    # Cola impresión
    result = await db.execute(
        select(ColaImpresion.usuario).where(
            ColaImpresion.usuario.isnot(None),
            ColaImpresion.usuario != "",
        ).distinct()
    )
    for row in result.scalars().all():
        if row and row.strip():
            usuarios_set.add(row.strip())

    return sorted(usuarios_set)

# ── GET /api/admin/system-status ─────────────────────────────────────
@router.get("/system-status")
@router.get("/system-status/")
async def get_system_status(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """Estado del sistema: conteo de tablas, tamaño DB, etc."""

    # Tamaño de la base de datos
    result = await db.execute(
        text("SELECT pg_size_pretty(pg_database_size(current_database()))")
    )
    db_size = result.scalar() or "—"

    # Conteo por tabla
    tablas_info = []
    tablas = [
        ("usuarios",             "usuarios"),
        ("inventario_planta",    "inventario_planta"),
        ("partes",               "partes"),
        ("planes_produccion",    "planes_produccion"),
        ("registros_produccion", "registros_produccion"),
        ("registros_secado",     "registros_secado"),
        ("cola_impresion",       "cola_impresion"),
        ("contador_carritos",    "contador_carritos"),
        ("anomalias",            "anomalias"),
        ("registros_paros",      "registros_paros"),
        ("historial_turnos",     "historial_turnos"),
        ("suministros_silo",    "suministros_silo"),
        ("lotes_inventario",     "lotes_inventario"),
        ("ordenes_produccion",    "ordenes_produccion"),
    ]

    for nombre, tabla in tablas:
        try:
            result = await db.execute(text(f"SELECT COUNT(*) FROM {tabla}"))
            count = result.scalar() or 0

            result_size = await db.execute(
                text(f"SELECT pg_size_pretty(pg_total_relation_size('{tabla}'))")
            )
            size = result_size.scalar() or "—"

            tablas_info.append({
                "nombre": nombre,
                "registros": count,
                "tamano": size,
            })
        except Exception:
            tablas_info.append({
                "nombre": nombre,
                "registros": 0,
                "tamano": "—",
            })

    # Total de registros
    total_registros = sum(t["registros"] for t in tablas_info)

    # Uptime de PostgreSQL
    try:
        result = await db.execute(
            text("SELECT date_trunc('second', current_timestamp - pg_postmaster_start_time()) AS uptime")
        )
        uptime = str(result.scalar() or "—")
    except Exception:
        uptime = "—"

    # Versión PostgreSQL
    try:
        result = await db.execute(text("SELECT version()"))
        pg_version_full = result.scalar() or ""
        pg_version = pg_version_full.split(",")[0] if pg_version_full else "—"
    except Exception:
        pg_version = "—"

    return {
        "db_size":          db_size,
        "total_registros":  total_registros,
        "total_tablas":     len(tablas_info),
        "tablas":           tablas_info,
        "uptime":           uptime,
        "pg_version":       pg_version,
        "hora_servidor":    ahora_local().strftime("%Y-%m-%d %H:%M:%S"),
    }


# ── POST /api/admin/db/limpiar-cola ─────────────────────────────────
@router.post("/db/limpiar-cola")
@router.post("/db/limpiar-cola/")
async def limpiar_cola_generados(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """Elimina registros de cola_impresion con estado 'generado'"""
    result = await db.execute(
        text("DELETE FROM cola_impresion WHERE estado = 'generado'")
    )
    await db.commit()
    return {"message": "Cola limpiada", "eliminados": result.rowcount}


# ── POST /api/admin/db/limpiar-anomalias ─────────────────────────────
@router.post("/db/limpiar-anomalias")
@router.post("/db/limpiar-anomalias/")
async def limpiar_anomalias_antiguas(
    dias: int = 30,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """Elimina anomalías con más de X días"""
    fecha_limite = (ahora_local() - timedelta(days=dias)).strftime("%Y-%m-%d")
    result = await db.execute(
        text("DELETE FROM anomalias WHERE fecha < :fecha"),
        {"fecha": fecha_limite}
    )
    await db.commit()
    return {"message": f"Anomalías anteriores a {fecha_limite} eliminadas", "eliminados": result.rowcount}


# ── POST /api/admin/db/limpiar-historial ─────────────────────────────
@router.post("/db/limpiar-historial")
@router.post("/db/limpiar-historial/")
async def limpiar_historial_turnos(
    dias: int = 30,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """Elimina historial de turnos con más de X días"""
    fecha_limite = (ahora_local() - timedelta(days=dias)).strftime("%Y-%m-%d")
    result = await db.execute(
        text("DELETE FROM historial_turnos WHERE fecha < :fecha"),
        {"fecha": fecha_limite}
    )
    await db.commit()
    return {"message": f"Historial anterior a {fecha_limite} eliminado", "eliminados": result.rowcount}


# ── POST /api/admin/db/resetear-contadores ───────────────────────────
@router.post("/db/resetear-contadores")
@router.post("/db/resetear-contadores/")
async def resetear_contadores(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """Resetea todos los contadores de carritos"""
    result = await db.execute(text("DELETE FROM contador_carritos"))
    await db.commit()
    return {"message": "Contadores reseteados", "eliminados": result.rowcount}


# ── POST /api/admin/db/vaciar-produccion ─────────────────────────────
@router.post("/db/vaciar-produccion")
@router.post("/db/vaciar-produccion/")
async def vaciar_produccion(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """Vacía la tabla de registros de producción"""
    result = await db.execute(text("DELETE FROM registros_produccion"))
    await db.commit()
    return {"message": "Registros de producción eliminados", "eliminados": result.rowcount}


# ── POST /api/admin/db/vaciar-secado ─────────────────────────────────
@router.post("/db/vaciar-secado")
@router.post("/db/vaciar-secado/")
async def vaciar_secado(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """Vacía la tabla de registros de secado"""
    result = await db.execute(text("DELETE FROM registros_secado"))
    await db.commit()
    return {"message": "Registros de secado eliminados", "eliminados": result.rowcount}

# ── GET /api/admin/reportes-turnos ───────────────────────────────────
@router.get("/reportes-turnos")
@router.get("/reportes-turnos/")
async def get_reportes_turnos(
    limite: int = 20,
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """Retorna resumen de producción agrupado por fecha+turno"""

    result = await db.execute(
        text("""
            SELECT
                fecha,
                turno,
                COUNT(*)                        AS escaneos,
                COALESCE(SUM(qty_bolsa), 0)     AS piezas,
                COUNT(DISTINCT numero_parte)     AS partes_unicas,
                COUNT(DISTINCT maquina)          AS maquinas,
                MIN(hora)                        AS primer_escaneo,
                MAX(hora)                        AS ultimo_escaneo
            FROM registros_produccion
            WHERE fecha IS NOT NULL
            GROUP BY fecha, turno
            ORDER BY fecha DESC, turno DESC
            LIMIT :limite
        """),
        {"limite": limite}
    )
    rows = result.fetchall()

    # También traer datos de secado por turno
    result_secado = await db.execute(
        text("""
            SELECT
                fecha,
                turno,
                COUNT(*)                                    AS total_secado,
                COUNT(*) FILTER (WHERE estado = 'salido')   AS salidos_secado
            FROM registros_secado
            WHERE fecha IS NOT NULL
            GROUP BY fecha, turno
            ORDER BY fecha DESC, turno DESC
            LIMIT :limite
        """),
        {"limite": limite}
    )
    secado_rows = result_secado.fetchall()
    secado_map = {}
    for r in secado_rows:
        secado_map[f"{r[0]}_{r[1]}"] = {
            "total_secado":   r[2],
            "salidos_secado": r[3],
        }

    reportes = []
    for r in rows:
        key = f"{r[0]}_{r[1]}"
        secado = secado_map.get(key, {"total_secado": 0, "salidos_secado": 0})
        reportes.append({
            "fecha":           r[0],
            "turno":           r[1],
            "escaneos":        r[2],
            "piezas":          r[3],
            "partes_unicas":   r[4],
            "maquinas":        r[5],
            "primer_escaneo":  r[6],
            "ultimo_escaneo":  r[7],
            "secado_total":    secado["total_secado"],
            "secado_salidos":  secado["salidos_secado"],
        })

    return reportes

# ── POST /api/admin/db/vaciar-ordenes-produccion ──────────────────────
@router.post("/db/vaciar-ordenes-produccion")
@router.post("/db/vaciar-ordenes-produccion/")
async def vaciar_ordenes_produccion(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """Vacía la tabla de órdenes de producción y sus suministros asociados"""
    # Primero eliminar suministros (dependen de OPs)
    r_sum = await db.execute(text("DELETE FROM suministros_silo"))
    # Luego eliminar las OPs
    r_ops = await db.execute(text("DELETE FROM ordenes_produccion"))
    await db.commit()
    return {
        "message": "Órdenes de producción y suministros eliminados",
        "eliminados": r_ops.rowcount + r_sum.rowcount,
    }


# ── POST /api/admin/db/vaciar-suministros-silo ────────────────────────
@router.post("/db/vaciar-suministros-silo")
@router.post("/db/vaciar-suministros-silo/")
async def vaciar_suministros_silo(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """Vacía únicamente la tabla de suministros de silo"""
    result = await db.execute(text("DELETE FROM suministros_silo"))
    await db.commit()
    return {
        "message": "Suministros de silo eliminados",
        "eliminados": result.rowcount,
    }


# ── POST /api/admin/db/vaciar-lotes-inventario-produccion ─────────────
@router.post("/db/vaciar-lotes-inventario-produccion")
@router.post("/db/vaciar-lotes-inventario-produccion/")
async def vaciar_lotes_inventario_produccion(
    db: AsyncSession = Depends(get_db),
    _: Usuario = Depends(get_current_admin),
):
    """Elimina lotes de inventario generados por producción (op_origen NOT NULL)"""
    # Primero eliminar movimientos de esos lotes
    r_mov = await db.execute(text("""
        DELETE FROM movimientos_lote
        WHERE lote_id IN (
            SELECT lote_id FROM lotes_inventario
            WHERE op_origen IS NOT NULL
        )
    """))
    # Luego eliminar los lotes
    r_lotes = await db.execute(text("""
        DELETE FROM lotes_inventario WHERE op_origen IS NOT NULL
    """))
    await db.commit()
    return {
        "message": "Lotes de inventario de producción y sus movimientos eliminados",
        "eliminados": r_lotes.rowcount + r_mov.rowcount,
    }