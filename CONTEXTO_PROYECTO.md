# Sistema de Producción — Cheong Woon

> Repositorio: `git@github.com:Jarsen-dev/Chwoon_System.git`
> Rama principal: `main`
> Ramas adicionales: `feat/migracion-web`, `frontend-redesign`, `security/backend-deps`

---

## Stack Tecnológico

### Backend
- **Python 3.12** + FastAPI + Uvicorn (async, hot-reload)
- **SQLAlchemy** + asyncpg (PostgreSQL async)
- **Alembic** (migraciones de DB — única fuente de verdad del esquema)
- Pydantic, Pandas, NumPy, scikit-learn
- ReportLab + QRCode (PDFs/etiquetas)
- python-jose[cryptography] (JWT), bcrypt (passwords)
- APScheduler (gestión de turnos), pytz
- pip-tools (`requirements.in` → `requirements.txt` con hashes)

### Frontend
- **Next.js 16.2.6** + TypeScript + **React 19.2.4**
- Tailwind CSS 4 (dark theme), App Router
- React Query, Zustand, React Hook Form + Zod
- Recharts (gráficas), html5-qrcode (scanner)
- Socket.IO Client (WebSocket), jsPDF + html2canvas
- Radix UI (Dialog, Tabs, Toast)
- html-to-image, date-fns, jwt-decode

---

## Convenciones del Proyecto

### Backend
- `redirect_slashes=False` → endpoints definidos con y sin `/`
- async/await en todos los endpoints
- Modelos en `models/`, validación Pydantic en `schemas/`, lógica en `services/`, endpoints en `routers/`
- Auth: `Depends(get_current_user)` o roles específicos
- Controles de calidad automáticos: COMPONENTE/RESINA → ["IQC"]; PRODUCTO FINAL → ["LQC", "OQC"]
- Importador Excel normaliza columnas (minúsculas, sin acentos, espacios→guiones)
- Backend Dockerfile corre como `appuser` (UID 1000)

### Frontend
- API calls a través de `src/lib/api.ts` con `API_URL=''` (URLs relativas vía proxy Next.js)
- WebSocket directo: `NEXT_PUBLIC_WS_URL`
- Estado auth en `AuthContext.tsx`, hook `useAuth()`, cookies + localStorage
- Páginas fullscreen con `ModuleShell.tsx` (fixed inset-0 con tabs temáticos)
- Navbar oculta en rutas fullscreen
- Campos numéricos en forms: almacenados como string, convertidos al enviar
- UI Kit en `components/ui/`: Button, Card, Modal, DataTable, FormInput, Badge, etc.

---

## Proxy Next.js → Backend

- `frontend/next.config.ts` proxea rutas a `http://backend:8000`
- Secciones: `beforeFiles` (PDFs, descargas Excel, APIs que colisionan con App Router) y `afterFiles` (API general)
- WebSocket conecta directo (no proxea WS)

---

## Estructura del Proyecto

