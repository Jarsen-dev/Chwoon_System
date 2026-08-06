'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  verificarLoteTraslado,
  surtirMaterial,
  getRegistrosSalidaProduccion,
  getUbicaciones,
} from '@/lib/api';
import { RegistroSalidaProduccion, UbicacionAlmacen } from '@/types';
import { Button, Modal, LoadingSpinner, Pagination } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  IconTraslados, IconLista, IconHistorial, IconCamara, IconCerrar,
  IconAlertas, IconEjecutar, IconUbicaciones,
} from '@/lib/icons';

interface Props {
  token: string;
}

type Vista = 'escanear' | 'registros';
type Notificar = (msg: string, tipo?: 'ok' | 'err') => void;

const PAGE_SIZE = 50;

const INPUT_FILTRO =
  'bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 placeholder:text-gray-400';
const LABEL_FILTRO = 'text-xs font-semibold uppercase tracking-wider text-gray-300';

function formatFecha(iso?: string) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return iso; }
}

interface FilaExtraccion {
  lote_id: string;
  sku_producto: string;
  nombre_producto: string;
  fecha_recepcion?: string;
  cantidad: string;
  cantidadMax: number;
  inventario: number;
}

interface Advertencia {
  lote_id: string;
  prioritario_id: string;
  prioritario_ubicacion: string;
}

