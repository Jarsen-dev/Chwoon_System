'use client';

import { useState } from 'react';
import { getReporteEmbarques } from '@/lib/api';
import { ReporteEmbarqueItem } from '@/types';

interface Props {
  token: string;
}

export default function ReporteEmbarquesTab({ token }: Props) {
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [clase, setClase] = useState('');
  const [reporte, setReporte] = useState<ReporteEmbarqueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const cargar = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getReporteEmbarques(token, fecha, clase || undefined);
      setReporte(data);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const horas = Array.from({ length: 13 }, (_, i) => i + 7);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">📋 Reporte de Embarques por Día</h2>
      </div>

      {/* Filtros */}
      <div className="flex gap-3 items-end">
        <div>
          <label className="text-sm text-gray-400">Fecha</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="block bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1"
          />
        </div>
        <div>
          <label className="text-sm text-gray-400">Clase de Producto</label>
          <select
            value={clase}
            onChange={(e) => setClase(e.target.value)}
            className="block bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1"
          >
            <option value="">TODAS LAS CLASES</option>
            <option value="AUTOPARTES">AUTOPARTES</option>
            <option value="LINEA BLANCA">LINEA BLANCA</option>
            <option value="EMBALAJE">EMBALAJE</option>
          </select>
        </div>
        <button
          onClick={cargar}
          disabled={loading}
          className="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 px-6 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          {loading ? '⏳ Cargando...' : '📊 Generar Reporte'}
        </button>
      </div>

      {error && (
        <div className="bg-red-500/20 text-red-400 p-3 rounded-lg text-sm">{error}</div>
      )}

      {/* Tabla de reporte */}
      {reporte.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800">
                <tr>
                  <th className="text-left p-3 text-gray-400 sticky left-0 bg-gray-800 z-10">SKU</th>
                  <th className="text-right p-3 text-gray-400">Solicitado</th>
                  <th className="text-right p-3 text-gray-400">Enviado</th>
                  <th className="text-right p-3 text-gray-400">Diferencia</th>
                  <th className="text-right p-3 text-gray-400">% Tránsito</th>
                  {horas.map(h => (
                    <th key={h} className="text-center p-2 text-gray-500 text-xs min-w-[50px]">
                      {h}:00
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {reporte.map((item) => (
                  <tr key={item.item_id} className="hover:bg-gray-800/50">
                    <td className="p-3 font-mono text-teal-400 text-xs sticky left-0 bg-gray-900">{item.sku}</td>
                    <td className="p-3 text-right">{item.cantidad_solicitada}</td>
                    <td className="p-3 text-right text-green-400">{item.cantidad_enviada}</td>
                    <td className="p-3 text-right">
                      <span className={item.diferencia > 0 ? 'text-red-400' : 'text-green-400'}>
                        {item.diferencia}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        parseFloat(item.porcentaje_en_transito) >= 100
                          ? 'bg-green-500/20 text-green-400'
                          : parseFloat(item.porcentaje_en_transito) > 0
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-red-500/20 text-red-400'
                      }`}>
                        {item.porcentaje_en_transito}
                      </span>
                    </td>
                    {horas.map(h => {
                      const val = item.embarques_por_hora[String(h)] || 0;
                      return (
                        <td key={h} className="p-2 text-center text-xs">
                          {val > 0 ? (
                            <span className="bg-teal-500/30 text-teal-400 px-1.5 py-0.5 rounded">{val}</span>
                          ) : (
                            <span className="text-gray-700">-</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Resumen */}
          <div className="bg-gray-800 px-4 py-3 flex gap-6 text-sm">
            <span className="text-gray-400">
              Total SKUs: <span className="text-white font-bold">{reporte.length}</span>
            </span>
            <span className="text-gray-400">
              Total Solicitado: <span className="text-white font-bold">
                {reporte.reduce((s, r) => s + r.cantidad_solicitada, 0).toLocaleString('es-MX')}
              </span>
            </span>
            <span className="text-gray-400">
              Total Enviado: <span className="text-green-400 font-bold">
                {reporte.reduce((s, r) => s + r.cantidad_enviada, 0).toLocaleString('es-MX')}
              </span>
            </span>
            <span className="text-gray-400">
              Embarcado Hoy: <span className="text-teal-400 font-bold">
                {reporte.reduce((s, r) => s + r.total_embarcado_dia, 0).toLocaleString('es-MX')}
              </span>
            </span>
          </div>
        </div>
      )}

      {/* Estado vacío */}
      {!loading && reporte.length === 0 && !error && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-16 text-center">
          <div className="text-5xl mb-4">📋</div>
          <p className="text-gray-400">Seleccione una fecha y genere el reporte</p>
        </div>
      )}
    </div>
  );
}