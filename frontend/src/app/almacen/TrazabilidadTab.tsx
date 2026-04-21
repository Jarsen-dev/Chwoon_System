'use client';

import { useState } from 'react';
import { getTrazabilidad } from '@/lib/api';
import { TrazabilidadLote } from '@/types';

interface Props {
  token: string;
}

export default function TrazabilidadTab({ token }: Props) {
  const [busqueda, setBusqueda] = useState('');
  const [resultado, setResultado] = useState<TrazabilidadLote | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const buscar = async () => {
    if (!busqueda.trim()) return;
    try {
      setLoading(true);
      setError('');
      setResultado(null);
      const data = await getTrazabilidad(token, busqueda.trim());
      if (data.error) {
        setError(data.error);
      } else {
        setResultado(data);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') buscar();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-2">🔍 Trazabilidad de Lotes</h2>
        <p className="text-sm text-gray-400">Rastree el ciclo de vida completo de un lote, desde su origen hasta su destino.</p>
      </div>

      {/* Barra de búsqueda */}
      <div className="flex gap-3">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ingrese Lote ID, OP ID o Devolución ID..."
          className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white placeholder-gray-500"
          autoFocus
        />
        <button
          onClick={buscar}
          disabled={!busqueda.trim() || loading}
          className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 px-6 py-3 rounded-lg font-medium transition-colors"
        >
          {loading ? '⏳' : '🔍'} Buscar
        </button>
      </div>

      {error && (
        <div className="bg-red-500/20 text-red-400 p-4 rounded-lg text-sm">{error}</div>
      )}

      {/* Resultado */}
      {resultado && resultado.info_lote && (
        <div className="space-y-4">
          {/* Info del lote */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <h3 className="text-lg font-bold mb-3 text-orange-400">📦 Información del Lote</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(resultado.info_lote).map(([key, value]) => (
                <div key={key}>
                  <span className="text-xs text-gray-500 uppercase">{key.replace(/_/g, ' ')}</span>
                  <p className="text-sm text-white font-medium mt-0.5">
                    {value !== null && value !== undefined ? String(value) : '-'}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Movimientos */}
          {resultado.movimientos && resultado.movimientos.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-lg font-bold mb-3 text-blue-400">📋 Historial de Movimientos</h3>
              <div className="space-y-2">
                {resultado.movimientos.map((mov, i) => (
                  <div key={i} className="bg-gray-800 rounded-lg p-3 flex items-start justify-between">
                    <div>
                      <span className="font-mono text-sm text-orange-400">{mov.tipo}</span>
                      <span className="text-xs text-gray-400 ml-3">
                        {mov.fecha ? new Date(mov.fecha).toLocaleString('es-MX') : '-'}
                      </span>
                      {mov.detalles && Object.keys(mov.detalles).length > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          {Object.entries(mov.detalles).map(([k, v]) => (
                            <span key={k} className="mr-3">{k}: <span className="text-gray-300">{String(v)}</span></span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className={`font-bold text-sm ${mov.cantidad >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {mov.cantidad >= 0 ? '+' : ''}{mov.cantidad}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Estado vacío */}
      {!loading && !resultado && !error && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-16 text-center">
          <div className="text-5xl mb-4">🔍</div>
          <p className="text-gray-400">Ingrese un ID para rastrear su trazabilidad</p>
          <p className="text-xs text-gray-600 mt-2">Puede buscar por: Lote ID, Orden de Producción, Devolución ID</p>
        </div>
      )}
    </div>
  );
}