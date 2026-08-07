# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Industrial ERP system for Cheong Woon plastics manufacturing plant. Full-stack: FastAPI backend + Next.js frontend, Dockerized, PostgreSQL via async SQLAlchemy.

## Development Commands

**Always use `dcl` (alias for local compose) in development — never bare `docker-compose` which uses the production file.**

```bash
# Stack management
alias dcl='docker-compose -f docker-compose.local.yml'
dcl up -d                    # Start stack
dcl ps                       # Check status
dcl logs -f backend          # Live backend logs
dcl restart backend          # Restart (volume-mounted, no rebuild needed)
dcl build backend            # Rebuild only when Dockerfile/requirements change

# Database migrations (ALWAYS run inside container)
dcl exec -w /app backend alembic revision --autogenerate -m "descripción"
dcl exec -w /app backend alembic upgrade head
dcl exec -w /app backend alembic current
dcl exec -w /app backend alembic downgrade -1   # dev only

# Database direct access
dcl exec db psql -U planta_user -d planta_db
```

**Frontend local dev** (outside Docker, when working on frontend only):
```bash
cd frontend
npm run dev      # http://localhost:3000
npm run build
npm run lint
```

**Backend tests:**
```bash
dcl exec -w /app backend python -m pytest tests/
dcl exec -w /app backend python -m pytest tests/test_proveedores.py  # single file
```

**Production deploy:**
```bash
git pull
docker compose build backend && docker compose up -d backend
docker compose exec -w /app backend alembic upgrade head
docker compose restart backend
```

## Architecture

### Backend (`backend/app/`)
- `main.py` — FastAPI app with `lifespan`: verifies DB connection, creates initial admin user, starts APScheduler. **Never calls `create_all`** — Alembic owns the schema.
- `database.py` — async SQLAlchemy engine + `AsyncSessionLocal` + `Base`
- `core/deps.py` — `get_db`, `get_current_user`, and per-role guards (`get_current_admin`, `get_current_finanzas`, etc.)
- `core/security.py` — bcrypt hashing (native, not passlib), JWT create/decode
- `models/__init__.py` — imports **all** models so Alembic autogenerate picks them up; this import is critical
- `routers/` — 22 routers, each registered in `main.py`
- `services/` — business logic: AI analytics, PDF generation, turno management, supplier scoring

### Frontend (`frontend/src/`)
- `lib/api.ts` — all API calls centralized here (~2400 lines). `API_URL=''` → relative URLs proxied by Next.js
- `types/index.ts` — all TypeScript interfaces (~950 lines)
- `context/AuthContext.tsx` — auth state, `useAuth()` hook, stores token in localStorage + cookies
- `middleware.ts` — route protection by role via cookies (`token`, `rol`)
- `app/<module>/page.tsx` + tab files — each module is a fullscreen `ModuleShell.tsx` with themed tabs
- `components/ui/` — shared UI kit: Button, Card, Modal, DataTable, FormInput, Badge, etc.
- `lib/theme.ts` — per-module color themes

### Proxy Architecture
`frontend/next.config.ts` proxies all `/api/*`, `/partes/*`, `/productos/*`, etc. to `http://backend:8000`. WebSocket connects directly (not proxied) via `NEXT_PUBLIC_WS_URL`.

## Key Conventions

### Backend
- All endpoints are `async/await`
- `redirect_slashes=False` on the FastAPI app
- Quality control assignment is automatic: COMPONENTE/RESINA → IQC only; PRODUCTO FINAL → LQC + OQC
- Timezone is fixed UTC-6; use `ahora_local()`, `get_fecha_turno()`, `get_turno_actual()` helpers
- Excel importer normalizes column headers: lowercase, no accents, spaces→hyphens
- Runs as `appuser` (UID 1000) in Docker

### Frontend
- Numeric form fields stored as strings, converted to numbers on submit
- Fullscreen module pages use `ModuleShell.tsx` (fixed inset-0); Navbar hides on these routes
- WebSocket connects directly to `NEXT_PUBLIC_WS_URL` (not via Next.js proxy)

### Migrations
- Alembic is the single source of truth — never `Base.metadata.create_all()`
- `alembic/env.py` converts `postgresql+asyncpg://` → `postgresql+psycopg2://` for sync migrations
- After any model change: autogenerate → review the file → `upgrade head` → commit

## Roles

`admin` → `supervisor` → `operador` (limited `/produccion`)
`finanzas`, `compras`, `ventas`, `calidad`, `almacen`, `logistica` — each restricted to their module(s)

