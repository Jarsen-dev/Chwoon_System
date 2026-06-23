'use client';

import { useState, useEffect } from 'react';
import { getConteos, crearConteo, registrarConteo, aprobarConteo } from '@/lib/api';
import { Button, Modal, LoadingSpinner } from '@/components/ui';
import { IconConteo, IconNuevo } from '@/lib/icons';

interface Props { token: string; }

export default function ConteoFisicoTab({ token }: Props) {
  const [conteos, setConteos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notif, setNotif] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);
  const [showCrear, setShowCrear] = useState(false);
  const [zona, setZona] = useState('');
  const [selConteo, setSelConteo] = useState<any>(null);
  const [formReg, setFormReg] = useState({ lote_id: '', cantidad_contada: '' });
  const [motivoAprob, setMotivoAprob] = useState('');

  const mostrar = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setNotif({ msg, tipo }); setTimeout(() => setNotif(null), 4000); };

  const cargar = async () => {
    try { setLoading(true); const d = await getConteos(token); setConteos(d); } catch (e: any) { mostrar(e.message, 'err'); } finally { setLoading(false); }
  };

  useEffect(() => { cargar(); }, []);

  const handleCrear = async () => {
    try { await crearConteo(token, { zona }); mostrar('Conteo creado'); setShowCrear(false); setZona(''); cargar(); }
    catch (e: any) { mostrar(e.message, 'err'); }
  };

  const handleRegistrar = async () => {
    if (!selConteo) return;
    try {
      await registrarConteo(token, selConteo.conteo_id, { lote_id: formReg.lote_id, cantidad_contada: parseFloat(formReg.cantidad_contada) });
      mostrar('Registrado');
      setFormReg({ lote_id: '', cantidad_contada: '' });
      const d = await getConteos(token);
      setConteos(d);
      const updated = d.find((c: any) => c.conteo_id === selConteo.conteo_id);
      if (updated) setSelConteo(updated);
    } catch (e: any) { mostrar(e.message, 'err'); }
  };

  const handleAprobar = async () => {
    if (!selConteo) return;
    try { await aprobarConteo(token, selConteo.conteo_id, { motivo: motivoAprob }); mostrar('Conteo aprobado'); setMotivoAprob(''); cargar(); setSelConteo(null); }
    catch (e: any) { mostrar(e.message, 'err'); }
  };

  const statusBadge = (s: string) => {
    const c: Record<string, string> = { 'En Proceso': 'bg-yellow-500/20 text-yellow-400', 'Aprobado': 'bg-green-500/20 text-green-400' };
    return c[s] || 'bg-gray-500/20 text-gray-400';
  };

  return (
    <div className="space-y-4">
      {notif && <div className={`p-3 rounded-lg text-sm font-medium ${notif.tipo === 'ok' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{notif.msg}</div>}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <IconConteo size={22} className="text-[var(--accent)]" aria-hidden /> Conteo Físico
        </h2>
        <Button leftIcon={IconNuevo} onClick={() => setShowCrear(true)}>Nuevo Conteo</Button>
      </div>

      {loading ? <div className="flex justify-center py-12"><LoadingSpinner sizeClass="h-10 w-10" /></div> : (
        <div className="space-y-3">
          {conteos.map((c: any) => (
            <div key={c.conteo_id} className={`bg-gray-900 border rounded-xl p-4 cursor-pointer ${selConteo?.conteo_id === c.conteo_id ? 'border-orange-500' : 'border-gray-800'}`} onClick={() => setSelConteo(c)}>
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-mono text-orange-400 text-sm">{c.conteo_id}</span>
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${statusBadge(c.status)}`}>{c.status}</span>
                </div>
                <span className="text-xs text-gray-500">{c.zona}</span>
              </div>
              <div className="text-sm text-gray-300 mt-1">Items: {c.items?.length || 0} | Diferencia total: {c.total_diferencia?.toFixed(2) || 0}</div>
            </div>
          ))}
          {conteos.length === 0 && <p className="text-center text-gray-500 py-8">Sin conteos físicos</p>}
        </div>
      )}

      {selConteo && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
          <h3 className="text-lg font-bold mb-3">Detalle: {selConteo.conteo_id}</h3>
          <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 sticky top-0"><tr><th className="text-left p-2 text-gray-300">Lote</th><th className="text-left p-2 text-gray-300">SKU</th><th className="text-right p-2 text-gray-300">Sistema</th><th className="text-right p-2 text-gray-300">Contado</th><th className="text-right p-2 text-gray-300">Dif</th></tr></thead>
              <tbody className="divide-y divide-gray-800">
                {selConteo.items?.map((it: any, i: number) => (
                  <tr key={i} className={it.diferencia !== null && it.diferencia !== 0 ? 'bg-red-900/10' : ''}>
                    <td className="p-2 font-mono text-xs text-orange-400">{it.lote_id}</td>
                    <td className="p-2 font-mono text-xs">{it.sku}</td>
                    <td className="p-2 text-right">{it.cantidad_sistema}</td>
                    <td className="p-2 text-right">{it.cantidad_contada ?? '-'}</td>
                    <td className={`p-2 text-right ${it.diferencia !== null && it.diferencia !== 0 ? 'text-red-400 font-bold' : 'text-gray-300'}`}>{it.diferencia ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selConteo.status === 'En Proceso' && (
            <div className="mt-4 space-y-3">
              <div className="flex gap-2">
                <input value={formReg.lote_id} onChange={e => setFormReg(f => ({ ...f, lote_id: e.target.value }))} placeholder="Lote ID" className="flex-1 font-mono bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                <input type="number" value={formReg.cantidad_contada} onChange={e => setFormReg(f => ({ ...f, cantidad_contada: e.target.value }))} placeholder="Cantidad contada" className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                <Button onClick={handleRegistrar}>Registrar</Button>
              </div>
              <div className="flex gap-2">
                <input value={motivoAprob} onChange={e => setMotivoAprob(e.target.value)} placeholder="Motivo aprobación" className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
                <Button onClick={handleAprobar}>Aprobar Ajuste</Button>
              </div>
            </div>
          )}
        </div>
      )}

      <Modal
        open={showCrear}
        onClose={() => setShowCrear(false)}
        title="Nuevo Conteo Físico"
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCrear(false)}>Cancelar</Button>
            <Button onClick={handleCrear} disabled={!zona}>Crear</Button>
          </>
        }
      >
        <select value={zona} onChange={e => setZona(e.target.value)} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
          <option value="">Seleccionar zona...</option>
          <option value="ALMACEN">ALMACEN</option>
          <option value="APROBADO">APROBADO</option>
          <option value="PICKING">PICKING</option>
          <option value="EMBARQUE">EMBARQUE</option>
          <option value="CUARENTENA">CUARENTENA</option>
          <option value="SILOS">SILOS</option>
        </select>
      </Modal>
    </div>
  );
}