```
produccion/
├── .env                          # Variables de entorno (raíz, NUNCA en git)
├── .env.example                  # Template de env vars
├── .gitignore
├── README.md
├── package.json                  # Dependencias raíz (html5-qrcode, @types/react)
├── docker-compose.yml            # PRODUCCIÓN
├── docker-compose.local.yml      # DESARROLLO
├── backend/
│   ├── .env                      # DATABASE_URL, SECRET_KEY, etc.
│   ├── Dockerfile                # python:3.12-slim, appuser UID 1000
│   ├── .dockerignore
│   ├── requirements.in           # Dependencias directas (pip-compile)
│   ├── requirements.txt          # Pinned + hashed (pip-tools)
│   ├── migrate_data.py           # Solo importa JSON inicial (no crea tablas)
│   ├── alembic.ini               # script_location=alembic, timezone=America/Mexico_City
│   ├── test_wms_integration.py
│   ├── static/
│   │   └── Logo.png
│   ├── alembic/
│   │   ├── env.py                # Lee .env, convierte asyncpg→psycopg2
│   │   ├── script.py.mako
│   │   └── versions/             # 22 migraciones (ver sección Alembic)
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py               # FastAPI, lifespan (verifica DB, admin inicial, scheduler)
│   │   ├── database.py           # engine async + AsyncSessionLocal + Base
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   ├── security.py       # bcrypt hashing, JWT create/decode
│   │   │   └── deps.py           # get_db, get_current_user, guards por rol
│   │   ├── models/               # 32 modelos (ver abajo)
│   │   │   └── __init__.py       # Importa todos los modelos para Alembic
│   │   ├── schemas/              # 14 schemas Pydantic
│   │   │   └── __init__.py
│   │   ├── routers/              # 22 routers
│   │   │   └── __init__.py
│   │   └── services/             # 6 services
│   ├── tests/
│   │   ├── conftest.py
│   │   └── test_proveedores.py
│   └── venv/
├── frontend/
│   ├── Dockerfile                # node:20-alpine, build+start
│   ├── package.json
│   ├── next.config.ts            # 272 líneas de rewrites
│   ├── tailwind.config.ts
│   ├── tsconfig.json
│   ├── eslint.config.mjs
│   ├── postcss.config.mjs
│   ├── .env.local
│   ├── .env.production
│   ├── public/
│   │   └── Logo.png
│   └── src/
│       ├── app/                  # módulos con page.tsx + tabs
│       │   ├── login/
│       │   ├── unauthorized/
│       │   ├── produccion/       # 16 tabs + helpers.ts
│       │   ├── almacen/          # 11 tabs
│       │   ├── calidad/          # 8 tabs
│       │   ├── compras/          # 4 tabs (incl. ValidacionTab)
│       │   ├── ventas/           # 5 tabs
│       │   ├── logistica/        # 4 tabs
│       │   ├── admin/            # 8 tabs + helpers.tsx
│       │   ├── layout.tsx
│       │   ├── page.tsx
│       │   └── globals.css
│       ├── components/
│       │   ├── MainWrapper.tsx
│       │   ├── Navbar.tsx
│       │   ├── ui/               # 10 componentes UI
│       │   ├── etiquetas/        # (vacío)
│       │   ├── partes/           # (vacío)
│       │   └── produccion/       # (vacío)
│       ├── context/
│       │   └── AuthContext.tsx
│       ├── lib/
│       │   ├── api.ts            # ~2375 líneas, todos los endpoints
│       │   └── theme.ts          # Temas por módulo + colores
│       ├── middleware.ts         # Protección de rutas por rol
│       └── types/
│           └── index.ts          # 943 líneas, todas las interfaces
├── pgadmin/
│   └── entrypoint.sh             # Auto-configura pgpass + servers.json
├── .opencode/
│   └── ...                       # Configuración de OpenCode CLI
└── venv/
```

---

## Docker

| Servicio | Imagen | Puerto local | Puerto prod | Container local | Container prod |
|---|---|---|---|---|---|
| db | postgres:15-alpine | 5433:5432 | 5432:5432 | produccion_db_local | produccion_db |
| backend | python:3.12-slim | 8000:8000 | 8000:8000 | produccion_backend | produccion_backend |
| frontend | node:20-alpine | 3000:3000 | 3000:3000 | produccion_frontend | produccion_frontend |
| pgadmin | dpage/pgadmin4 | 5050:80 | 5050:80 | produccion_pgadmin | produccion_pgadmin |

### Desarrollo (alias `dcl`)
```bash
alias dcl='docker-compose -f docker-compose.local.yml'
# SIEMPRE usar dcl en desarrollo. docker-compose directo usa docker-compose.yml (producción)
dcl up -d                    # Levantar stack
dcl ps                       # Ver estado
dcl logs -f backend          # Logs en vivo
dcl restart backend          # Reiniciar (volume mount = sin rebuild)
dcl build backend            # Rebuild si tocas Dockerfile/requirements
dcl exec -w /app backend alembic revision --autogenerate -m "msg"
dcl exec -w /app backend alembic upgrade head
dcl exec db psql -U planta_user -d planta_db
```

### Producción
```bash
docker compose pull
docker compose build backend
docker compose up -d
docker compose exec -w /app backend alembic upgrade head
docker compose restart backend
```

---

## Variables de Entorno

### `.env` (raíz — desarrollo)
```
POSTGRES_USER=planta_user
POSTGRES_PASSWORD=password123
POSTGRES_DB=planta_db
DB_HOST=produccion_db_local
DB_PORT=5432
PGADMIN_EMAIL=admin@admin.com
PGADMIN_PASSWORD=admin123
DATABASE_URL=postgresql+asyncpg://planta_user:password123@db:5432/planta_db
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5050
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_WS_URL=ws://localhost:8000
```

### `backend/.env` (desarrollo)
```
DATABASE_URL=postgresql+asyncpg://planta_user:password123@localhost:5432/planta_db
SECRET_KEY=sistema_planta_clave_super_secreta_2024_cambiar_produccion
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=480
ALLOWED_ORIGINS=http://localhost:3000,http://192.168.1.101:3000,http://localhost:5050
```

