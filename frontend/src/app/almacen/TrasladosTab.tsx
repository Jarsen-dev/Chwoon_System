'use client';

import { useState, useEffect } from 'react';
import { getTrasladosProduccion, getHistorialTrasladosProduccion, ejecutarMovimientoParcial } from '@/lib/api';
import { TrasladoProduccion } from '@/types';
import { Button, Modal, LoadingSpinner } from '@/components/ui';
import { IconTraslados, IconLista, IconHistorial, IconEjecutar } from '@/lib/icons';

interface Props {
  token: string;
}

export default function TrasladosTab({ token }: Props) {
  const [vista, setVista] = useState<'activos' | 'historial'>('activos');
  const [traslados, setTraslados] = useState<TrasladoProduccion[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalEjecutar, setModalEjecutar] = useState<TrasladoProduccion | null>(null);
  const [movimientos, setMovimientos] = useState<{ sku: string; cantidad_a_mover: string }[]>([]);
  const [autorizador, setAutorizador] = useState('');
  const [notif, setNotif] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);

  const mostrarNotif = (msg: string, tipo: 'ok' | 'err' = 'ok') => {
    setNotif({ msg, tipo });
    setTimeout(() => setNotif(null), 5000);
  };

  const cargar = async () => {
    try {
      setLoading(true);
      if (vista === 'activos') {
        const data = await getTrasladosProduccion(token);
        setTraslados(data);
      } else {
        const data = await getHistorialTrasladosProduccion(token);
        setTraslados(data);
      }
    } catch (e: any) {
      mostrarNotif(e.message, 'err');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, [vista]);

  const abrirEjecutar = (t: TrasladoProduccion) => {
    setModalEjecutar(t);
    setMovimientos(
      (t.items || []).map((item) => ({
        sku: item.sku_componente,
        cantidad_a_mover: String(Math.max(0, item.cantidad_requerida - item.cantidad_movida)),
      }))
    );
    setAutorizador('');
  };

  const handleEjecutar = async () => {
    if (!modalEjecutar) return;
    try {
      const movs = movimientos
        .filter(m => parseFloat(m.cantidad_a_mover) > 0)
        .map(m => ({ sku: m.sku, cantidad_a_mover: parseFloat(m.cantidad_a_mover) }));

      if (movs.length === 0) { mostrarNotif('No hay movimientos', 'err'); return; }

      const res = await ejecutarMovimientoParcial(token, modalEjecutar.id_traslado, {
        movimientos: movs,
        autorizador,
      });
      mostrarNotif(`Movimiento ejecutado. Estado: ${res.nuevo_status}`);
      setModalEjecutar(null);
      cargar();
    } catch (e: any) {
      mostrarNotif(e.message, 'err');
    }
  };

  const statusBadge = (status: string) => {
    const colores: Record<string, string> = {
      'Pendiente': 'bg-yellow-500/20 text-yellow-400',
      'En Proceso': 'bg-blue-500/20 text-blue-400',
      'Completado': 'bg-green-500/20 text-green-400',
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
        <h2 className="text-xl font-bold flex items-center gap-2">
          <IconTraslados size={22} className="text-[var(--accent)]" aria-hidden /> Traslados a Producción
        </h2>
        <div className="flex gap-2">
          <button onClick={() => setVista('activos')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${vista === 'activos' ? 'bg-[var(--accent)] text-[var(--accent-fg)]' : 'bg-gray-800 text-gray-300'}`}>
            <IconLista size={16} aria-hidden /> Activos
          </button>
          <button onClick={() => setVista('historial')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium ${vista === 'historial' ? 'bg-[var(--accent)] text-[var(--accent-fg)]' : 'bg-gray-800 text-gray-300'}`}>
            <IconHistorial size={16} aria-hidden /> Historial
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner sizeClass="h-10 w-10" />
        </div>
      ) : (
        <div className="space-y-4">
          {traslados.map((t) => (
            <div key={t.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <span className="font-mono text-orange-400 text-sm">{t.id_traslado}</span>
                  <div className="text-xs text-gray-300 mt-1 font-mono">OP: {t.op_id_origen} → {t.linea_produccion_destino || 'N/A'}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${statusBadge(t.status)}`}>{t.status}</span>
                  {t.status !== 'Completado' && (
                    <Button variant="primary" size="sm" leftIcon={IconEjecutar} onClick={() => abrirEjecutar(t)}>
                      Ejecutar
                    </Button>
                  )}
                </div>
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-500 text-xs">
                    <th className="text-left pb-1">SKU Componente</th>
                    <th className="text-right pb-1">Requerido</th>
                    <th className="text-right pb-1">Movido</th>
                    <th className="text-right pb-1">Pendiente</th>
                    <th className="text-right pb-1">Progreso</th>
                  </tr>
                </thead>
                <tbody>
                  {(t.items || []).map((item, i) => {
                    const pend = item.cantidad_requerida - item.cantidad_movida;
                    const pct = item.cantidad_requerida > 0 ? (item.cantidad_movida / item.cantidad_requerida * 100) : 0;
                    return (
                      <tr key={i} className="border-t border-gray-800">
                        <td className="py-2 font-mono text-xs">{item.sku_componente}</td>
                        <td className="py-2 text-right">{item.cantidad_requerida}</td>
                        <td className="py-2 text-right text-green-400">{item.cantidad_movida}</td>
                        <td className="py-2 text-right text-yellow-400">{pend > 0 ? pend : 0}</td>
                        <td className="py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="w-20 bg-gray-800 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${pct >= 100 ? 'bg-green-500' : 'bg-orange-500'}`}
                                style={{ width: `${Math.min(pct, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-300">{pct.toFixed(0)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Historial de movimientos del traslado */}
              {(t.historial || []).length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-800">
                  <p className="text-xs text-gray-500 mb-2">Historial de movimientos:</p>
                  {(t.historial || []).map((h: any, hi: number) => (
                    <div key={hi} className="text-xs text-gray-300 mb-1">
                      <span className="text-gray-500">{h.fecha ? new Date(h.fecha).toLocaleString('es-MX') : '-'}</span>
                      {' — '}Autorizado por: <span className="text-white">{h.autorizador}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {traslados.length === 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-12 text-center text-gray-500">
              {vista === 'activos' ? 'No hay traslados activos' : 'Sin historial de traslados'}
            </div>
          )}
        </div>
      )}

      {/* Modal Ejecutar Movimiento */}
      <Modal
        open={!!modalEjecutar}
        onClose={() => setModalEjecutar(null)}
        size="lg"
        title={
          <span className="flex items-center gap-2">
            <IconEjecutar size={18} aria-hidden /> Ejecutar Movimiento
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalEjecutar(null)}>Cancelar</Button>
            <Button
              variant="primary"
              leftIcon={IconEjecutar}
              onClick={handleEjecutar}
              disabled={!autorizador || movimientos.every(m => !parseFloat(m.cantidad_a_mover))}
            >
              Ejecutar Movimiento
            </Button>
          </>
        }
      >
        {modalEjecutar && (
          <>
            <p className="text-sm text-gray-300 mb-4 font-mono">{modalEjecutar.id_traslado} → {modalEjecutar.linea_produccion_destino}</p>

            <div className="space-y-3 mb-4">
              {movimientos.map((mov, i) => {
                const itemOriginal = (modalEjecutar.items || []).find(it => it.sku_componente === mov.sku);
                const pendiente = itemOriginal ? itemOriginal.cantidad_requerida - itemOriginal.cantidad_movida : 0;
                return (
                  <div key={i} className="bg-gray-800 rounded-lg p-3">
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-mono text-sm text-orange-400">{mov.sku}</span>
                      <span className="text-xs text-gray-300">Pendiente: {pendiente}</span>
                    </div>
                    <input
                      type="number"
                      value={mov.cantidad_a_mover}
                      onChange={(e) => {
                        const updated = [...movimientos];
                        updated[i].cantidad_a_mover = e.target.value;
                        setMovimientos(updated);
                      }}
                      max={pendiente}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      placeholder="Cantidad a mover"
                    />
                  </div>
                );
              })}
            </div>

            <div>
              <label className="text-sm text-gray-300">Autorizado por</label>
              <input
                type="text"
                value={autorizador}
                onChange={(e) => setAutorizador(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                placeholder="Nombre del autorizador"
              />
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}