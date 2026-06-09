'use client';
import { useState } from 'react';
import { analizarDemanda } from '@/lib/api';
import type { DemandaGapItem } from '@/types';

export default function DemandaTab({ token }: { token: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [analisis, setAnalisis] = useState<DemandaGapItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const procesarArchivo = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const resultado = await analizarDemanda(token, file);
      setAnalisis(resultado);
    } catch (e: any) {
      setError(e.message || 'Error al analizar el archivo');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 border border-gray-800 p-5 rounded-xl flex gap-4 items-end">
        <div className="flex-1">
          <label className="text-sm text-gray-400 mb-1 block">Subir Requerimiento Cliente (LG / GMES Plan)</label>
          <input type="file" accept=".xlsx, .csv" onChange={e => setFile(e.target.files?.[0] || null)} className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-gray-800 file:text-white" />
        </div>
        <button onClick={procesarArchivo} disabled={!file || loading} className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 px-6 py-2 rounded-lg font-medium">
          {loading ? 'Cruzando Datos...' : 'Analizar Brecha vs Inventario'}
        </button>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/40 text-red-300 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}

      {analisis.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
            <span className="text-sm text-gray-400">{analisis.length} SKUs analizados</span>
            <span className="text-sm text-red-400">{analisis.filter(i => i.status === 'FALTANTE').length} faltantes</span>
          </div>
          <table className="w-full text-sm text-left text-gray-300">
            <thead className="bg-gray-800">
              <tr>
                <th className="px-4 py-3">SKU / Producto</th>
                <th className="px-4 py-3">Demanda Cliente</th>
                <th className="px-4 py-3">Stock PT Aprobado</th>
                <th className="px-4 py-3">Brecha (Faltante)</th>
                <th className="px-4 py-3">Acción Sugerida</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {analisis.map((item, i) => (
                <tr key={i} className="hover:bg-gray-800/50">
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-gray-400">{item.sku}</div>
                    {item.descripcion && <div className="text-gray-200">{item.descripcion}</div>}
                  </td>
                  <td className="px-4 py-3 font-bold">{item.demanda.toLocaleString()}</td>
                  <td className="px-4 py-3 text-blue-400 font-medium">{item.stock_pt_aprobado.toLocaleString()}</td>
                  <td className={`px-4 py-3 font-bold ${item.brecha < 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {item.brecha >= 0 ? '+' : ''}{item.brecha.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    {item.status === 'FALTANTE' ? (
                      <span className="bg-red-600/20 text-red-400 border border-red-500/30 px-3 py-1 rounded text-xs font-bold">
                        Detonar Producción
                      </span>
                    ) : (
                      <span className="bg-green-600/20 text-green-400 border border-green-500/30 px-3 py-1 rounded text-xs font-bold">
                        Stock Suficiente
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