### Producción (creado manualmente en servidor)
- DB_HOST=produccion_db
- ALLOWED_ORIGINS y NEXT_PUBLIC_WS_URL apuntan a 100.111.35.87

---

## Alembic — Sistema de Migraciones (CRÍTICO)

### Configuración
- `backend/alembic/env.py` carga `.env` y convierte `postgresql+asyncpg://` → `postgresql+psycopg2://`
- `backend/app/models/__init__.py` importa TODOS los modelos (crítico para `Base.metadata`)
- `backend/app/main.py` NO llama `init_db()` ni `create_all` — Alembic es la única fuente de verdad del esquema

### Flujo de trabajo
**Desarrollo:** cambias modelo → genera migración → aplica local
```bash
dcl exec -w /app backend alembic revision --autogenerate -m "descripción"
# Revisar archivo generado en backend/alembic/versions/
dcl exec -w /app backend alembic upgrade head
git add + commit + push
```

**Producción:** pull → build → upgrade
```bash
git pull
docker compose build backend && docker compose up -d backend
docker compose exec -w /app backend alembic upgrade head
docker compose restart backend
```

### Comandos útiles
- `alembic current` → versión aplicada
- `alembic history` → historial de migraciones
- `alembic heads` → última revisión disponible
- `alembic stamp head` → marcar como aplicada SIN ejecutar (baseline)
- `alembic downgrade -1` → revertir última (solo dev)

### Migraciones actuales (22 archivos)

| Archivo | Descripción |
|---|---|
| `20260430_0845_baseline_initial_schema.py` | Baseline inicial |
| `20260430_0905_sync_defaults_fk_and_nullables.py` | Sync defaults, FKs, nullables |
| `003_add_compras_ventas_roles.py` | Roles compras/ventas |
| `004_add_permisos_tabs.py` | Permisos por tabs |
| `005_rename_cliente_asociado_add_ciclo.py` | Rename cliente_asociado, add ciclo |
| `006_remove_nombre_linea_lg.py` | Remove nombre_linea_lg |
| `20260507_1150_plan_inyeccion.py` | Plan de inyección |
| `20260511_1200_inyeccion.py` | Tablas de inyección |
| `20260513_1500_add_nombre_productos.py` | Add nombre_productos |
| `20260513_1600_aux_silo.py` | Silo auxiliar |
| `20260515_1200_add_cli_prod.py` | Add cli_prod |
| `20260515_1400_add_proc_maq.py` | Add proc_maq |
| `20260515_1500_fix_alembic_v.py` | Fix alembic_version varchar(32) |
| `20260520_0956_rep_manual.py` | Reporte manual inyección |
| `20260522_1554_crear_tbl_prov.py` | Tabla proveedores |
| `20260525_1437_scoring.py` | Scoring proveedores |
| `20260527_0900_add_zonas_y_lote_campos.py` | Zonas y lotes |
| `20260528_0900_add_nombre_usuario.py` | Add nombre_usuario |
| `20260529_1200_add_proveedor_contacto_cols.py` | Contacto proveedor |
| `20260529_1300_add_iva_orden_compra.py` | IVA en ordenes de compra |
| `20260603_1015_add_firmas_orden_compra.py` | Firmas en orden de compra |
| `a1b2c3d4e5f6_add_empresa_tables.py` | Tablas de empresa |

---

## Roles y Permisos

| Rol | Acceso |
|---|---|
| admin | Total (incluye /admin) |
| supervisor | Todo excepto /admin |
| operador | `/`, `/produccion` limitado |
| finanzas | `/compras`, `/ventas`, `/calidad` |
| compras | `/compras` |
| ventas | `/ventas` |
| calidad | `/calidad`, `/produccion` |
| almacen | `/almacen`, `/logistica` |
| logistica | `/logistica` |

### Dependencias de Auth (`core/deps.py`)
- `get_current_user`, `get_current_admin`, `get_supervisor_or_admin`
- `get_current_finanzas`, `get_current_compras`, `get_current_ventas`
- `get_current_calidad`, `get_current_almacen`, `get_current_logistica`

### Middleware frontend (`middleware.ts`)
Protege rutas por rol vía cookies (`token`, `rol`). Redirige a `/login` o `/unauthorized`.

---

## JWT y Turnos

