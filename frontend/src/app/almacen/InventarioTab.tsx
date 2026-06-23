'use client';

import { useState, useEffect } from 'react';
import {
  getLotesInventario,
  getInventarioConsolidado,
  getLotesAprobadosSinUbicacion,
  getHistorialLote,
  ajustarLote,
  scrapInventario,
  consumirFifo,
} from '@/lib/api';
import { LoteInventario, InventarioConsolidado, MovimientoLote as MovimientoLoteType } from '@/types';
import { Button, Modal, LoadingSpinner } from '@/components/ui';
import {
  IconInventario, IconGrafico, IconPendiente, IconFifo, IconActualizar,
  IconDocumento, IconEditar, IconEliminar,
} from '@/lib/icons';

interface Props {
  token: string;
}

type Vista = 'lotes' | 'consolidado' | 'pendientes' | 'fifo';

export default function InventarioTab({ token }: Props) {
  const [vista, setVista] = useState<Vista>('lotes');
  const [lotes, setLotes] = useState<LoteInventario[]>([]);
  const [consolidado, setConsolidado] = useState<InventarioConsolidado[]>([]);
  const [pendientes, setPendientes] = useState<LoteInventario[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroSku, setFiltroSku] = useState('');
  const [historialLote, setHistorialLote] = useState<MovimientoLoteType[]>([]);
  const [loteSeleccionado, setLoteSeleccionado] = useState<string | null>(null);
  const [modalAjuste, setModalAjuste] = useState<LoteInventario | null>(null);
  const [modalScrap, setModalScrap] = useState<LoteInventario | null>(null);
  const [ajusteForm, setAjusteForm] = useState({ nueva_cantidad: '', motivo: '', responsable: '' });
  const [scrapForm, setScrapForm] = useState({ cantidad_scrap: '', motivo: '', responsable: '' });
  const [notif, setNotif] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);
  const [fifoSku, setFifoSku] = useState('');
  const [fifoCantidad, setFifoCantidad] = useState('');
  const [fifoResult, setFifoResult] = useState<any[] | null>(null);
  const [fifoLoading, setFifoLoading] = useState(false);

  const mostrarNotif = (msg: string, tipo: 'ok' | 'err' = 'ok') => {
    setNotif({ msg, tipo });
    setTimeout(() => setNotif(null), 5000);
  };

  const cargar = async () => {
    try {
      setLoading(true);
      if (vista === 'lotes') {
        const params: any = {};
        if (filtroEstado) params.estado = filtroEstado;
        if (filtroSku) params.sku = filtroSku;
        const data = await getLotesInventario(token, params);
        setLotes(data);
      } else if (vista === 'consolidado') {
        const data = await getInventarioConsolidado(token);
        setConsolidado(data);
      } else if (vista === 'pendientes') {
        const data = await getLotesAprobadosSinUbicacion(token);
        setPendientes(data);
      }
    } catch (e: any) {
      mostrarNotif(e.message, 'err');
    } finally {
      setLoading(false);
    }
  };

  const runFifoViewer = async () => {
    if (!fifoSku || !fifoCantidad) return;
    try {
      setFifoLoading(true);
      const res = await consumirFifo(token, { sku: fifoSku, cantidad: parseFloat(fifoCantidad), detalles: { modo: 'VISTA_PREVIA' } });
      setFifoResult(res.plan);
    } catch (e: any) {
      mostrarNotif(e.message, 'err');
      setFifoResult([]);
    } finally {
      setFifoLoading(false);
    }
  };

  useEffect(() => { cargar(); }, [vista]);

  const verHistorial = async (loteId: string) => {
    try {
      const data = await getHistorialLote(token, loteId);
      setHistorialLote(data);
      setLoteSeleccionado(loteId);
    } catch (e: any) {
      mostrarNotif(e.message, 'err');
    }
  };

  const handleAjustar = async () => {
    if (!modalAjuste) return;
    try {
      await ajustarLote(token, modalAjuste.lote_id, {
        nueva_cantidad: parseFloat(ajusteForm.nueva_cantidad),
        motivo: ajusteForm.motivo,
        responsable: ajusteForm.responsable,
      });
      mostrarNotif('Lote ajustado correctamente');
      setModalAjuste(null);
      setAjusteForm({ nueva_cantidad: '', motivo: '', responsable: '' });
      cargar();
    } catch (e: any) {
      mostrarNotif(e.message, 'err');
    }
  };

  const handleScrap = async () => {
    if (!modalScrap) return;
    try {
      await scrapInventario(token, modalScrap.lote_id, {
        cantidad_scrap: parseFloat(scrapForm.cantidad_scrap),
        motivo: scrapForm.motivo,
        responsable: scrapForm.responsable,
      });
      mostrarNotif('Scrap registrado correctamente');
      setModalScrap(null);
      setScrapForm({ cantidad_scrap: '', motivo: '', responsable: '' });
      cargar();
    } catch (e: any) {
      mostrarNotif(e.message, 'err');
    }
  };

  const estadoBadge = (estado: string) => {
    const colores: Record<string, string> = {
      'Aprobado': 'bg-green-500/20 text-green-400',
      'Pendiente IQC': 'bg-yellow-500/20 text-yellow-400',
      'Pendiente LQC': 'bg-blue-500/20 text-blue-400',
      'Rechazado': 'bg-red-500/20 text-red-400',
    };
    return colores[estado] || 'bg-gray-500/20 text-gray-400';
  };

  return (
    <div className="space-y-4">
      {/* Notificación */}
      {notif && (
        <div className={`p-3 rounded-lg text-sm font-medium ${notif.tipo === 'ok' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
          {notif.msg}
        </div>
      )}

      {/* Selector de vista */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(['lotes', 'consolidado', 'pendientes', 'fifo'] as Vista[]).map((v) => {
            const Icon = v === 'lotes' ? IconInventario : v === 'consolidado' ? IconGrafico : v === 'pendientes' ? IconPendiente : IconFifo;
            const txt = v === 'lotes' ? 'Todos los Lotes' : v === 'consolidado' ? 'Consolidado' : v === 'pendientes' ? 'Pendientes Ubicar' : 'FIFO Viewer';
            return (
              <button
                key={v}
                onClick={() => setVista(v)}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  vista === v
                    ? 'bg-[var(--accent)] text-[var(--accent-fg)]'
                    : 'bg-gray-800 text-gray-300 hover:text-white'
                }`}
              >
                <Icon size={16} aria-hidden /> {txt}
              </button>
            );
          })}
        </div>
        <Button variant="secondary" onClick={cargar} leftIcon={IconActualizar}>Actualizar</Button>
      </div>

      {/* Filtros para vista de lotes */}
      {vista === 'lotes' && (
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Filtrar por SKU..."
            value={filtroSku}
            onChange={(e) => setFiltroSku(e.target.value)}
            className="font-mono bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white w-48 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            <option value="">Todos los estados</option>
            <option value="Aprobado">Aprobado</option>
            <option value="Pendiente IQC">Pendiente IQC</option>
            <option value="Pendiente LQC">Pendiente LQC</option>
            <option value="Rechazado">Rechazado</option>
          </select>
          <Button onClick={cargar}>Buscar</Button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner sizeClass="h-10 w-10" />
        </div>
      ) : (
        <>
          {/* VISTA: Todos los Lotes */}
          {vista === 'lotes' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-800 sticky top-0">
                    <tr>
                      <th className="text-left p-3 text-gray-300">Lote ID</th>
                      <th className="text-left p-3 text-gray-300">SKU</th>
                      <th className="text-left p-3 text-gray-300">Producto</th>
                      <th className="text-right p-3 text-gray-300">Cantidad</th>
                      <th className="text-left p-3 text-gray-300">Bultos</th>
                      <th className="text-left p-3 text-gray-300">Ubicación</th>
                      <th className="text-left p-3 text-gray-300">Estado</th>
                      <th className="text-left p-3 text-gray-300">Bloqueo</th>
                      <th className="text-left p-3 text-gray-300">Origen</th>
                      <th className="text-center p-3 text-gray-300">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {lotes.map((lote) => (
                      <tr key={lote.id} className="hover:bg-gray-800/50">
                        <td className="p-3 font-mono text-orange-400 text-xs">{lote.lote_id}</td>
                        <td className="p-3 font-mono text-xs">{lote.sku_producto}</td>
                        <td className="p-3 text-gray-300">{lote.nombre_producto}</td>
                        <td className="p-3 text-right font-bold">{lote.cantidad_actual}</td>
                        <td className="p-3 text-xs text-gray-300">{lote.bultos}</td>
                        <td className="p-3 text-gray-300">{lote.nombre_ubicacion}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${estadoBadge(lote.estado_calidad)}`}>
                            {lote.estado_calidad}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-red-400">{lote.bloqueado_por || '-'}</td>
                        <td className="p-3 text-xs text-gray-300 font-mono">{lote.oc_origen || lote.op_origen || '-'}</td>
                        <td className="p-3 text-center">
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => verHistorial(lote.lote_id)}
                              className="inline-flex items-center bg-gray-700 hover:bg-gray-600 p-1.5 rounded text-gray-200"
                              title="Ver historial"
                              aria-label="Ver historial"
                            ><IconDocumento size={14} aria-hidden /></button>
                            <button
                              onClick={() => { setModalAjuste(lote); setAjusteForm({ nueva_cantidad: String(lote.cantidad_actual), motivo: '', responsable: '' }); }}
                              className="inline-flex items-center bg-blue-600/30 hover:bg-blue-600/50 p-1.5 rounded text-blue-300"
                              title="Ajustar"
                              aria-label="Ajustar lote"
                            ><IconEditar size={14} aria-hidden /></button>
                            <button
                              onClick={() => { setModalScrap(lote); setScrapForm({ cantidad_scrap: '', motivo: '', responsable: '' }); }}
                              className="inline-flex items-center bg-red-600/30 hover:bg-red-600/50 p-1.5 rounded text-red-300"
                              title="Scrap"
                              aria-label="Registrar scrap"
                            ><IconEliminar size={14} aria-hidden /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {lotes.length === 0 && (
                      <tr><td colSpan={10} className="p-8 text-center text-gray-500">No se encontraron lotes</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="bg-gray-800 px-4 py-2 text-sm text-gray-300">
                Total: {lotes.length} lotes
              </div>
            </div>
          )}

          {/* VISTA: Consolidado */}
          {vista === 'consolidado' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-800 sticky top-0">
                    <tr>
                      <th className="text-left p-3 text-gray-300">SKU</th>
                      <th className="text-left p-3 text-gray-300">Producto</th>
                      <th className="text-left p-3 text-gray-300">Tipo</th>
                      <th className="text-right p-3 text-gray-300">Stock Total</th>
                      <th className="text-right p-3 text-gray-300">En Compra</th>
                      <th className="text-right p-3 text-gray-300">En Producción</th>
                      <th className="text-left p-3 text-gray-300">Distribución</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {consolidado.filter(c => c.stock_total > 0 || c.en_compra > 0 || c.en_produccion > 0).map((item) => (
                      <tr key={item.sku} className="hover:bg-gray-800/50">
                        <td className="p-3 font-mono text-orange-400 text-xs">{item.sku}</td>
                        <td className="p-3">{item.nombre}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${
                            item.tipo === 'COMPONENTE' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'
                          }`}>{item.tipo}</span>
                        </td>
                        <td className="p-3 text-right font-bold">{item.stock_total.toLocaleString('es-MX')}</td>
                        <td className="p-3 text-right text-yellow-400">{item.en_compra > 0 ? item.en_compra.toLocaleString('es-MX') : '-'}</td>
                        <td className="p-3 text-right text-blue-400">{item.en_produccion > 0 ? item.en_produccion.toLocaleString('es-MX') : '-'}</td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(item.stock_por_ubicacion_agregado).map(([ub, cant]) => (
                              <span key={ub} className="bg-gray-800 px-2 py-0.5 rounded text-xs text-gray-300">
                                {ub}: {cant}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VISTA: Pendientes de ubicar */}
          {vista === 'pendientes' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-800 sticky top-0">
                    <tr>
                      <th className="text-left p-3 text-gray-300">Lote ID</th>
                      <th className="text-left p-3 text-gray-300">SKU</th>
                      <th className="text-left p-3 text-gray-300">Producto</th>
                      <th className="text-left p-3 text-gray-300">Tipo</th>
                      <th className="text-right p-3 text-gray-300">Cantidad</th>
                      <th className="text-left p-3 text-gray-300">Origen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {pendientes.map((lote) => (
                      <tr key={lote.id} className="hover:bg-gray-800/50">
                        <td className="p-3 font-mono text-orange-400 text-xs">{lote.lote_id}</td>
                        <td className="p-3 font-mono text-xs">{lote.sku_producto}</td>
                        <td className="p-3 text-gray-300">{lote.nombre_producto}</td>
                        <td className="p-3 text-xs text-gray-300">{lote.tipo_producto}</td>
                        <td className="p-3 text-right font-bold">{lote.cantidad_actual}</td>
                        <td className="p-3 text-xs text-gray-300 font-mono">{lote.oc_origen || lote.op_origen || '-'}</td>
                      </tr>
                    ))}
                    {pendientes.length === 0 && (
                      <tr><td colSpan={6} className="p-8 text-center text-gray-500">No hay lotes pendientes de ubicar</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* VISTA: FIFO Viewer */}
          {vista === 'fifo' && (
            <div className="space-y-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
                <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
                  <IconFifo size={18} className="text-[var(--accent)]" aria-hidden /> Simulador FIFO
                </h3>
                <div className="flex gap-3 items-end">
                  <div>
                    <label className="text-xs text-gray-300">SKU</label>
                    <input value={fifoSku} onChange={e => setFifoSku(e.target.value)} className="font-mono bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white w-48 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" placeholder="SKU..." />
                  </div>
                  <div>
                    <label className="text-xs text-gray-300">Cantidad</label>
                    <input type="number" value={fifoCantidad} onChange={e => setFifoCantidad(e.target.value)} className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white w-32 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" placeholder="0" />
                  </div>
                  <Button onClick={runFifoViewer} disabled={fifoLoading}>{fifoLoading ? '...' : 'Ver FIFO'}</Button>
                </div>
              </div>
              {fifoResult !== null && (
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  {fifoResult.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">Sin stock disponible para este SKU</div>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-800">
                        <tr>
                          <th className="text-left p-3 text-gray-300">#</th>
                          <th className="text-left p-3 text-gray-300">Lote ID</th>
                          <th className="text-left p-3 text-gray-300">Origen</th>
                          <th className="text-right p-3 text-gray-300">Cantidad a Consumir</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {fifoResult.map((item, idx) => (
                          <tr key={idx} className="hover:bg-gray-800/50">
                            <td className="p-3 text-gray-500">{idx + 1}</td>
                            <td className="p-3 font-mono text-orange-400 text-xs">{item.lote_id}</td>
                            <td className="p-3 text-gray-300">{item.almacen_origen}</td>
                            <td className="p-3 text-right font-bold text-green-400">{item.cantidad_consumida}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modal Historial */}
      <Modal
        open={!!loteSeleccionado}
        onClose={() => setLoteSeleccionado(null)}
        size="2xl"
        title={
          <span className="flex items-center gap-2">
            <IconDocumento size={18} aria-hidden /> Historial: <span className="font-mono">{loteSeleccionado}</span>
          </span>
        }
      >
        {historialLote.length === 0 ? (
          <p className="text-gray-400 text-center py-8">Sin movimientos registrados</p>
        ) : (
          <div className="space-y-3">
            {historialLote.map((mov, i) => (
              <div key={i} className="bg-gray-800 rounded-lg p-3">
                <div className="flex justify-between items-start">
                  <span className="font-mono text-sm text-orange-400">{mov.tipo}</span>
                  <span className="text-xs text-gray-300">{mov.fecha ? new Date(mov.fecha).toLocaleString('es-MX') : '-'}</span>
                </div>
                <div className="text-sm mt-1">Cantidad: <span className="font-bold">{mov.cantidad}</span></div>
                {Object.keys(mov.detalles || {}).length > 0 && (
                  <div className="mt-2 text-xs text-gray-300">
                    {Object.entries(mov.detalles).map(([k, v]) => (
                      <div key={k}><span className="text-gray-400">{k}:</span> {String(v)}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Modal Ajustar */}
      <Modal
        open={!!modalAjuste}
        onClose={() => setModalAjuste(null)}
        title={
          <span className="flex items-center gap-2">
            <IconEditar size={18} aria-hidden /> Ajustar Lote: <span className="font-mono">{modalAjuste?.lote_id}</span>
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalAjuste(null)}>Cancelar</Button>
            <Button onClick={handleAjustar} disabled={!ajusteForm.motivo || !ajusteForm.responsable}>Ajustar</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-300">Nueva Cantidad</label>
            <input type="number" value={ajusteForm.nueva_cantidad} onChange={(e) => setAjusteForm(f => ({ ...f, nueva_cantidad: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
          </div>
          <div>
            <label className="text-sm text-gray-300">Motivo</label>
            <input type="text" value={ajusteForm.motivo} onChange={(e) => setAjusteForm(f => ({ ...f, motivo: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" placeholder="Motivo del ajuste" />
          </div>
          <div>
            <label className="text-sm text-gray-300">Responsable</label>
            <input type="text" value={ajusteForm.responsable} onChange={(e) => setAjusteForm(f => ({ ...f, responsable: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
          </div>
        </div>
      </Modal>

      {/* Modal Scrap */}
      <Modal
        open={!!modalScrap}
        onClose={() => setModalScrap(null)}
        title={
          <span className="flex items-center gap-2">
            <IconEliminar size={18} aria-hidden /> Scrap: <span className="font-mono">{modalScrap?.lote_id}</span>
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalScrap(null)}>Cancelar</Button>
            <Button variant="danger" onClick={handleScrap} disabled={!scrapForm.cantidad_scrap || !scrapForm.motivo || !scrapForm.responsable}>Registrar Scrap</Button>
          </>
        }
      >
        {modalScrap && <p className="text-sm text-gray-300 mb-3">Disponible: <span className="font-bold text-white">{modalScrap.cantidad_actual}</span></p>}
        <div className="space-y-3">
          <div>
            <label className="text-sm text-gray-300">Cantidad Scrap</label>
            <input type="number" value={scrapForm.cantidad_scrap} onChange={(e) => setScrapForm(f => ({ ...f, cantidad_scrap: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
          </div>
          <div>
            <label className="text-sm text-gray-300">Motivo</label>
            <input type="text" value={scrapForm.motivo} onChange={(e) => setScrapForm(f => ({ ...f, motivo: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
          </div>
          <div>
            <label className="text-sm text-gray-300">Responsable</label>
            <input type="text" value={scrapForm.responsable} onChange={(e) => setScrapForm(f => ({ ...f, responsable: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]" />
          </div>
        </div>
      </Modal>
    </div>
  );
}