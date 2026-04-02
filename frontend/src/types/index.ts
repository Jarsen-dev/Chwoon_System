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