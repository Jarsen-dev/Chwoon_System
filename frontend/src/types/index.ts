// ==========================================
// INVENTARIO PLANTA
// ==========================================
export interface InventarioItem {
  codigo:        string
  descripcion:   string
  linea:         string
  tipo:          string
  qtu:           number
  linea_lg:      string
  ayuda_visual?: string
}

// ==========================================
// PRODUCTOS
// ==========================================
export interface BomItem {
  sku_componente: string
  cantidad:       number
  descripcion?:   string
  unidad?:        string // 'pza' | 'm' | '' (legado: se infiere de la cantidad)
}

export interface CaracteristicasInyeccion {
  id_proceso?:  string
  tipo_resina?: string
  resina?:      string
  densidad?:    string | number
  peso_spec?:   number
  peso_seco?:   number
  cav?:         number
  ciclo?:       number
}

export interface CaracteristicasResina {
  tipo_resina?: string
  grado?:       string
  marca?:       string
  cantidad?:    number
}

export interface ProductoItem {
  id:                        number
  sku:                       string
  tipo:                      string
  clase_producto:            string
  unidad_de_medida:          string
  descripcion:               string
  cantidad_carrito:          number
  proveedor:                 string
  cliente:                   string
  cliente_id:                string
  modelo:                    string
  linea_produccion:          string
  ubicacion:                 string
  status:                    string
  controles_calidad:         string[]
  puntos_inspeccion_iqc:     Record<string, any>[]
  puntos_inspeccion_lqc:     Record<string, any>[]
  puntos_inspeccion_oqc:     Record<string, any>[]
  bom:                       BomItem[]
  caracteristicas_inyeccion: CaracteristicasInyeccion
  caracteristicas_resina:    CaracteristicasResina
}

// Versión ligera para listados paginados (sin BOM, puntos de inspección ni características)
export interface ProductoListItem {
  id:                number
  sku:               string
  tipo:              string
  clase_producto:    string
  unidad_de_medida:  string
  descripcion:       string
  cantidad_carrito:  number
  proveedor:         string
  cliente:           string
  cliente_id:        string
  modelo:            string
  linea_produccion:  string
  ubicacion:         string
  status:            string
  controles_calidad: string[]
  bom_count:         number
}

export interface ProductoPage {
  items:  ProductoListItem[]
  total:  number
  limit:  number
  offset: number
}

export interface AyudaVisual {
  id:              number
  sku:             string
  nombre_archivo:  string
  codigo_av:       string
  ruta:            string
  tiene_thumbnail: boolean
}

export interface ReindexAyudasResumen {
  total_archivos:        number
  indexados:             number
  nuevos:                number
  actualizados:          number
  eliminados:            number
  thumbnails_generados:  number
  sin_producto:          string[]
  errores:               string[]
}

export interface ProductoCreate {
  sku:                        string
  tipo?:                      string
  clase_producto?:            string
  unidad_de_medida?:          string
  descripcion?:               string
  cantidad_carrito?:          number
  proveedor?:                 string
  cliente?:                   string
  cliente_id?:                string
  modelo?:                    string
  linea_produccion?:          string
  ubicacion?:                 string
  caracteristicas_inyeccion?: CaracteristicasInyeccion
  caracteristicas_resina?:    CaracteristicasResina
}

export interface ProductoUpdate {
  tipo?:                      string
  clase_producto?:            string
  unidad_de_medida?:          string
  descripcion?:               string
  cantidad_carrito?:          number
  proveedor?:                 string
  cliente?:                   string
  cliente_id?:                string
  modelo?:                    string
  linea_produccion?:          string
  ubicacion?:                 string
  status?:                    string
  controles_calidad?:         string[]
  puntos_inspeccion_iqc?:     Record<string, any>[]
  puntos_inspeccion_lqc?:     Record<string, any>[]
  puntos_inspeccion_oqc?:     Record<string, any>[]
  bom?:                       BomItem[]
  caracteristicas_inyeccion?: CaracteristicasInyeccion
  caracteristicas_resina?:    CaracteristicasResina
}