- Token: 480 min (8h = 1 turno), almacenado en localStorage + cookies
- Cookies usadas por `middleware.ts` para proteger rutas
- Turnos: DIA 07:30→19:30, NOCHE 19:30→07:30 (cruza medianoche)
- Cierre automático al primer escaneo del nuevo turno → snapshot JSON en `historial_turnos`
- Zona horaria fija UTC-6: `TZ_LOCAL = timezone(timedelta(hours=-6))`
- Helpers: `ahora_local()`, `get_fecha_turno()`, `get_turno_actual()`
- Scheduler APScheduler iniciado en `lifespan` de FastAPI

---

## Backend — Modelos de Base de Datos (32)

### Auth/Usuarios
- `Usuario` (username, email, hashed_password, rol, activo, permisos_tabs JSON, nombre_completo)

### Catálogo
- `Parte` (numero_parte, descripcion, tipo_material, kg_bolsa, etc.)
- `Producto` (sku, nombre, tipo PRODUCTO/COMPONENTE/RESINA, BOM JSON, puntos IQC/LQC/OQC lineas)
- `InventarioPlanta` (numero_parte, descripcion, cantidad, ubicacion)

### Producción
- `RegistroProduccion` (fecha, hora, turno, maquina, numero_parte, qty_bolsa, total_acumulado)
- `PlanProduccion` (numero_parte, meta_piezas, turno_objetivo)
- `ColaImpresion` (parte_id, cantidad_etiquetas, turno, estado)
- `ContadorCarrito` (carrito_numero, ultimo_registro_id)
- `Anomalia` (fecha, hora, numero_parte, motivo, tipo)
- `RegistroParo` (fecha, hora_inicio, hora_fin, duracion, maquina, motivo)
- `HistorialTurno` (turno, fecha, resumen JSON)
- `RegistroSecado` (fecha, hora, maquina, temperatura, humedad)
- `SuministroSilo` (silo, material, cantidad, operador, turno)
- `OrdenProduccion` (unificada PRE-EXPANSION/INYECCION/ASSY — ver abajo)

### Órdenes de Producción
Modelo unificado `OrdenProduccion` con campos específicos por clase:
- **PRE-EXPANSION**: sku_materia_prima, grado, numero_costal, densidad, pantalla_peso, ciclo_seg, counter_tiro, silo_destino, lote_inventario_generado
- **INYECCION**: uph_esperado, metodo_conteo
- **ASSY**: (usa BOM del producto)
- **Comunes**: op_id, clase_produccion, sku_producto, cantidad_a_producir, cantidad_producida, status, linea_produccion, operador
- **JSON fields**: registros_parciales, material_consumido, paros, etiquetas_generadas, scrap_reportado, componentes_consumidos

### Inyección
- `PlanInyeccion` (planes de inyección con metas y asignaciones)
- `RegistroAvanceInyeccion` (avance por máquina/turno)
- `ReporteManualInyeccion` (reporte manual con paros, scrap, observaciones)

### Compras
- `OrdenCompra` (+ `OrdenCompraItem`, `RecepcionCompra`) — con campo `origen` (FINANZAS/PRODUCCION)
- `Proveedor` (nombre, contacto, email, telefono, direccion, estatus, score JSON)
- `ConfigAlertaStock` (sku, stock_minimo, activo)

### Ventas
- `OrdenVenta` (+ `OrdenVentaItem`, `EnvioVenta`)
- `Devolucion`
- `PlanVentas`

### Calidad
- `Inspeccion` (tipo IQC/LQC/OQC/DEVOLUCION, resultados JSON)
- `RegistroScrap`

### Almacén
- `Ubicacion` (jerárquica: zona, pasillo, nivel, posición)
- `LoteInventario` (SKU, cantidad, lote, fecha_recepcion, estado_calidad, ubicacion, zona)
- `MovimientoLote` (tipo: TRANSFERENCIA_IQC, TRASLADO, CONSUMO_FIFO, etc.)
- `OrdenPicking` (ordenes de picking para preparación de pedidos)
- `ConteoFisico` (conteos cíclicos de inventario)

### Logística
- `Embarque` (Surtido→Tránsito→Entregado)
- `OrdenTraslado` + `OrdenTrasladoProduccion`

### Empresa
- `Empresa` (datos fiscales de la compañía: RFC, razón social, dirección, regimen_fiscal)

---

## Backend — Schemas Pydantic (14)

