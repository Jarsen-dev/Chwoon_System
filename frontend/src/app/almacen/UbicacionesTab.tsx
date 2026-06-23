'use client';

import { useState, useEffect } from 'react';
import { getUbicaciones, crearUbicacion, actualizarUbicacion, eliminarUbicacion, importarUbicaciones } from '@/lib/api';
import { UbicacionAlmacen } from '@/types';
import { Button, Modal, LoadingSpinner } from '@/components/ui';
import { IconUbicaciones, IconNuevo, IconEditar, IconEliminar } from '@/lib/icons';

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
            <Button variant="ghost" size="sm" leftIcon={IconEditar} onClick={() => abrirEditar(u)}>Editar</Button>
            <Button variant="danger" size="sm" leftIcon={IconEliminar} onClick={() => handleEliminar(u.id)}>Eliminar</Button>
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
        <h2 className="text-xl font-bold flex items-center gap-2">
          <IconUbicaciones size={22} className="text-[var(--accent)]" aria-hidden /> Ubicaciones
        </h2>
        <Button leftIcon={IconNuevo} onClick={abrirCrear}>Nueva</Button>
      </div>
      {loading ? <div className="flex justify-center py-12"><LoadingSpinner sizeClass="h-10 w-10" /></div> : (
        <div className="space-y-1">{renderTree()}</div>
      )}

      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title={`${editId ? 'Editar' : 'Nueva'} Ubicación`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal(false)}>Cancelar</Button>
            <Button onClick={guardar}>Guardar</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-300">Nombre</label>
            <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
          </div>
          <div>
            <label className="text-sm text-gray-300">Tipo de Zona</label>
            <select value={form.tipo_zona} onChange={e => setForm(f => ({ ...f, tipo_zona: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
              {TIPO_ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-300">Padre (opcional)</label>
            <select value={form.parent_id} onChange={e => setForm(f => ({ ...f, parent_id: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]">
              <option value="">Sin padre</option>
              {ubicaciones.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm text-gray-300">Capacidad Máxima</label>
            <input type="number" value={form.capacidad_max} onChange={e => setForm(f => ({ ...f, capacidad_max: e.target.value }))} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" placeholder="kg / unidades" />
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={form.permite_mixing} onChange={e => setForm(f => ({ ...f, permite_mixing: e.target.checked }))} /> Permite mixing
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={form.activa} onChange={e => setForm(f => ({ ...f, activa: e.target.checked }))} /> Activa
            </label>
          </div>
        </div>
      </Modal>
    </div>
  );
}
