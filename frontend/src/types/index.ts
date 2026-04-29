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
}

export interface CaracteristicasInyeccion {
  id_proceso?:  string
  tipo_resina?: string
  resina?:      string
  densidad?:    number
  peso?:        number
  peso_seco?:   number
  cav?:         number
}

export interface ProductoItem {
  id:                        number
  sku:                       string
  nombre:                    string
  tipo:                      string
  clase_producto:            string
  unidad_de_medida:          string
  descripcion:               string
  cantidad_carrito:          number
  proveedor:                 string
  cliente_id:                string
  cliente_asociado:          string
  linea_produccion:          string
  ubicacion:                 string
  linea_lg:                  string
  status:                    string
  controles_calidad:         string[]
  puntos_inspeccion_iqc:     Record<string, any>[]
  puntos_inspeccion_lqc:     Record<string, any>[]
  puntos_inspeccion_oqc:     Record<string, any>[]
  bom:                       BomItem[]
  caracteristicas_inyeccion: CaracteristicasInyeccion
}

export interface ProductoCreate {
  sku:                        string
  nombre:                     string
  tipo?:                      string
  clase_producto?:            string
  unidad_de_medida?:          string
  descripcion?:               string
  cantidad_carrito?:          number
  proveedor?:                 string
  cliente_id?:                string
  cliente_asociado?:          string
  linea_produccion?:          string
  ubicacion?:                 string
  linea_lg?:                  string
  caracteristicas_inyeccion?: CaracteristicasInyeccion
}

export interface ProductoUpdate {
  nombre?:                    string
  tipo?:                      string
  clase_producto?:            string
  unidad_de_medida?:          string
  descripcion?:               string
  cantidad_carrito?:          number
  proveedor?:                 string
  cliente_id?:                string
  cliente_asociado?:          string
  linea_produccion?:          string
  ubicacion?:                 string
  linea_lg?:                  string
  status?:                    string
  controles_calidad?:         string[]
  puntos_inspeccion_iqc?:     Record<string, any>[]
  puntos_inspeccion_lqc?:     Record<string, any>[]
  puntos_inspeccion_oqc?:     Record<string, any>[]
  bom?:                       BomItem[]
  caracteristicas_inyeccion?: CaracteristicasInyeccion
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
export type RolUsuario = 'admin' | 'supervisor' | 'operador' | 'finanzas' | 'calidad' | 'almacen' | 'logistica'

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
  id:         number
  username:   string
  email:      string
  rol:        RolUsuario
  activo:     boolean
  created_at: string
}

export interface UsuarioCreate {
  username: string
  email:    string
  password: string
  rol:      RolUsuario
}

export interface UsuarioUpdate {
  email?:    string
  rol?:      RolUsuario
  activo?:   boolean
  password?: string
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
  status:        string
  ov_generada?:  string | null
}

export interface PlanVentasItem {
  sku:           string
  descripcion?:  string
  stock_actual?: number
  dias: {
    LUNES:     PlanVentasDia
    MARTES:    PlanVentasDia
    MIERCOLES: PlanVentasDia
    JUEVES:    PlanVentasDia
    VIERNES:   PlanVentasDia
  }
}

export interface PlanVentasSemana {
  id:                    number
  identificador_semana:  string
  fecha_inicio_semana:   string
  fecha_importacion:     string
  items:                 PlanVentasItem[]
  importado_por?:        string
  total_skus?:           number
}

// ==========================================
// FINANZAS — Dashboard
// ==========================================
export interface FinanzasDashboard {
  total_oc:                number
  oc_pendientes:           number
  oc_completadas:          number
  total_ov:                number
  ov_pendientes:           number
  ov_enviadas:             number
  ov_stock_insuficiente:   number
  total_devoluciones:      number
  devoluciones_pendientes: number
  valor_compras_mes:       number
  valor_ventas_mes:        number
  planes_venta_activos:    number
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
export interface AlmacenDashboard {
  total_lotes: number
  lotes_sin_ubicacion: number
  total_ubicaciones: number
  total_embarques: number
  embarques_surtidos: number
  embarques_en_transito: number
  embarques_entregados: number
  traslados_pendientes: number
  traslados_en_proceso: number
  traslados_completados: number
  stock_total_items: number
  lotes_eps: number
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