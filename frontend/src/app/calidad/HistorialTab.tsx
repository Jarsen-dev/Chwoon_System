'use client';

import { useEffect, useState } from 'react';
import {
  getInspecciones,
  descargarPdfInspeccion,
  getFotoIncidenciaBlob,
  registrarSegundaRevision,
} from '@/lib/api';
import type { InspeccionCalidad } from '@/types';
import { Button, Modal, LoadingSpinner, VisorFoto, Pagination } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import {
  IconDocumento, IconActualizar, IconCerrar, IconAlertas,
  IconOk, IconVer, IconCalidad,
} from '@/lib/icons';

interface Props {
  token: string;
}

/** Cada tab interna es un filtro `resultado` sobre el mismo endpoint; por eso
 *  la tabla ya no necesita columna de Resultado. */
const TABS = [
  { id: 'Aprobado',   label: 'Aprobados',  color: 'text-green-400', borde: 'border-green-400' },
  { id: 'Rechazado',  label: 'Rechazados', color: 'text-red-400',   borde: 'border-red-400' },
  { id: 'Cuarentena', label: 'Cuarentena', color: 'text-amber-400', borde: 'border-amber-400' },
] as const;

type TabId = typeof TABS[number]['id'];

const PAGE_SIZE = 50;

// Mismas clases que el patrón de filtros de Almacén (InventarioTab/TrasladosTab).
const INPUT_FILTRO =
  'bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/15 placeholder:text-gray-400';
const LABEL_FILTRO = 'text-xs font-semibold uppercase tracking-wider text-gray-300';

const tipoBadge: Record<string, { bg: string; text: string }> = {
  IQC:        { bg: 'bg-blue-900/40',   text: 'text-blue-400' },
  LQC:        { bg: 'bg-purple-900/40', text: 'text-purple-400' },
  OQC:        { bg: 'bg-indigo-900/40', text: 'text-indigo-400' },
  DEVOLUCION: { bg: 'bg-yellow-900/40', text: 'text-yellow-400' },
};