## ID Formats

| Entity | Format | Example |
|---|---|---|
| Orden Producción | `[PE-\|INY-\|]NN+DDMMYY+XXXX` | `PE-010526-ABCD` |
| Lote IQC | `YYYYMMDD-XXXX-N` | `20260526-001-1` |
| Inspección | `INS-{TIPO}-{ddmmyyHHMMSS}` | `INS-IQC-2605103000` |
| OC Producción | `OC-PROD-{YYYYMMDDHHmmss}` | `OC-PROD-20260526103000` |

## Key Business Flows

**Shift change:** First scan of a new shift auto-closes the previous one and saves a JSON snapshot to `historial_turnos`. Shifts are DIA 07:30–19:30 / NOCHE 19:30–07:30.

**Pre-expansion without raw material stock:** System auto-generates an OC with `origen=PRODUCCION`, `status=Pendiente Aprobación`, `proveedor=POR-ASIGNAR`. Compras assigns supplier/prices and approves.

**ASSY with missing BOM components:** Validates stock of all components first. Missing → `Pendiente Material`. "Surtir Material" re-validates then consumes FIFO.

**Recepciones:** there is a single reception flow, photo-based. The warehouse operator photographs the supplier's physical remisión (or sends it from a phone via the QR handoff at `/movil/[sessionId]`), Tesseract + Ollama extract the line items (`services/ocr_remisiones.py`), the operator reviews and saves a `RemisionRecepcion`, and printing the labels (`POST /api/remisiones/{id}/etiquetas`) is what creates the `LoteInventario` rows as `Pendiente IQC`. Everything lives in `routers/remisiones.py` (prefix `/api/remisiones`) and `app/almacen/RecepcionesOCRTab.tsx` (tab id `recepciones`). **It does not know about Órdenes de Compra** — `proveedor` is free text off the sheet, not an FK. The old OC-driven flow (`recepciones_compra`, `/almacen/recepciones/*`) was removed in `20260807_del_recepciones`; as a consequence OCs no longer advance to `Parcial`/`Completada` on their own, and the supplier score no longer receives `PUNTUALIDAD_*` events.

**IQC → warehouse location:** Reception creates the lote with `estado_calidad="Pendiente IQC"` → Calidad inspects → if Approved it lands in "Pendientes de Ubicar" (which is implicit: `estado_calidad="Aprobado" AND ubicacion_id IS NULL`, see `almacen.py` `/inventario/aprobados-sin-ubicacion`) → Almacén transfers it, writing `MovimientoLote(tipo="TRASLADO", detalles={"origen": "IQC", ...})`.

**Quality inspection (IQC / LQC / OQC):** the `puntos_inspeccion_*` of the product are **no longer used** — they stay in the model and in the Productos editor for the historical record, but Calidad doesn't read them. The inspector now sees the **ayudas visuales** of the part number and answers two fixed questions (`PREGUNTAS` in `components/calidad/InspeccionEvaluacion.tsx`). All "Sí" → **Aprobado**. Any "No" requires a reason plus at least one photo, and then the choice of **Rechazo** or **Cuarentena**. The backend re-validates this coherence in `_validar_evaluacion` (`routers/calidad.py`) instead of trusting the client's verdict.

**Cuarentena:** a third value of `ResultadoInspeccion` and of `estado_calidad`. The lote stays out of inventory because every stock query filters on `estado_calidad == "Aprobado"`. It is resolved from Historial → Cuarentena → "Segunda revisión" (`POST /calidad/inspecciones/{id}/segunda-revision`), which **updates the same inspection** (no second row), records the original reasons in `segunda_revision`, and defers the supplier score impact until that moment. Approving there returns the lote to "Pendientes de Ubicar".

**Incident photos:** stored under `backend/static/incidencias_iqc/<Lote ID>/<uuid>.<ext>`, uploaded before the inspection exists (`POST /calidad/incidencias/foto`) and served by an authenticated endpoint — there is **no `StaticFiles` mount** anywhere in this backend. Same pattern as the remisiones photos (`routers/remisiones.py`).

**Shipments:** OV "Pendiente de Envío" → Almacén creates Embarque (consumes FIFO lots) → Surtido → En Tránsito → Entregado.

