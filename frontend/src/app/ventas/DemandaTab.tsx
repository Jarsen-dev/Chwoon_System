'use client';
import { useState } from 'react';

export default function DemandaTab({ token }: { token: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [analisis, setAnalisis] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Mock temporal para visualización (aquí conectarías a tu endpoint de cálculo de brecha)
  const procesarArchivo = () => {
    setLoading(true);
    setTimeout(() => {
      setAnalisis([
        { sku: 'ABQ73946703', desc: 'CASE ASSY CONTROL', demanda: 1200, stock: 800, brecha: -400, status: 'FALTANTE' },
        { sku: 'ADJ75492608', desc: 'DUCT MULTI ASSY', demanda: 500, stock: 650, brecha: 150, status: 'OK' },
      ]);
      setLoading(false);
    }, 1000);
  };

  return (
    <div className="space-y-6">
      <div className="bg-gray-900 border border-gray-800 p-5 rounded-xl flex gap-4 items-end">
        <div className="flex-1">
          <label className="text-sm text-gray-400 mb-1 block">Subir Requerimiento Cliente (LG / GMES Plan)</label>
          <input type="file" accept=".xlsx, .csv" onChange={e => setFile(e.target.files?.[0] || null)} className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:bg-gray-800 file:text-white" />
        </div>
        <button onClick={procesarArchivo} disabled={!file || loading} className="bg-violet-600 hover:bg-violet-700 px-6 py-2 rounded-lg font-medium">
          {loading ? 'Cruzando Datos...' : 'Analizar Brecha vs Inventario'}
        </button>
      </div>

      {analisis.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-sm text-left text-gray-300">
            <thead className="bg-gray-800">
              <tr>
                <th className="px-4 py-3">SKU / Proyecto</th>
                <th className="px-4 py-3">Demanda Cliente</th>
                <th className="px-4 py-3">Stock PT Aprobado</th>
                <th className="px-4 py-3">Brecha (Faltante)</th>
                <th className="px-4 py-3">Acción Sugerida</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {analisis.map((item, i) => (
                <tr key={i} className="hover:bg-gray-800/50">
                  <td className="px-4 py-3">{item.sku} - {item.desc}</td>
                  <td className="px-4 py-3 font-bold">{item.demanda}</td>
                  <td className="px-4 py-3 text-blue-400 font-medium">{item.stock}</td>
                  <td className={`px-4 py-3 font-bold ${item.brecha < 0 ? 'text-red-400' : 'text-green-400'}`}>
                    {item.brecha}
                  </td>
                  <td className="px-4 py-3">
                    {item.brecha < 0 ? (
                      <button className="bg-red-600/20 text-red-400 border border-red-500/30 px-3 py-1 rounded text-xs font-bold">
                        Detonar Producción (R1/R2)
                      </button>
                    ) : (
                      <button className="bg-green-600/20 text-green-400 border border-green-500/30 px-3 py-1 rounded text-xs font-bold">
                        Convertir a Orden Venta
                      </button>
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