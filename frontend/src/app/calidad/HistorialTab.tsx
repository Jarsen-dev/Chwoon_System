'use client';

import { useState, useEffect } from 'react';
import { getInspecciones, descargarPdfInspeccion } from '@/lib/api';
import type { InspeccionCalidad } from '@/types';

interface Props {
  token: string;
}

export default function HistorialTab({ token }: Props) {
  const [inspecciones, setInspecciones] = useState<InspeccionCalidad[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filtros
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroResultado, setFiltroResultado] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  // Detalle
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<InspeccionCalidad | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getInspecciones(token, {
        tipo: filtroTipo || undefined,
        resultado: filtroResultado || undefined,
        fecha_desde: fechaDesde || undefined,
        fecha_hasta: fechaHasta || undefined,
        limite: 200,
      });
      setInspecciones(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const aplicarFiltros = () => fetchData();

  const limpiarFiltros = () => {
    setFiltroTipo('');
    setFiltroResultado('');
    setFechaDesde('');
    setFechaHasta('');
    setTimeout(fetchData, 0);
  };

  const verDetalle = (insp: InspeccionCalidad) => {
    setDetalle(insp);
    setDetalleId(insp.inspeccion_id);
  };

  const formatFecha = (fecha?: string) => {
    if (!fecha) return 'N/A';
    try {
      return new Date(fecha).toLocaleString('es-MX', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return fecha;
    }
  };

  const tipoBadge: Record<string, { bg: string; text: string }> = {
    IQC:        { bg: 'bg-blue-900/40',   text: 'text-blue-400' },
    LQC:        { bg: 'bg-purple-900/40', text: 'text-purple-400' },
    OQC:        { bg: 'bg-indigo-900/40', text: 'text-indigo-400' },
    DEVOLUCION: { bg: 'bg-yellow-900/40', text: 'text-yellow-400' },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">📋 Historial de Inspecciones</h2>
          <p className="text-gray-400 text-sm mt-1">Registro completo de todas las inspecciones realizadas</p>
        </div>
        <button
          onClick={fetchData}
          className="bg-cyan-600 hover:bg-cyan-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          🔄 Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="">Todos los tipos</option>
            <option value="IQC">🔍 IQC</option>
            <option value="LQC">🏭 LQC</option>
            <option value="OQC">📦 OQC</option>
            <option value="DEVOLUCION">🔄 Devolución</option>
          </select>
          <select
            value={filtroResultado}
            onChange={(e) => setFiltroResultado(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
          >
            <option value="">Todos los resultados</option>
            <option value="Aprobado">✅ Aprobado</option>
            <option value="Rechazado">❌ Rechazado</option>
          </select>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
          />
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
          />
          <div className="flex gap-2">
            <button
              onClick={aplicarFiltros}
              className="flex-1 bg-cyan-600 hover:bg-cyan-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              🔍 Filtrar
            </button>
            <button
              onClick={limpiarFiltros}
              className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg text-sm transition-colors"
            >
              ✕
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-4">
          <p className="text-red-400">❌ {error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-cyan-400" />
        </div>
      ) : (
        <>
          <p className="text-gray-500 text-sm">{inspecciones.length} inspecciones encontradas</p>

          <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-gray-800 z-10">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400">Fecha</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400">ID</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400">Tipo</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400">SKU</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400">Producto</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400">Inspector</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400">Resultado</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-400">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {inspecciones.map((insp) => {
                    const badge = tipoBadge[insp.tipo_inspeccion] || { bg: 'bg-gray-800', text: 'text-gray-400' };
                    return (
                      <tr key={insp.id} className="border-t border-gray-800 hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-xs text-gray-400">{formatFecha(insp.fecha)}</td>
                        <td className="px-4 py-3 text-xs font-mono text-gray-300">{insp.inspeccion_id}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${badge.bg} ${badge.text}`}>
                            {insp.tipo_inspeccion}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-white">{insp.sku_producto}</td>
                        <td className="px-4 py-3 text-xs text-gray-300 max-w-[150px] truncate">
                          {insp.nombre_producto || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">{insp.inspector}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-bold ${
                            insp.resultado_final === 'Aprobado' ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {insp.resultado_final === 'Aprobado' ? '✅' : '❌'} {insp.resultado_final}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => verDetalle(insp)}
                              className="bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-xs transition-colors"
                            >
                              👁️
                            </button>
                            <button
                              onClick={() => descargarPdfInspeccion(token, insp.inspeccion_id)}
                              className="bg-purple-700 hover:bg-purple-600 px-2 py-1 rounded text-xs transition-colors"
                            >
                              📄
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {inspecciones.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                        No se encontraron inspecciones
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Modal Detalle */}
      {detalle && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-700 max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-cyan-400">
                Detalle — {detalle.inspeccion_id}
              </h3>
              <button onClick={() => setDetalle(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-gray-400">Tipo:</span> <span className="text-white ml-2">{detalle.tipo_inspeccion}</span></div>
              <div><span className="text-gray-400">Resultado:</span> <span className={`ml-2 font-bold ${detalle.resultado_final === 'Aprobado' ? 'text-green-400' : 'text-red-400'}`}>{detalle.resultado_final}</span></div>
              <div><span className="text-gray-400">SKU:</span> <span className="text-white ml-2 font-mono">{detalle.sku_producto}</span></div>
              <div><span className="text-gray-400">Producto:</span> <span className="text-white ml-2">{detalle.nombre_producto || 'N/A'}</span></div>
              <div><span className="text-gray-400">Lote:</span> <span className="text-white ml-2 font-mono">{detalle.lote_id || 'N/A'}</span></div>
              <div><span className="text-gray-400">Cantidad:</span> <span className="text-white ml-2">{detalle.cantidad_inspeccionada}</span></div>
              <div><span className="text-gray-400">Inspector:</span> <span className="text-white ml-2">{detalle.inspector}</span></div>
              <div><span className="text-gray-400">Fecha:</span> <span className="text-white ml-2">{formatFecha(detalle.fecha)}</span></div>
              {detalle.oc_origen && <div><span className="text-gray-400">OC Origen:</span> <span className="text-white ml-2">{detalle.oc_origen}</span></div>}
              {detalle.op_origen && <div><span className="text-gray-400">OP Origen:</span> <span className="text-white ml-2">{detalle.op_origen}</span></div>}
            </div>

            {detalle.resultados_puntos && detalle.resultados_puntos.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold text-gray-300 mb-2">Puntos de Inspección</h4>
                <div className="space-y-1">
                  {detalle.resultados_puntos.map((p, i) => (
                    <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                      p.resultado === 'Conforme' ? 'bg-green-900/20' :
                      p.resultado === 'No Conforme' ? 'bg-red-900/20' : 'bg-gray-800'
                    }`}>
                      <span className="text-white">{p.punto}</span>
                      <span className={`font-medium ${
                        p.resultado === 'Conforme' ? 'text-green-400' :
                        p.resultado === 'No Conforme' ? 'text-red-400' : 'text-gray-400'
                      }`}>
                        {p.resultado}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detalle.notas && (
              <div>
                <h4 className="text-sm font-semibold text-gray-300 mb-1">Notas</h4>
                <p className="text-sm text-gray-400 bg-gray-800 rounded-lg px-3 py-2">{detalle.notas}</p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => descargarPdfInspeccion(token, detalle.inspeccion_id)}
                className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                📄 Descargar PDF
              </button>
              <button
                onClick={() => setDetalle(null)}
                className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}