| Archivo | Contenido |
|---|---|
| `auth.py` | LoginRequest, Token, Usuario, UsuarioCreate, UsuarioUpdate |
| `produccion.py` | RegistroProduccion, Anomalia, RegistroParo, PlanProduccion |
| `inventario.py` | InventarioItem CRUD |
| `partes.py` | Parte CRUD |
| `productos.py` | Producto CRUD, BOM, puntos inspección |
| `cola.py` | ColaImpresion CRUD |
| `finanzas.py` | OC, OV, Devoluciones, PlanVentas, Proveedores, Dashboard |
| `calidad.py` | Inspecciones, Scrap, Dashboard |
| `almacen.py` | Ubicaciones, Lotes, Movimientos, Traslados, EPS, Trazabilidad, Dashboard |
| `logistica.py` | Embarques, Reporte, Dashboard |
| `ordenes_produccion.py` | OrdenProduccion, Paros |
| `empresa.py` | Empresa CRUD |
| `reporte_manual_inyeccion.py` | ReporteManualInyeccion |

---

## Backend — Routers (22)

| Router | Prefijo | Funcionalidad |
|---|---|---|
| `auth.py` | `/api` | Login, me, usuarios CRUD |
| `partes.py` | `/partes` | Catálogo de partes |
| `productos.py` | `/productos` | Catálogo de productos, BOM, puntos IQC/LQC/OQC |
| `etiquetas.py` | `/etiquetas` | Cola de impresión, generar PDFs |
| `produccion.py` | `/produccion` | Registros, anomalías, paros, salud máquinas, proyección, turnos, WebSocket |
| `secado.py` | `/secado` | Registros de secado, escaneo, Excel |
| `plan.py` | `/plan` | Planes de producción |
| `inventario.py` | `/inventario` | Inventario planta |
| `importar.py` | `/importar` | Importar datos Excel |
| `admin.py` | `/admin` | Dashboard admin, usuarios, logs, limpieza DB |
| `finanzas.py` | `/finanzas` | OC, OV, devoluciones, plan ventas, proveedores, dashboard |
| `calidad.py` | `/calidad` | Inspecciones IQC/LQC/OQC, puntos inspección, scrap, PDFs |
| `almacen.py` | `/almacen` | Recepciones, ubicaciones, inventario lotes, traslados, EPS, trazabilidad |
| `logistica.py` | `/logistica` | Embarques, reportes |
| `ordenes_produccion.py` | `/ordenes-produccion` | Pre-expansión, inyección, ASSY, silos, suministros |
| `plan_inyeccion.py` | `/plan-inyeccion` | Planes de inyección, reportes |
| `reporte_manual_inyeccion.py` | `/reporte-manual-inyeccion` | Reportes manuales de inyección |
| `picking.py` | `/picking` | Órdenes de picking |
| `conteo_fisico.py` | `/conteo-fisico` | Conteos físicos de inventario |
| `alertas.py` | `/alertas` | Alertas de stock mínimo |
| `empresa.py` | `/empresa` | Datos fiscales de la empresa |

---

## Backend — Services (6)

| Service | Función |
|---|---|
| `ia_analitica.py` | Predicciones scikit-learn, detección de anomalías |
| `pdf_generator.py` | Generación de PDFs (etiquetas, reportes) |
| `contador_service.py` | Lógica de contador de carritos |
| `turno_service.py` | Gestión automática de turnos (APScheduler) |
| `calidad_pdf.py` | PDFs de inspecciones de calidad |
| `proveedor_score.py` | Scoring automático de proveedores |

---

## Frontend — Módulos y Tabs

### Producción (`/produccion`) — 16 tabs
`HomeDashboardTab`, `DashboardTab`, `ScannerTab`, `PartesTab`, `ProductosTab`, `EtiquetasTab`, `PlanTab`, `PredictionTab`, `AnomaliesTab`, `CuartoSecadoTab`, `OrdenesProduccionTab`, `PreExpansionTab`, `InyeccionTab`, `DashboardInyeccionTab`, `EnsambleTab`

### Almacén (`/almacen`) — 11 tabs
`DashboardTab`, `RecepcionesTab`, `InventarioTab`, `UbicacionesTab`, `TrasladosTab`, `EPSTab`, `TrazabilidadTab`, `ConfiguracionTab`, `ConteoFisicoTab`, `PickingTab`

### Calidad (`/calidad`) — 8 tabs
`DashboardTab`, `IQCTab`, `LQCTab`, `OQCTab`, `DevolucionesTab`, `HistorialTab`, `ScrapTab`

### Ventas (`/ventas`) — 5 tabs
`DashboardTab`, `VentasTab`, `DevolucionesTab`, `PlanVentasTab`, `ScannerIQCTab`*