// ==========================================
// COLA DE IMPRESIÓN
// ==========================================
export interface ColaItemCreate {
  codigo_inventario:  string
  cantidad_etiquetas: number
  turno:              string
}

export interface ColaItem {
  id?:                number
  codigo_inventario:  string
  numero_parte:       string
  descripcion:        string
  cantidad_etiquetas: number
  turno:              string
  estado?:            string
  user?:              string | null
}

// ==========================================
// PLAN - lo que guarda la BD
// ==========================================
export interface PlanItem {
  id?:            number
  numero_parte:   string
  meta_piezas:    number
  turno_objetivo: string
  proceso?:       string
  maquina?:       string
  created_at?:    string
}

// ==========================================
// PLAN PRODUCCIÓN - lo que muestra el dashboard
// ==========================================
export interface PlanProduccion {
  numero_parte: string
  descripcion:  string
  maquina:      string
  meta:         number
  producido:    number
  faltan:       number
  estado:       '✅ COMPLETO' | '🔄 EN PROCESO' | '⏸️ EN COLA'
}

// ==========================================
// REGISTRO PRODUCCIÓN
// ==========================================
export interface RegistroProduccion {
  id:              number
  fecha:           string
  hora:            string
  turno:           string
  maquina:         string
  numero_parte:    string
  descripcion:     string
  carrito_numero:  number
  qty_bolsa:       number
  total_acumulado: number
  usuario?:        string | null
}

// ==========================================
// ANOMALÍA
// ==========================================
export interface Anomalia {
  id:           number
  fecha:        string
  hora:         string
  numero_parte: string
  motivo:       string
  tipo:         'FRAUDE' | 'MANTENIMIENTO' | 'LENTITUD_PLAN'
}

// ==========================================
// REGISTRO PARO
// ==========================================
export interface RegistroParo {
  id?:               number
  fecha:             string
  hora_inicio:       string
  hora_fin?:         string
  duracion_minutos?: number
  maquina:           string
  motivo:            string
  turno:             string
  created_at?:       string
}

// ==========================================
// AUTH
// ==========================================
export type RolUsuario = 'admin' | 'supervisor' | 'operador' | 'finanzas' | 'compras' | 'ventas' | 'calidad' | 'almacen' | 'logistica'

export interface LoginRequest {
  username: string
  password: string
}

export interface Token {
  access_token: string
  token_type:   string
  rol:          RolUsuario
  username:     string
}

export interface Usuario {
  id:            number
  username:      string
  nombre?:       string | null
  email:         string
  rol:           RolUsuario
  activo:        boolean
  created_at:    string
  permisos_tabs?: Record<string, string[]> | null  // ← NUEVO
}

export interface UsuarioCreate {
  username:      string
  nombre?:       string
  email:         string
  password:      string
  rol:           RolUsuario
  permisos_tabs?: Record<string, string[]> | null  // ← NUEVO
}

export interface UsuarioUpdate {
  nombre?:       string
  email?:        string
  rol?:          RolUsuario
  activo?:       boolean
  password?:     string
  permisos_tabs?: Record<string, string[]> | null  // ← NUEVO
}

