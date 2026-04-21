'use client';

import { useState, useEffect } from 'react';
import { getUbicaciones, crearUbicacion, actualizarUbicacion, eliminarUbicacion, importarUbicaciones } from '@/lib/api';
import { UbicacionAlmacen } from '@/types';

interface Props {
  token: string;
}

export default function UbicacionesTab({ token }: Props) {
  const [ubicaciones, setUbicaciones] = useState<UbicacionAlmacen[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalCrear, setModalCrear] = useState(false);
  const [modalEditar, setModalEditar] = useState<UbicacionAlmacen | null>(null);
  const [nombre, setNombre] = useState('');
  const [parentId, setParentId] = useState<number | null>(null);
  const [notif, setNotif] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);

  const mostrarNotif = (msg: string, tipo: 'ok' | 'err' = 'ok') => {
    setNotif({ msg, tipo });
    setTimeout(() => setNotif(null), 5000);
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

  const handleCrear = async () => {
    try {
      await crearUbicacion(token, { nombre, parent_id: parentId });
      mostrarNotif('Ubicación creada');
      setModalCrear(false);
      setNombre('');
      setParentId(null);
      cargar();
    } catch (e: any) {
      mostrarNotif(e.message, 'err');
    }
  };

  const handleEditar = async () => {
    if (!modalEditar) return;
    try {
      await actualizarUbicacion(token, modalEditar.id, nombre);
      mostrarNotif('Ubicación actualizada');
      setModalEditar(null);
      setNombre('');
      cargar();
    } catch (e: any) {
      mostrarNotif(e.message, 'err');
    }
  };

  const handleEliminar = async (id: number) => {
    if (!confirm('¿Eliminar esta ubicación?')) return;
    try {
      await eliminarUbicacion(token, id);
      mostrarNotif('Ubicación eliminada');
      cargar();
    } catch (e: any) {
      mostrarNotif(e.message, 'err');
    }
  };

  const handleImportar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await importarUbicaciones(token, file);
      mostrarNotif(res.message);
      cargar();
    } catch (err: any) {
      mostrarNotif(err.message, 'err');
    }
    e.target.value = '';
  };

  // Organizar en jerarquía
  const padres = ubicaciones.filter(u => !u.parent_id);
  const getHijos = (parentId: number) => ubicaciones.filter(u => u.parent_id === parentId);

  return (
    <div className="space-y-4">
      {notif && (
        <div className={`p-3 rounded-lg text-sm font-medium ${notif.tipo === 'ok' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
          {notif.msg}
        </div>
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">📍 Gestión de Ubicaciones</h2>
        <div className="flex gap-2">
          <label className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors">
            📥 Importar Excel
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleImportar} className="hidden" />
          </label>
          <button
            onClick={() => { setModalCrear(true); setNombre(''); setParentId(null); }}
            className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            ➕ Nueva Ubicación
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-400" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {padres.map((padre) => (
            <div key={padre.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-orange-400">📁 {padre.nombre}</h3>
                <div className="flex gap-1">
                  <button
                    onClick={() => { setModalEditar(padre); setNombre(padre.nombre); }}
                    className="text-gray-400 hover:text-white text-sm"
                  >✏️</button>
                  <button
                    onClick={() => handleEliminar(padre.id)}
                    className="text-gray-400 hover:text-red-400 text-sm"
                  >🗑️</button>
                </div>
              </div>
              <div className="space-y-1 ml-4">
                {getHijos(padre.id).map((hijo) => (
                  <div key={hijo.id} className="flex justify-between items-center py-1 text-sm">
                    <span className="text-gray-300">📍 {hijo.nombre}</span>
                    <div className="flex gap-1">
                      <button
                        onClick={() => { setModalEditar(hijo); setNombre(hijo.nombre); }}
                        className="text-gray-500 hover:text-white text-xs"
                      >✏️</button>
                      <button
                        onClick={() => handleEliminar(hijo.id)}
                        className="text-gray-500 hover:text-red-400 text-xs"
                      >🗑️</button>
                    </div>
                  </div>
                ))}
                {getHijos(padre.id).length === 0 && (
                  <p className="text-xs text-gray-600">Sin sub-ubicaciones</p>
                )}
              </div>
            </div>
          ))}
          {padres.length === 0 && (
            <p className="text-gray-500 col-span-full text-center py-8">No hay ubicaciones registradas</p>
          )}
        </div>
      )}

      {/* Modal Crear */}
      {modalCrear && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setModalCrear(false)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">➕ Nueva Ubicación</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-400">Nombre</label>
                <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1" placeholder="Nombre de la ubicación" />
              </div>
              <div>
                <label className="text-sm text-gray-400">Ubicación Padre (opcional)</label>
                <select value={parentId || ''} onChange={(e) => setParentId(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1">
                  <option value="">Sin padre (raíz)</option>
                  {ubicaciones.filter(u => !u.parent_id).map(u => (
                    <option key={u.id} value={u.id}>{u.nombre}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={handleCrear} disabled={!nombre.trim()}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium">Crear</button>
                <button onClick={() => setModalCrear(false)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm font-medium">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar */}
      {modalEditar && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setModalEditar(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">✏️ Editar Ubicación</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-400">Nuevo Nombre</label>
                <input type="text" value={nombre} onChange={(e) => setNombre(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={handleEditar} disabled={!nombre.trim()}
                  className="flex-1 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium">Guardar</button>
                <button onClick={() => setModalEditar(null)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm font-medium">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}