**Visual aids (Ayudas Visuales) mirror:** the PDFs live on the Synology SMB share `\\192.168.1.15\ayudas visuales`, but the backend **never serves from there**. "Reindexar AV" (Producción → Productos) runs `POST /ayudas-visuales/sync`, a background job with two phases: (1) `services/ayudas_sync.py` mirrors the share recursively into `backend/static/ayudas_visuales/` — copies new/changed files, deletes what's gone from the cloud; (2) the existing indexer matches each PDF to a product by the SKU in its filename and renders thumbnails. The UI polls `GET /ayudas-visuales/sync/estado`. An APScheduler job repeats it nightly when `AYUDAS_SYNC_AUTO=true`. If the Synology is unreachable — or any folder fails to list — **the prune is skipped and nothing local is deleted**, so viewing keeps working offline. `POST /ayudas-visuales/reindexar` still reindexes disk only, without touching SMB. Credentials: `SMB_AYUDAS_*` in `.env`.

## Excel Files — Ventas Module

CW usa dos archivos Excel de LG como fuente de datos para el módulo `/ventas`.
Ambos se importan vía endpoints POST en el backend; nunca se leen directamente desde el frontend.

---

### 1. CW_Venta_Reporte_Diario (`CW_Venta_Reporte_Diario_JUNIO_*.xlsx`)

Archivo de reporte diario de ventas y plan semanal.  
**Importar:** `POST /finanzas/plan-ventas/importar` (hoja `CW PLAN`) y lectura manual de `VENTA REPORTE(D)`.

#### Hoja: `CW PLAN`

Plan semanal de embarques a LG por SKU.  
Headers en **fila 5** (índice 5 en openpyxl, base 1); datos desde fila 6.

| Columna | Header | Campo en DB (`PlanVentas.items[]`) | Notas |
|---|---|---|---|
| B | NO. PARTE | `sku` | Clave primaria del SKU |
| C | DESCRIPCION | `descripcion` | Nombre del producto |
| D | LINE | `linea` | R1 / R2 / R3 / SVC |
| E | CW LINE | `cw_line` | L2 / L3 / L5 / L6 — línea de producción CW |
| F | MODEL | `model` | QUANTUM-T / OMEGA / MAJESTY / etc. |
| G | MODEL | *(segunda descripción, ignorar)* | |
| H | ID 1 | `id1` | Agrupación funcional: Control Box / Duct Multi / etc. |
| N | viernes | `dias.VIERNES.plan` | Cantidad programada ese día |
| O | lunes | `dias.LUNES.plan` | |
| P | martes | `dias.MARTES.plan` | |
| Q | miércoles | `dias.MIERCOLES.plan` | |
| R | jueves | `dias.JUEVES.plan` | |
| S | INV. CW | `stock_actual` | Inventario en planta CW |
| T | INV. LG | `stock_lg` | Inventario en planta LG — usado para calcular DIF |

- **Fila 4** contiene fechas datetime para las columnas de días (identificar día de la semana con `weekday()`).
- Filas con columna B vacía (`NO. PARTE = None`) son separadores visuales — ignorar.
- `DIF = stock_lg − plan_acumulado_hasta_el_día` — se calcula en frontend, **no se almacena**.
- El parser usa `pd.Timestamp.weekday()` para mapear fechas a `LUNES/MARTES/MIERCOLES/JUEVES/VIERNES/SABADO`.
- Upsert por `identificador_semana` (formato `YYYY-WW`); preserva `status="Autorizado"` y `ov_generada` en días ya procesados.

#### Hoja: `VENTA REPORTE(D)` — Reporte diario de embarques realizados

Historial de piezas embarcadas a LG por día.  
Headers en **fila 4**; datos desde fila 5.

| Columna | Header | Equivalente en DB |
|---|---|---|
| B | NO. PARTE | `sku_producto` |
| C | DESCRIPCION | `nombre_producto` |
| D | LINE | `linea` |
| E | NO. EMB | número de embarque del día |
| F | CANTIDAD | cantidad programada |
| G | FECHA | `fecha_envio` (datetime) |
| H | NO. DEPARTURE | `EnvioVenta.no_departure` — folio NPX de LG (ej: `NPX26060000025`) |
| I | CW INVOICE | `EnvioVenta.cw_invoice` (ej: `CWJ1`) |
| J | HRA DE SALIDA | hora de salida del camión |
| K | SALIDA STATUS | `EnvioVenta.status_salida` — `OK` o `NG` |
| L | CANTIDAD FINAL | `cantidad` efectivamente enviada |
| M | CAPTURISTA | usuario que capturó |
| N | NO. CAMION | `EnvioVenta.no_camion` |
| O | CHOFER | `EnvioVenta.chofer` |
| P | COMENTARIO | notas |

#### Hoja: `VENTA REPORTE(M)` — Mismo formato, acumulado mensual

