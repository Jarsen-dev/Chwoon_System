'use client';

import { useState, useEffect } from 'react';
import { getEmbarques, crearEmbarque, registrarSalidaEmbarque, confirmarEntregaEmbarque } from '@/lib/api';
import { EmbarqueAlmacen } from '@/types';

interface Props {
  token: string;
}

export default function EmbarquesTab({ token }: Props) {
  const [embarques, setEmbarques] = useState<EmbarqueAlmacen[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState('');
  const [modalSalida, setModalSalida] = useState<EmbarqueAlmacen | null>(null);
  const [salidaForm, setSalidaForm] = useState({ camion: '', chofer: '', departure: '' });
  const [notif, setNotif] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);

  const mostrarNotif = (msg: string, tipo: 'ok' | 'err' = 'ok') => {
    setNotif({ msg, tipo });
    setTimeout(() => setNotif(null), 5000);
  };

  const cargar = async () => {
    try {
      setLoading(true);
      const data = await getEmbarques(token, filtroStatus || undefined);
      setEmbarques(data);
    } catch (e: any) {
      mostrarNotif(e.message, 'err');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, [filtroStatus]);

  const handleSalida = async () => {
    if (!modalSalida) return;
    try {
      await registrarSalidaEmbarque(token, modalSalida.numero_embarque, salidaForm);
      mostrarNotif('Salida registrada');
      setModalSalida(null);
      setSalidaForm({ camion: '', chofer: '', departure: '' });
      cargar();
    } catch (e: any) {
      mostrarNotif(e.message, 'err');
    }
  };

  const handleEntrega = async (numero: string) => {
    if (!confirm('¿Confirmar entrega de este embarque?')) return;
    try {
      await confirmarEntregaEmbarque(token, numero);
      mostrarNotif('Entrega confirmada');
      cargar();
    } catch (e: any) {
      mostrarNotif(e.message, 'err');
    }
  };

  const statusBadge = (status: string) => {
    const colores: Record<string, string> = {
      'Surtido': 'bg-green-500/20 text-green-400',
      'En Tránsito': 'bg-blue-500/20 text-blue-400',
      'Entregado': 'bg-emerald-500/20 text-emerald-400',
    };
    return colores[status] || 'bg-gray-500/20 text-gray-400';
  };

  return (
    <div className="space-y-4">
      {notif && (
        <div className={`p-3 rounded-lg text-sm font-medium ${notif.tipo === 'ok' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
          {notif.msg}
        </div>
      )}

      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">🚚 Gestión de Embarques</h2>
        <div className="flex gap-2">
          <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white">
            <option value="">Todos los estados</option>
            <option value="Surtido">Surtido</option>
            <option value="En Tránsito">En Tránsito</option>
            <option value="Entregado">Entregado</option>
          </select>
          <button onClick={cargar} className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm">🔄</button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-400" />
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 sticky top-0">
                <tr>
                  <th className="text-left p-3 text-gray-400">N° Embarque</th>
                  <th className="text-left p-3 text-gray-400">OV</th>
                  <th className="text-left p-3 text-gray-400">Cliente</th>
                  <th className="text-left p-3 text-gray-400">Estado</th>
                  <th className="text-left p-3 text-gray-400">Fecha</th>
                  <th className="text-left p-3 text-gray-400">Camión</th>
                  <th className="text-left p-3 text-gray-400">Chofer</th>
                  <th className="text-center p-3 text-gray-400">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {embarques.map((emb) => (
                  <tr key={emb.id} className="hover:bg-gray-800/50">
                    <td className="p-3 font-mono text-orange-400 text-xs">{emb.numero_embarque}</td>
                    <td className="p-3">{emb.ov_id}</td>
                    <td className="p-3 text-gray-300">{emb.cliente_id || '-'}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${statusBadge(emb.status)}`}>
                        {emb.status}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-gray-400">
                      {emb.fecha_creacion ? new Date(emb.fecha_creacion).toLocaleDateString('es-MX') : '-'}
                    </td>
                    <td className="p-3 text-gray-300">{emb.camion || '-'}</td>
                    <td className="p-3 text-gray-300">{emb.chofer || '-'}</td>
                    <td className="p-3 text-center">
                      <div className="flex gap-1 justify-center">
                        {emb.status === 'Surtido' && (
                          <button
                            onClick={() => { setModalSalida(emb); setSalidaForm({ camion: '', chofer: '', departure: '' }); }}
                            className="bg-blue-600/30 hover:bg-blue-600/50 px-2 py-1 rounded text-xs"
                          >🚛 Salida</button>
                        )}
                        {emb.status === 'En Tránsito' && (
                          <button
                            onClick={() => handleEntrega(emb.numero_embarque)}
                            className="bg-green-600/30 hover:bg-green-600/50 px-2 py-1 rounded text-xs"
                          >✅ Entregado</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {embarques.length === 0 && (
                  <tr><td colSpan={8} className="p-8 text-center text-gray-500">No hay embarques</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="bg-gray-800 px-4 py-2 text-sm text-gray-400">
            Total: {embarques.length} embarques
          </div>
        </div>
      )}

      {/* Modal Salida */}
      {modalSalida && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setModalSalida(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">🚛 Registrar Salida: {modalSalida.numero_embarque}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-400">Camión</label>
                <input type="text" value={salidaForm.camion} onChange={(e) => setSalidaForm(f => ({ ...f, camion: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1" placeholder="Placa o identificador" />
              </div>
              <div>
                <label className="text-sm text-gray-400">Chofer</label>
                <input type="text" value={salidaForm.chofer} onChange={(e) => setSalidaForm(f => ({ ...f, chofer: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1" placeholder="Nombre del chofer" />
              </div>
              <div>
                <label className="text-sm text-gray-400">Fecha/Hora Salida</label>
                <input type="datetime-local" value={salidaForm.departure} onChange={(e) => setSalidaForm(f => ({ ...f, departure: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={handleSalida} disabled={!salidaForm.camion || !salidaForm.chofer || !salidaForm.departure}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium">Registrar Salida</button>
                <button onClick={() => setModalSalida(null)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm font-medium">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}