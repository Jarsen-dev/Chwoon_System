'use client'

import { getBarColor } from './helpers'
import { IconInventario, IconContador, IconCompletado, IconActualizar, IconGrafico, type LucideIcon } from '@/lib/icons'

interface DashItem {
  numero_parte: string
  total:        number
  meta:         number
  porcentaje:   number
}

interface Props {
  dashPorParte:    DashItem[]
  dashTotalPiezas: number
  cargarDashboard: () => void
}

export default function DashboardTab({ dashPorParte, dashTotalPiezas, cargarDashboard }: Props) {
  const cards: { label: string; value: string | number; icon: LucideIcon; color: string; text: string }[] = [
    { label: 'Total Piezas',   value: dashTotalPiezas.toLocaleString(),                              icon: IconInventario, color: 'border-blue-500   bg-blue-500/10',   text: 'text-blue-400'   },
    { label: 'Partes Activas', value: dashPorParte.length,                                           icon: IconContador,   color: 'border-purple-500 bg-purple-500/10', text: 'text-purple-400' },
    { label: 'Completadas',    value: dashPorParte.filter(p => p.porcentaje >= 100).length,          icon: IconCompletado, color: 'border-emerald-500 bg-emerald-500/10', text: 'text-emerald-400' },
    { label: 'En Proceso',     value: dashPorParte.filter(p => p.porcentaje > 0 && p.porcentaje < 100).length, icon: IconActualizar, color: 'border-yellow-500 bg-yellow-500/10', text: 'text-yellow-400' },
  ]

  return (
    <div className="space-y-6">
      {/* Tarjetas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card, idx) => {
          const CardIcon = card.icon
          return (
            <div key={idx} className={`rounded-lg border-l-4 p-4 ${card.color}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-300 uppercase tracking-wider">{card.label}</span>
                <CardIcon size={20} className={card.text} aria-hidden />
              </div>
              <p className={`text-3xl font-bold ${card.text}`}>{card.value}</p>
            </div>
          )
        })}
      </div>

      {/* Barras */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-gray-100 flex items-center gap-2"><IconGrafico size={18} className="text-[var(--accent)]" aria-hidden /> Producción por Número de Parte</h2>
            <p className="text-xs text-gray-300 mt-0.5">Acumulado del turno · ordenado por mayor producción</p>
          </div>
          <button onClick={cargarDashboard} className="text-xs text-[var(--accent)] hover:opacity-80 font-medium flex items-center gap-1.5">
            <IconActualizar size={14} aria-hidden /> Actualizar
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-96 overflow-y-auto">
          {dashPorParte.length === 0 ? (
            <div className="py-12 text-center">
              <IconGrafico size={36} className="mx-auto mb-2 text-gray-500" aria-hidden />
              <p className="text-gray-300">Sin producción registrada hoy.</p>
            </div>
          ) : (
            dashPorParte.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-medium w-5 text-right">{idx + 1}</span>
                    <span className="font-mono font-bold text-gray-200 text-sm">{item.numero_parte}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-200">{item.total.toLocaleString()}</span>
                    {item.meta > 0 && (
                      <>
                        <span className="text-xs text-gray-400">/ {item.meta.toLocaleString()}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          item.porcentaje >= 100 ? 'bg-emerald-500/10 text-emerald-400'
                          : item.porcentaje >= 60 ? 'bg-blue-500/10 text-blue-400'
                          : item.porcentaje >= 30 ? 'bg-yellow-500/10 text-yellow-400'
                          : 'bg-red-500/10 text-red-400'
                        }`}>{item.porcentaje}%</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-5" />
                  <div className="flex-1 bg-gray-800 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-3 rounded-full transition-all duration-700 ${getBarColor(item.porcentaje)}`}
                      style={{
                        width: item.meta > 0
                          ? `${item.porcentaje}%`
                          : `${Math.round((item.total / (dashPorParte[0]?.total || 1)) * 100)}%`
                      }}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}