'use client';

import { useState, useEffect } from 'react';
import {
  getLotesInventario,
  getInventarioConsolidado,
  getLotesAprobadosSinUbicacion,
  getHistorialLote,
  ajustarLote,
  scrapInventario,
} from '@/lib/api';
import { LoteInventario, InventarioConsolidado, MovimientoLote as MovimientoLoteType } from '@/types';

interface Props {
  token: string;
}

type Vista = 'lotes' | 'consolidado' | 'pendientes';

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
      } else {
        const data = await getLotesAprobadosSinUbicacion(token);
        setPendientes(data);
      }
    } catch (e: any) {
      mostrarNotif(e.message, 'err');
    } finally {
      setLoading(false);
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
          {(['lotes', 'consolidado', 'pendientes'] as Vista[]).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                vista === v
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {v === 'lotes' ? '📦 Todos los Lotes' : v === 'consolidado' ? '📊 Consolidado' : '⏳ Pendientes Ubicar'}
            </button>
          ))}
        </div>
        <button onClick={cargar} className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm">
          🔄 Actualizar
        </button>
      </div>

      {/* Filtros para vista de lotes */}
      {vista === 'lotes' && (
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Filtrar por SKU..."
            value={filtroSku}
            onChange={(e) => setFiltroSku(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white w-48"
          />
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white"
          >
            <option value="">Todos los estados</option>
            <option value="Aprobado">Aprobado</option>
            <option value="Pendiente IQC">Pendiente IQC</option>
            <option value="Pendiente LQC">Pendiente LQC</option>
            <option value="Rechazado">Rechazado</option>
          </select>
          <button onClick={cargar} className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded-lg text-sm">
            Buscar
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-400" />
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
                      <th className="text-left p-3 text-gray-400">Lote ID</th>
                      <th className="text-left p-3 text-gray-400">SKU</th>
                      <th className="text-left p-3 text-gray-400">Producto</th>
                      <th className="text-right p-3 text-gray-400">Cantidad</th>
                      <th className="text-left p-3 text-gray-400">Ubicación</th>
                      <th className="text-left p-3 text-gray-400">Estado</th>
                      <th className="text-left p-3 text-gray-400">Origen</th>
                      <th className="text-center p-3 text-gray-400">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {lotes.map((lote) => (
                      <tr key={lote.id} className="hover:bg-gray-800/50">
                        <td className="p-3 font-mono text-orange-400 text-xs">{lote.lote_id}</td>
                        <td className="p-3">{lote.sku_producto}</td>
                        <td className="p-3 text-gray-300">{lote.nombre_producto}</td>
                        <td className="p-3 text-right font-bold">{lote.cantidad_actual}</td>
                        <td className="p-3 text-gray-300">{lote.nombre_ubicacion}</td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${estadoBadge(lote.estado_calidad)}`}>
                            {lote.estado_calidad}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-gray-400">{lote.oc_origen || lote.op_origen || '-'}</td>
                        <td className="p-3 text-center">
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => verHistorial(lote.lote_id)}
                              className="bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-xs"
                              title="Ver historial"
                            >📋</button>
                            <button
                              onClick={() => { setModalAjuste(lote); setAjusteForm({ nueva_cantidad: String(lote.cantidad_actual), motivo: '', responsable: '' }); }}
                              className="bg-blue-600/30 hover:bg-blue-600/50 px-2 py-1 rounded text-xs"
                              title="Ajustar"
                            >✏️</button>
                            <button
                              onClick={() => { setModalScrap(lote); setScrapForm({ cantidad_scrap: '', motivo: '', responsable: '' }); }}
                              className="bg-red-600/30 hover:bg-red-600/50 px-2 py-1 rounded text-xs"
                              title="Scrap"
                            >🗑️</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {lotes.length === 0 && (
                      <tr><td colSpan={8} className="p-8 text-center text-gray-500">No se encontraron lotes</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="bg-gray-800 px-4 py-2 text-sm text-gray-400">
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
                      <th className="text-left p-3 text-gray-400">SKU</th>
                      <th className="text-left p-3 text-gray-400">Producto</th>
                      <th className="text-left p-3 text-gray-400">Tipo</th>
                      <th className="text-right p-3 text-gray-400">Stock Total</th>
                      <th className="text-right p-3 text-gray-400">En Compra</th>
                      <th className="text-right p-3 text-gray-400">En Producción</th>
                      <th className="text-left p-3 text-gray-400">Distribución</th>
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
                      <th className="text-left p-3 text-gray-400">Lote ID</th>
                      <th className="text-left p-3 text-gray-400">SKU</th>
                      <th className="text-left p-3 text-gray-400">Producto</th>
                      <th className="text-left p-3 text-gray-400">Tipo</th>
                      <th className="text-right p-3 text-gray-400">Cantidad</th>
                      <th className="text-left p-3 text-gray-400">Origen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {pendientes.map((lote) => (
                      <tr key={lote.id} className="hover:bg-gray-800/50">
                        <td className="p-3 font-mono text-orange-400 text-xs">{lote.lote_id}</td>
                        <td className="p-3">{lote.sku_producto}</td>
                        <td className="p-3 text-gray-300">{lote.nombre_producto}</td>
                        <td className="p-3 text-xs text-gray-400">{lote.tipo_producto}</td>
                        <td className="p-3 text-right font-bold">{lote.cantidad_actual}</td>
                        <td className="p-3 text-xs text-gray-400">{lote.oc_origen || lote.op_origen || '-'}</td>
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
        </>
      )}

      {/* Modal Historial */}
      {loteSeleccionado && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setLoteSeleccionado(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">📋 Historial: {loteSeleccionado}</h3>
              <button onClick={() => setLoteSeleccionado(null)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            {historialLote.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Sin movimientos registrados</p>
            ) : (
              <div className="space-y-3">
                {historialLote.map((mov, i) => (
                  <div key={i} className="bg-gray-800 rounded-lg p-3">
                    <div className="flex justify-between items-start">
                      <span className="font-mono text-sm text-orange-400">{mov.tipo}</span>
                      <span className="text-xs text-gray-400">{mov.fecha ? new Date(mov.fecha).toLocaleString('es-MX') : '-'}</span>
                    </div>
                    <div className="text-sm mt-1">Cantidad: <span className="font-bold">{mov.cantidad}</span></div>
                    {Object.keys(mov.detalles || {}).length > 0 && (
                      <div className="mt-2 text-xs text-gray-400">
                        {Object.entries(mov.detalles).map(([k, v]) => (
                          <div key={k}><span className="text-gray-500">{k}:</span> {String(v)}</div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal Ajustar */}
      {modalAjuste && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setModalAjuste(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">✏️ Ajustar Lote: {modalAjuste.lote_id}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-400">Nueva Cantidad</label>
                <input type="number" value={ajusteForm.nueva_cantidad} onChange={(e) => setAjusteForm(f => ({ ...f, nueva_cantidad: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1" />
              </div>
              <div>
                <label className="text-sm text-gray-400">Motivo</label>
                <input type="text" value={ajusteForm.motivo} onChange={(e) => setAjusteForm(f => ({ ...f, motivo: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1" placeholder="Motivo del ajuste" />
              </div>
              <div>
                <label className="text-sm text-gray-400">Responsable</label>
                <input type="text" value={ajusteForm.responsable} onChange={(e) => setAjusteForm(f => ({ ...f, responsable: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={handleAjustar} disabled={!ajusteForm.motivo || !ajusteForm.responsable}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium">Ajustar</button>
                <button onClick={() => setModalAjuste(null)} className="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm font-medium">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Scrap */}
      {modalScrap && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setModalScrap(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-4">🗑️ Scrap: {modalScrap.lote_id}</h3>
            <p className="text-sm text-gray-400 mb-3">Disponible: <span className="font-bold text-white">{modalScrap.cantidad_actual}</span></p>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-400">Cantidad Scrap</label>
                <input type="number" value={scrapForm.cantidad_scrap} onChange={(e) => setScrapForm(f => ({ ...f, cantidad_scrap: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1" />
              </div>
              <div>
                <label className="text-sm text-gray-400">Motivo</label>
                <input type="text" value={scrapForm.motivo} onChange={(e) => setScrapForm(f => ({ ...f, motivo: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1" />
              </div>
              <div>
                <label className="text-sm text-gray-400">Responsable</label>
                <input type="text" value={scrapForm.responsable} onChange={(e) => setScrapForm(f => ({ ...f, responsable: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={handleScrap} disabled={!scrapForm.cantidad_scrap || !scrapForm.motivo || !scrapForm.responsable}
                  className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-medium">Registrar Scrap</button>
                <button onClick={() => setModalScrap(null)} className="flex-1 bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm font-medium">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}