// ← NUEVO: mapa completo de módulo → tabs disponibles por rol
export const TABS_POR_MODULO: Record<string, { id: string; label: string }[]> = {
  produccion: [
    { id: 'home',          label: '🏠 Inicio'         },
    { id: 'captura',       label: '📷 Captura'         },
    { id: 'dashboard',     label: '📊 Dashboard'       },
    { id: 'ordenes',       label: '📋 Órdenes Prod.'   },
    { id: 'pre_expansion', label: '🔥 Pre-Expansión'   },
    { id: 'inyeccion',     label: '💉 Inyección'       },
    { id: 'ensamble',      label: '🔧 Ensamble'        },
    { id: 'productos',     label: '📦 Productos'       },
    { id: 'etiquetas',     label: '🖨️ Etiquetas'       },
    { id: 'plan',          label: '📋 Plan Prod.'      },
    { id: 'prediccion',    label: '🤖 Predicción IA'   },
    { id: 'anomalias',     label: '🚨 Anomalías'       },
  ],
  calidad: [
    { id: 'dashboard',    label: '📊 Dashboard'   },
    { id: 'iqc',          label: '🔍 IQC'         },
    { id: 'lqc',          label: '🏭 LQC'         },
    { id: 'oqc',          label: '📦 OQC'         },
    { id: 'devoluciones', label: '🔄 Devoluciones' },
    { id: 'historial',    label: '📋 Historial'   },
    { id: 'scrap',        label: '🗑️ Scrap'        },
  ],
  almacen: [
    { id: 'dashboard',    label: '📊 Dashboard'   },
    { id: 'recepciones',  label: '📥 Recepciones' },
    { id: 'inventario',   label: '📦 Inventario'  },
    { id: 'ubicaciones',  label: '📍 Ubicaciones' },
    { id: 'traslados',    label: '🔄 Traslados'   },
    { id: 'eps',          label: '🏭 Almacén EPS' },
    { id: 'trazabilidad', label: '🔍 Trazabilidad'},
    { id: 'picking',      label: '🛒 Picking'     },
    { id: 'conteo',       label: '📋 Conteo Físico'},
    { id: 'configuracion',label: '⚙️ Configuración'},
  ],
  logistica: [
    { id: 'dashboard', label: '📊 Dashboard' },
    { id: 'embarques', label: '🚛 Embarques'  },
    { id: 'reporte',   label: '📈 Reporte'    },
  ],
  compras: [
    { id: 'dashboard', label: '📊 Dashboard' },
    { id: 'compras',   label: '🛒 Compras'   },
    { id: 'proveedores', label: '🤝 Proveedores' },
    { id: 'validacion',  label: '⚖️ Validación'  },
  ],
  ventas: [
    { id: 'dashboard',   label: '📊 Dashboard'   },
    { id: 'ventas',      label: '💵 Ventas'       },
    { id: 'devoluciones',label: '🔄 Devoluciones' },
    { id: 'plan_ventas', label: '📅 Plan Ventas'  },
    { id: 'scanner_iqc', label: '🔍 Scanner IQC'  },
  ],
  maquinas: [
    { id: 'eps', label: '🔧 Máquinas EPS' },
  ],
}

// Módulos que le corresponden a cada rol
export const MODULOS_POR_ROL: Record<string, string[]> = {
  admin:      ['produccion', 'calidad', 'almacen', 'logistica', 'compras', 'ventas', 'maquinas'],
  supervisor: ['produccion', 'maquinas'],
  operador:   ['produccion', 'maquinas'],
  calidad:    ['calidad'],
  almacen:    ['almacen'],
  logistica:  ['logistica'],
  compras:    ['compras'],
  ventas:     ['ventas'],
  finanzas:   ['compras', 'ventas'],
}

// ==========================================
// FINANZAS — Órdenes de Compra
// ==========================================
export interface OrdenCompraItem {
  id?:                number
  sku_producto:       string
  nombre_producto:    string
  cantidad_requerida: number
  cantidad_recibida:  number
  precio_unitario:    number
  moneda:             string
}

export interface RecepcionCompra {
  id:                number
  recepcion_id:      string
  oc_id:             string
  sku_producto:      string
  cantidad_recibida: number
  fecha_recepcion:   string
  recibido_por?:     string
  notas?:            string
}

export interface OrdenCompra {
  id:                  number
  oc_id:               string
  id_proveedor:        string
  nombre_proveedor:    string
  status:              string
  origen?:             string
  fecha_creacion:      string
  fecha_actualizacion?: string
  notas?:              string
  creado_por?:         string
  aprobado_por?:       string
  items:               OrdenCompraItem[]
  recepciones?:        RecepcionCompra[]
  motivo_rechazo?:     string
  iva?:               number
  firma_compras?:     string
  fecha_firma_compras?: string
  firma_finanzas?:     string
  fecha_firma_finanzas?: string
}

