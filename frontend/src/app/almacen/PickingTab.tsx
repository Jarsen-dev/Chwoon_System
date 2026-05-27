'use client';

import { useState, useEffect } from 'react';
import { getPickings, crearPicking, confirmarLotePicking, completarPicking, cancelarPicking } from '@/lib/api';

interface Props { token: string; }

export default function PickingTab({ token }: Props) {
  const [pickings, setPickings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notif, setNotif] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);
  const [showCrear, setShowCrear] = useState(false);
  const [form, setForm] = useState({ tipo_origen: 'OV', origen_id: '', cliente_id: '', zona_staging: '', sku: '', cantidad: '' });
  const [detalle, setDetalle] = useState<any>(null);

  const mostrar = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setNotif({ msg, tipo }); setTimeout(() => setNotif(null), 4000); };

  const cargar = async () => {
    try { setLoading(true); const d = await getPickings(token); setPickings(d); } catch (e: any) { mostrar(e.message, 'err'); } finally { setLoading(false); }
  };

  useEffect(() => { cargar(); }, []);

  const handleCrear = async () => {
    try {
      await crearPicking(token, {
        tipo_origen: form.tipo_origen,
        origen_id: form.origen_id,
        cliente_id: form.cliente_id || undefined,
        zona_staging: form.zona_staging || undefined,
        items: [{ sku: form.sku, cantidad_requerida: parseFloat(form.cantidad) }],
      });
      mostrar('Picking creado');
      setShowCrear(false);
      setForm({ tipo_origen: 'OV', origen_id: '', cliente_id: '', zona_staging: '', sku: '', cantidad: '' });
      cargar();
    } catch (e: any) { mostrar(e.message, 'err'); }
  };

  const handleConfirmar = async (pickingId: string, sku: string, loteId: string, cantidad: number) => {
    try {
      await confirmarLotePicking(token, pickingId, { sku, lote_id: loteId, cantidad_confirmada: cantidad });
      mostrar('Lote confirmado');
      cargar();
    } catch (e: any) { mostrar(e.message, 'err'); }
  };

  const statusBadge = (s: string) => {
    const c: Record<string, string> = { 'Pendiente': 'bg-yellow-500/20 text-yellow-400', 'En Picking': 'bg-blue-500/20 text-blue-400', 'Completado': 'bg-green-500/20 text-green-400', 'Cancelado': 'bg-red-500/20 text-red-400' };
    return c[s] || 'bg-gray-500/20 text-gray-400';
  };

  return (
    <div className="space-y-4">
      {notif && <div className={`p-3 rounded-lg text-sm font-medium ${notif.tipo === 'ok' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{notif.msg}</div>}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">🛒 Picking</h2>
        <button onClick={() => setShowCrear(true)} className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded-lg text-sm font-medium">➕ Crear Picking</button>
      </div>

      {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-400" /></div> : (
        <div className="space-y-3">
          {pickings.map((p: any) => (
            <div key={p.picking_id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <span className="font-mono text-orange-400 text-sm">{p.picking_id}</span>
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${statusBadge(p.status)}`}>{p.status}</span>
                </div>
                <div className="flex gap-2">
                  {p.status === 'Pendiente' && <button onClick={() => setDetalle(p)} className="bg-blue-600/20 text-blue-400 px-2 py-1 rounded text-xs">Ver</button>}
                  {p.status === 'En Picking' && <button onClick={() => completarPicking(token, p.picking_id).then(() => { mostrar('Completado'); cargar(); }).catch((e: any) => mostrar(e.message, 'err'))} className="bg-green-600/20 text-green-400 px-2 py-1 rounded text-xs">Completar</button>}
                  {(p.status === 'Pendiente' || p.status === 'En Picking') && <button onClick={() => cancelarPicking(token, p.picking_id).then(() => { mostrar('Cancelado'); cargar(); }).catch((e: any) => mostrar(e.message, 'err'))} className="bg-red-600/20 text-red-400 px-2 py-1 rounded text-xs">Cancelar</button>}
                </div>
              </div>
              <div className="text-sm text-gray-400">Origen: {p.tipo_origen} {p.origen_id} {p.cliente_id ? `| Cliente: ${p.cliente_id}` : ''}</div>
              {p.items?.map((item: any, idx: number) => (
                <div key={idx} className="mt-2 bg-gray-800/50 rounded-lg p-2 text-sm">
                  <div className="flex justify-between">
                    <span className="font-mono text-white">{item.sku}</span>
                    <span className="text-gray-400">{item.cantidad_picking || 0} / {item.cantidad_requerida}</span>
                  </div>
                  {item.lotes_asignados?.map((la: any, i: number) => (
                    <div key={i} className="flex justify-between items-center mt-1 text-xs">
                      <span className="text-gray-500">{la.lote_id} ({la.ubicacion})</span>
                      {la.confirmado ? <span className="text-green-400">✅</span> : (
                        p.status !== 'Completado' && p.status !== 'Cancelado' &&
                        <button onClick={() => handleConfirmar(p.picking_id, item.sku, la.lote_id, la.cantidad)} className="bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded">Confirmar</button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
          {pickings.length === 0 && <p className="text-center text-gray-500 py-8">Sin órdenes de picking</p>}
        </div>
      )}

      {showCrear && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowCrear(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">Crear Picking</h3>
            <div className="space-y-3">
              <select value={form.tipo_origen} onChange={e => setForm(f => ({ ...f, tipo_origen: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white">
                <option value="OV">Orden de Venta (OV)</option>
                <option value="OP">Orden de Producción (OP)</option>
                <option value="TRASLADO">Traslado</option>
              </select>
              <input value={form.origen_id} onChange={e => setForm(f => ({ ...f, origen_id: e.target.value }))} placeholder="ID Origen" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white" />
              <input value={form.cliente_id} onChange={e => setForm(f => ({ ...f, cliente_id: e.target.value }))} placeholder="Cliente ID (opcional)" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white" />
              <input value={form.zona_staging} onChange={e => setForm(f => ({ ...f, zona_staging: e.target.value }))} placeholder="Zona Staging (opcional)" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white" />
              <input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="SKU" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white" />
              <input type="number" value={form.cantidad} onChange={e => setForm(f => ({ ...f, cantidad: e.target.value }))} placeholder="Cantidad" className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white" />
            </div>
            <div className="flex gap-3 pt-4">
              <button onClick={handleCrear} className="flex-1 bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded-lg text-sm font-medium">Crear</button>
              <button onClick={() => setShowCrear(false)} className="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
