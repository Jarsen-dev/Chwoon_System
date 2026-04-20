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
export type RolUsuario = 'admin' | 'supervisor' | 'operador' | 'finanzas' | 'calidad'

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
  fecha_creacion:      string
  fecha_actualizacion?: string
  notas?:              string
  creado_por?:         string
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