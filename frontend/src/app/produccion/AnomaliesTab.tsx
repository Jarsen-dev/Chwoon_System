'use client'

import { getTipoBadge, getTipoIcon } from './helpers'
import { IconAlertas, IconActualizar, IconOk } from '@/lib/icons'

interface Anomalia {
  id:           number
  fecha:        string
  hora:         string
  numero_parte: string
  motivo:       string
  tipo:         string
}

interface Props {
  anomalias:       Anomalia[]
  cargarAnomalias: () => void
}

export default function AnomaliesTab({ anomalias, cargarAnomalias }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2"><IconAlertas size={22} className="text-[var(--accent)]" aria-hidden /> Registro de Alertas y Anomalías</h2>
          <p className="text-xs text-gray-300 mt-0.5">Detecciones automáticas por Inteligencia Artificial</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {['FRAUDE', 'MANTENIMIENTO', 'LENTITUD_PLAN'].map(tipo => {
            const count = anomalias.filter(a => a.tipo === tipo).length
            const TipoIcon = getTipoIcon(tipo)
            return (
              <div key={tipo} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${getTipoBadge(tipo)}`}>
                <TipoIcon size={14} aria-hidden />
                <span>{tipo}</span>
                <span className="bg-gray-900/60 px-1.5 rounded-full">{count}</span>
              </div>
            )
          })}
          <button
            onClick={cargarAnomalias}
            className="px-3 py-1.5 rounded-full text-xs font-bold border border-gray-600 bg-gray-800 hover:bg-gray-700 text-gray-300 transition flex items-center gap-1.5"
          >
            <IconActualizar size={14} aria-hidden /> Actualizar
          </button>
        </div>
      </div>

      <div className="overflow-x-auto border border-gray-800 rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-800 border-b border-gray-800">
              {['Tipo','Fecha','Hora','No. de Parte'].map(col => (
                <th key={col} className="p-3 text-center font-semibold text-gray-300">{col}</th>
              ))}
              <th className="p-3 text-left font-semibold text-gray-300">Motivo Detectado</th>
            </tr>
          </thead>
          <tbody>
            {anomalias.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-16 text-center">
                  <IconOk size={48} className="mx-auto mb-3 text-emerald-400" aria-hidden />
                  <p className="text-gray-300 font-medium">Sin anomalías detectadas.</p>
                  <p className="text-gray-400 text-xs mt-1">El sistema de IA está monitoreando en tiempo real.</p>
                </td>
              </tr>
            ) : (
              anomalias.map((a, idx) => (
                <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800 transition">
                  <td className="p-3 text-center">
                    {(() => { const TipoIcon = getTipoIcon(a.tipo); return (
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${getTipoBadge(a.tipo)}`}>
                        <TipoIcon size={13} aria-hidden /> {a.tipo}
                      </span>
                    )})()}
                  </td>
                  <td className="p-3 text-center font-mono text-xs text-gray-400">{a.fecha}</td>
                  <td className="p-3 text-center font-mono text-xs text-gray-400">{a.hora}</td>
                  <td className="p-3 text-center">
                    <span className={`font-mono font-bold text-sm ${
                      a.numero_parte === 'MANTENIMIENTO' ? 'text-orange-400' : 'text-blue-400'
                    }`}>{a.numero_parte}</span>
                  </td>
                  <td className="p-3 text-gray-300 text-xs max-w-md">{a.motivo}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {anomalias.length > 0 && (
        <p className="text-right text-xs text-gray-400">
          {anomalias.length} alerta(s) registrada(s) en total
        </p>
      )}
    </div>
  )
}