Misma estructura que `VENTA REPORTE(D)`, pero con el acumulado del mes completo.

#### Hoja: `PANTALLA`

Dashboard visual de LG con DIF y programación. **No se importa al sistema** — solo referencia visual.

---

### 2. PLAN_EMBARQUE (`PLAN_EMBARQUE_DDMMYYYY.xlsx`)

Plan semanal detallado que LG entrega a CW con PSI Coverage, programación por línea y requerimientos GMES.  
**Importar:** `POST /finanzas/plan-embarque/importar` (hoja `PSI RESUME`).

#### Hoja: `PSI RESUME` ← **LA MÁS IMPORTANTE**

Resumen de cobertura PSI (Production Schedule Index) por categoría de producto.  
El backend la lee directamente para actualizar `psi_snapshots` con los valores oficiales de LG.

| Fila (openpyxl base-1) | Columna | Contenido | Campo en `PsiSnapshot` |
|---|---|---|---|
| 10 | B | `"Ref"` | — identificador de categoría |
| 10 | C | Need D-Day (entero) | `ref_need_dday` |
| 10 | D | Covered D-Day (entero) | `ref_covered_dday` |
| 10 | E | % coverage D-Day (fracción 0–1) | `coverage_ref_dday` |
| 10 | F | Need D+1 (entero) | `ref_need_d1` |
| 10 | G | Covered D+1 (entero) | `ref_covered_d1` |
| 10 | H | % coverage D+1 (fracción 0–1) | `coverage_ref_d1` |
| 11 | B | `"Oven"` | — identificador de categoría |
| 11 | C–H | misma estructura que fila 10 | `oven_*` |

- Valores son fracciones (0.368 = 36.8%). El dashboard los multiplica × 100 para mostrar.
- El backend acota a máximo 2.0 (200%) antes de guardar.
- Si existe `PsiSnapshot` para hoy, el dashboard usa esos valores; si no, calcula desde `CW PLAN`.
- **Categorías:** `Ref` = líneas R1/R2 (refrigeración), `Oven` = línea R3 u otros (hornos).

#### Hoja: `CW PLAN`

Mismo formato que el `CW PLAN` del archivo de reporte diario (ver arriba).  
Usado para consulta; el import oficial viene del `CW_Venta_Reporte_Diario`.

#### Hoja: `PROGRAMACION`

Plan de producción por línea (R1, R2, R3) con cantidades diarias y asignaciones de modelos.  
Estructura compleja: filas 2–7 tienen configuración de líneas (LINE, META, MIX A/B, UPH);
filas 8+ tienen días como columnas con cantidades por modelo.  
**No se importa aún** — pendiente para `DemandaTab`.

#### Hoja: `PPN` (Production Plan by Number)

Work orders por línea con fechas. Columnas: Line, W/O, Project, y una columna por cada fecha de la semana.  
**No se importa aún.**

#### Hoja: `GMES`

Requerimientos de componentes por parte LG. ~6966 filas.  
**No se importa aún** — pendiente para `DemandaTab` (análisis de demanda de componentes).

#### Hojas: `OVEN FCST`, `INV PT`, `INV EPS`, `INV EPS CUTTING`, `INV MATERIAL`

Inventarios y forecasts de productos terminados, EPS y materiales.  
**No se importan aún.**

---

### Convenciones de parsing para Excel

```python
# Leer hoja con openpyxl (data_only=True para obtener valores calculados, no fórmulas)
import openpyxl, io
wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
ws = wb["CW PLAN"]

# Acceder a fila/columna (base 1):
ws.cell(row=10, column=5).value   # fila 10, columna E

# Iterar fila como lista 0-indexed:
row = [c.value for c in ws[10]]   # índice 0 = col A, 1 = col B, etc.

# Detectar columnas de días por tipo datetime:
import pandas as pd
if isinstance(val, datetime):
    dia = ["LUNES","MARTES","MIERCOLES","JUEVES","VIERNES","SABADO","DOMINGO"][val.weekday()]

# Ignorar filas separadoras (NO. PARTE vacío):
if not row[1]:   # columna B (índice 1) es NO. PARTE
    continue
```

---

## Services & Ports

| Service | Container (local) | Port |
|---|---|---|
| PostgreSQL | `produccion_db_local` | 5433 → 5432 |
| FastAPI backend | `produccion_backend` | 8000 |
| Next.js frontend | `produccion_frontend` | 3000 |
| pgAdmin | `produccion_pgadmin` | 5050 |
