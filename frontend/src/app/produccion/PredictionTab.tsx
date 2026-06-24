'use client'

import { getFaltanStyle } from './helpers'
import { IconGrafico, IconMaquinas, IconPrediccion } from '@/lib/icons'

interface Props {
  proyecciones:  any[]
  saludMaquinas: any[]
}

export default function PredictionTab({ proyecciones, saludMaquinas }: Props) {
  return (
    <div className="space-y-8">
      {/* Proyecciones */}
      <div>
        <h2 className="text-xl font-bold text-gray-200 mb-4 border-b border-gray-800 pb-2 flex items-center gap-2">
          <IconGrafico size={20} className="text-[var(--accent)]" aria-hidden /> Proyección de Cierre de Turno
        </h2>
        <div className="overflow-x-auto border border-gray-800 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-blue-500/20 text-blue-300 border-b">
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
                    <IconPrediccion size={36} className="mx-auto mb-2 text-gray-500" aria-hidden />
                    <span className="text-gray-300">Sin datos suficientes para proyectar.</span>
                  </td>
                </tr>
              ) : (
                proyecciones.map((proy, idx) => (
                  <tr key={idx} className="border-t hover:bg-blue-500/5 transition">
                    <td className="p-3 text-center font-mono font-medium text-blue-300">{proy.numero_parte}</td>
                    <td className="p-3 text-center font-semibold">{proy.producido}</td>
                    <td className="p-3 text-center text-orange-400 font-medium">{proy.ritmo_por_hora ?? '—'}</td>
                    <td className="p-3 text-center">{proy.meta_plan}</td>
                    <td className={`p-3 text-center font-bold ${getFaltanStyle(proy.faltan)}`}>{proy.faltan}</td>
                    <td className="p-3 text-center font-bold text-blue-400">{proy.tiempo_estimado}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Salud máquinas */}
      <div>
        <h2 className="text-xl font-bold text-gray-200 mb-4 border-b border-gray-800 pb-2 flex items-center gap-2">
          <IconMaquinas size={20} className="text-[var(--accent)]" aria-hidden /> Mantenimiento Predictivo
        </h2>
        <div className="overflow-x-auto border border-gray-800 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-purple-500/20 text-purple-300 border-b">
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
                    <IconMaquinas size={36} className="mx-auto mb-2 text-gray-500" aria-hidden />
                    <span className="text-gray-300">Escanea más códigos para detectar patrones.</span>
                  </td>
                </tr>
              ) : (
                saludMaquinas.map((maq, idx) => (
                  <tr key={idx} className="border-t hover:bg-purple-500/5 transition">
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