import { RolUsuario } from '@/types'

// ── Constantes ──────────────────────────────────────────────────────
export const ROLES: RolUsuario[] = [
  'admin', 'supervisor', 'operador',
  'finanzas', 'compras', 'ventas',
  'calidad', 'almacen', 'logistica',
]

export const ROL_BADGE: Record<RolUsuario, string> = {
  admin:      'bg-red-900/50    text-red-300    border border-red-700',
  supervisor: 'bg-blue-900/50   text-blue-300   border border-blue-700',
  operador:   'bg-green-900/50  text-green-300  border border-green-700',
  finanzas:   'bg-emerald-900/50 text-emerald-300 border border-emerald-700',
  compras:    'bg-lime-900/50   text-lime-300   border border-lime-700',
  ventas:     'bg-violet-900/50 text-violet-300 border border-violet-700',
  calidad:    'bg-cyan-900/50   text-cyan-300   border border-cyan-700',
  almacen:    'bg-orange-900/50 text-orange-300 border border-orange-700',
  logistica:  'bg-teal-900/50   text-teal-300   border border-teal-700',
}

export const ROL_ICON: Record<string, string> = {
  admin:      '👑',
  supervisor: '🔵',
  operador:   '🟢',
  finanzas:   '💰',
  compras:    '🛒',
  ventas:     '💵',
  calidad:    '🔬',
  almacen:    '📦',
  logistica:  '🚛',
}

export const TABS = [
  { id: 'dashboard', label: '📊 Dashboard'     },
  { id: 'usuarios',  label: '👥 Usuarios'      },
  { id: 'logs',      label: '📋 Logs'          },
  { id: 'database',  label: '🗃️ Base de Datos' },
  { id: 'sistema',   label: '🖥️ Sistema'       },
  { id: 'empresa',   label: '🏢 Empresa'       },   // ← NUEVO
]

// ── Tipos compartidos ───────────────────────────────────────────────
export interface DashboardStats {
  turno_actual: string
  fecha_turno:  string
  usuarios:     { total: number; activos: number }
  partes:       { total: number }
  plan:         { total: number; pendiente: number; en_proceso: number }
  cola:         { pendiente: number; generado: number }
  produccion:   { escaneos_turno: number; piezas_turno: number }
  secado:       { dentro: number; salidos: number }
  anomalias:    { recientes_7d: number }
}

export interface LogEntry {
  fecha: string; hora: string; usuario: string
  accion: string; detalle: string; modulo: string; created_at: string
}

export interface TablaInfo {
  nombre: string; registros: number; tamano: string
}

export interface SystemStatus {
  db_size: string; total_registros: number; total_tablas: number
  tablas: TablaInfo[]; uptime: string; pg_version: string; hora_servidor: string
}

// ── Tipos empresa ────────────────────────────────────────────────────
export interface ConfiguracionEmpresa {
  id?:                 number
  nombre:              string
  rfc?:                string
  direccion?:          string
  telefono?:           string
  email?:              string
  logo_url?:           string
  representante_legal?: string
  regimen_fiscal?:     string
  cp?:                 string
  ciudad?:             string
  estado?:             string
  pais?:               string
  banco?:              string
  cuenta?:             string
  clabe?:              string
  created_at?:         string
  updated_at?:         string
}

export interface ContactoEmpresa {
  id?:          number
  area:         string
  nombre:       string
  puesto?:      string
  telefono?:    string
  ext?:         string
  celular?:     string
  email?:       string
  es_principal: boolean
  horario?:     string
  notas?:       string
  activo:       boolean
  created_at?:  string
  updated_at?:  string
}

// ── Helpers ─────────────────────────────────────────────────────────
export function getTablaIcon(nombre: string): string {
  const map: Record<string, string> = {
    usuarios: '👥', inventario_planta: '📦', partes: '⚙️',
    planes_produccion: '📋', registros_produccion: '📷',
    registros_secado: '🌡️', cola_impresion: '🖨️',
    contador_carritos: '🔢', anomalias: '⚠️',
    registros_paros: '🛑', historial_turnos: '📊',
    ordenes_compra: '🛒', ordenes_compra_items: '📦',
    recepciones_compra: '📥', ordenes_venta: '💵',
    ordenes_venta_items: '🏷️', envios_venta: '🚚',
    devoluciones: '🔄', planes_venta: '📅',
    inspecciones: '🔬', registros_scrap: '🗑️',
    plan_inyeccion: '🏭',
    configuracion_empresa: '🏢', contactos_empresa: '📇',
  }
  return map[nombre] || '📄'
}

// ── Componentes compartidos ─────────────────────────────────────────
export function StatCard({ icon, value, label, badge, badgeColor = 'gray', borderColor = 'border-gray-700', valueColor = 'text-white' }: {
  icon: string; value: string | number; label: string
  badge?: string; badgeColor?: string; borderColor?: string; valueColor?: string
}) {
  const badgeColors: Record<string, string> = {
    gray:    'text-gray-400 bg-gray-700',
    yellow:  'text-yellow-400 bg-yellow-900/30',
    purple:  'text-purple-400 bg-purple-900/30',
    blue:    'text-blue-400 bg-blue-900/30',
    emerald: 'text-emerald-400 bg-emerald-900/30',
    orange:  'text-orange-400 bg-orange-900/30',
    red:     'text-red-400 bg-red-900/30',
    cyan:    'text-cyan-400 bg-cyan-900/30',
  }

  return (
    <div className={`bg-gray-900 rounded-xl border ${borderColor} p-5 flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        {badge && (
          <span className={`text-xs font-medium px-2 py-1 rounded-full ${badgeColors[badgeColor] || badgeColors.gray}`}>
            {badge}
          </span>
        )}
      </div>
      <p className={`text-3xl font-bold ${valueColor}`}>{value}</p>
      <p className="text-sm text-gray-400">{label}</p>
    </div>
  )
}

export function DbActionCard({ icon, title, description, count, buttonLabel, buttonColor, loading, onClick, danger = false }: {
  icon: string; title: string; description: string
  count?: number; buttonLabel: string; buttonColor: string
  loading: boolean; onClick: () => void; danger?: boolean
}) {
  return (
    <div className={`bg-gray-900 rounded-xl border p-5 ${danger ? 'border-red-800/50' : 'border-gray-700'}`}>
      <div className="flex items-start gap-3">
        <span className="text-2xl mt-0.5">{icon}</span>
        <div className="flex-1">
          <h3 className="font-bold text-white text-sm">{title}</h3>
          <p className="text-gray-400 text-xs mt-1">{description}</p>
          {count !== undefined && (
            <p className="text-gray-500 text-xs mt-2">
              Registros actuales: <span className="text-gray-300 font-mono font-bold">{count.toLocaleString()}</span>
            </p>
          )}
        </div>
      </div>
      <button
        onClick={onClick}
        disabled={loading}
        className={`mt-4 w-full py-2 rounded-lg text-sm font-bold text-white transition-colors flex items-center justify-center gap-2 ${
          loading ? 'bg-gray-600 cursor-not-allowed' : buttonColor
        }`}
      >
        {loading ? (
          <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Procesando...</>
        ) : buttonLabel}
      </button>
    </div>
  )
}