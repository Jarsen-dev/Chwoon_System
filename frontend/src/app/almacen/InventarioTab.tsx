'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getLotesInventario,
  getLotesAprobadosSinUbicacion,
  getUbicaciones,
  transferirLotes,
  solicitarModificacionLote,
} from '@/lib/api';
import { LoteInventario, UbicacionAlmacen } from '@/types';
import { Button, Modal, LoadingSpinner, Pagination } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  IconInventario, IconPendiente, IconFifo, IconActualizar,
  IconAlertas, IconUbicaciones, IconBuscar,
} from '@/lib/icons';

interface Props {
  token: string;
}

type Vista = 'lotes' | 'pendientes' | 'fifo';
type Notificar = (msg: string, tipo?: 'ok' | 'err') => void;

const PAGE_SIZE = 50;

const INPUT_FILTRO =
  'bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 placeholder:text-gray-400';
const INPUT_MODAL =
  'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]';
const LABEL_FILTRO = 'text-xs font-semibold uppercase tracking-wider text-gray-300';

function formatFecha(iso?: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return iso; }
}

export default function InventarioTab({ token }: Props) {
  const [vista, setVista] = useState<Vista>('lotes');
  const [notif, setNotif] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);

  const notificar = useCallback<Notificar>((msg, tipo = 'ok') => {
    setNotif({ msg, tipo });
    setTimeout(() => setNotif(null), 5000);
  }, []);

  return (
    <div className="space-y-4">
      {notif && (
        <div className={`p-3 rounded-lg text-sm font-medium ${notif.tipo === 'ok' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
          {notif.msg}
        </div>
      )}

      {/* Selector de vista */}
      <div className="flex gap-2">
        {(['lotes', 'pendientes', 'fifo'] as Vista[]).map((v) => {
          const Icon = v === 'lotes' ? IconInventario : v === 'pendientes' ? IconPendiente : IconFifo;
          const txt = v === 'lotes' ? 'Todos los Lotes' : v === 'pendientes' ? 'Pendientes Ubicar' : 'FIFO Viewer';
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

      {vista === 'lotes' && <VistaLotes token={token} notificar={notificar} />}
      {vista === 'pendientes' && <VistaPendientes token={token} notificar={notificar} />}
      {vista === 'fifo' && <VistaFifo token={token} notificar={notificar} />}
    </div>
  );
}

// ============================================================
// TODOS LOS LOTES
// ============================================================
function VistaLotes({ token, notificar }: { token: string; notificar: Notificar }) {
  const [lotes, setLotes] = useState<LoteInventario[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [busqueda, setBusqueda] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [modalSolicitud, setModalSolicitud] = useState<LoteInventario | null>(null);

  const busquedaDebounced = useDebouncedValue(busqueda, 300);
  const hayFiltros = Boolean(busqueda || fechaInicio || fechaFin);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getLotesInventario(token, {
      estado: 'Aprobado',
      search: busquedaDebounced,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      limit: PAGE_SIZE,
      offset,
    }, controller.signal)
      .then(data => {
        setLotes(data.items);
        setTotal(data.total);
        if (data.total > 0 && offset >= data.total) {
          setOffset(Math.floor((data.total - 1) / PAGE_SIZE) * PAGE_SIZE);
        }
      })
      .catch(err => { if (err.name !== 'AbortError') notificar(err.message, 'err'); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [token, busquedaDebounced, fechaInicio, fechaFin, offset, refreshKey, notificar]);

  // Cualquier cambio de filtro devuelve a la primera página
  const cambiarBusqueda = (valor: string) => { setBusqueda(valor); setOffset(0); };
  const cambiarFechaInicio = (valor: string) => { setFechaInicio(valor); setOffset(0); };
  const cambiarFechaFin = (valor: string) => { setFechaFin(valor); setOffset(0); };

  const limpiarFiltros = () => {
    setBusqueda('');
    setFechaInicio('');
    setFechaFin('');
    setOffset(0);
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">Lotes aprobados</h2>
        <div className="flex items-center gap-3">
          <span className="bg-gray-800 text-gray-400 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-800">
            {total} lote{total !== 1 ? 's' : ''}
          </span>
          <Button size="sm" variant="ghost" leftIcon={IconActualizar} onClick={() => setRefreshKey(k => k + 1)}>
            Actualizar
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-2 mb-4">
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label htmlFor="lotes-busqueda" className={LABEL_FILTRO}>Búsqueda</label>
          <div className="relative">
            <input
              id="lotes-busqueda"
              type="text"
              value={busqueda}
              onChange={e => cambiarBusqueda(e.target.value)}
              placeholder="Buscar no. parte, descripción, cantidad, ubicación, remisión..."
              className={`w-full ${INPUT_FILTRO}`}
            />
            {loading && (
              <span
                className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full border-2 border-gray-600 border-t-blue-400 animate-spin"
                aria-label="Buscando..."
              />
            )}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="lotes-fecha-inicio" className={LABEL_FILTRO}>Fecha inicio</label>
          <input
            id="lotes-fecha-inicio"
            type="date"
            value={fechaInicio}
            onChange={e => cambiarFechaInicio(e.target.value)}
            className={INPUT_FILTRO}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="lotes-fecha-fin" className={LABEL_FILTRO}>Fecha fin</label>
          <input
            id="lotes-fecha-fin"
            type="date"
            value={fechaFin}
            onChange={e => cambiarFechaFin(e.target.value)}
            className={INPUT_FILTRO}
          />
        </div>
        {hayFiltros && (
          <div className="flex items-center gap-2 ml-auto pb-2">
            <button
              onClick={limpiarFiltros}
              className="text-xs text-gray-400 hover:text-red-400 underline underline-offset-2 transition-colors"
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      <div className="overflow-x-auto max-h-[600px] rounded-lg border border-gray-800">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-950 z-10">
            <tr className="text-left text-xs uppercase tracking-wider text-gray-400">
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Lote ID</th>
              <th className="px-4 py-3">No. Parte</th>
              <th className="px-4 py-3">Descripción</th>
              <th className="px-4 py-3 text-right">Cantidad</th>
              <th className="px-4 py-3">Ubicación</th>
              <th className="px-4 py-3">Remisión</th>
              <th className="px-4 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center"><LoadingSpinner label="Cargando…" /></td></tr>
            ) : lotes.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-gray-500">No se encontraron lotes</td></tr>
            ) : lotes.map(lote => (
              <tr key={lote.id} className="hover:bg-gray-800/50 transition">
                <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{formatFecha(lote.fecha_recepcion)}</td>
                <td className="px-4 py-3 font-mono text-orange-400 text-xs">{lote.lote_id}</td>
                <td className="px-4 py-3 font-mono text-xs text-white">{lote.sku_producto}</td>
                <td className="px-4 py-3 text-gray-300">{lote.nombre_producto}</td>
                <td className="px-4 py-3 text-right font-bold">{lote.cantidad_actual}</td>
                <td className="px-4 py-3 text-gray-300">{lote.nombre_ubicacion}</td>
                <td className="px-4 py-3 text-gray-300">{lote.numero_remision || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-center">
                    <button
                      onClick={() => setModalSolicitud(lote)}
                      className="inline-flex items-center bg-amber-600/30 hover:bg-amber-600/50 p-1.5 rounded text-amber-300 transition"
                      title="Solicitar modificación"
                      aria-label="Solicitar modificación"
                    ><IconAlertas size={14} aria-hidden /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Pagination total={total} limit={PAGE_SIZE} offset={offset} onChange={setOffset} />
        <div className="ml-auto text-sm font-medium text-gray-400">
          Mostrando {lotes.length} de {total} lotes
        </div>
      </div>

      <ModalSolicitud
        token={token}
        lote={modalSolicitud}
        onClose={() => setModalSolicitud(null)}
        notificar={notificar}
      />
    </div>
  );
}

// ============================================================
// MODAL: solicitud de modificación
// ============================================================
function ModalSolicitud({ token, lote, onClose, notificar }: {
  token: string;
  lote: LoteInventario | null;
  onClose: () => void;
  notificar: Notificar;
}) {
  const [motivo, setMotivo] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cerrar = () => {
    setMotivo('');
    setMensaje('');
    onClose();
  };

  const enviar = async () => {
    if (!lote) return;
    try {
      setEnviando(true);
      await solicitarModificacionLote(token, lote.lote_id, { motivo, mensaje });
      notificar('Solicitud enviada');
      cerrar();
    } catch (e: any) {
      notificar(e.message, 'err');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Modal
      open={!!lote}
      onClose={cerrar}
      title={
        <span className="flex items-center gap-2">
          <IconAlertas size={18} aria-hidden /> Solicitar modificación: <span className="font-mono">{lote?.lote_id}</span>
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={cerrar}>Cancelar</Button>
          <Button onClick={enviar} disabled={!motivo.trim() || !mensaje.trim() || enviando}>
            {enviando ? 'Enviando…' : 'Enviar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="text-sm text-gray-300">Motivo</label>
          <input
            type="text"
            value={motivo}
            onChange={e => setMotivo(e.target.value)}
            placeholder="Cantidad incorrecta, número de parte equivocado..."
            className={INPUT_MODAL}
          />
        </div>
        <div>
          <label className="text-sm text-gray-300">Mensaje</label>
          <textarea
            rows={4}
            value={mensaje}
            onChange={e => setMensaje(e.target.value)}
            placeholder="Describe la modificación que se requiere"
            className={`${INPUT_MODAL} resize-y`}
          />
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// PENDIENTES DE UBICAR
// ============================================================
function VistaPendientes({ token, notificar }: { token: string; notificar: Notificar }) {
  const [pendientes, setPendientes] = useState<LoteInventario[]>([]);
  const [ubicaciones, setUbicaciones] = useState<UbicacionAlmacen[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalUbicar, setModalUbicar] = useState<LoteInventario | null>(null);

  const cargar = useCallback(async () => {
    try {
      setLoading(true);
      const [lotes, ubis] = await Promise.all([
        getLotesAprobadosSinUbicacion(token),
        getUbicaciones(token),
      ]);
      setPendientes(lotes);
      setUbicaciones(ubis);
    } catch (e: any) {
      notificar(e.message, 'err');
    } finally {
      setLoading(false);
    }
  }, [token, notificar]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">Lotes pendientes de ubicar</h2>
        <div className="flex items-center gap-3">
          <span className="bg-gray-800 text-gray-400 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-800">
            {pendientes.length} lote{pendientes.length !== 1 ? 's' : ''}
          </span>
          <Button size="sm" variant="ghost" leftIcon={IconActualizar} onClick={cargar}>Actualizar</Button>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[600px] rounded-lg border border-gray-800">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-950 z-10">
            <tr className="text-left text-xs uppercase tracking-wider text-gray-400">
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Lote ID</th>
              <th className="px-4 py-3">No. Parte</th>
              <th className="px-4 py-3">Descripción</th>
              <th className="px-4 py-3 text-right">Cantidad</th>
              <th className="px-4 py-3">Remisión</th>
              <th className="px-4 py-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center"><LoadingSpinner label="Cargando…" /></td></tr>
            ) : pendientes.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">No hay lotes pendientes de ubicar</td></tr>
            ) : pendientes.map(lote => (
              <tr key={lote.id} className="hover:bg-gray-800/50 transition">
                <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{formatFecha(lote.fecha_recepcion)}</td>
                <td className="px-4 py-3 font-mono text-orange-400 text-xs">{lote.lote_id}</td>
                <td className="px-4 py-3 font-mono text-xs text-white">{lote.sku_producto}</td>
                <td className="px-4 py-3 text-gray-300">{lote.nombre_producto}</td>
                <td className="px-4 py-3 text-right font-bold">{lote.cantidad_actual}</td>
                <td className="px-4 py-3 text-gray-300">{lote.numero_remision || '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-center">
                    <button
                      onClick={() => setModalUbicar(lote)}
                      className="inline-flex items-center bg-[var(--accent)]/25 hover:bg-[var(--accent)]/40 p-1.5 rounded text-[var(--accent)] transition"
                      title="Asignar ubicación"
                      aria-label="Asignar ubicación"
                    ><IconUbicaciones size={14} aria-hidden /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ModalUbicar
        token={token}
        lote={modalUbicar}
        ubicaciones={ubicaciones}
        onClose={() => setModalUbicar(null)}
        onUbicado={cargar}
        notificar={notificar}
      />
    </div>
  );
}

// ============================================================
// MODAL: asignar ubicación
// ============================================================
function ModalUbicar({ token, lote, ubicaciones, onClose, onUbicado, notificar }: {
  token: string;
  lote: LoteInventario | null;
  ubicaciones: UbicacionAlmacen[];
  onClose: () => void;
  onUbicado: () => void;
  notificar: Notificar;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [seleccion, setSeleccion] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Solo las hojas del árbol reciben material: un rack padre es una agrupación,
  // no una posición física.
  const hojas = useMemo(() => {
    const padres = new Set(
      ubicaciones.map(u => u.parent_id).filter((p): p is number => p != null)
    );
    const porId = new Map(ubicaciones.map(u => [u.id, u]));
    const ruta = (u: UbicacionAlmacen) => {
      const partes = [u.nombre];
      let actual = u.parent_id != null ? porId.get(u.parent_id) : undefined;
      let saltos = 0;
      while (actual && saltos < 20) {
        partes.unshift(actual.nombre);
        actual = actual.parent_id != null ? porId.get(actual.parent_id) : undefined;
        saltos++;
      }
      return partes.join(' › ');
    };
    return ubicaciones
      .filter(u => u.activa && !padres.has(u.id))
      .map(u => ({ id: u.id, nombre: u.nombre, tipo_zona: u.tipo_zona, ruta: ruta(u) }))
      .sort((a, b) => a.ruta.localeCompare(b.ruta, 'es'));
  }, [ubicaciones]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return hojas;
    return hojas.filter(u => u.ruta.toLowerCase().includes(q));
  }, [hojas, busqueda]);

  const cerrar = () => {
    setBusqueda('');
    setSeleccion(null);
    onClose();
  };

  const guardar = async () => {
    if (!lote || seleccion == null) return;
    const destino = hojas.find(u => u.id === seleccion);
    if (!destino) return;
    try {
      setGuardando(true);
      await transferirLotes(token, [{
        lote_id: lote.lote_id,
        sku_producto: lote.sku_producto,
        destino_id: destino.id,
        destino_nombre: destino.nombre,
      }]);
      notificar(`Lote ${lote.lote_id} ubicado en ${destino.nombre}`);
      cerrar();
      onUbicado();
    } catch (e: any) {
      notificar(e.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open={!!lote}
      onClose={cerrar}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <IconUbicaciones size={18} aria-hidden /> Asignar ubicación: <span className="font-mono">{lote?.lote_id}</span>
        </span>
      }
      footer={
        <>
          <Button variant="secondary" onClick={cerrar}>Cancelar</Button>
          <Button onClick={guardar} disabled={seleccion == null || guardando}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar ubicación..."
          className={`w-full ${INPUT_FILTRO}`}
        />
        <div className="max-h-[320px] overflow-y-auto rounded-lg border border-gray-800 divide-y divide-gray-800">
          {filtradas.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-500">No hay ubicaciones disponibles</p>
          ) : filtradas.map(u => (
            <button
              key={u.id}
              onClick={() => setSeleccion(u.id)}
              className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition ${
                seleccion === u.id ? 'bg-[var(--accent)]/20 text-white' : 'text-gray-300 hover:bg-gray-800/60'
              }`}
            >
              <span className="text-sm">{u.ruta}</span>
              <span className="shrink-0 bg-gray-800 text-gray-400 text-xs px-2 py-0.5 rounded">{u.tipo_zona}</span>
            </button>
          ))}
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// FIFO VIEWER
// ============================================================
function VistaFifo({ token, notificar }: { token: string; notificar: Notificar }) {
  const [entrada, setEntrada] = useState('');
  const [consulta, setConsulta] = useState('');
  const [lotes, setLotes] = useState<LoteInventario[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // `consulta` solo se llena desde el botón Buscar: nunca vuelve a vacío
    if (!consulta) return;
    const controller = new AbortController();
    setLoading(true);
    getLotesInventario(token, {
      sku: consulta,
      estado: 'Aprobado',
      orden: 'antiguos',
      limit: PAGE_SIZE,
      offset,
    }, controller.signal)
      .then(data => {
        setLotes(data.items);
        setTotal(data.total);
        if (data.total > 0 && offset >= data.total) {
          setOffset(Math.floor((data.total - 1) / PAGE_SIZE) * PAGE_SIZE);
        }
      })
      .catch(err => { if (err.name !== 'AbortError') notificar(err.message, 'err'); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [token, consulta, offset, notificar]);

  const buscar = () => {
    setOffset(0);
    setConsulta(entrada.trim());
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
        <h3 className="text-lg font-bold mb-3 flex items-center gap-2">
          <IconFifo size={18} className="text-[var(--accent)]" aria-hidden /> Consulta FIFO
        </h3>
        <p className="text-xs text-gray-400 mb-3">
          Lotes disponibles del número de parte, del más viejo al más nuevo.
        </p>
        <div className="flex gap-3 items-end">
          <div className="flex flex-col gap-1 flex-1 max-w-sm">
            <label htmlFor="fifo-sku" className={LABEL_FILTRO}>Número de parte</label>
            <input
              id="fifo-sku"
              value={entrada}
              onChange={e => setEntrada(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') buscar(); }}
              placeholder="Número de parte..."
              className={`font-mono ${INPUT_FILTRO}`}
            />
          </div>
          <Button onClick={buscar} leftIcon={IconBuscar} disabled={!entrada.trim() || loading}>
            {loading ? 'Buscando…' : 'Buscar'}
          </Button>
        </div>
      </div>

      {consulta && (
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="overflow-x-auto max-h-[600px] rounded-lg border border-gray-800">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-950 z-10">
                <tr className="text-left text-xs uppercase tracking-wider text-gray-400">
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Lote ID</th>
                  <th className="px-4 py-3">No. Parte</th>
                  <th className="px-4 py-3">Descripción</th>
                  <th className="px-4 py-3 text-right">Cantidad</th>
                  <th className="px-4 py-3">Ubicación</th>
                  <th className="px-4 py-3">Remisión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center"><LoadingSpinner label="Cargando…" /></td></tr>
                ) : lotes.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">Sin stock disponible para este número de parte</td></tr>
                ) : lotes.map(lote => (
                  <tr key={lote.id} className="hover:bg-gray-800/50 transition">
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{formatFecha(lote.fecha_recepcion)}</td>
                    <td className="px-4 py-3 font-mono text-orange-400 text-xs">{lote.lote_id}</td>
                    <td className="px-4 py-3 font-mono text-xs text-white">{lote.sku_producto}</td>
                    <td className="px-4 py-3 text-gray-300">{lote.nombre_producto}</td>
                    <td className="px-4 py-3 text-right font-bold">{lote.cantidad_actual}</td>
                    <td className="px-4 py-3 text-gray-300">{lote.nombre_ubicacion}</td>
                    <td className="px-4 py-3 text-gray-300">{lote.numero_remision || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Pagination total={total} limit={PAGE_SIZE} offset={offset} onChange={setOffset} />
            <div className="ml-auto text-sm font-medium text-gray-400">
              Mostrando {lotes.length} de {total} lotes
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
