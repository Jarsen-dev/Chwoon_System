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

**IQC → warehouse location:** Reception creates lote with `estado_calidad=Pendiente` → Calidad inspects → if Approved, appears in "Pendientes de Ubicar" → `MovimientoLote(TRANSFERENCIA_IQC)`.

**Shipments:** OV "Pendiente de Envío" → Almacén creates Embarque (consumes FIFO lots) → Surtido → En Tránsito → Entregado.

## Services & Ports

| Service | Container (local) | Port |
|---|---|---|
| PostgreSQL | `produccion_db_local` | 5433 → 5432 |
| FastAPI backend | `produccion_backend` | 8000 |
| Next.js frontend | `produccion_frontend` | 3000 |
| pgAdmin | `produccion_pgadmin` | 5050 |
