'use client';

import { useState, useEffect } from 'react';
import { getUbicaciones, crearUbicacion, actualizarUbicacion, eliminarUbicacion, importarUbicaciones } from '@/lib/api';
import { UbicacionAlmacen } from '@/types';

interface Props {
  token: string;
}

const TIPO_ZONAS = [
  'ALMACEN', 'DOCK', 'IQC', 'CUARENTENA', 'APROBADO', 'PICKING', 'EMBARQUE', 'SCRAP', 'PRODUCCION', 'SILOS'
];

export default function UbicacionesTab({ token }: Props) {
  const [ubicaciones, setUbicaciones] = useState<UbicacionAlmacen[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ nombre: '', parent_id: '' as string | number, tipo_zona: 'ALMACEN', capacidad_max: '', permite_mixing: false, activa: true });
  const [notif, setNotif] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);

  const mostrarNotif = (msg: string, tipo: 'ok' | 'err' = 'ok') => {
    setNotif({ msg, tipo });
    setTimeout(() => setNotif(null), 4000);
  };

  const cargar = async () => {
    try {
      setLoading(true);
      const data = await getUbicaciones(token);
      setUbicaciones(data);
    } catch (e: any) {
      mostrarNotif(e.message, 'err');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const abrirCrear = () => {
    setEditId(null);
    setForm({ nombre: '', parent_id: '', tipo_zona: 'ALMACEN', capacidad_max: '', permite_mixing: false, activa: true });
    setModal(true);
  };

  const abrirEditar = (ub: UbicacionAlmacen) => {
    setEditId(ub.id);
    setForm({ nombre: ub.nombre, parent_id: ub.parent_id ?? '', tipo_zona: ub.tipo_zona, capacidad_max: ub.capacidad_max?.toString() ?? '', permite_mixing: ub.permite_mixing, activa: ub.activa });
    setModal(true);
  };

  const guardar = async () => {
    try {
      const payload: any = {
        nombre: form.nombre.trim(),
        tipo_zona: form.tipo_zona,
        permite_mixing: form.permite_mixing,
        activa: form.activa,
      };
      if (form.capacidad_max) payload.capacidad_max = parseFloat(form.capacidad_max);
      if (form.parent_id) payload.parent_id = Number(form.parent_id);

      if (editId) {
        await actualizarUbicacion(token, editId, payload);
        mostrarNotif('Ubicación actualizada');
      } else {
        await crearUbicacion(token, payload);
        mostrarNotif('Ubicación creada');
      }
      setModal(false);
      cargar();
    } catch (e: any) {
      mostrarNotif(e.message, 'err');
    }
  };

  const handleEliminar = async (id: number) => {
    if (!confirm('¿Eliminar ubicación?')) return;
    try {
      await eliminarUbicacion(token, id);
      mostrarNotif('Eliminada');
      cargar();
    } catch (e: any) {
      mostrarNotif(e.message, 'err');
    }
  };

  const zonaBadge = (zona: string) => {
    const colors: Record<string, string> = {
      'DOCK': 'bg-gray-500/20 text-gray-400',
      'IQC': 'bg-yellow-500/20 text-yellow-400',
      'CUARENTENA': 'bg-red-500/20 text-red-400',
      'APROBADO': 'bg-green-500/20 text-green-400',
      'PICKING': 'bg-blue-500/20 text-blue-400',
      'EMBARQUE': 'bg-purple-500/20 text-purple-400',
      'SCRAP': 'bg-rose-500/20 text-rose-400',
      'PRODUCCION': 'bg-cyan-500/20 text-cyan-400',
      'SILOS': 'bg-orange-500/20 text-orange-400',
    };
    return colors[zona] || 'bg-gray-500/20 text-gray-400';
  };

  const renderTree = (parentId: number | null = null, depth = 0) => {
    const items = ubicaciones.filter(u => u.parent_id === parentId);
    return items.map(u => (
      <div key={u.id} style={{ marginLeft: depth * 24 }} className="mb-2">
        <div className="flex items-center justify-between bg-gray-800/50 rounded-lg p-3 border border-gray-700">
          <div className="flex items-center gap-3">
            <span className={`text-xs px-2 py-0.5 rounded-full ${zonaBadge(u.tipo_zona)}`}>{u.tipo_zona}</span>
            <span className="font-medium">{u.nombre}</span>
            {u.capacidad_max && <span className="text-xs text-gray-500">Cap: {u.capacidad_max}</span>}
            {u.permite_mixing && <span className="text-xs text-blue-400">Mix</span>}
            {!u.activa && <span className="text-xs text-red-400">Inactiva</span>}
          </div>
          <div className="flex gap-2">
            <button onClick={() => abrirEditar(u)} className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 px-2 py-1 rounded text-xs">Editar</button>
            <button onClick={() => handleEliminar(u.id)} className="bg-red-600/20 hover:bg-red-600/40 text-red-400 px-2 py-1 rounded text-xs">Eliminar</button>
          </div>
        </div>
        {renderTree(u.id, depth + 1)}
      </div>
    ));
  };

  return (
    <div className="space-y-4">
      {notif && <div className={`p-3 rounded-lg text-sm font-medium ${notif.tipo === 'ok' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{notif.msg}</div>}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">📍 Ubicaciones</h2>
        <button onClick={abrirCrear} className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded-lg text-sm font-medium">➕ Nueva</button>
      </div>
      {loading ? <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-400" /></div> : (
        <div className="space-y-1">{renderTree()}</div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setModal(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">{editId ? 'Editar' : 'Nueva'} Ubicación</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-400">Nombre</label>
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1" />
              </div>
              <div>
                <label className="text-sm text-gray-400">Tipo de Zona</label>
                <select value={form.tipo_zona} onChange={e => setForm(f => ({ ...f, tipo_zona: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1">
                  {TIPO_ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-400">Padre (opcional)</label>
                <select value={form.parent_id} onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1">
                  <option value="">Sin padre</option>
                  {ubicaciones.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm text-gray-400">Capacidad Máxima</label>
                <input type="number" value={form.capacidad_max} onChange={e => setForm(f => ({ ...f, capacidad_max: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1" placeholder="kg / unidades" />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-400">
                  <input type="checkbox" checked={form.permite_mixing} onChange={e => setForm(f => ({ ...f, permite_mixing: e.target.checked }))} /> Permite mixing
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-400">
                  <input type="checkbox" checked={form.activa} onChange={e => setForm(f => ({ ...f, activa: e.target.checked }))} /> Activa
                </label>
              </div>
            </div>
            <div className="flex gap-3 pt-4">
              <button onClick={guardar} className="flex-1 bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded-lg text-sm font-medium">Guardar</button>
              <button onClick={() => setModal(false)} className="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
