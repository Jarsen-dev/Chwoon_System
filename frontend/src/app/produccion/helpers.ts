import { RegistroProduccion } from '@/types'

export function getTipoBadge(tipo: string): string {
  switch (tipo) {
    case 'FRAUDE':        return 'bg-red-500/10    text-red-400    border border-red-500/30'
    case 'MANTENIMIENTO': return 'bg-orange-500/10 text-orange-400 border border-orange-500/30'
    case 'LENTITUD_PLAN': return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'
    default:              return 'bg-gray-500/10   text-gray-400   border border-gray-500/30'
  }
}

export function getTipoIcon(tipo: string): string {
  switch (tipo) {
    case 'FRAUDE':        return '🕵️'
    case 'MANTENIMIENTO': return '⚙️'
    case 'LENTITUD_PLAN': return '🐢'
    default:              return '⚠️'
  }
}

export function getBarColor(pct: number): string {
  if (pct >= 90) return 'bg-emerald-500'
  if (pct >= 60) return 'bg-blue-500'
  if (pct >= 30) return 'bg-yellow-500'
  return 'bg-red-500'
}

export function getFaltanStyle(faltan: number | string): string {
  if (faltan === 'N/A') return 'text-gray-400'
  if (faltan === 0)     return 'text-emerald-600 font-bold'
  if (typeof faltan === 'number' && faltan > 0) return 'text-orange-500 font-semibold'
  return 'text-gray-600'
}

// ── Tipo compartido entre page.tsx y ScannerTab ──────────────────
export interface RegistroConMeta extends RegistroProduccion {
  meta_plan?: number | string
  faltan?:    number | string
}