export interface ProveedorMaterialItem {
  id: number
  proveedor_id: number
  sku_material: string
  codigo_proveedor?: string
  costo_unitario: number
  moneda: string
}
 
export interface ProveedorItem {
  id: number
  uuid: string
  razon_social: string
  rfc: string
  lead_time_dias: number
  condiciones_pago?: string
  dias_credito?: number
  estatus_calidad: string
  direccion?: string
  nombre_contacto?: string
  numero_contacto?: string
  correo_contacto?: string
  notas?: string
  score_calidad?: number
  score_detalle?: Record<string, any>
  score_updated_at?: string
  fecha_creacion: string
  materiales: ProveedorMaterialItem[]
}

// ==========================================
// FINANZAS — Órdenes de Venta
// ==========================================
export interface OrdenVentaItem {
  id?:              number
  sku_producto:     string
  nombre_producto?: string
  cantidad:         number
  cantidad_enviada: number
  precio_unitario:  number
  moneda:           string
}

export interface EnvioVenta {
  id:              number
  envio_id:        string
  ov_id:           string
  fecha_envio:     string
  autorizado_por?: string
  items_enviados:  { sku_producto: string; cantidad: number }[]
  notas?:          string
  no_camion?:      string
  chofer?:         string
  status_salida?:  string
  no_departure?:   string
  cw_invoice?:     string
}

export interface OrdenVenta {
  id:                  number
  ov_id:               string
  cliente_id:          string
  nombre_cliente?:     string
  estado:              string
  fecha_creacion:      string
  fecha_actualizacion?: string
  notas?:              string
  creado_por?:         string
  total_items:         number
  valor_total:         number
  items:               OrdenVentaItem[]
  envios?:             EnvioVenta[]
}

// ==========================================
// FINANZAS — Devoluciones
// ==========================================
export interface Devolucion {
  id:                     number
  devolucion_id:          string
  ov_id:                  string
  sku_producto:           string
  nombre_producto?:       string
  cantidad_devuelta:      number
  motivo:                 string
  lote_produccion_origen?: string
  fecha_devolucion:       string
  estado_inspeccion:      string
  disposicion_final?:     string
  cantidad_scrap:         number
  cantidad_retrabajo:     number
  procesado_por?:         string
  creado_por?:            string
}

// ==========================================
// FINANZAS — Plan de Ventas
// ==========================================

export interface PlanVentasDia {
  plan:          number
  status:        'Pendiente' | 'Autorizado' | string
  ov_generada?:  string | null
}

// Días que el backend puede devolver (depende de cuántos días tenga la semana
// importada — no todos los planes tienen sábado)
export type DiaSemana = 'LUNES' | 'MARTES' | 'MIERCOLES' | 'JUEVES' | 'VIERNES' | 'SABADO'

export interface PlanVentasItem {
  sku:           string
  descripcion?:  string
  linea?:        string        // R1 / R2 / R3 / SVC

  // ── Campos nuevos del CW PLAN ──────────────────────────────────────────
  cw_line?:      string | null  // L2 / L3 / L5 / L6  (línea de producción CW)
  model?:        string | null  // QUANTUM-T / MAJESTY / RAPTOR 2 / etc.
  id1?:          string | null  // agrupación funcional: Control Box / Duct Multi / etc.

  // ── Stock ───────────────────────────────────────────────────────────────
  stock_actual?: number         // INV. CW — inventario en planta Cheong Woon
  stock_lg?:     number         // INV. LG — inventario en planta LG (NUEVO)

  // ── Plan por día ────────────────────────────────────────────────────────
  dias: Partial<Record<DiaSemana, PlanVentasDia>>
}

