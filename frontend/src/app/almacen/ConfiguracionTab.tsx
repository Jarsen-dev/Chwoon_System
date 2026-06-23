'use client';

import { useState, useEffect } from 'react';
import { getConfigAlertas, crearConfigAlerta, eliminarConfigAlerta, evaluarAlertas } from '@/lib/api';
import { Button, LoadingSpinner } from '@/components/ui';
import { IconConfig, IconAlertas } from '@/lib/icons';

interface Props { token: string; }

export default function ConfiguracionTab({ token }: Props) {
  const [configs, setConfigs] = useState<any[]>([]);
  const [alertas, setAlertas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notif, setNotif] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);
  const [form, setForm] = useState({ sku: '', stock_minimo: '', stock_maximo: '', dias_rotacion: '' });

  const mostrar = (msg: string, tipo: 'ok' | 'err' = 'ok') => { setNotif({ msg, tipo }); setTimeout(() => setNotif(null), 4000); };

  const cargar = async () => {
    try {
      setLoading(true);
      const [c, a] = await Promise.all([getConfigAlertas(token), evaluarAlertas(token)]);
      setConfigs(c);
      setAlertas(a.alertas || []);
    } catch (e: any) { mostrar(e.message, 'err'); } finally { setLoading(false); }
  };

  useEffect(() => { cargar(); }, []);

  const handleCrear = async () => {
    try {
      await crearConfigAlerta(token, {
        sku: form.sku,
        stock_minimo: parseFloat(form.stock_minimo) || 0,
        stock_maximo: form.stock_maximo ? parseFloat(form.stock_maximo) : undefined,
        dias_rotacion: form.dias_rotacion ? parseInt(form.dias_rotacion) : undefined,
      });
      mostrar('Configuración guardada');
      setForm({ sku: '', stock_minimo: '', stock_maximo: '', dias_rotacion: '' });
      cargar();
    } catch (e: any) { mostrar(e.message, 'err'); }
  };

  return (
    <div className="space-y-6">
      {notif && <div className={`p-3 rounded-lg text-sm font-medium ${notif.tipo === 'ok' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{notif.msg}</div>}
      <h2 className="text-xl font-bold flex items-center gap-2">
        <IconConfig size={22} className="text-[var(--accent)]" aria-hidden /> Configuración de Alertas
      </h2>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Nueva Configuración</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <input value={form.sku} onChange={e => setForm(f => ({ ...f, sku: e.target.value }))} placeholder="SKU" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
          <input type="number" value={form.stock_minimo} onChange={e => setForm(f => ({ ...f, stock_minimo: e.target.value }))} placeholder="Stock Mínimo" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
          <input type="number" value={form.stock_maximo} onChange={e => setForm(f => ({ ...f, stock_maximo: e.target.value }))} placeholder="Stock Máximo (opc)" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
          <input type="number" value={form.dias_rotacion} onChange={e => setForm(f => ({ ...f, dias_rotacion: e.target.value }))} placeholder="Días Rotación (opc)" className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white" />
        </div>
        <Button onClick={handleCrear} disabled={!form.sku} className="mt-3">Guardar</Button>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3">Configuraciones Guardadas</h3>
        {loading ? <div className="flex justify-center py-8"><LoadingSpinner sizeClass="h-8 w-8" /></div> : (
          <div className="space-y-2">
            {configs.map((cfg: any) => (
              <div key={cfg.id} className="flex justify-between items-center bg-gray-800/50 rounded-lg p-3">
                <div className="text-sm">
                  <span className="font-mono text-orange-400">{cfg.sku}</span>
                  <span className="ml-3 text-gray-300">Min: {cfg.stock_minimo}</span>
                  {cfg.stock_maximo && <span className="ml-2 text-gray-300">Max: {cfg.stock_maximo}</span>}
                  {cfg.dias_rotacion && <span className="ml-2 text-gray-300">Rot: {cfg.dias_rotacion}d</span>}
                </div>
                <Button variant="danger" size="sm" onClick={() => eliminarConfigAlerta(token, cfg.id).then(() => cargar()).catch((e: any) => mostrar(e.message, 'err'))}>Eliminar</Button>
              </div>
            ))}
            {configs.length === 0 && <p className="text-gray-500 text-sm">Sin configuraciones</p>}
          </div>
        )}
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <IconAlertas size={16} aria-hidden /> Alertas Activas ({alertas.length})
        </h3>
        <div className="space-y-2">
          {alertas.map((a: any, i: number) => (
            <div key={i} className="bg-red-900/10 border border-red-500/20 rounded-lg p-3 text-sm">
              <span className="font-bold text-red-400">{a.tipo}</span>
              {a.sku && <span className="ml-2 font-mono text-white">{a.sku}</span>}
              {a.lote_id && <span className="ml-2 font-mono text-white">{a.lote_id}</span>}
              {a.stock_actual !== undefined && <span className="ml-2 text-gray-400">Stock: {a.stock_actual}</span>}
              {a.stock_minimo !== undefined && <span className="ml-2 text-gray-400">Min: {a.stock_minimo}</span>}
              {a.cantidad !== undefined && <span className="ml-2 text-gray-400">Cant: {a.cantidad}</span>}
            </div>
          ))}
          {alertas.length === 0 && <p className="text-gray-500 text-sm">Sin alertas activas</p>}
        </div>
      </div>
    </div>
  );
}
