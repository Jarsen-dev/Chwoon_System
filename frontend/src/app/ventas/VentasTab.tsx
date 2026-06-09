// frontend/src/app/finanzas/VentasTab.tsx

'use client';

import { useState, useEffect, useCallback } from 'react';
import { getOrdenesVenta, crearOrdenVenta, enviarOrdenVenta, getOrdenVenta, ESTADO_COLORS } from '@/lib/api';
import type { OrdenVenta } from '@/types';

interface Props {
  token: string;
}

const ESTADO_OPTIONS = ['Todos', 'Pendiente de Envío', 'En Preparación', 'Lista para Carga', 'Stock Insuficiente', 'Enviado', 'Embarque Parcial', 'Devolución Parcial', 'Cancelada'];

export default function VentasTab({ token }: Props) {
  const [ordenes, setOrdenes] = useState<OrdenVenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('Todos');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetalleModal, setShowDetalleModal] = useState(false);
  const [ordenDetalle, setOrdenDetalle] = useState<any>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form: Crear OV
  const [formClienteId, setFormClienteId] = useState('');
  const [formClienteNombre, setFormClienteNombre] = useState('');
  const [formNotas, setFormNotas] = useState('');
  const [formItems, setFormItems] = useState<
    { sku_producto: string; nombre_producto: string; cantidad: string; precio_unitario: string }[]
  >([{ sku_producto: '', nombre_producto: '', cantidad: '', precio_unitario: '' }]);

  const fetchOrdenes = useCallback(async () => {
    try {
      setLoading(true);
      const estado = filtroEstado === 'Todos' ? undefined : filtroEstado;
      const res = await getOrdenesVenta(token, estado);
      setOrdenes(res);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, filtroEstado]);

  useEffect(() => {
    fetchOrdenes();
  }, [fetchOrdenes]);

  const clearMessages = () => { setError(''); setSuccess(''); };

  const handleCrear = async () => {
    clearMessages();
    try {
      const items = formItems
        .filter((i) => i.sku_producto.trim())
        .map((i) => ({
          sku_producto: i.sku_producto.trim().toUpperCase(),
          nombre_producto: i.nombre_producto.trim(),
          cantidad: parseFloat(i.cantidad) || 0,
          precio_unitario: parseFloat(i.precio_unitario) || 0,
        }));

      if (!formClienteId.trim() || items.length === 0) {
        setError('Complete cliente y al menos un item');
        return;
      }

      await crearOrdenVenta(token, {
        cliente_id: formClienteId.trim(),
        nombre_cliente: formClienteNombre.trim() || undefined,
        items,
        notas: formNotas || undefined,
      });

      setSuccess('Orden de venta creada exitosamente');
      setShowCreateModal(false);
      resetForm();
      fetchOrdenes();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const resetForm = () => {
    setFormClienteId('');
    setFormClienteNombre('');
    setFormNotas('');
    setFormItems([{ sku_producto: '', nombre_producto: '', cantidad: '', precio_unitario: '' }]);
  };

  const handleEnviar = async (ovId: string) => {
    if (!confirm(`¿Confirmar envío de la orden ${ovId}?`)) return;
    clearMessages();
    try {
      await enviarOrdenVenta(token, ovId);
      setSuccess(`Orden ${ovId} enviada correctamente`);
      fetchOrdenes();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleVerDetalle = async (ovId: string) => {
    try {
      const res = await getOrdenVenta(token, ovId);
      setOrdenDetalle(res);
      setShowDetalleModal(true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const addItem = () =>
    setFormItems([...formItems, { sku_producto: '', nombre_producto: '', cantidad: '', precio_unitario: '' }]);
  const removeItem = (idx: number) => setFormItems(formItems.filter((_, i) => i !== idx));
  const updateItem = (idx: number, field: string, value: string) => {
    const updated = [...formItems];
    (updated[idx] as any)[field] = value;
    setFormItems(updated);
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val);

  return (
    <div className="space-y-4">
      {/* Messages */}
      {error && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-lg px-4 py-3 text-red-400 flex justify-between">
          <span>❌ {error}</span>
          <button onClick={() => setError('')} className="text-red-300 hover:text-white">✕</button>
        </div>
      )}
      {success && (
        <div className="bg-green-900/30 border border-green-500/50 rounded-lg px-4 py-3 text-green-400 flex justify-between">
          <span>✅ {success}</span>
          <button onClick={() => setSuccess('')} className="text-green-300 hover:text-white">✕</button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold">💵 Órdenes de Venta</h2>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
          >
            {ESTADO_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchOrdenes} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors">
            🔄 Refrescar
          </button>
          <button
            onClick={() => { resetForm(); setShowCreateModal(true); }}
            className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            ➕ Nueva OV
          </button>
        </div>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-400" />
        </div>
      ) : ordenes.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
          <p className="text-4xl mb-3">📋</p>
          <p className="text-gray-400">No hay órdenes de venta</p>
        </div>
      ) : (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">OV ID</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">Cliente</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">Estado</th>
                  <th className="px-4 py-3 text-right text-gray-400 font-medium">Items</th>
                  <th className="px-4 py-3 text-right text-gray-400 font-medium">Valor Total</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">Fecha</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">Creado por</th>
                  <th className="px-4 py-3 text-center text-gray-400 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {ordenes.map((ov) => (
                  <tr key={ov.ov_id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-blue-400">{ov.ov_id}</td>
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-white">{ov.nombre_cliente || ov.cliente_id}</p>
                        {ov.nombre_cliente && <p className="text-xs text-gray-500">{ov.cliente_id}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${ESTADO_COLORS[ov.estado] || 'bg-gray-500/20 text-gray-400'}`}>
                        {ov.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">{ov.total_items}</td>
                    <td className="px-4 py-3 text-right text-gray-300">{formatCurrency(ov.valor_total)}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(ov.fecha_creacion)}</td>
                    <td className="px-4 py-3 text-gray-400">{ov.creado_por || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-1">
                        <button
                          onClick={() => handleVerDetalle(ov.ov_id)}
                          className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 px-2 py-1 rounded text-xs transition-colors"
                          title="Ver detalle"
                        >
                          👁️
                        </button>
                        {ov.estado === 'Pendiente de Envío' && (
                          <button
                            onClick={() => handleEnviar(ov.ov_id)}
                            className="bg-green-600/20 hover:bg-green-600/40 text-green-400 px-2 py-1 rounded text-xs transition-colors"
                            title="Enviar"
                          >
                            🚚
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* Modal: Crear Orden de Venta                  */}
      {/* ============================================ */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">➕ Nueva Orden de Venta</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">ID Cliente *</label>
                  <input
                    type="text"
                    value={formClienteId}
                    onChange={(e) => setFormClienteId(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    placeholder="CLI-001"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Nombre Cliente</label>
                  <input
                    type="text"
                    value={formClienteNombre}
                    onChange={(e) => setFormClienteNombre(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    placeholder="Cliente S.A. de C.V."
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Notas (opcional)</label>
                <textarea
                  value={formNotas}
                  onChange={(e) => setFormNotas(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  rows={2}
                />
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-gray-300">Productos *</label>
                  <button onClick={addItem} className="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 px-3 py-1 rounded-lg text-xs transition-colors">
                    + Agregar
                  </button>
                </div>
                <div className="space-y-3">
                  {formItems.map((item, idx) => (
                    <div key={idx} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                      <div className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-3">
                          <label className="block text-xs text-gray-500 mb-1">SKU *</label>
                          <input
                            type="text"
                            value={item.sku_producto}
                            onChange={(e) => updateItem(idx, 'sku_producto', e.target.value)}
                            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                          />
                        </div>
                        <div className="col-span-4">
                          <label className="block text-xs text-gray-500 mb-1">Nombre</label>
                          <input
                            type="text"
                            value={item.nombre_producto}
                            onChange={(e) => updateItem(idx, 'nombre_producto', e.target.value)}
                            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-500 mb-1">Cantidad *</label>
                          <input
                            type="text"
                            value={item.cantidad}
                            onChange={(e) => updateItem(idx, 'cantidad', e.target.value)}
                            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-500 mb-1">Precio</label>
                          <input
                            type="text"
                            value={item.precio_unitario}
                            onChange={(e) => updateItem(idx, 'precio_unitario', e.target.value)}
                            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none"
                          />
                        </div>
                        <div className="col-span-1 flex justify-center">
                          {formItems.length > 1 && (
                            <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-300 text-lg">🗑️</button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-800 flex justify-end gap-3">
              <button onClick={() => setShowCreateModal(false)} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors">
                Cancelar
              </button>
              <button onClick={handleCrear} className="bg-emerald-600 hover:bg-emerald-700 px-6 py-2 rounded-lg text-sm font-medium transition-colors">
                ✅ Crear OV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* Modal: Detalle de OV                         */}
      {/* ============================================ */}
      {showDetalleModal && ordenDetalle && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">
                📋 Detalle: <span className="text-blue-400">{ordenDetalle.ov_id}</span>
              </h3>
              <button onClick={() => setShowDetalleModal(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-6 space-y-6">
              {/* Info general */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                  <p className="text-xs text-gray-500">Cliente</p>
                  <p className="text-sm font-medium">{ordenDetalle.nombre_cliente || ordenDetalle.cliente_id}</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                  <p className="text-xs text-gray-500">Estado</p>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium border ${ESTADO_COLORS[ordenDetalle.estado] || ''}`}>
                    {ordenDetalle.estado}
                  </span>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                  <p className="text-xs text-gray-500">Fecha</p>
                  <p className="text-sm">{formatDate(ordenDetalle.fecha_creacion)}</p>
                </div>
              </div>

              {/* Items */}
              <div>
                <h4 className="text-sm font-semibold text-gray-400 mb-2">📦 Productos</h4>
                <div className="bg-gray-800/30 rounded-lg border border-gray-700 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-800">
                      <tr>
                        <th className="px-4 py-2 text-left text-gray-400 text-xs">SKU</th>
                        <th className="px-4 py-2 text-left text-gray-400 text-xs">Nombre</th>
                        <th className="px-4 py-2 text-right text-gray-400 text-xs">Cantidad</th>
                        <th className="px-4 py-2 text-right text-gray-400 text-xs">Enviada</th>
                        <th className="px-4 py-2 text-right text-gray-400 text-xs">Precio Unit.</th>
                        <th className="px-4 py-2 text-right text-gray-400 text-xs">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {ordenDetalle.items.map((item: any, idx: number) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 font-mono text-blue-400">{item.sku_producto}</td>
                          <td className="px-4 py-2">{item.nombre_producto || '—'}</td>
                          <td className="px-4 py-2 text-right">{item.cantidad}</td>
                          <td className="px-4 py-2 text-right">{item.cantidad_enviada}</td>
                          <td className="px-4 py-2 text-right">{formatCurrency(item.precio_unitario)}</td>
                          <td className="px-4 py-2 text-right font-medium">{formatCurrency(item.cantidad * item.precio_unitario)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Envíos */}
              {ordenDetalle.envios && ordenDetalle.envios.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-400 mb-2">🚚 Historial de Envíos</h4>
                  <div className="space-y-2">
                    {ordenDetalle.envios.map((envio: any) => (
                      <div key={envio.envio_id} className="bg-gray-800/30 rounded-lg p-3 border border-gray-700">
                        <div className="flex justify-between items-center">
                          <div>
                            <p className="text-sm font-mono text-green-400">{envio.envio_id}</p>
                            <p className="text-xs text-gray-400">Autorizado por: {envio.autorizado_por || 'N/A'}</p>
                          </div>
                          <p className="text-xs text-gray-500">{formatDate(envio.fecha_envio)}</p>
                        </div>
                        {envio.items_enviados && (
                          <div className="mt-2 flex gap-2 flex-wrap">
                            {envio.items_enviados.map((ie: any, i: number) => (
                              <span key={i} className="bg-green-900/30 text-green-400 px-2 py-1 rounded text-xs">
                                {ie.sku_producto}: {ie.cantidad}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-800 flex justify-end">
              <button onClick={() => setShowDetalleModal(false)} className="bg-gray-700 hover:bg-gray-600 px-6 py-2 rounded-lg text-sm transition-colors">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}