export default function TrasladosTab({ token }: Props) {
  const [vista, setVista] = useState<Vista>('escanear');
  const [notif, setNotif] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);
  const [refreshRegistros, setRefreshRegistros] = useState(0);

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

      <div className="flex gap-2">
        {(['escanear', 'registros'] as Vista[]).map((v) => {
          const Icon = v === 'escanear' ? IconLista : IconHistorial;
          const txt = v === 'escanear' ? 'Escanear' : 'Registros';
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

      {vista === 'escanear' && (
        <VistaEscanear token={token} notificar={notificar} onSurtido={() => setRefreshRegistros(k => k + 1)} />
      )}
      {vista === 'registros' && (
        <VistaRegistros token={token} notificar={notificar} refreshKey={refreshRegistros} />
      )}
    </div>
  );
}

// ============================================================
// ESCANEAR
// ============================================================
function VistaEscanear({ token, notificar, onSurtido }: {
  token: string;
  notificar: Notificar;
  onSurtido: () => void;
}) {
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lista, setLista] = useState<FilaExtraccion[]>([]);
  const [resaltado, setResaltado] = useState<string | null>(null);
  const [advertencia, setAdvertencia] = useState<Advertencia | null>(null);

  const [modalSurtir, setModalSurtir] = useState(false);
  const [ubicaciones, setUbicaciones] = useState<UbicacionAlmacen[]>([]);
  const [ubicacionDestino, setUbicacionDestino] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Scanner cámara ────────────────────────────────────────────────
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerRef = useRef<HTMLDivElement | null>(null);
  const procesarLoteRef = useRef<(codigo: string) => Promise<void>>(async () => {});

  useEffect(() => {
    const interval = setInterval(() => {
      if (!modalSurtir && !scannerOpen && document.activeElement !== inputRef.current) {
        inputRef.current?.focus();
      }
    }, 500);
    return () => clearInterval(interval);
  }, [modalSurtir, scannerOpen]);

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(''), 10000);
      return () => clearTimeout(t);
    }
  }, [error]);

  useEffect(() => {
    if (resaltado) {
      const t = setTimeout(() => setResaltado(null), 2500);
      return () => clearTimeout(t);
    }
  }, [resaltado]);

  const procesarLote = useCallback(async (codigoRaw: string) => {
    // Algunos escáneres emiten "?" en lugar de "_" según la distribución del
    // teclado — mismo tratamiento que IQCTab, ScannerTab y CuartoSecadoTab.
    const codigo = codigoRaw.trim().toUpperCase().replace(/\?/g, '_');
    if (!codigo) return;

    setLoading(true);
    setError('');

    try {
      const info = await verificarLoteTraslado(token, codigo);

      setLista(prev => {
        if (prev.some(f => f.lote_id === info.lote.lote_id)) {
          setResaltado(info.lote.lote_id);
          return prev;
        }
        if (!info.es_mas_antiguo) {
          setAdvertencia({
            lote_id: info.lote.lote_id,
            prioritario_id: info.lote_prioritario_id || '—',
            prioritario_ubicacion: info.lote_prioritario_ubicacion || '—',
          });
          return prev;
        }
        return [...prev, {
          lote_id: info.lote.lote_id,
          sku_producto: info.lote.sku_producto,
          nombre_producto: info.lote.nombre_producto || 'N/A',
          fecha_recepcion: info.lote.fecha_recepcion,
          cantidad: String(info.lote.cantidad_actual),
          cantidadMax: info.lote.cantidad_actual,
          inventario: info.stock_total_sku,
        }];
      });
    } catch (err: any) {
      setError(err.message || 'Error al verificar el lote');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    procesarLoteRef.current = procesarLote;
  }, [procesarLote]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value;
    setInputValue(valor);
    if (scanTimer.current) clearTimeout(scanTimer.current);
    if (valor.trim()) {
      scanTimer.current = setTimeout(() => {
        procesarLote(valor.trim());
        setInputValue('');
      }, 800);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (scanTimer.current) clearTimeout(scanTimer.current);
      const valor = inputValue.trim();
      if (valor) {
        procesarLote(valor);
        setInputValue('');
      }
    }
  };

  // ── Scanner cámara ────────────────────────────────────────────────
  const abrirScanner = async () => {
    setScannerError(null);
    setScannerOpen(true);
    setTimeout(async () => {
      if (!scannerContainerRef.current) return;
      try {
        const scanner = new Html5Qrcode('reader-traslados');
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            void scanner.stop().then(() => {
              scannerRef.current = null;
              setScannerOpen(false);
              void procesarLoteRef.current(decodedText);
            });
          },
          () => {}
        );
      } catch (err: any) {
        setScannerError(err?.message || 'No se pudo iniciar la cámara');
        if (scannerRef.current) {
          try { await scannerRef.current.stop(); } catch {}
          scannerRef.current = null;
        }
      }
    }, 300);
  };

  const cerrarScanner = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch {}
      scannerRef.current = null;
    }
    setScannerOpen(false);
    setScannerError(null);
  };

  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        void scannerRef.current.stop();
        scannerRef.current = null;
      }
    };
  }, []);

  // ── Lista en construcción ────────────────────────────────────────
  const quitarFila = (loteId: string) => {
    setLista(prev => prev.filter(f => f.lote_id !== loteId));
  };

  const actualizarCantidad = (loteId: string, valor: string) => {
    setLista(prev => prev.map(f => (f.lote_id === loteId ? { ...f, cantidad: valor } : f)));
  };

  const listaValida = useMemo(() => {
    if (lista.length === 0) return false;
    return lista.every(f => {
      const n = parseFloat(f.cantidad);
      return !isNaN(n) && n > 0 && n <= f.cantidadMax;
    });
  }, [lista]);

  // ── Modal Surtir ──────────────────────────────────────────────────
  const abrirSurtir = async () => {
    if (!listaValida) {
      notificar('Revisa las cantidades: deben ser mayores a 0 y no exceder el stock del lote.', 'err');
      return;
    }
    try {
      const ubis = await getUbicaciones(token);
      setUbicaciones(ubis.filter(u => u.tipo_zona === 'PRODUCCION'));
      setUbicacionDestino(null);
      setModalSurtir(true);
    } catch (err: any) {
      notificar(err.message, 'err');
    }
  };

  const confirmarSurtir = async () => {
    if (!ubicacionDestino || !listaValida) return;
    try {
      setGuardando(true);
      await surtirMaterial(token, {
        ubicacion_produccion_id: ubicacionDestino,
        items: lista.map(f => ({
          lote_id: f.lote_id,
          sku_producto: f.sku_producto,
          cantidad: parseFloat(f.cantidad),
        })),
      });
      notificar('Material surtido correctamente');
      setLista([]);
      setModalSurtir(false);
      setUbicacionDestino(null);
      onSurtido();
    } catch (err: any) {
      notificar(err.message, 'err');
    } finally {
      setGuardando(false);
    }
  };

  const destinoSeleccionado = ubicaciones.find(u => u.id === ubicacionDestino);

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-4 flex items-center justify-between">
          <p className="text-red-400 flex items-center gap-2 text-sm"><IconAlertas size={16} aria-hidden /> {error}</p>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-300" aria-label="Cerrar"><IconCerrar size={16} aria-hidden /></button>
        </div>
      )}

      {/* Input de escaneo */}
      <div className="bg-gray-900 rounded-xl border border-[var(--accent)]/30 p-6">
        <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-1">
          <IconTraslados size={20} className="text-[var(--accent)]" aria-hidden /> Escanear lote a extraer
        </h2>
        <p className="text-xs text-gray-400 mb-4">
          Escanea el QR de la etiqueta del lote ya ubicado en almacén. Se valida automáticamente que sea el más viejo de su número de parte (FIFO).
        </p>
        <div className="flex justify-center">
          <div className="w-full max-w-xl relative flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Escanear o escribir el Lote ID..."
              className="flex-1 bg-gray-800 border-2 border-[var(--accent)]/50 rounded-xl px-6 py-4 text-lg
                         text-white placeholder-gray-500 focus:outline-none focus:border-[var(--accent)]
                         focus:ring-2 focus:ring-[var(--accent)]/30 transition-all font-mono"
              autoComplete="off"
            />
            <button
              onClick={abrirScanner}
              type="button"
              title="Escanear con cámara"
              className="shrink-0 inline-flex items-center justify-center
                         w-14 h-14 rounded-xl border-2 border-[var(--accent)]/50
                         bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20
                         active:scale-95 transition-all"
            >
              <IconCamara size={26} aria-hidden />
            </button>
            {loading && (
              <div className="absolute right-20 top-1/2 -translate-y-1/2">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[var(--accent)]" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Lista en construcción */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Material a extraer</h2>
          <div className="flex items-center gap-3">
            <span className="bg-gray-800 text-gray-400 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-800">
              {lista.length} lote{lista.length !== 1 ? 's' : ''}
            </span>
            <Button
              size="sm"
              leftIcon={IconEjecutar}
              onClick={abrirSurtir}
              disabled={lista.length === 0}
            >
              Surtir Material
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-gray-400">
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Lote</th>
                <th className="px-4 py-3">No. Parte</th>
                <th className="px-4 py-3">Descripción</th>
                <th className="px-4 py-3 text-right">Cantidad</th>
                <th className="px-4 py-3 text-right">Inventario</th>
                <th className="px-4 py-3 text-center">Quitar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {lista.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">Escanea un lote para comenzar</td></tr>
              ) : lista.map(f => (
                <tr key={f.lote_id} className={`transition ${resaltado === f.lote_id ? 'bg-[var(--accent)]/20' : ''}`}>
                  <td className="px-4 py-2 text-gray-300 whitespace-nowrap">{formatFecha(f.fecha_recepcion)}</td>
                  <td className="px-4 py-2 font-mono text-orange-400 text-xs">{f.lote_id}</td>
                  <td className="px-4 py-2 font-mono text-xs text-white">{f.sku_producto}</td>
                  <td className="px-4 py-2 text-gray-300">{f.nombre_producto}</td>
                  <td className="px-4 py-2 text-right">
                    <input
                      type="number"
                      value={f.cantidad}
                      onChange={e => actualizarCantidad(f.lote_id, e.target.value)}
                      min={0}
                      max={f.cantidadMax}
                      step="any"
                      className="w-24 text-right bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    />
                  </td>
                  <td className="px-4 py-2 text-right font-bold">{f.inventario}</td>
                  <td className="px-4 py-2">
                    <div className="flex justify-center">
                      <button
                        onClick={() => quitarFila(f.lote_id)}
                        className="inline-flex items-center bg-red-600/20 hover:bg-red-600/40 p-1.5 rounded text-red-400 transition"
                        title="Quitar de la lista"
                        aria-label="Quitar de la lista"
                      ><IconCerrar size={14} aria-hidden /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal advertencia FIFO */}
      <Modal
        open={!!advertencia}
        onClose={() => setAdvertencia(null)}
        title={
          <span className="flex items-center gap-2 text-amber-400">
            <IconAlertas size={18} aria-hidden /> Advertencia FIFO
          </span>
        }
        footer={<Button onClick={() => setAdvertencia(null)}>OK</Button>}
      >
        <div className="space-y-2 text-sm text-gray-200">
          <p>El lote escaneado <span className="font-mono text-orange-400">{advertencia?.lote_id}</span> no es el más viejo disponible de ese número de parte.</p>
          <p>
            Debes extraer primero el lote{' '}
            <span className="font-mono text-orange-400">{advertencia?.prioritario_id}</span>, ubicado en{' '}
            <span className="font-semibold text-white">{advertencia?.prioritario_ubicacion}</span>.
          </p>
        </div>
      </Modal>

      {/* Modal Surtir Material */}
      <Modal
        open={modalSurtir}
        onClose={() => setModalSurtir(false)}
        size="lg"
        title={
          <span className="flex items-center gap-2">
            <IconEjecutar size={18} aria-hidden /> Surtir Material
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalSurtir(false)} disabled={guardando}>Cancelar</Button>
            <Button onClick={confirmarSurtir} disabled={!ubicacionDestino || guardando}>
              {guardando ? 'Confirmando…' : 'Confirmar'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className={LABEL_FILTRO}>Ubicación de producción</label>
            <select
              value={ubicacionDestino ?? ''}
              onChange={e => setUbicacionDestino(e.target.value ? Number(e.target.value) : null)}
              className={`w-full mt-1 ${INPUT_FILTRO}`}
            >
              <option value="">Selecciona una ubicación…</option>
              {ubicaciones.map(u => (
                <option key={u.id} value={u.id}>{u.nombre}</option>
              ))}
            </select>
            {ubicaciones.length === 0 && (
              <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                <IconAlertas size={12} aria-hidden /> No hay ubicaciones de producción configuradas.
              </p>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-800">
                <tr className="text-left text-xs uppercase tracking-wider text-gray-400">
                  <th className="px-3 py-2">Lote</th>
                  <th className="px-3 py-2">No. Parte</th>
                  <th className="px-3 py-2">Descripción</th>
                  <th className="px-3 py-2 text-right">Cantidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {lista.map(f => (
                  <tr key={f.lote_id}>
                    <td className="px-3 py-2 font-mono text-orange-400 text-xs">{f.lote_id}</td>
                    <td className="px-3 py-2 font-mono text-xs">{f.sku_producto}</td>
                    <td className="px-3 py-2 text-gray-300">{f.nombre_producto}</td>
                    <td className="px-3 py-2 text-right font-bold">{f.cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {destinoSeleccionado && (
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <IconUbicaciones size={12} aria-hidden /> Destino: <span className="text-white font-semibold">{destinoSeleccionado.nombre}</span>
            </p>
          )}
        </div>
      </Modal>

      {/* Modal Scanner de Cámara */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2"><IconCamara size={18} aria-hidden /> Escanear QR</h3>
              <button onClick={cerrarScanner} className="text-gray-400 hover:text-white leading-none" aria-label="Cerrar">
                <IconCerrar size={20} aria-hidden />
              </button>
            </div>
            <div ref={scannerContainerRef} id="reader-traslados" className="w-full aspect-square rounded-xl overflow-hidden bg-black" />
            {scannerError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                <p className="font-semibold flex items-center gap-1"><IconAlertas size={14} aria-hidden /> Error de cámara</p>
                <p className="text-xs">{scannerError}</p>
              </div>
            )}
            <p className="text-xs text-gray-400 text-center">Apunta el código QR dentro del recuadro</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// REGISTROS
// ============================================================
function VistaRegistros({ token, notificar, refreshKey }: {
  token: string;
  notificar: Notificar;
  refreshKey: number;
}) {
  const [registros, setRegistros] = useState<RegistroSalidaProduccion[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  const busquedaDebounced = useDebouncedValue(busqueda, 300);
  const hayFiltros = Boolean(busqueda || fechaInicio || fechaFin);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    getRegistrosSalidaProduccion(token, {
      search: busquedaDebounced,
      fecha_inicio: fechaInicio,
      fecha_fin: fechaFin,
      limit: PAGE_SIZE,
      offset,
    }, controller.signal)
      .then(data => {
        setRegistros(data.items);
        setTotal(data.total);
        if (data.total > 0 && offset >= data.total) {
          setOffset(Math.floor((data.total - 1) / PAGE_SIZE) * PAGE_SIZE);
        }
      })
      .catch(err => { if (err.name !== 'AbortError') notificar(err.message, 'err'); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [token, busquedaDebounced, fechaInicio, fechaFin, offset, refreshKey, notificar]);

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
        <h2 className="text-lg font-bold text-white">Salidas a producción</h2>
        <span className="bg-gray-800 text-gray-400 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-800">
          {total} registro{total !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-2 mb-4">
        <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
          <label htmlFor="registros-busqueda" className={LABEL_FILTRO}>Búsqueda</label>
          <div className="relative">
            <input
              id="registros-busqueda"
              type="text"
              value={busqueda}
              onChange={e => cambiarBusqueda(e.target.value)}
              placeholder="Buscar no. parte, descripción, cantidad, ubicación almacén, ubicación producción..."
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
          <label htmlFor="registros-fecha-inicio" className={LABEL_FILTRO}>Fecha inicio</label>
          <input
            id="registros-fecha-inicio"
            type="date"
            value={fechaInicio}
            onChange={e => cambiarFechaInicio(e.target.value)}
            className={INPUT_FILTRO}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="registros-fecha-fin" className={LABEL_FILTRO}>Fecha fin</label>
          <input
            id="registros-fecha-fin"
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
              <th className="px-4 py-3">Lote</th>
              <th className="px-4 py-3">No. Parte</th>
              <th className="px-4 py-3">Descripción</th>
              <th className="px-4 py-3 text-right">Cantidad</th>
              <th className="px-4 py-3">Ubicación Almacén</th>
              <th className="px-4 py-3">Ubicación Producción</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center"><LoadingSpinner label="Cargando…" /></td></tr>
            ) : registros.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">Sin registros de salida</td></tr>
            ) : registros.map(r => (
              <tr key={r.id} className="hover:bg-gray-800/50 transition">
                <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{formatFecha(r.fecha)}</td>
                <td className="px-4 py-3 font-mono text-orange-400 text-xs">{r.lote_id}</td>
                <td className="px-4 py-3 font-mono text-xs text-white">{r.sku_producto}</td>
                <td className="px-4 py-3 text-gray-300">{r.nombre_producto}</td>
                <td className="px-4 py-3 text-right font-bold">{r.cantidad}</td>
                <td className="px-4 py-3 text-gray-300">{r.ubicacion_almacen_nombre}</td>
                <td className="px-4 py-3 text-gray-300">{r.ubicacion_produccion_nombre}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Pagination total={total} limit={PAGE_SIZE} offset={offset} onChange={setOffset} />
        <div className="ml-auto text-sm font-medium text-gray-400">
          Mostrando {registros.length} de {total} registros
        </div>
      </div>
    </div>
  );
}
