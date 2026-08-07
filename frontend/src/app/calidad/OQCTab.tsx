'use client';

import { useState } from 'react';
import { registrarInspeccion, getProducto, descargarPdfInspeccion } from '@/lib/api';
import type { ProductoItem } from '@/types';
import { Button } from '@/components/ui';
import InspeccionEvaluacion, { type EvaluacionPayload } from '@/components/calidad/InspeccionEvaluacion';
import {
  IconOQC, IconAlertas, IconDocumento, IconActualizar, IconBuscar,
  IconPendiente, IconOk,
} from '@/lib/icons';

interface Props {
  token: string;
}

/** El Lote ID nombra la carpeta de evidencia en el servidor, así que se acota a
 *  lo que el backend acepta como nombre de carpeta. */
const LOTE_ID_RE = /^[A-Za-z0-9_-]{1,150}$/;

export default function OQCTab({ token }: Props) {
  const [sku, setSku] = useState('');
  const [producto, setProducto] = useState<ProductoItem | null>(null);
  const [notas, setNotas] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [loteId, setLoteId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [ultimaInspeccionId, setUltimaInspeccionId] = useState<string | null>(null);

  const loteIdValido = LOTE_ID_RE.test(loteId.trim());

  const buscarProducto = async () => {
    if (!sku.trim()) return;
    setLoading(true);
    setError('');
    try {
      setProducto(await getProducto(sku.trim()));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const enviarInspeccion = async (payload: EvaluacionPayload) => {
    if (!producto) return;
    setLoading(true);
    setError('');
    try {
      const res = await registrarInspeccion(token, {
        lote_id: loteId.trim() || undefined,
        sku_producto: producto.sku,
        nombre_producto: producto.descripcion,
        tipo_inspeccion: 'OQC',
        resultado_final: payload.resultado_final,
        resultados_puntos: [],
        respuestas: payload.respuestas,
        fotos: payload.fotos,
        cantidad_inspeccionada: parseInt(cantidad) || 0,
        notas: notas || undefined,
      });
      setUltimaInspeccionId(res.inspeccion_id);
      setSuccess(`Inspección OQC ${res.inspeccion_id} — ${payload.resultado_final}`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const reiniciar = () => {
    setSku('');
    setProducto(null);
    setNotas('');
    setCantidad('');
    setLoteId('');
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
        <h2 className="text-2xl font-bold flex items-center gap-2"><IconOQC size={24} className="text-[var(--accent)]" aria-hidden /> Inspección OQC</h2>
        <p className="text-gray-300 text-sm mt-1">Inspección de salida — Producto final</p>
      </div>

      {!producto && (
        <div className="bg-gray-900 rounded-xl border border-indigo-500/30 p-6">
          <label className="block text-sm font-semibold text-gray-300 mb-2">SKU del Producto Final</label>
          <div className="flex gap-3">
            <input
              value={sku}
              onChange={(e) => setSku(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && buscarProducto()}
              placeholder="Ingrese el SKU..."
              className="flex-1 bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-white
                         placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
            <Button
              size="lg"
              onClick={buscarProducto}
              disabled={loading || !sku.trim()}
              leftIcon={loading ? IconPendiente : IconBuscar}
            >
              Buscar
            </Button>
          </div>
        </div>
      )}

      {producto && (
        <>
          <div className="bg-gray-900 rounded-xl border border-gray-700 p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <p className="text-sm text-gray-400">Número de parte</p>
                <p className="font-mono text-white">{producto.sku}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Descripción</p>
                <p className="text-white">{producto.descripcion}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400">Tipo</p>
                <p className="text-white">{producto.tipo}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-1">Lote ID</label>
              <input
                value={loteId}
                onChange={(e) => setLoteId(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white
                           placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                placeholder="ID del lote..."
              />
              <p className="text-xs text-gray-500 mt-1">
                {loteId.trim() && !loteIdValido
                  ? <span className="text-amber-400">Solo letras, números, guiones y guiones bajos.</span>
                  : 'Requerido para poder adjuntar evidencia fotográfica.'}
              </p>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-300 mb-1">Cantidad Inspeccionada</label>
              <input
                type="number"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white
                           placeholder-gray-500 focus:outline-none focus:border-indigo-500"
                placeholder="0"
              />
            </div>
          </div>

          <div className="bg-gray-900 rounded-xl border border-gray-700 p-6">
            <Button variant="secondary" onClick={reiniciar}>Reiniciar</Button>
          </div>

          {/* Ayudas visuales + preguntas + notas + evidencia */}
          <InspeccionEvaluacion
            token={token}
            sku={producto.sku}
            loteId={loteIdValido ? loteId.trim() : undefined}
            onRegistrar={enviarInspeccion}
            guardando={loading}
            notas={notas}
            onNotasChange={setNotas}
          />
        </>
      )}
    </div>
  );
}