const formatFecha = (fecha?: string) => {
  if (!fecha) return 'N/A';
  try {
    return new Date(fecha).toLocaleString('es-MX', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return fecha;
  }
};

export default function HistorialTab({ token }: Props) {
  const [tab, setTab] = useState<TabId>('Aprobado');
  const [inspecciones, setInspecciones] = useState<InspeccionCalidad[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // Filtros
  const [busqueda, setBusqueda] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');

  const busquedaDebounced = useDebouncedValue(busqueda, 300);
  const hayFiltros = Boolean(busqueda || filtroTipo || fechaInicio || fechaFin);

  // Detalle y segunda revisión
  const [detalle, setDetalle] = useState<InspeccionCalidad | null>(null);
  const [revision, setRevision] = useState<InspeccionCalidad | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getInspecciones(token, {
      tipo: filtroTipo || undefined,
      resultado: tab,
      fecha_desde: fechaInicio || undefined,
      fecha_hasta: fechaFin || undefined,
      search: busquedaDebounced,
      limit: PAGE_SIZE,
      offset,
    }, controller.signal)
      .then(data => {
        setInspecciones(data.items);
        setTotal(data.total);
        if (data.total > 0 && offset >= data.total) {
          setOffset(Math.floor((data.total - 1) / PAGE_SIZE) * PAGE_SIZE);
        }
      })
      .catch((err: any) => { if (err.name !== 'AbortError') setError(err.message); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [token, tab, busquedaDebounced, filtroTipo, fechaInicio, fechaFin, offset, refreshKey]);

  // Cualquier cambio de filtro regresa a la primera página
  const cambiarBusqueda = (valor: string) => { setBusqueda(valor); setOffset(0); };
  const cambiarFiltroTipo = (valor: string) => { setFiltroTipo(valor); setOffset(0); };
  const cambiarFechaInicio = (valor: string) => { setFechaInicio(valor); setOffset(0); };
  const cambiarFechaFin = (valor: string) => { setFechaFin(valor); setOffset(0); };
  const cambiarTab = (t: TabId) => { setTab(t); setOffset(0); };

  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltroTipo('');
    setFechaInicio('');
    setFechaFin('');
    setOffset(0);
  };

  const descargarPdf = async (inspeccionId: string) => {
    try {
      await descargarPdfInspeccion(token, inspeccionId);
    } catch (err: any) {
      setError(err.message || 'No se pudo generar el PDF');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><IconDocumento size={24} className="text-[var(--accent)]" aria-hidden /> Historial de Inspecciones</h2>
          <p className="text-gray-300 text-sm mt-1">Registro completo de todas las inspecciones realizadas</p>
        </div>
        <Button onClick={() => setRefreshKey(k => k + 1)} leftIcon={IconActualizar}>Actualizar</Button>
      </div>

      {/* Tabs internas por resultado */}
      <div className="flex gap-2 border-b border-gray-800">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => cambiarTab(t.id)}
            className={`px-5 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? `${t.color} ${t.borde}`
                : 'text-gray-400 border-transparent hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label htmlFor="historial-busqueda" className={LABEL_FILTRO}>Búsqueda</label>
            <div className="relative">
              <input
                id="historial-busqueda"
                type="text"
                value={busqueda}
                onChange={e => cambiarBusqueda(e.target.value)}
                placeholder="Buscar no. de parte, descripción, inspector..."
                className={`w-full ${INPUT_FILTRO}`}
              />
              {loading && (
                <span
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full border-2 border-gray-600 border-t-cyan-400 animate-spin"
                  aria-label="Buscando..."
                />
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="historial-proceso" className={LABEL_FILTRO}>Proceso</label>
            <select
              id="historial-proceso"
              value={filtroTipo}
              onChange={e => cambiarFiltroTipo(e.target.value)}
              className={INPUT_FILTRO}
            >
              <option value="">Todos</option>
              <option value="IQC">IQC</option>
              <option value="LQC">LQC</option>
              <option value="OQC">OQC</option>
              <option value="DEVOLUCION">Devolución</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="historial-fecha-inicio" className={LABEL_FILTRO}>Fecha inicio</label>
            <input
              id="historial-fecha-inicio"
              type="date"
              value={fechaInicio}
              onChange={e => cambiarFechaInicio(e.target.value)}
              className={INPUT_FILTRO}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="historial-fecha-fin" className={LABEL_FILTRO}>Fecha fin</label>
            <input
              id="historial-fecha-fin"
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
      </div>

      {error && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-4 flex items-center justify-between">
          <p className="text-red-400 flex items-center gap-2"><IconAlertas size={16} aria-hidden /> {error}</p>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-300" aria-label="Cerrar"><IconCerrar size={16} aria-hidden /></button>
        </div>
      )}

      {loading && inspecciones.length === 0 ? (
        <div className="flex items-center justify-center h-48">
          <LoadingSpinner sizeClass="h-10 w-10" />
        </div>
      ) : (
        <>
          <p className="text-gray-300 text-sm">{total} inspecciones encontradas</p>

          <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 bg-gray-800 z-10">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-300">Fecha</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-300">Lote ID</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-300">Proceso</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-300">Número de parte</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-300">Descripción</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-300">Inspector</th>
                    <th className="text-center px-4 py-3 text-xs font-semibold text-gray-300">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {inspecciones.map((insp) => {
                    const badge = tipoBadge[insp.tipo_inspeccion] || { bg: 'bg-gray-800', text: 'text-gray-400' };
                    return (
                      <tr key={insp.id} className="border-t border-gray-800 hover:bg-gray-800/50">
                        <td className="px-4 py-3 text-xs text-gray-400">{formatFecha(insp.fecha)}</td>
                        <td className="px-4 py-3 text-xs font-mono text-white">{insp.lote_id || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium px-2 py-1 rounded-full ${badge.bg} ${badge.text}`}>
                            {insp.tipo_inspeccion}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-white">{insp.sku_producto}</td>
                        <td className="px-4 py-3 text-xs text-gray-300 max-w-[180px] truncate">
                          {insp.nombre_producto || 'N/A'}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-400">{insp.inspector}</td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex gap-1 justify-center">
                            <button
                              onClick={() => setDetalle(insp)}
                              className="inline-flex items-center bg-gray-700 hover:bg-gray-600 p-1.5 rounded transition-colors"
                              title="Ver detalle" aria-label="Ver detalle"
                            >
                              <IconVer size={14} aria-hidden />
                            </button>
                            <button
                              onClick={() => descargarPdf(insp.inspeccion_id)}
                              className="inline-flex items-center bg-purple-700 hover:bg-purple-600 p-1.5 rounded transition-colors"
                              title="Descargar PDF" aria-label="Descargar PDF"
                            >
                              <IconDocumento size={14} aria-hidden />
                            </button>
                            {tab === 'Cuarentena' && (
                              <button
                                onClick={() => setRevision(insp)}
                                className="inline-flex items-center bg-amber-600 hover:bg-amber-500 p-1.5 rounded transition-colors"
                                title="Segunda revisión" aria-label="Segunda revisión"
                              >
                                <IconCalidad size={14} aria-hidden />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {inspecciones.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                        No se encontraron inspecciones
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Pagination total={total} limit={PAGE_SIZE} offset={offset} onChange={setOffset} />
            <div className="ml-auto text-sm font-medium text-gray-400">
              Mostrando {inspecciones.length} de {total} inspecciones
            </div>
          </div>
        </>
      )}

      {/* Modal Detalle */}
      <Modal
        open={!!detalle}
        onClose={() => setDetalle(null)}
        size="3xl"
        title={<span className="text-cyan-400 font-mono">Detalle — {detalle?.inspeccion_id}</span>}
        footer={
          detalle ? (
            <>
              <Button variant="secondary" onClick={() => setDetalle(null)}>Cerrar</Button>
              <Button leftIcon={IconDocumento} onClick={() => descargarPdf(detalle.inspeccion_id)}>Descargar PDF</Button>
            </>
          ) : null
        }
      >
        {detalle && <DetalleInspeccion token={token} insp={detalle} />}
      </Modal>

      {/* Modal Segunda revisión */}
      <ModalSegundaRevision
        token={token}
        insp={revision}
        onClose={() => setRevision(null)}
        onListo={() => { setRevision(null); setRefreshKey(k => k + 1); }}
        onError={setError}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Detalle
// ══════════════════════════════════════════════════════════════════════

function DetalleInspeccion({ token, insp }: { token: string; insp: InspeccionCalidad }) {
  const respuestas = insp.respuestas || [];
  const puntos = insp.resultados_puntos || [];
  const segunda = insp.segunda_revision;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div><span className="text-gray-400">Proceso:</span> <span className="text-white ml-2">{insp.tipo_inspeccion}</span></div>
        <div><span className="text-gray-400">Resultado:</span> <span className={`ml-2 font-bold ${
          insp.resultado_final === 'Aprobado' ? 'text-green-400'
            : insp.resultado_final === 'Cuarentena' ? 'text-amber-400' : 'text-red-400'
        }`}>{insp.resultado_final}</span></div>
        <div><span className="text-gray-400">Lote ID:</span> <span className="text-white ml-2 font-mono">{insp.lote_id || 'N/A'}</span></div>
        <div><span className="text-gray-400">Número de parte:</span> <span className="text-white ml-2 font-mono">{insp.sku_producto}</span></div>
        <div><span className="text-gray-400">Descripción:</span> <span className="text-white ml-2">{insp.nombre_producto || 'N/A'}</span></div>
        <div><span className="text-gray-400">Cantidad:</span> <span className="text-white ml-2">{insp.cantidad_inspeccionada}</span></div>
        <div><span className="text-gray-400">Inspector:</span> <span className="text-white ml-2">{insp.inspector}</span></div>
        <div><span className="text-gray-400">Fecha:</span> <span className="text-white ml-2">{formatFecha(insp.fecha)}</span></div>
        {insp.oc_origen && <div><span className="text-gray-400">OC Origen:</span> <span className="text-white ml-2">{insp.oc_origen}</span></div>}
        {insp.op_origen && <div><span className="text-gray-400">OP Origen:</span> <span className="text-white ml-2">{insp.op_origen}</span></div>}
      </div>

      {respuestas.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-2">Evaluación</h4>
          <div className="space-y-2">
            {respuestas.map((r, i) => (
              <div key={i} className={`px-3 py-2 rounded-lg text-sm ${
                r.respuesta === 'Si' ? 'bg-green-900/20' : 'bg-red-900/20'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <span className="text-white">{r.pregunta}</span>
                  <span className={`font-bold shrink-0 ${r.respuesta === 'Si' ? 'text-green-400' : 'text-red-400'}`}>
                    {r.respuesta === 'Si' ? 'Sí' : 'No'}
                  </span>
                </div>
                {r.motivo && <p className="text-gray-400 text-xs mt-1 italic">Motivo: {r.motivo}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      <GaleriaFotos token={token} rutas={insp.fotos || []} />

      {segunda && (
        <div className="bg-amber-900/15 border border-amber-500/30 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-amber-400 mb-2">Historial de cuarentena</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div><span className="text-gray-400">Revisor:</span> <span className="text-white ml-2">{segunda.revisor}</span></div>
            <div><span className="text-gray-400">Fecha:</span> <span className="text-white ml-2">{formatFecha(segunda.fecha)}</span></div>
            <div>
              <span className="text-gray-400">¿El material cumple con todos los puntos de inspección?</span>
              <span className={`ml-2 font-bold ${segunda.ahora_ok ? 'text-green-400' : 'text-red-400'}`}>
                {segunda.ahora_ok ? 'Sí' : 'No'}
              </span>
            </div>
            <div><span className="text-gray-400">Cierre:</span> <span className="text-white ml-2">{segunda.resultado}</span></div>
          </div>
          {segunda.motivos_previos.length > 0 && (
            <div className="mt-3">
              <p className="text-xs font-semibold text-gray-300 mb-1">Motivos que originaron la cuarentena:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {segunda.motivos_previos.map((m, i) => (
                  <li key={i} className="text-xs text-gray-400">{m}</li>
                ))}
              </ul>
            </div>
          )}
          {segunda.notas && (
            <p className="text-xs text-gray-400 mt-2">Notas: {segunda.notas}</p>
          )}
        </div>
      )}

      {/* Inspecciones anteriores al cambio de formato */}
      {puntos.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-2">Puntos de Inspección</h4>
          <div className="space-y-1">
            {puntos.map((p, i) => (
              <div key={i} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${
                p.resultado === 'Conforme' ? 'bg-green-900/20' :
                p.resultado === 'No Conforme' ? 'bg-red-900/20' : 'bg-gray-800'
              }`}>
                <span className="text-white">{p.punto}</span>
                <span className={`font-medium ${
                  p.resultado === 'Conforme' ? 'text-green-400' :
                  p.resultado === 'No Conforme' ? 'text-red-400' : 'text-gray-400'
                }`}>
                  {p.resultado}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {insp.notas && (
        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-1">Notas</h4>
          <p className="text-sm text-gray-400 bg-gray-800 rounded-lg px-3 py-2">{insp.notas}</p>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Galería de evidencia
// ══════════════════════════════════════════════════════════════════════

/** El endpoint de fotos pide token y un <img src> no manda cabeceras, así que
 *  cada foto se baja como blob y se pinta desde un object URL. */
function GaleriaFotos({ token, rutas }: { token: string; rutas: string[] }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [ampliada, setAmpliada] = useState<string | null>(null);

  // El padre arma `rutas` con `insp.fotos || []`, así que su identidad cambia en
  // cada render: la dependencia es el contenido, no el array.
  const clave = rutas.join('|');

  useEffect(() => {
    const lista = clave ? clave.split('|') : [];
    // Sin fotos no se limpia el estado: la limpieza del efecto anterior ya
    // revocó esos object URLs y el componente no renderiza nada cuando
    // `rutas` viene vacío.
    if (lista.length === 0) return;

    let vigente = true;
    const creadas: string[] = [];

    void Promise.all(lista.map(r => getFotoIncidenciaBlob(token, r).catch(() => null)))
      .then(blobs => {
        if (!vigente) return;
        for (const b of blobs) {
          if (b) creadas.push(URL.createObjectURL(b));
        }
        setUrls(creadas);
      });

    return () => {
      vigente = false;
      creadas.forEach(URL.revokeObjectURL);
    };
  }, [token, clave]);

  if (rutas.length === 0) return null;

  // Al cambiar de inspección los object URLs anteriores quedan revocados: se
  // descarta la ampliación en el render en vez de resetearla desde el efecto.
  const ampliadaVigente = ampliada && urls.includes(ampliada) ? ampliada : null;

  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-300 mb-2">
        Evidencia fotográfica ({rutas.length})
      </h4>
      {urls.length === 0 ? (
        <LoadingSpinner sizeClass="h-6 w-6" />
      ) : (
        <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
          {urls.map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={() => setAmpliada(url)}
              className="rounded-lg overflow-hidden border border-gray-700 hover:border-cyan-500/60 transition"
              title="Ampliar"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Evidencia ${i + 1}`} className="w-full aspect-square object-cover" />
            </button>
          ))}
        </div>
      )}

      {ampliadaVigente && (
        <div className="mt-3">
          <VisorFoto src={ampliadaVigente} alt="Evidencia" alturaClase="h-[50vh]" dentroDeModal />
          <div className="flex justify-end mt-2">
            <Button size="sm" variant="secondary" onClick={() => setAmpliada(null)}>Cerrar vista</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Segunda revisión
// ══════════════════════════════════════════════════════════════════════

function ModalSegundaRevision({
  token, insp, onClose, onListo, onError,
}: {
  token: string;
  insp: InspeccionCalidad | null;
  onClose: () => void;
  onListo: () => void;
  onError: (msg: string) => void;
}) {
  const [ahoraOk, setAhoraOk] = useState<boolean | null>(null);
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);

  // Cada apertura empieza limpia
  useEffect(() => { setAhoraOk(null); setNotas(''); }, [insp?.inspeccion_id]);

  if (!insp) return null;

  const motivos = (insp.respuestas || [])
    .filter(r => r.respuesta === 'No' && r.motivo)
    .map(r => ({ pregunta: r.pregunta, motivo: r.motivo as string }));

  const cerrar = async (resultado: 'Aprobado' | 'Rechazado') => {
    setGuardando(true);
    try {
      await registrarSegundaRevision(token, insp.inspeccion_id, {
        ahora_ok: ahoraOk === true,
        resultado,
        notas: notas.trim() || undefined,
      });
      onListo();
    } catch (err: any) {
      onError(err.message || 'No se pudo registrar la segunda revisión');
      onClose();
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="2xl"
      title={<span className="text-amber-400 flex items-center gap-2"><IconCalidad size={18} aria-hidden /> Segunda revisión — {insp.lote_id || insp.inspeccion_id}</span>}
      footer={<Button variant="secondary" onClick={onClose}>Cancelar</Button>}
    >
      <div className="space-y-5">
        <div>
          <h4 className="text-sm font-semibold text-gray-300 mb-2">Motivos del rechazo original</h4>
          {motivos.length === 0 ? (
            <p className="text-sm text-gray-500">Sin motivos registrados.</p>
          ) : (
            <div className="space-y-2">
              {motivos.map((m, i) => (
                <div key={i} className="bg-red-900/20 rounded-lg px-3 py-2">
                  <p className="text-xs text-gray-400">{m.pregunta}</p>
                  <p className="text-sm text-white mt-0.5">{m.motivo}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <GaleriaFotos token={token} rutas={insp.fotos || []} />

        <div>
          <p className="text-white font-medium mb-3">¿El material cumple con todos los puntos de inspección?</p>
          <div className="flex gap-3">
            <Button
              variant={ahoraOk === true ? 'primary' : 'ghost'}
              leftIcon={IconOk}
              onClick={() => setAhoraOk(true)}
            >
              Sí
            </Button>
            <Button
              variant={ahoraOk === false ? 'danger' : 'ghost'}
              leftIcon={IconCerrar}
              onClick={() => setAhoraOk(false)}
            >
              No
            </Button>
          </div>
        </div>

        {ahoraOk !== null && (
          <>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Notas de la revisión (opcional)</label>
              <textarea
                value={notas}
                onChange={e => setNotas(e.target.value)}
                rows={2}
                placeholder="Retrabajo aplicado, acuerdo con el proveedor..."
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white
                           placeholder-gray-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex justify-end">
              {ahoraOk ? (
                <Button size="lg" leftIcon={IconOk} disabled={guardando} onClick={() => cerrar('Aprobado')}>
                  {guardando ? 'Guardando...' : 'Aprobado'}
                </Button>
              ) : (
                <Button size="lg" variant="danger" leftIcon={IconCerrar} disabled={guardando} onClick={() => cerrar('Rechazado')}>
                  {guardando ? 'Guardando...' : 'Rechazar'}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
