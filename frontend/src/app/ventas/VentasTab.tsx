// frontend/src/app/ventas/VentasTab.tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getOrdenesVenta, crearOrdenVenta, actualizarOrdenVenta, enviarOrdenVenta,
  getOrdenVenta, cambiarEstadoOV, getPlanesVentas, getPlanVentas,
  autorizarVentasMasivo, ESTADO_COLORS,
} from '@/lib/api';
import type { OrdenVenta, PlanVentasSemana, DiaSemana } from '@/types';
import { calcularDIF } from '@/types';

interface Props { token: string }

const ESTADO_OPTIONS = ['Todos', 'Pendiente de Envío', 'En Preparación', 'Lista para Carga', 'Stock Insuficiente', 'Enviado', 'Embarque Parcial', 'Devolución Parcial', 'Cancelada'];
const DIAS_ORDEN: DiaSemana[] = ['VIERNES', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES'];
const LABEL_DIA: Record<DiaSemana, string> = { VIERNES: 'Vie', LUNES: 'Lun', MARTES: 'Mar', MIERCOLES: 'Mié', JUEVES: 'Jue', SABADO: 'Sáb' };

const ESTADOS_CANCELABLES = new Set(['Pendiente de Envío', 'Stock Insuficiente', 'En Preparación', 'Lista para Carga']);

type ItemForm = { sku_producto: string; nombre_producto: string; cantidad: string; precio_unitario: string };

export default function VentasTab({ token }: Props) {
  const [ordenes, setOrdenes] = useState<OrdenVenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('Todos');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editOV, setEditOV] = useState<OrdenVenta | null>(null);
  const [showDetalleModal, setShowDetalleModal] = useState(false);
  const [ordenDetalle, setOrdenDetalle] = useState<any>(null);
  const [deletingOV, setDeletingOV] = useState<OrdenVenta | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Recomendaciones
  const [planActivo, setPlanActivo] = useState<PlanVentasSemana | null>(null);
  const [showRecomendaciones, setShowRecomendaciones] = useState(false);
  const [cantidadesEdit, setCantidadesEdit] = useState<Record<string, number>>({});
  const [seleccionadas, setSeleccionadas] = useState<Set<string>>(new Set());
  const [autorizando, setAutorizando] = useState(false);

  // Form crear/editar OV
  const [formClienteId, setFormClienteId] = useState('');
  const [formClienteNombre, setFormClienteNombre] = useState('');
  const [formNotas, setFormNotas] = useState('');
  const [formItems, setFormItems] = useState<ItemForm[]>([{ sku_producto: '', nombre_producto: '', cantidad: '', precio_unitario: '' }]);
  const [saving, setSaving] = useState(false);

  const fetchOrdenes = useCallback(async () => {
    try {
      setLoading(true);
      const estado = filtroEstado === 'Todos' ? undefined : filtroEstado;
      const [ovs, planes] = await Promise.all([
        getOrdenesVenta(token, estado),
        getPlanesVentas(token).catch(() => [] as PlanVentasSemana[]),
      ]);
      setOrdenes(ovs);
      if (planes.length > 0) {
        const semana = planes[0].identificador_semana;
        const plan = await getPlanVentas(token, semana).catch(() => null);
        setPlanActivo(plan);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, filtroEstado]);

  useEffect(() => { fetchOrdenes(); }, [fetchOrdenes]);

  const clearMessages = () => { setError(''); setSuccess(''); };

  // ── Recomendaciones ──────────────────────────────────────────────────────
  const pendientes = planActivo?.items.flatMap(item =>
    DIAS_ORDEN.filter(dia => {
      const d = item.dias[dia];
      return d && d.plan > 0 && d.status !== 'Autorizado';
    }).map(dia => ({ item, dia, key: `${item.sku}|${dia}` }))
  ) ?? [];

  const handleToggleSeleccion = (key: string) => {
    setSeleccionadas(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const handleSeleccionarTodo = () => {
    if (seleccionadas.size === pendientes.length) {
      setSeleccionadas(new Set());
    } else {
      setSeleccionadas(new Set(pendientes.map(p => p.key)));
    }
  };

  const handleAutorizar = async () => {
    if (!planActivo || seleccionadas.size === 0) return;
    const ventas = pendientes
      .filter(p => seleccionadas.has(p.key))
      .map(({ item, dia }) => ({
        sku: item.sku,
        dia,
        cantidad: cantidadesEdit[`${item.sku}|${dia}`] ?? item.dias[dia]!.plan,
      }));

    setAutorizando(true);
    clearMessages();
    try {
      const res = await autorizarVentasMasivo(token, {
        identificador_semana: planActivo.identificador_semana,
        ventas,
      });
      setSuccess(`${res.resultados.length} órdenes de venta generadas desde el plan`);
      setSeleccionadas(new Set());
      setCantidadesEdit({});
      await fetchOrdenes();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setAutorizando(false);
    }
  };

  // ── Crear / Editar OV ────────────────────────────────────────────────────
  const resetForm = () => {
    setFormClienteId('');
    setFormClienteNombre('');
    setFormNotas('');
    setFormItems([{ sku_producto: '', nombre_producto: '', cantidad: '', precio_unitario: '' }]);
    setEditOV(null);
  };

  const openCreateModal = () => {
    resetForm();
    setShowCreateModal(true);
  };

  const openEditModal = (ov: OrdenVenta) => {
    setEditOV(ov);
    setFormClienteId(ov.cliente_id);
    setFormClienteNombre(ov.nombre_cliente || '');
    setFormNotas(ov.notas || '');
    setFormItems(
      ov.items?.map(i => ({
        sku_producto: i.sku_producto,
        nombre_producto: i.nombre_producto || '',
        cantidad: String(i.cantidad),
        precio_unitario: String(i.precio_unitario),
      })) || [{ sku_producto: '', nombre_producto: '', cantidad: '', precio_unitario: '' }]
    );
    setShowCreateModal(true);
  };

  const handleGuardar = async () => {
    clearMessages();
    const items = formItems
      .filter(i => i.sku_producto.trim())
      .map(i => ({
        sku_producto: i.sku_producto.trim().toUpperCase(),
        nombre_producto: i.nombre_producto.trim(),
        cantidad: parseFloat(i.cantidad) || 0,
        precio_unitario: parseFloat(i.precio_unitario) || 0,
      }));

    if (!formClienteId.trim() || items.length === 0) {
      setError('Complete cliente y al menos un item');
      return;
    }
    setSaving(true);
    try {
      if (editOV) {
        await actualizarOrdenVenta(token, editOV.ov_id, {
          nombre_cliente: formClienteNombre.trim() || undefined,
          notas: formNotas || undefined,
        });
        setSuccess(`Orden ${editOV.ov_id} actualizada`);
      } else {
        await crearOrdenVenta(token, {
          cliente_id: formClienteId.trim(),
          nombre_cliente: formClienteNombre.trim() || undefined,
          items,
          notas: formNotas || undefined,
        });
        setSuccess('Orden de venta creada exitosamente');
      }
      setShowCreateModal(false);
      resetForm();
      fetchOrdenes();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
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

  const handleImprimir = (ov: OrdenVenta) => {
    setSuccess(`PDF de ${ov.ov_id} en desarrollo — próximamente disponible`);
  };

  const handleConfirmarEliminar = async () => {
    if (!deletingOV) return;
    clearMessages();
    try {
      await cambiarEstadoOV(token, deletingOV.ov_id, 'Cancelada', 'Cancelada por usuario');
      setSuccess(`Orden ${deletingOV.ov_id} cancelada`);
      setDeletingOV(null);
      fetchOrdenes();
    } catch (err: any) {
      setError(err.message);
      setDeletingOV(null);
    }
  };

  const addItem = () => setFormItems([...formItems, { sku_producto: '', nombre_producto: '', cantidad: '', precio_unitario: '' }]);
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

      {/* Panel de Recomendaciones */}
      {pendientes.length > 0 && (
        <div className="bg-amber-900/20 border border-amber-600/40 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowRecomendaciones(p => !p)}
            className="w-full px-5 py-3 flex items-center justify-between text-left hover:bg-amber-900/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-amber-400 text-lg">💡</span>
              <span className="font-semibold text-amber-300">Recomendaciones del Plan de Ventas</span>
              <span className="bg-amber-500 text-black text-xs font-bold px-2 py-0.5 rounded-full">{pendientes.length}</span>
              <span className="text-xs text-amber-500">ordenes pendientes de autorizar</span>
            </div>
            <span className="text-amber-400 text-sm">{showRecomendaciones ? '▲ Ocultar' : '▼ Ver'}</span>
          </button>

          {showRecomendaciones && (
            <div className="p-4 border-t border-amber-600/30">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSeleccionarTodo}
                    className="text-xs text-amber-400 hover:text-amber-300 underline"
                  >
                    {seleccionadas.size === pendientes.length ? 'Desmarcar todo' : 'Seleccionar todo'}
                  </button>
                  {seleccionadas.size > 0 && (
                    <span className="text-xs text-gray-400">({seleccionadas.size} seleccionadas)</span>
                  )}
                </div>
                <button
                  onClick={handleAutorizar}
                  disabled={seleccionadas.size === 0 || autorizando}
                  className="bg-amber-600 hover:bg-amber-700 disabled:opacity-40 px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors"
                >
                  {autorizando ? 'Generando...' : `✓ Aceptar seleccionadas (${seleccionadas.size})`}
                </button>
              </div>

              <div className="overflow-x-auto rounded-lg border border-amber-600/20">
                <table className="w-full text-xs">
                  <thead className="bg-amber-900/30">
                    <tr>
                      <th className="px-3 py-2 text-amber-400 font-medium text-left w-8"></th>
                      <th className="px-3 py-2 text-amber-400 font-medium text-left">SKU</th>
                      <th className="px-3 py-2 text-amber-400 font-medium text-left">Descripción</th>
                      <th className="px-3 py-2 text-amber-400 font-medium text-center">Día</th>
                      <th className="px-3 py-2 text-amber-400 font-medium text-right">Cantidad Plan</th>
                      <th className="px-3 py-2 text-amber-400 font-medium text-right">DIF</th>
                      <th className="px-3 py-2 text-amber-400 font-medium text-center">Cantidad a Generar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-900/30">
                    {pendientes.map(({ item, dia, key }) => {
                      const dif = calcularDIF(item, dia);
                      const difColor = dif >= 0 ? 'text-green-400' : 'text-red-400';
                      const cantEdit = cantidadesEdit[key] ?? item.dias[dia]!.plan;
                      return (
                        <tr key={key} className={`hover:bg-amber-900/20 transition-colors ${seleccionadas.has(key) ? 'bg-amber-900/20' : ''}`}>
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={seleccionadas.has(key)}
                              onChange={() => handleToggleSeleccion(key)}
                              className="accent-amber-500"
                            />
                          </td>
                          <td className="px-3 py-2 font-mono text-blue-400">{item.sku}</td>
                          <td className="px-3 py-2 text-gray-300 max-w-[180px] truncate">{item.descripcion}</td>
                          <td className="px-3 py-2 text-center text-gray-300">{LABEL_DIA[dia]}</td>
                          <td className="px-3 py-2 text-right text-white font-medium">{item.dias[dia]!.plan.toLocaleString()}</td>
                          <td className={`px-3 py-2 text-right font-mono font-medium ${difColor}`}>{dif > 0 ? '+' : ''}{dif.toLocaleString()}</td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="number"
                              value={cantEdit}
                              onChange={e => setCantidadesEdit(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                              className="w-24 text-center text-sm bg-gray-800 border border-amber-600/40 rounded px-1 py-0.5 text-white focus:border-amber-400 focus:outline-none"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
            {ESTADO_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchOrdenes} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors">
            🔄 Refrescar
          </button>
          <button
            onClick={openCreateModal}
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
                        {/* Ver detalle */}
                        <button
                          onClick={() => handleVerDetalle(ov.ov_id)}
                          className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 px-2 py-1 rounded text-xs transition-colors"
                          title="Ver detalle"
                        >
                          👁️
                        </button>
                        {/* Editar */}
                        <button
                          onClick={() => openEditModal(ov)}
                          className="bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 px-2 py-1 rounded text-xs transition-colors"
                          title="Editar orden"
                        >
                          ✏️
                        </button>
                        {/* Imprimir PDF */}
                        <button
                          onClick={() => handleImprimir(ov)}
                          className="bg-violet-600/20 hover:bg-violet-600/40 text-violet-400 px-2 py-1 rounded text-xs transition-colors"
                          title="Imprimir PDF"
                        >
                          🖨️
                        </button>
                        {/* Eliminar (cancelar) — solo en estados no terminales */}
                        {ESTADOS_CANCELABLES.has(ov.estado) && (
                          <button
                            onClick={() => setDeletingOV(ov)}
                            className="bg-red-600/20 hover:bg-red-600/40 text-red-400 px-2 py-1 rounded text-xs transition-colors"
                            title="Cancelar orden"
                          >
                            🗑️
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

      {/* ── Modal: Crear / Editar OV ── */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">{editOV ? `✏️ Editar OV: ${editOV.ov_id}` : '➕ Nueva Orden de Venta'}</h3>
              <button onClick={() => { setShowCreateModal(false); resetForm(); }} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">ID Cliente *</label>
                  <input
                    type="text"
                    value={formClienteId}
                    onChange={(e) => setFormClienteId(e.target.value)}
                    disabled={!!editOV}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none disabled:opacity-50"
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

              {!editOV && (
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
                            <input type="text" value={item.sku_producto} onChange={(e) => updateItem(idx, 'sku_producto', e.target.value)}
                              className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none" />
                          </div>
                          <div className="col-span-4">
                            <label className="block text-xs text-gray-500 mb-1">Nombre</label>
                            <input type="text" value={item.nombre_producto} onChange={(e) => updateItem(idx, 'nombre_producto', e.target.value)}
                              className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none" />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs text-gray-500 mb-1">Cantidad *</label>
                            <input type="text" value={item.cantidad} onChange={(e) => updateItem(idx, 'cantidad', e.target.value)}
                              className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none" />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-xs text-gray-500 mb-1">Precio</label>
                            <input type="text" value={item.precio_unitario} onChange={(e) => updateItem(idx, 'precio_unitario', e.target.value)}
                              className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none" />
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
              )}
            </div>

            <div className="p-6 border-t border-gray-800 flex justify-end gap-3">
              <button onClick={() => { setShowCreateModal(false); resetForm(); }} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors">
                Cancelar
              </button>
              <button onClick={handleGuardar} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-6 py-2 rounded-lg text-sm font-medium transition-colors">
                {saving ? 'Guardando...' : editOV ? '✅ Guardar Cambios' : '✅ Crear OV'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Detalle OV ── */}
      {showDetalleModal && ordenDetalle && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">📋 Detalle: <span className="text-blue-400">{ordenDetalle.ov_id}</span></h3>
              <button onClick={() => setShowDetalleModal(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-6 space-y-6">
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

      {/* ── Modal: Confirmar Cancelar OV ── */}
      {deletingOV && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-red-800 w-full max-w-md">
            <div className="p-6 border-b border-gray-800">
              <h3 className="text-lg font-bold text-red-400">🗑️ Cancelar Orden de Venta</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-red-900/20 border border-red-600/40 rounded-lg p-4">
                <p className="text-sm text-red-300 mb-3">¿Confirmas que deseas cancelar esta orden?</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">OV ID:</span>
                    <span className="font-mono text-blue-400">{deletingOV.ov_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Cliente:</span>
                    <span className="text-white">{deletingOV.nombre_cliente || deletingOV.cliente_id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Estado actual:</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${ESTADO_COLORS[deletingOV.estado] || ''}`}>{deletingOV.estado}</span>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500">La orden cambiará a estado "Cancelada" y se conservará en el historial.</p>
            </div>
            <div className="p-6 border-t border-gray-800 flex justify-end gap-3">
              <button onClick={() => setDeletingOV(null)} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors">
                No cancelar
              </button>
              <button onClick={handleConfirmarEliminar} className="bg-red-700 hover:bg-red-800 px-6 py-2 rounded-lg text-sm font-medium transition-colors">
                🗑️ Sí, cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