export interface PlanVentasSemana {
  id:                   number
  identificador_semana: string       // formato YYYY-WW
  fecha_inicio_semana:  string       // ISO date del lunes
  fecha_importacion:    string
  items:                PlanVentasItem[]
  importado_por?:       string
  total_skus?:          number
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: calcula la DIF acumulada hasta un día dado
//
// La DIF NO se almacena en DB — se calcula en frontend para siempre estar fresca.
//
// Lógica del CW PLAN:
//   DIF_dia = stock_lg - sum(plan de este día + días anteriores de la semana)
//
// Si DIF es negativa → el plan supera el stock que tiene LG → alerta roja.
// ─────────────────────────────────────────────────────────────────────────────
const ORDEN_DIAS: DiaSemana[] = ['VIERNES', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES']

export function calcularDIF(item: PlanVentasItem, hastaElDia: DiaSemana): number {
  const stockLG = item.stock_lg ?? 0
  let acumulado = 0

  for (const dia of ORDEN_DIAS) {
    const planDia = item.dias[dia]?.plan ?? 0
    acumulado += planDia
    if (dia === hastaElDia) break
  }

  return stockLG - acumulado
}

// Retorna el color de badge para una DIF dada
export function colorDIF(dif: number): 'green' | 'yellow' | 'red' {
  if (dif > 0)  return 'green'
  if (dif === 0) return 'yellow'
  return 'red'
}

// ==========================================
// FINANZAS — Dashboard
// ==========================================
export interface FinanzasDashboard {
  // Órdenes de compra
  total_oc:                number
  oc_pendientes:           number
  oc_completadas:          number

  // Órdenes de venta
  total_ov:                number
  ov_pendientes:           number
  ov_en_preparacion:       number
  ov_lista_para_carga:     number
  ov_enviadas:             number
  ov_stock_insuficiente:   number

  // Devoluciones y plan
  total_devoluciones:      number
  devoluciones_pendientes: number
  planes_venta_activos:    number

  // Financiero
  valor_compras_mes:       number
  valor_ventas_mes:        number

  // KPIs operativos del día
  programado_hoy:          number
  embarcado_hoy:           number
  pct_cumplimiento:        number
  skus_dif_negativa:       number

  // PSI Coverage (fracción 0.0–2.0)
  coverage_ref_dday:       number
  coverage_ref_d1:         number
  coverage_oven_dday:      number
  coverage_oven_d1:        number
}

export interface DemandaGapItem {
  sku: string
  descripcion?: string
  demanda: number
  stock_pt_aprobado: number
  brecha: number
  status: 'OK' | 'FALTANTE'
}

// ==========================================
// CLIENTES
// ==========================================
export interface Cliente {
  id: number
  cliente_id: string
  razon_social: string
  rfc?: string
  contacto_nombre?: string
  contacto_email?: string
  contacto_telefono?: string
  direccion?: string
  condiciones_pago?: string
  dias_credito?: number
  estatus: string
  notas?: string
  score_cliente: number
  fecha_creacion: string
}

export interface ClienteEvento {
  id: number
  cliente_id_fk: number
  tipo_evento: string
  impacto: number
  referencia_id?: string
  descripcion?: string
  fecha: string
  registrado_por?: string
}

// Semáforo PSI: fracción → color tailwind
export function semaforoCoverage(v: number): 'green' | 'yellow' | 'red' {
  if (v >= 1.0)  return 'green'
  if (v >= 0.5)  return 'yellow'
  return 'red'
}

export function colorClasesSemaforo(v: number): string {
  const s = semaforoCoverage(v)
  if (s === 'green')  return 'text-green-400 border-green-500/30 bg-green-500/10'
  if (s === 'yellow') return 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10'
  return 'text-red-400 border-red-500/30 bg-red-500/10'
}

// ==========================================
// CALIDAD — Inspecciones
// ==========================================
export interface PuntoResultado {
  punto: string
  especificacion?: string
  resultado: string  // "Conforme" | "No Conforme"
}

export interface InspeccionCalidad {
  id: number
  inspeccion_id: string
  lote_id?: string
  sku_producto?: string
  nombre_producto?: string
  tipo_inspeccion: string
  fecha?: string
  inspector: string
  resultado_final: string
  resultados_puntos: PuntoResultado[]
  oc_origen?: string
  op_origen?: string
  cantidad_inspeccionada: number
  notas?: string
  created_at?: string
}

// ==========================================
// CALIDAD — Scrap
// ==========================================
export interface RegistroScrapItem {
  id: number
  scrap_id: string
  fecha?: string
  sku_producto: string
  nombre_producto?: string
  lote_id?: string
  cantidad: number
  motivo?: string
  origen: string
  referencia?: string
  registrado_por?: string
}

// ==========================================
// CALIDAD — Dashboard
// ==========================================
export interface CalidadDashboard {
  total_inspecciones: number
  inspecciones_hoy: number
  iqc_total: number
  iqc_aprobadas: number
  iqc_rechazadas: number
  lqc_total: number
  lqc_aprobadas: number
  lqc_rechazadas: number
  oqc_total: number
  oqc_aprobadas: number
  oqc_rechazadas: number
  dev_total: number
  scrap_hoy: number
  scrap_mes: number
  tasa_aprobacion: number
}

// ==========================================
// CALIDAD — Puntos de inspección (desde producto)
// ==========================================
export interface ProductoPuntosInspeccion {
  sku: string
  nombre: string
  tipo: string
  controles_calidad: string[]
  puntos_inspeccion_iqc: Record<string, any>[]
  puntos_inspeccion_lqc: Record<string, any>[]
  puntos_inspeccion_oqc: Record<string, any>[]
}

// ==========================================
// ALMACÉN — Ubicaciones
// ==========================================
export interface UbicacionAlmacen {
  id: number
  nombre: string
  parent_id?: number | null
  tipo_zona: string
  capacidad_max?: number | null
  permite_mixing: boolean
  activa: boolean
}

// ==========================================
// ALMACÉN — Lotes de Inventario
// ==========================================
export interface LoteInventario {
  id: number
  lote_id: string
  sku_producto: string
  cantidad_actual: number
  cantidad_inicial: number
  ubicacion_id?: number | null
  nombre_ubicacion?: string
  nombre_producto?: string
  tipo_producto?: string
  clase_producto?: string
  fecha_recepcion?: string
  oc_origen?: string
  op_origen?: string
  ov_origen?: string
  estado_calidad: string
  carrito_id?: string
  lote_produccion_origen?: string
  motivo_devolucion?: string
  bloqueado_por?: string
  numero_remision?: string
  fecha_caducidad?: string
  lote_proveedor?: string
  bultos: number
}

// ==========================================
// ALMACÉN — Movimientos de Lote
// ==========================================
export interface MovimientoLote {
  id: number
  lote_id: string
  fecha?: string
  tipo: string
  cantidad: number
  detalles: Record<string, any>
}

// ==========================================
// ALMACÉN — Inventario Consolidado
// ==========================================
export interface InventarioConsolidado {
  sku: string
  nombre?: string
  tipo?: string
  clase_producto?: string
  stock_total: number
  stock_por_ubicacion_agregado: Record<string, number>
  stock_por_ubicacion_detalle: Record<string, number>
  en_compra: number
  en_produccion: number
}

// ==========================================
// ALMACÉN — Embarques
// ==========================================
export interface EmbarqueItem {
  lote_id: string
  sku: string
  cantidad: number
}

export interface EmbarqueAlmacen {
  id: number
  numero_embarque: string
  ov_id: string
  cliente_id?: string
  fecha_creacion?: string
  status: string
  items: EmbarqueItem[]
  camion?: string
  chofer?: string
  departure?: string
  sku?: string
  nombre_producto?: string
  creado_por?: string
}

// ==========================================
// ALMACÉN — Traslados a Producción
// ==========================================
export interface TrasladoProduccionItem {
  sku_componente: string
  cantidad_requerida: number
  cantidad_movida: number
}

export interface TrasladoProduccion {
  id: number
  id_traslado: string
  op_id_origen: string
  linea_produccion_destino?: string
  fecha_creacion?: string
  status: string
  items: TrasladoProduccionItem[]
  historial: any[]
  creado_por?: string
}

// ==========================================
// ALMACÉN — Reporte Embarques
// ==========================================
export interface ReporteEmbarqueItem {
  item_id: string
  sku: string
  cantidad_solicitada: number
  cantidad_enviada: number
  diferencia: number
  porcentaje_en_transito: string
  total_embarcado_dia: number
  embarques_por_hora: Record<string, number>
}

// ==========================================
// ALMACÉN — Dashboard
// ==========================================
export interface StockPorZona {
  lotes: number
  kg: number
}

export interface AlmacenDashboard {
  total_lotes_activos: number
  lotes_sin_ubicacion: number
  lotes_cuarentena: number
  lotes_pendiente_iqc: number
  valor_stock_estimado: number
  lote_mas_antiguo_dias: number
  lotes_sin_movimiento_30d: number
  rotacion_promedio_dias: number
  recepciones_hoy: number
  picking_pendientes: number
  picking_completados_hoy: number
  traslados_pendientes: number
  alertas_stock_minimo: any[]
  alertas_lotes_bloqueados: any[]
  stock_por_zona: Record<string, StockPorZona>
}

// ==========================================
// ALMACÉN — Trazabilidad
// ==========================================
export interface TrazabilidadLote {
  info_lote?: Record<string, any>
  movimientos?: Record<string, any>[]
  origen?: Record<string, any>
  error?: string
}

// ==========================================
// ALMACÉN — Recepciones de Compra
// ==========================================
export interface OrdenCompraAlmacenItem {
  id?:                number
  sku_producto:       string
  nombre_producto:    string
  cantidad_requerida: number
  cantidad_recibida:  number
}

export interface RecepcionAlmacen {
  id:                number
  recepcion_id:      string
  sku_producto:      string
  cantidad_recibida: number
  fecha_recepcion:   string
  recibido_por?:     string
  notas?:            string
}

export interface OrdenCompraAlmacen {
  id:                   number
  oc_id:                string
  id_proveedor:         string
  nombre_proveedor:     string
  status:               string
  origen?:              string
  fecha_creacion:       string
  fecha_actualizacion?: string
  notas?:               string
  creado_por?:          string
  aprobado_por?:        string
  items:                OrdenCompraAlmacenItem[]
  recepciones?:         RecepcionAlmacen[]
}

// ==========================================
// ÓRDENES DE PRODUCCIÓN
// ==========================================
export interface OrdenProduccion {
  id: number
  op_id: string
  clase_produccion: string  // PRE-EXPANSION | INYECCION | ASSY
  sku_producto: string
  nombre_producto: string
  linea_produccion?: string
  cantidad_a_producir: number
  cantidad_producida: number
  cantidad_carrito: number
  operador?: string
  status: string
  fecha_inicio?: string
  fecha_fin?: string

  // Pre-Expansión
  sku_materia_prima?: string
  cantidad_usada_requerida: number
  cantidad_total_consumida: number
  ubicacion_destino?: string
  lote_inventario_generado?: string
  grado?: string
  numero_costal?: string
  hora_inicio_real?: string
  densidad?: number
  pantalla_peso?: number
  ciclo_seg?: number
  counter_tiro?: number
  hora_finalizacion?: string
  silo_destino?: string

  // Inyección
  uph_esperado: number
  metodo_conteo?: string

  // JSON
  registros_parciales: any[]
  material_consumido: any[]
  paros: ParoProduccion[]
  etiquetas_generadas: any[]
  scrap_reportado: any[]
  componentes_consumidos: Record<string, any>

  creado_por?: string
}

export interface ParoProduccion {
  id: string
  motivo: string
  inicio: string
  fin?: string
  duracion_segundos: number
  status: string  // Activo | Finalizado
}

export interface OrdenUnificada {
  id: string
  tipo: string
  sku: string
  nombre: string
  progreso: string
  status: string
  fecha?: string
  linea?: string
  operador?: string
}

// ══════════════════════════════════════════════════════════════
// PRE-EXPANSIÓN — Nuevos tipos
// ══════════════════════════════════════════════════════════════

export interface SuministroSilo {
  id: number
  suministro_id: string
  silo_origen: string
  silo_origen_op_id?: string
  aux_destino: string
  sku_resina?: string
  nombre_resina?: string
  grado?: string
  densidad: number
  kg_suministrados: number
  kg_restantes: number
  tiempo_reposo_horas: number
  maquinas_inyeccion: string[]
  fecha_suministro?: string
  creado_por?: string
}

export interface EstadoSilo {
  nombre_silo: string
  es_aux: boolean
  vacio: boolean
  sku_resina?: string
  nombre_resina?: string
  grado?: string
  densidad?: number
  kg_totales: number
  fecha_entrada?: string
  hora_finalizacion_lote?: string
  op_id_origen?: string
  tiempo_reposo_segundos: number
  tiempo_reposo_horas: number
  suministro?: SuministroSilo
  silo_fuente?: string
}

// ==========================================
// LOGÍSTICA — Dashboard
// ==========================================
export interface LogisticaDashboard {
  total_embarques: number
  embarques_surtidos: number
  embarques_en_transito: number
  embarques_entregados: number
  embarques_hoy: number
  entregas_hoy: number
}

// ==========================================
// REPORTE MANUAL INYECCIÓN
// ==========================================
export interface ReporteManualInyeccion {
  id: number
  fecha: string
  turno: string
  numero_parte: string
  descripcion: string
  cliente: string
  resina: string
  proceso: string
  peso: number
  cav_bom: number
  ciclo: number
  type: string
  maquina: string
  cav_real: number
  ciclo_real: number
  tiempo_trabajo: number
  produccion_total: number
  // paros
  cambio_molde: number
  ajustes: number
  arranque_paro: number
  mantenimiento: number
  molde_danado: number
  falta_personal: number
  falta_material: number
  otro_paro: number
  soldar_puerta_ejector: number
  estopero: number
  bomba_hidraulica: number
  motor_hidraulico: number
  manguera_hidraulica: number
  valvula_hidraulica: number
  reloj: number
  caldera: number
  sensor_seguridad: number
  falta_aire: number
  fuga_aceite: number
  electrico: number
  tolva_tapada: number
  extra: number
  // scrap
  scrap_falta_llenado: number
  scrap_cruda: number
  scrap_quebrada: number
  scrap_hinchada: number
  scrap_arranque: number
  scrap_fuera_dimension: number
  scrap_pandeada: number
  scrap_aplastada_molde: number
  // calculados
  scrap_total: number
  scrap_kg: number
  tiempo_paro_total: number
  cm: number
  produccion_buena: number
  produccion_kg: number
  produccion_meta_total: number
  produccion_meta_kg: number
  produccion_porcentaje: number
  scrap_porcentaje: number
}
// ==========================================
// MÁQUINAS EPS — Integración PLC/HMI
// ==========================================
export interface MaquinaEstado {
  id:                    number
  codigo:                string
  nombre:                string
  linea?:                string | null
  tipo?:                 string | null
  marca_plc?:            string | null
  ip_hmi?:               string | null
  umbral_incidencia_seg: number
  activa:                boolean
  counter?:              number | null
  process_no?:           number | null
  meta_h?:               number | null
  estado_actual?:        string | null   // AUTO | MANUAL | DESCONOCIDO
  incidencias_activas:   string[]
  piezas_turno:          number
  ultima_actualizacion?: string | null
}

export interface MaquinaEvento {
  id:           number
  maquina_id:   number
  tipo_evento:  string   // PIEZA | INCIDENCIA_INICIO | INCIDENCIA_FIN | CAMBIO_ESTADO
  valor?:       number | null
  estado?:      string | null
  operador?:    string | null
  turno?:       string | null
  fecha_turno?: string | null
  metadata?:    Record<string, any>
  created_at?:  string | null
}

export interface MaquinaCreate {
  codigo:                 string
  nombre:                 string
  linea?:                 string
  tipo?:                  string
  marca_plc?:             string
  ip_hmi?:                string
  umbral_incidencia_seg?: number
}

export interface MaquinaUpdate {
  nombre?:                string
  linea?:                 string
  tipo?:                  string
  marca_plc?:             string
  ip_hmi?:                string
  umbral_incidencia_seg?: number
  activa?:                boolean
}
