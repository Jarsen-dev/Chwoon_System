'use client'

import { getBarColor } from './helpers'

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
  const cards = [
    { label: 'Total Piezas',   value: dashTotalPiezas.toLocaleString(),                              icon: '📦', color: 'border-blue-500   bg-blue-50',   text: 'text-blue-700'   },
    { label: 'Partes Activas', value: dashPorParte.length,                                           icon: '🔢', color: 'border-purple-500 bg-purple-50', text: 'text-purple-700' },
    { label: 'Completadas',    value: dashPorParte.filter(p => p.porcentaje >= 100).length,          icon: '✅', color: 'border-emerald-500 bg-emerald-50', text: 'text-emerald-700' },
    { label: 'En Proceso',     value: dashPorParte.filter(p => p.porcentaje > 0 && p.porcentaje < 100).length, icon: '🔄', color: 'border-yellow-500 bg-yellow-50', text: 'text-yellow-700' },
  ]

  return (
    <div className="space-y-6">
      {/* Tarjetas */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card, idx) => (
          <div key={idx} className={`rounded-lg border-l-4 p-4 ${card.color}`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{card.label}</span>
              <span className="text-xl">{card.icon}</span>
            </div>
            <p className={`text-3xl font-bold ${card.text}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Barras */}
      <div className="bg-gray-900 border border-gray-700 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800">📊 Producción por Número de Parte</h2>
            <p className="text-xs text-gray-400 mt-0.5">Acumulado del turno · ordenado por mayor producción</p>
          </div>
          <button onClick={cargarDashboard} className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
            🔄 Actualizar
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-96 overflow-y-auto">
          {dashPorParte.length === 0 ? (
            <div className="py-12 text-center">
              <span className="text-4xl block mb-2">📊</span>
              <p className="text-gray-400">Sin producción registrada hoy.</p>
            </div>
          ) : (
            dashPorParte.map((item, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 font-medium w-5 text-right">{idx + 1}</span>
                    <span className="font-mono font-bold text-slate-800 text-sm">{item.numero_parte}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-700">{item.total.toLocaleString()}</span>
                    {item.meta > 0 && (
                      <>
                        <span className="text-xs text-gray-400">/ {item.meta.toLocaleString()}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          item.porcentaje >= 100 ? 'bg-emerald-100 text-emerald-700'
                          : item.porcentaje >= 60 ? 'bg-blue-100 text-blue-700'
                          : item.porcentaje >= 30 ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
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