export interface Parte {
  id:                   number
  numero_parte:         string
  descripcion:          string
  linea:                string
  id_interno:           string
  cantidad_por_etiqueta: string
  cliente_lg:           string
  ayuda_visual:         string
}

export interface ColaItem {
  id?:                number
  parte_id:           number
  numero_parte:       string
  descripcion:        string
  cantidad_etiquetas: number
  turno:              'Día' | 'Noche'
  estado?:            'pendiente' | 'generado'
}

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

export interface PlanProduccion {
  numero_parte:  string
  descripcion:   string
  maquina:       string
  meta:          number
  producido:     number
  faltan:        number
  estado:        '✅ COMPLETO' | '🔄 EN PROCESO' | '⏸️ EN COLA'
}

export interface Anomalia {
  id:           number
  fecha:        string
  hora:         string
  numero_parte: string
  motivo:       string
  tipo:         'FRAUDE' | 'MANTENIMIENTO' | 'LENTITUD_PLAN'
}