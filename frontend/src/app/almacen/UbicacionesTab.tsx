'use client';

import { useMemo, useState, useEffect } from 'react';
import { getUbicaciones, crearUbicacion, eliminarUbicacion } from '@/lib/api';
import { UbicacionAlmacen } from '@/types';
import { Button, Modal, LoadingSpinner, Card, Badge } from '@/components/ui';
import { IconUbicaciones, IconNuevo, IconEliminar, IconOk, IconBloqueado, IconVer } from '@/lib/icons';

interface Props {
  token: string;
}

const TIPO_ZONAS = [
  'ALMACEN', 'DOCK', 'IQC', 'CUARENTENA', 'APROBADO', 'PICKING', 'EMBARQUE', 'SCRAP', 'PRODUCCION', 'SILOS'
];

const INPUT_MODAL =
  'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]';

type ConfirmModal = { ubicacion: UbicacionAlmacen } | null;

function formatFecha(iso?: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return iso; }
}

const zonaBadgeClass = (zona: string) => {
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

export default function UbicacionesTab({ token }: Props) {
  const [ubicaciones, setUbicaciones] = useState<UbicacionAlmacen[]>([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ nombre: '', tipo_zona: 'ALMACEN' });
  const [confirmModal, setConfirmModal] = useState<ConfirmModal>(null);
  const [detalleModal, setDetalleModal] = useState<UbicacionAlmacen | null>(null);
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
    setForm({ nombre: '', tipo_zona: 'ALMACEN' });
    setModal(true);
  };

  const guardar = async () => {
    try {
      await crearUbicacion(token, { nombre: form.nombre.trim(), tipo_zona: form.tipo_zona });
      mostrarNotif('Ubicación creada');
      setModal(false);
      cargar();
    } catch (e: any) {
      mostrarNotif(e.message, 'err');
    }
  };

  const confirmarEliminar = async () => {
    if (!confirmModal) return;
    try {
      await eliminarUbicacion(token, confirmModal.ubicacion.id);
      mostrarNotif('Ubicación eliminada');
    } catch (e: any) {
      mostrarNotif(e.message, 'err');
    } finally {
      setConfirmModal(null);
      cargar();
    }
  };

  // Solo las ubicaciones que reciben lotes (hojas del árbol) se muestran como
  // tarjeta; las contenedoras (MAIN, ALMACEN EPS, SILOS) solo aportan zona.
  const grupos = useMemo(() => {
    const padres = new Set(
      ubicaciones.map(u => u.parent_id).filter((p): p is number => p != null)
    );
    const q = busqueda.trim().toLowerCase();
    const hojas = ubicaciones
      .filter(u => !padres.has(u.id))
      .filter(u => !q || u.nombre.toLowerCase().includes(q) || u.tipo_zona.toLowerCase().includes(q));

    const porZona = new Map<string, UbicacionAlmacen[]>();
    for (const u of hojas) {
      const lista = porZona.get(u.tipo_zona) || [];
      lista.push(u);
      porZona.set(u.tipo_zona, lista);
    }
    return Array.from(porZona.entries())
      .map(([zona, items]) => ({ zona, items: items.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')) }))
      .sort((a, b) => a.zona.localeCompare(b.zona, 'es'));
  }, [ubicaciones, busqueda]);

  return (
    <div className="space-y-4">
      {notif && <div className={`p-3 rounded-lg text-sm font-medium ${notif.tipo === 'ok' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{notif.msg}</div>}

      <div className="flex justify-between items-center gap-3">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <IconUbicaciones size={22} className="text-[var(--accent)]" aria-hidden /> Ubicaciones
        </h2>
        <Button leftIcon={IconNuevo} onClick={abrirCrear}>Nueva</Button>
      </div>

      <input
        type="text"
        value={busqueda}
        onChange={e => setBusqueda(e.target.value)}
        placeholder="Buscar por nombre o zona..."
        className="w-full max-w-sm bg-gray-950 border border-gray-800 rounded-md px-3 py-2 text-sm text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 placeholder:text-gray-400"
      />

      {loading ? (
        <div className="flex justify-center py-12"><LoadingSpinner sizeClass="h-10 w-10" /></div>
      ) : grupos.length === 0 ? (
        <p className="text-center text-gray-500 py-12">No se encontraron ubicaciones</p>
      ) : (
        <div className="space-y-6">
          {grupos.map(({ zona, items }) => (
            <div key={zona}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${zonaBadgeClass(zona)}`}>{zona}</span>
                <Badge variant="info">{items.length} ubicaci{items.length === 1 ? 'ón' : 'ones'}</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {items.map(u => {
                  const ocupado = u.lotes.length > 0;
                  return (
                    <Card key={u.id} padding="sm" className="flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-white">{u.nombre}</p>
                        <button
                          onClick={() => setConfirmModal({ ubicacion: u })}
                          className="inline-flex items-center bg-red-600/30 hover:bg-red-600/50 p-1.5 rounded text-red-300 transition shrink-0"
                          title="Eliminar"
                          aria-label="Eliminar ubicación"
                        ><IconEliminar size={14} aria-hidden /></button>
                      </div>

                      {ocupado ? (
                        <Badge variant="warning" className="self-start">
                          <IconBloqueado size={12} aria-hidden /> Ocupado
                        </Badge>
                      ) : (
                        <Badge variant="success" className="self-start">
                          <IconOk size={12} aria-hidden /> Disponible
                        </Badge>
                      )}

                      {ocupado && u.lotes.length === 1 && (
                        <div className="text-xs text-gray-300 border-t border-gray-800 pt-2">
                          <div className="flex flex-wrap gap-x-1.5">
                            <span className="font-mono text-orange-400">{u.lotes[0].lote_id}</span>
                            <span className="text-gray-500">·</span>
                            <span className="font-mono">{u.lotes[0].sku_producto}</span>
                            <span className="text-gray-500">·</span>
                            <span>{formatFecha(u.lotes[0].fecha_recepcion)}</span>
                          </div>
                        </div>
                      )}

                      {ocupado && u.lotes.length > 1 && (
                        <div className="flex items-center justify-between gap-2 text-xs text-gray-300 border-t border-gray-800 pt-2">
                          <span>
                            {u.lotes.length} lotes · {new Set(u.lotes.map(l => l.sku_producto)).size} no. de parte
                          </span>
                          <Button variant="ghost" size="sm" leftIcon={IconVer} onClick={() => setDetalleModal(u)}>
                            Ver detalle
                          </Button>
                        </div>
                      )}

                      {!u.activa && <span className="text-xs text-red-400">Inactiva</span>}
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: nueva ubicación */}
      <Modal
        open={modal}
        onClose={() => setModal(false)}
        title="Nueva Ubicación"
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
            <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} className={INPUT_MODAL} />
          </div>
          <div>
            <label className="text-sm text-gray-300">Tipo de Zona</label>
            <select value={form.tipo_zona} onChange={e => setForm(f => ({ ...f, tipo_zona: e.target.value }))} className={INPUT_MODAL}>
              {TIPO_ZONAS.map(z => <option key={z} value={z}>{z}</option>)}
            </select>
          </div>
        </div>
      </Modal>

      {/* Modal: confirmar eliminación */}
      <Modal
        open={!!confirmModal}
        onClose={() => setConfirmModal(null)}
        size="sm"
        title={<span className="flex items-center gap-2 text-red-400"><IconEliminar size={18} aria-hidden /> Eliminar ubicación</span>}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmModal(null)}>Cancelar</Button>
            <Button variant="danger" onClick={confirmarEliminar} leftIcon={IconEliminar}>Sí, Eliminar</Button>
          </>
        }
      >
        <p className="text-gray-300 text-sm">
          ¿Eliminar <span className="font-mono">{confirmModal?.ubicacion.nombre}</span>? Esta acción no se puede deshacer.
        </p>
      </Modal>

      {/* Modal: detalle de lotes en la ubicación */}
      <Modal
        open={!!detalleModal}
        onClose={() => setDetalleModal(null)}
        size="md"
        title={
          <span className="flex items-center gap-2">
            {detalleModal?.nombre}
            {detalleModal && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${zonaBadgeClass(detalleModal.tipo_zona)}`}>
                {detalleModal.tipo_zona}
              </span>
            )}
          </span>
        }
        footer={<Button variant="secondary" onClick={() => setDetalleModal(null)}>Cerrar</Button>}
      >
        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-800">
              <tr className="text-left text-xs uppercase tracking-wider text-gray-400">
                <th className="px-3 py-2">Lote ID</th>
                <th className="px-3 py-2">No. Parte</th>
                <th className="px-3 py-2 text-right">Cantidad</th>
                <th className="px-3 py-2">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {detalleModal?.lotes.map(l => (
                <tr key={l.lote_id}>
                  <td className="px-3 py-2 font-mono text-orange-400 text-xs">{l.lote_id}</td>
                  <td className="px-3 py-2 font-mono text-xs">{l.sku_producto}</td>
                  <td className="px-3 py-2 text-right font-bold">{l.cantidad_actual}</td>
                  <td className="px-3 py-2 text-gray-300">{formatFecha(l.fecha_recepcion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>
    </div>
  );
}