### Compras (`/compras`) — 4 tabs
`DashboardTab`, `ComprasTab`, `ProveedoresTab`, `ValidacionTab`

### Logística (`/logistica`) — 4 tabs
`DashboardTab`, `EmbarquesTab`, `ReporteEmbarquesTab`

### Admin (`/admin`) — 8 tabs
`DashboardTab`, `UsuariosTab`, `LogsTab`, `DatabaseTab`, `SistemaTab`, `EmpresaTab`, `helpers.tsx`

> *Nota: `ScannerIQCTab.tsx` está referenciado en la navegación de Ventas pero no existe físicamente en `frontend/src/app/ventas/`.

---

## Formatos de IDs

| Tipo | Formato | Ejemplo |
|---|---|---|
| OP | `[PE-\|INY-\|]NN+DDMMYY+XXXX` (XXXX = últimos 4 chars SKU) | PE-010526-ABCD |
| Lote IQC | `YYYYMMDD-XXXX-N` | 20260526-001-1 |
| Inspección | `INS-{TIPO}-{ddmmyyHHMMSS}` | INS-IQC-2605103000 |
| Scrap | `SCRAP-{ddmmyyHHMMSS}` | SCRAP-2605103000 |
| Devolución | `DVddmmyyHHMMXXXX` | DV26051030ABCD |
| OC Producción | `OC-PROD-{YYYYMMDDHHmmss}` | OC-PROD-20260526103000 |

---

## Flujos de Negocio Clave

### Pre-Expansión sin stock → Compras
1. Operador inicia lote sin stock de MP
2. Sistema auto-genera OC: `origen=PRODUCCION`, `status=Pendiente Aprobación`, proveedor="POR-ASIGNAR"
3. Compras edita proveedor/precios → Aprueba → status=Creada
4. Recepciones normales en Almacén

### ASSY con BOM faltante
1. Validar stock de TODOS los componentes
2. Si falta material → status=Pendiente Material + lista de faltantes
3. "Surtir Material" re-valida y consume FIFO → status=En Proceso

### Recepción IQC → Ubicación
1. Recepción crea lote con `estado_calidad=Pendiente`
2. Calidad inspecciona → Aprobado/Rechazado
3. Aprobado aparece en "Pendientes de Ubicar"
4. Almacenista transfiere → `MovimientoLote` tipo TRANSFERENCIA_IQC

### Embarques
1. OV en estado "Pendiente de Envío"
2. Almacén crea embarque → consume lotes FIFO → status=Surtido
3. Registrar salida (camión/chofer) → status=En Tránsito
4. Confirmar entrega → status=Entregado

### Cambio de Turno
1. Primer escaneo del nuevo turno cierra el anterior automáticamente
2. Snapshot JSON en `historial_turnos` con resumen de producción + secado

---

## pgAdmin Auto-configuración

- `pgadmin/entrypoint.sh` lee env vars y genera pgpass + servers.json al iniciar
- `SERVER_MODE=False` → sin login
- Servidor "Planta DB" pre-cargado, conecta automáticamente
- Local: `http://localhost:5050` | Producción: `http://100.111.35.87:5050`

---

## Git — Historial Reciente (top 20)

```
a91f88d feat: dark theme in production
a825489 fix: websocket 2
4c4ae10 fix: websocket
69ea286 feat: WMS implementation
c69ce75 feat: Implementacion ProveedoresTab
9dd68e3 fix: Plan produccion y cola de etiquetas
8a56b87 fix: Descripcion y Kg
e8f0934 feat: LQC functionality
c30be99 fix(backend): use turno_real variable in reporte_individual_excel
7c2c8c5 fix(alembic): shorten migration names and fix alembic_version varchar(32) truncation
64a0989 fix: Nombre alembic
141f888 feat: Boton de escaner
193cef2 fix: reemplaza passlib por bcrypt nativo, elimina incompatibilidad bcrypt 5.x
5aa7e20 fix: truncate passwords to 72 bytes for bcrypt 5.x compat
4a9b77a Merge branch 'main' of github.com:Jarsen-dev/Chwoon_System
e2c5ce8 security: limpia y actualiza dependencias frontend
06ad075 security: actualiza dependencias backend, migra a pip-tools, limpia entorno
abb83dc checkpoint: estado actual antes de actualizar dependencias backend
07d3ba4 feat: permisos_tabs por usuario - migracion 004
8196cce refactor: eliminar init_db, dejar que Alembic gestione el esquema
```