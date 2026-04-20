'use client';

import { useState } from 'react';
import { registrarInspeccion, getPuntosInspeccion, descargarPdfInspeccion } from '@/lib/api';
import type { PuntoResultado, ProductoPuntosInspeccion } from '@/types';

interface Props {
  token: string;
}

export default function LQCTab({ token }: Props) {
  const [sku, setSku] = useState('');
  const [skuBuscado, setSkuBuscado] = useState(false);
  const [puntosProducto, setPuntosProducto] = useState<ProductoPuntosInspeccion | null>(null);
  const [resultadosPuntos, setResultadosPuntos] = useState<PuntoResultado[]>([]);
  const [notas, setNotas] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [opOrigen, setOpOrigen] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [ultimaInspeccionId, setUltimaInspeccionId] = useState<string | null>(null);

  const buscarProducto = async () => {
    if (!sku.trim()) return;
    setLoading(true);
    setError('');
    try {
      const puntos = await getPuntosInspeccion(token, sku.trim());
      setPuntosProducto(puntos);
      const puntosLQC = puntos.puntos_inspeccion_lqc || [];
      setResultadosPuntos(
        puntosLQC.map((p: any) => ({
          punto: p.punto || p.nombre || p.name || String(p),
          especificacion: p.especificacion || p.spec || '',
          resultado: '',
        }))
      );
      setSkuBuscado(true);
    } catch (err: any) {
      setError(err.message);
      setPuntosProducto(null);
    } finally {
      setLoading(false);
    }
  };

  const actualizarPunto = (index: number, resultado: string) => {
    setResultadosPuntos(prev =>
      prev.map((p, i) => (i === index ? { ...p, resultado } : p))
    );
  };

  const todosEvaluados = resultadosPuntos.length === 0 || resultadosPuntos.every(p => p.resultado !== '');

  const calcularResultado = (): string => {
    if (resultadosPuntos.length === 0) return 'Aprobado';
    return resultadosPuntos.every(p => p.resultado === 'Conforme') ? 'Aprobado' : 'Rechazado';
  };

  const enviarInspeccion = async () => {
    if (!puntosProducto) return;
    setLoading(true);
    setError('');
    try {
      const resultado = calcularResultado();
      const res = await registrarInspeccion(token, {
        sku_producto: puntosProducto.sku,
        nombre_producto: puntosProducto.nombre,
        tipo_inspeccion: 'LQC',
        resultado_final: resultado,
        resultados_puntos: resultadosPuntos.map(p => ({
          punto: p.punto,
          especificacion: p.especificacion || '',
          resultado: p.resultado || 'No evaluado',
        })),
        op_origen: opOrigen || undefined,
        cantidad_inspeccionada: parseInt(cantidad) || 0,
        notas: notas || undefined,
      });
      setUltimaInspeccionId(res.inspeccion_id);
      setSuccess(`✅ Inspección LQC ${res.inspeccion_id} — ${resultado}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const reiniciar = () => {
    setSku('');
    setSkuBuscado(false);
    setPuntosProducto(null);
    setResultadosPuntos([]);
    setNotas('');
    setCantidad('');
    setOpOrigen('');
    setUltimaInspeccionId(null);
    setSuccess('');
    setError('');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {error && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-4">
          <p className="text-red-400">❌ {error}</p>
        </div>
      )}
      {success && (
        <div className="bg-green-900/30 border border-green-500/50 rounded-xl p-4 flex items-center justify-between">
          <p className="text-green-400">{success}</p>
          <div className="flex gap-2">
            {ultimaInspeccionId && (
              <button
                onClick={() => descargarPdfInspeccion(token, ultimaInspeccionId!)}
                className="bg-purple-600 hover:bg-purple-700 px-3 py-1 rounded-lg text-xs"
              >
                📄 PDF
              </button>
            )}
            <button onClick={reiniciar} className="bg-cyan-600 hover:bg-cyan-700 px-3 py-1 rounded-lg text-xs">
              🔄 Nueva
            </button>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">🏭 Inspección LQC</h2>
        <p className="text-gray-400 text-sm mt-1">Inspección en línea de producción</p>
      </div>

      {/* Buscar producto */}
      {!skuBuscado && (
        <div className="bg-gray-900 rounded-xl border border-purple-500/30 p-6">
          <label className="block text-sm font-semibold text-gray-300 mb-2">SKU del Producto</label>
          <div className="flex gap-3">
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && buscarProducto()}
              placeholder="Ingrese el SKU..."
              className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white
                         placeholder-gray-500 focus:outline-none focus:border-purple-500"
            />
            <button
              onClick={buscarProducto}
              disabled={loading || !sku.trim()}
              className="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {loading ? '⏳' : '🔍 Buscar'}
            </button>
          </div>
        </div>
      )}

      {/* Formulario de inspección */}
      {skuBuscado && puntosProducto && (
        <>
          <div className="bg-gray-900 rounded-xl border border-gray-700 p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-400">SKU</p>
                <p className="font-mono text-white">{puntosProducto.sku}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Nombre</p>
                <p className="text-white">{puntosProducto.nombre}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Tipo</p>
                <p className="text-white">{puntosProducto.tipo}</p>
              </div>
            </div>
          </div>

          {/* Datos adicionales */}
          <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-1">OP Origen (opcional)</label>
              <input
                value={opOrigen}
                onChange={(e) => setOpOrigen(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white
                           placeholder-gray-500 focus:outline-none focus:border-purple-500"
                placeholder="Orden de producción..."
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-1">Cantidad Inspeccionada</label>
              <input
                type="number"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white
                           placeholder-gray-500 focus:outline-none focus:border-purple-500"
                placeholder="0"
              />
            </div>
          </div>

          {/* Puntos de inspección */}
          {resultadosPuntos.length > 0 ? (
            <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-800">
                    <th className="text-left px-6 py-3 text-sm font-semibold text-gray-300">#</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-gray-300">Punto</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-gray-300">Especificación</th>
                    <th className="text-center px-6 py-3 text-sm font-semibold text-gray-300">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {resultadosPuntos.map((punto, idx) => (
                    <tr key={idx} className={`border-t border-gray-800 ${
                      punto.resultado === 'Conforme' ? 'bg-green-900/10' :
                      punto.resultado === 'No Conforme' ? 'bg-red-900/10' : ''
                    }`}>
                      <td className="px-6 py-3 text-sm text-gray-500">{idx + 1}</td>
                      <td className="px-6 py-3 text-sm text-white">{punto.punto}</td>
                      <td className="px-6 py-3 text-sm text-gray-400">{punto.especificacion || '—'}</td>
                      <td className="px-6 py-3">
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => actualizarPunto(idx, 'Conforme')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              punto.resultado === 'Conforme'
                                ? 'bg-green-600 text-white'
                                : 'bg-gray-700 text-gray-400 hover:bg-green-800'
                            }`}
                          >
                            ✅ Conforme
                          </button>
                          <button
                            onClick={() => actualizarPunto(idx, 'No Conforme')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              punto.resultado === 'No Conforme'
                                ? 'bg-red-600 text-white'
                                : 'bg-gray-700 text-gray-400 hover:bg-red-800'
                            }`}
                          >
                            ❌ No Conforme
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-gray-900 rounded-xl border border-yellow-500/30 p-6 text-center">
              <p className="text-yellow-400">⚠️ Sin puntos de inspección LQC configurados.</p>
            </div>
          )}

          {/* Notas y enviar */}
          <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 space-y-4">
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Notas adicionales..."
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-sm text-white
                         placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-y"
              rows={2}
            />
            <div className="flex items-center justify-between">
              <button onClick={reiniciar} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm">
                ← Reiniciar
              </button>
              <button
                onClick={enviarInspeccion}
                disabled={loading || (!todosEvaluados && resultadosPuntos.length > 0)}
                className={`px-8 py-3 rounded-lg font-medium text-sm transition-colors ${
                  loading || (!todosEvaluados && resultadosPuntos.length > 0)
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-purple-600 hover:bg-purple-700 text-white'
                }`}
              >
                {loading ? '⏳ Registrando...' : '📤 Registrar Inspección LQC'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}