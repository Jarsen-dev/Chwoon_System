'use client';

import { useState } from 'react';
import { registrarInspeccion, getPuntosInspeccion, descargarPdfInspeccion } from '@/lib/api';
import type { PuntoResultado, ProductoPuntosInspeccion } from '@/types';
import { Button } from '@/components/ui';
import {
  IconDevoluciones, IconAlertas, IconDocumento, IconActualizar, IconBuscar,
  IconPendiente, IconOk, IconCerrar,
} from '@/lib/icons';

interface Props {
  token: string;
}

export default function DevolucionesTab({ token }: Props) {
  const [sku, setSku] = useState('');
  const [skuBuscado, setSkuBuscado] = useState(false);
  const [puntosProducto, setPuntosProducto] = useState<ProductoPuntosInspeccion | null>(null);
  const [resultadosPuntos, setResultadosPuntos] = useState<PuntoResultado[]>([]);
  const [notas, setNotas] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [ovOrigen, setOvOrigen] = useState('');
  const [loteOrigen, setLoteOrigen] = useState('');
  const [motivo, setMotivo] = useState('');
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
      // Para devoluciones usamos puntos IQC como base de reinspección
      const puntosBase = puntos.puntos_inspeccion_iqc || puntos.puntos_inspeccion_lqc || [];
      setResultadosPuntos(
        puntosBase.map((p: any) => ({
          punto: p.punto || p.nombre || p.name || String(p),
          especificacion: p.especificacion || p.spec || '',
          resultado: '',
        }))
      );
      setSkuBuscado(true);
    } catch (err: any) {
      setError(err.message);
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
        lote_id: loteOrigen || undefined,
        sku_producto: puntosProducto.sku,
        nombre_producto: puntosProducto.nombre,
        tipo_inspeccion: 'DEVOLUCION',
        resultado_final: resultado,
        resultados_puntos: resultadosPuntos.map(p => ({
          punto: p.punto,
          especificacion: p.especificacion || '',
          resultado: p.resultado || 'No evaluado',
        })),
        oc_origen: ovOrigen || undefined,
        cantidad_inspeccionada: parseInt(cantidad) || 0,
        notas: `Motivo: ${motivo}${notas ? ` | ${notas}` : ''}`,
      });
      setUltimaInspeccionId(res.inspeccion_id);
      setSuccess(`Inspección Devolución ${res.inspeccion_id} — ${resultado}`);
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
    setOvOrigen('');
    setLoteOrigen('');
    setMotivo('');
    setUltimaInspeccionId(null);
    setSuccess('');
    setError('');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {error && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-4">
          <p className="text-red-400 flex items-center gap-2"><IconAlertas size={16} aria-hidden /> {error}</p>
        </div>
      )}
      {success && (
        <div className="bg-green-900/30 border border-green-500/50 rounded-xl p-4 flex items-center justify-between">
          <p className="text-green-400 flex items-center gap-2"><IconOk size={16} aria-hidden /> {success}</p>
          <div className="flex gap-2">
            {ultimaInspeccionId && (
              <Button size="sm" variant="secondary" leftIcon={IconDocumento} onClick={() => descargarPdfInspeccion(token, ultimaInspeccionId!)}>PDF</Button>
            )}
            <Button size="sm" leftIcon={IconActualizar} onClick={reiniciar}>Nueva</Button>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2"><IconDevoluciones size={24} className="text-[var(--accent)]" aria-hidden /> Inspección de Devolución</h2>
        <p className="text-gray-300 text-sm mt-1">Inspección de material devuelto por cliente</p>
      </div>

      {!skuBuscado && (
        <div className="bg-gray-900 rounded-xl border border-yellow-500/30 p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-2">SKU del Producto</label>
            <div className="flex gap-3">
              <input
                value={sku}
                onChange={(e) => setSku(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && buscarProducto()}
                placeholder="Ingrese el SKU..."
                className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white
                           placeholder-gray-500 focus:outline-none focus:border-yellow-500"
              />
              <Button size="lg" onClick={buscarProducto} disabled={loading || !sku.trim()} leftIcon={loading ? IconPendiente : IconBuscar}>
                Buscar
              </Button>
            </div>
          </div>
        </div>
      )}

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

          {/* Datos de devolución */}
          <div className="bg-gray-900 rounded-xl border border-yellow-500/20 p-6">
            <h3 className="text-sm font-semibold text-yellow-400 mb-3 flex items-center gap-2"><IconDocumento size={16} aria-hidden /> Datos de la Devolución</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-300 mb-1">OV Origen</label>
                <input
                  value={ovOrigen}
                  onChange={(e) => setOvOrigen(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white
                             placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                  placeholder="Orden de venta de origen..."
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Lote Origen</label>
                <input
                  value={loteOrigen}
                  onChange={(e) => setLoteOrigen(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white
                             placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                  placeholder="ID del lote de producción..."
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Cantidad Devuelta</label>
                <input
                  type="number"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white
                             placeholder-gray-500 focus:outline-none focus:border-yellow-500"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Motivo de Devolución</label>
                <select
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white
                             focus:outline-none focus:border-yellow-500"
                >
                  <option value="">Seleccionar motivo...</option>
                  <option value="Defecto de calidad">Defecto de calidad</option>
                  <option value="Material incorrecto">Material incorrecto</option>
                  <option value="Cantidad incorrecta">Cantidad incorrecta</option>
                  <option value="Daño en transporte">Daño en transporte</option>
                  <option value="Fuera de especificación">Fuera de especificación</option>
                  <option value="Otro">Otro</option>
                </select>
              </div>
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
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              punto.resultado === 'Conforme'
                                ? 'bg-green-600 text-white'
                                : 'bg-gray-700 text-gray-300 hover:bg-green-800'
                            }`}
                          >
                            <IconOk size={14} aria-hidden /> Conforme
                          </button>
                          <button
                            onClick={() => actualizarPunto(idx, 'No Conforme')}
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              punto.resultado === 'No Conforme'
                                ? 'bg-red-600 text-white'
                                : 'bg-gray-700 text-gray-300 hover:bg-red-800'
                            }`}
                          >
                            <IconCerrar size={14} aria-hidden /> No Conforme
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
              <p className="text-yellow-400 flex items-center justify-center gap-2"><IconAlertas size={16} aria-hidden /> Sin puntos de inspección configurados para reinspección.</p>
            </div>
          )}

          <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 space-y-4">
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Observaciones adicionales de la inspección..."
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-sm text-white
                         placeholder-gray-500 focus:outline-none focus:border-yellow-500 resize-y"
              rows={2}
            />
            <div className="flex items-center justify-between">
              <Button variant="secondary" onClick={reiniciar}>Reiniciar</Button>
              <Button
                size="lg"
                onClick={enviarInspeccion}
                disabled={loading || (!todosEvaluados && resultadosPuntos.length > 0) || !motivo}
                leftIcon={loading ? IconPendiente : IconOk}
              >
                {loading ? 'Registrando...' : 'Registrar Inspección Devolución'}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}