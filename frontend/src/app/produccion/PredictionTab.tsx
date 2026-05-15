'use client'

import { getFaltanStyle } from './helpers'

interface Props {
  proyecciones:  any[]
  saludMaquinas: any[]
}

export default function PredictionTab({ proyecciones, saludMaquinas }: Props) {
  return (
    <div className="space-y-8">
      {/* Proyecciones */}
      <div>
        <h2 className="text-xl font-bold text-slate-700 mb-4 border-b pb-2">
          📊 Proyección de Cierre de Turno
        </h2>
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-blue-50 text-blue-900 border-b">
              <tr>
                {['No. de Parte','Producidas','Ritmo (Pz/Hr)','Meta Plan','Faltan','Tiempo Estimado'].map(col => (
                  <th key={col} className="p-3 text-center font-semibold">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {proyecciones.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center">
                    <span className="text-4xl block mb-2">🤖</span>
                    <span className="text-gray-400">Sin datos suficientes para proyectar.</span>
                  </td>
                </tr>
              ) : (
                proyecciones.map((proy, idx) => (
                  <tr key={idx} className="border-t hover:bg-blue-50/50 transition">
                    <td className="p-3 text-center font-mono font-medium text-blue-800">{proy.numero_parte}</td>
                    <td className="p-3 text-center font-semibold">{proy.producido}</td>
                    <td className="p-3 text-center text-orange-600 font-medium">{proy.ritmo_por_hora ?? '—'}</td>
                    <td className="p-3 text-center">{proy.meta_plan}</td>
                    <td className={`p-3 text-center font-bold ${getFaltanStyle(proy.faltan)}`}>{proy.faltan}</td>
                    <td className="p-3 text-center font-bold text-blue-700">{proy.tiempo_estimado}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Salud máquinas */}
      <div>
        <h2 className="text-xl font-bold text-slate-700 mb-4 border-b pb-2">
          ⚙️ Mantenimiento Predictivo
        </h2>
        <div className="overflow-x-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-purple-50 text-purple-900 border-b">
              <tr>
                {['Máquina','Último Ciclo (seg)','Tendencia IA','Diagnóstico'].map(col => (
                  <th key={col} className="p-3 text-center font-semibold">{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {saludMaquinas.length === 0 ? (
                <tr>
                  <td colSpan={4} className="p-12 text-center">
                    <span className="text-4xl block mb-2">⚙️</span>
                    <span className="text-gray-400">Escanea más códigos para detectar patrones.</span>
                  </td>
                </tr>
              ) : (
                saludMaquinas.map((maq, idx) => (
                  <tr key={idx} className="border-t hover:bg-purple-50/50 transition">
                    <td className="p-3 text-center font-medium">{maq.maquina}</td>
                    <td className="p-3 text-center">{maq.ultimo_ciclo_segundos}</td>
                    <td className="p-3 text-center font-mono">{maq.tendencia}</td>
                    <td className="p-3 text-center">{maq.estado}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gray-400 mt-2 italic">
          * La IA necesita al menos 5 registros continuos de la misma máquina.
        </p>
      </div>
    </div>
  )
}