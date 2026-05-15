'use client'

import { getTipoBadge, getTipoIcon } from './helpers'

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
          <h2 className="text-xl font-bold text-slate-800">🚨 Registro de Alertas y Anomalías</h2>
          <p className="text-xs text-gray-400 mt-0.5">Detecciones automáticas por Inteligencia Artificial</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {['FRAUDE', 'MANTENIMIENTO', 'LENTITUD_PLAN'].map(tipo => {
            const count = anomalias.filter(a => a.tipo === tipo).length
            return (
              <div key={tipo} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${getTipoBadge(tipo)}`}>
                <span>{getTipoIcon(tipo)}</span>
                <span>{tipo}</span>
                <span className="bg-white/60 px-1.5 rounded-full">{count}</span>
              </div>
            )
          })}
          <button
            onClick={cargarAnomalias}
            className="px-3 py-1.5 rounded-full text-xs font-bold border border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-600 transition flex items-center gap-1"
          >
            🔄 Actualizar
          </button>
        </div>
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-gray-200">
              {['Tipo','Fecha','Hora','No. de Parte'].map(col => (
                <th key={col} className="p-3 text-center font-semibold text-slate-600">{col}</th>
              ))}
              <th className="p-3 text-left font-semibold text-slate-600">Motivo Detectado</th>
            </tr>
          </thead>
          <tbody>
            {anomalias.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-16 text-center">
                  <span className="text-5xl block mb-3">✅</span>
                  <p className="text-gray-500 font-medium">Sin anomalías detectadas.</p>
                  <p className="text-gray-400 text-xs mt-1">El sistema de IA está monitoreando en tiempo real.</p>
                </td>
              </tr>
            ) : (
              anomalias.map((a, idx) => (
                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 transition">
                  <td className="p-3 text-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${getTipoBadge(a.tipo)}`}>
                      {getTipoIcon(a.tipo)} {a.tipo}
                    </span>
                  </td>
                  <td className="p-3 text-center font-mono text-xs text-slate-500">{a.fecha}</td>
                  <td className="p-3 text-center font-mono text-xs text-slate-500">{a.hora}</td>
                  <td className="p-3 text-center">
                    <span className={`font-mono font-bold text-sm ${
                      a.numero_parte === 'MANTENIMIENTO' ? 'text-orange-600' : 'text-blue-700'
                    }`}>{a.numero_parte}</span>
                  </td>
                  <td className="p-3 text-slate-600 text-xs max-w-md">{a.motivo}</td>
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