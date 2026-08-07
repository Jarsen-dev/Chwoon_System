'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  getLoteEtiqueta,
  registrarInspeccion,
  descargarPdfInspeccion,
} from '@/lib/api';
import type { LoteEtiquetaInfo } from '@/types';
import { Button } from '@/components/ui';
import InspeccionEvaluacion, { type EvaluacionPayload } from '@/components/calidad/InspeccionEvaluacion';
import {
  IconBuscar, IconAlertas, IconCerrar, IconOk, IconCalidad, IconInventario,
  IconRecepciones, IconDocumento, IconCamara,
} from '@/lib/icons';

interface Props {
  token: string;
}

type ModoVista = 'scanner' | 'info' | 'inspeccion' | 'resultado';

/** Lote de etiqueta de recepción: AAAAMMDD_remisión_parte_N (ej. 20260731_1846_7801_1).
 *  Es lo ÚNICO que IQC acepta — los lotes con guiones del flujo de OC ya no. */
const LOTE_ETIQUETA_RE = /^\d{8}_[A-Z0-9]{4}_[A-Z0-9]{4}_\d+$/;

const MSG_FORMATO_INVALIDO =
  'Este código no es una etiqueta de lote válida. Escanea el QR de la etiqueta impresa de la recepción.';

/** Algunos escáneres emiten "?" en lugar de "_" según la distribución del
 *  teclado — mismo tratamiento que ScannerTab y CuartoSecadoTab. */
const normalizarLote = (texto: string) => texto.toUpperCase().replace(/\?/g, '_');

const ESTILO_RESULTADO: Record<string, { caja: string; texto: string; icono: typeof IconOk }> = {
  Aprobado:   { caja: 'bg-green-900/20 border-green-500/50', texto: 'text-green-400', icono: IconOk },
  Rechazado:  { caja: 'bg-red-900/20 border-red-500/50',     texto: 'text-red-400',   icono: IconCerrar },
  Cuarentena: { caja: 'bg-amber-900/20 border-amber-500/50', texto: 'text-amber-400', icono: IconAlertas },
};

export default function IQCTab({ token }: Props) {
  // ── Estado ────────────────────────────────────────────────────────
  const [modo, setModo] = useState<ModoVista>('scanner');
  const [inputValue, setInputValue] = useState('');
  const [loteInfo, setLoteInfo] = useState<LoteEtiquetaInfo | null>(null);
  const [notas, setNotas] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [ultimaInspeccionId, setUltimaInspeccionId] = useState<string | null>(null);
  const [ultimoResultado, setUltimoResultado] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Scanner cámara ────────────────────────────────────────────────
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerRef = useRef<HTMLDivElement | null>(null);
  const procesarLoteRef = useRef<(loteId: string) => Promise<void>>(async () => {});

  // ── Auto-focus en scanner ─────────────────────────────────────────
  useEffect(() => {
    if (modo === 'scanner') {
      const interval = setInterval(() => {
        if (document.activeElement !== inputRef.current) {
          inputRef.current?.focus();
        }
      }, 500);
      return () => clearInterval(interval);
    }
  }, [modo]);

  // ── Limpiar mensajes automáticamente ──────────────────────────────
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(''), 15000);
      return () => clearTimeout(t);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(''), 10000);
      return () => clearTimeout(t);
    }
  }, [error]);

  // ── Procesar escaneo ──────────────────────────────────────────────
  const procesarLote = useCallback(async (loteId: string) => {
    const codigo = normalizarLote(loteId.trim());
    if (!codigo) return;

    // Se valida antes de salir a la red: cualquier cosa que no sea una etiqueta
    // de lote (incluidos los lotes con guiones del flujo de OC) se rechaza aquí.
    if (!LOTE_ETIQUETA_RE.test(codigo)) {
      setError(MSG_FORMATO_INVALIDO);
      setSuccess('');
      return;
    }

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const info = await getLoteEtiqueta(token, codigo);
      setLoteInfo(info);
      setModo('info');
    } catch (err: any) {
      setError(err.message || 'Error al consultar lote');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Guardar ref siempre actualizada de procesarLote
  useEffect(() => {
    procesarLoteRef.current = procesarLote;
  }, [procesarLote]);

  // ── Scanner cámara ──────────────────────────────────────────────
  const abrirScanner = async () => {
    setScannerError(null);
    setScannerOpen(true);
    setTimeout(async () => {
      if (!scannerContainerRef.current) return;
      try {
        const scanner = new Html5Qrcode('reader-iqc');
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            void scanner.stop().then(() => {
              scannerRef.current = null;
              setScannerOpen(false);
              const normalizado = normalizarLote(decodedText);
              setInputValue(normalizado);
              void procesarLoteRef.current(normalizado);
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

  // ── Handlers input ────────────────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = normalizarLote(e.target.value);
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

  // ── Iniciar inspección ────────────────────────────────────────────
  const iniciarInspeccion = () => {
    if (!loteInfo) return;
    setModo('inspeccion');
  };

  // ── Enviar inspección ─────────────────────────────────────────────
  const enviarInspeccion = async (payload: EvaluacionPayload) => {
    if (!loteInfo) return;

    setLoading(true);
    setError('');

    try {
      const res = await registrarInspeccion(token, {
        lote_id: loteInfo.lote_id,
        sku_producto: loteInfo.sku_producto,
        nombre_producto: loteInfo.nombre_producto || undefined,
        tipo_inspeccion: 'IQC',
        resultado_final: payload.resultado_final,
        resultados_puntos: [],
        respuestas: payload.respuestas,
        fotos: payload.fotos,
        // Sin oc_origen: esta recepción viene de una hoja de remisión, no de
        // una OC (por eso tampoco corre el scoring de proveedor en el backend).
        cantidad_inspeccionada: loteInfo.cantidad,
        notas: notas || undefined,
      });

      setUltimaInspeccionId(res.inspeccion_id);
      setUltimoResultado(payload.resultado_final);
      setSuccess(`Inspección ${res.inspeccion_id} registrada — Resultado: ${payload.resultado_final}`);
      setModo('resultado');
    } catch (err: any) {
      setError(err.message || 'Error al registrar inspección');
    } finally {
      setLoading(false);
    }
  };

  // ── Descargar PDF ─────────────────────────────────────────────────
  const handleDescargarPdf = async () => {
    if (!ultimaInspeccionId) return;
    try {
      await descargarPdfInspeccion(token, ultimaInspeccionId);
    } catch (err: any) {
      setError(err.message);
    }
  };

  // ── Nuevo escaneo ─────────────────────────────────────────────────
  const nuevoEscaneo = () => {
    setModo('scanner');
    setLoteInfo(null);
    setNotas('');
    setInputValue('');
    setUltimaInspeccionId(null);
    setUltimoResultado(null);
    setError('');
    setSuccess('');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // ══════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Mensajes */}
      {error && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-4 flex items-center justify-between">
          <p className="text-red-400 flex items-center gap-2"><IconAlertas size={16} aria-hidden /> {error}</p>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-300" aria-label="Cerrar"><IconCerrar size={16} aria-hidden /></button>
        </div>
      )}
      {success && (
        <div className="bg-green-900/30 border border-green-500/50 rounded-xl p-4 flex items-center justify-between">
          <p className="text-green-400 flex items-center gap-2"><IconOk size={16} aria-hidden /> {success}</p>
          <button onClick={() => setSuccess('')} className="text-green-400 hover:text-green-300" aria-label="Cerrar"><IconCerrar size={16} aria-hidden /></button>
        </div>
      )}

      {/* ═══ MODO: SCANNER ═══ */}
      {modo === 'scanner' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2"><IconBuscar size={24} className="text-[var(--accent)]" aria-hidden /> Inspección IQC</h2>
            <p className="text-gray-300 text-sm mt-1">
              Escanee o ingrese un Lote ID para iniciar la inspección de entrada
            </p>
          </div>

          <div className="bg-gray-900 rounded-xl border border-cyan-500/30 p-8">
            <div className="flex justify-center">
              <div className="w-full max-w-xl relative flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Escanear el QR de la etiqueta de lote..."
                  className="flex-1 bg-gray-800 border-2 border-cyan-500/50 rounded-xl px-6 py-5 text-xl
                             text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400
                             focus:ring-2 focus:ring-cyan-400/30 transition-all"
                  autoFocus
                  autoComplete="off"
                />
                <button
                  onClick={abrirScanner}
                  type="button"
                  title="Escanear con cámara"
                  className="shrink-0 inline-flex items-center justify-center
                             w-14 h-14 rounded-xl border-2 border-cyan-500/50
                             bg-cyan-900/30 text-cyan-400 hover:bg-cyan-900/50
                             hover:text-cyan-300 hover:border-cyan-400
                             active:scale-95 transition-all"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
                {loading && (
                  <div className="absolute right-20 top-1/2 -translate-y-1/2">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-400" />
                  </div>
                )}
              </div>
            </div>
            <p className="text-gray-500 text-sm mt-3 text-center">
              Solo se acepta la etiqueta de lote de la recepción:{' '}
              <span className="text-cyan-400 font-mono">AAAAMMDD_remisión_parte_N</span>
              {' '}— ej. <span className="text-cyan-400 font-mono">20260731_1846_7801_1</span>
              {' '}(el escáner convierte automáticamente <span className="text-yellow-400">?</span> → <span className="text-cyan-400">_</span>)
            </p>
          </div>
        </div>
      )}

      {/* ═══ MODO: INFO LOTE ═══ */}
      {modo === 'info' && loteInfo && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2"><IconBuscar size={24} className="text-[var(--accent)]" aria-hidden /> IQC — Información del Lote</h2>
              <p className="text-gray-300 text-sm mt-1">Verifique los datos antes de iniciar la inspección</p>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={nuevoEscaneo}>Escanear otro</Button>
              <Button onClick={iniciarInspeccion} leftIcon={IconCalidad}>Iniciar Inspección</Button>
            </div>
          </div>

          {/* Ya inspeccionado antes: se avisa pero no se bloquea — re-inspeccionar
              tras un retrabajo es legítimo y el backend sobrescribe el estado. */}
          {loteInfo.estado_calidad !== 'Pendiente IQC' && (
            <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 rounded-xl px-4 py-3 text-sm flex items-center gap-2">
              <IconAlertas size={18} aria-hidden />
              Esta caja ya fue inspeccionada — estado actual:{' '}
              <span className="font-semibold">{loteInfo.estado_calidad}</span>.
              Si continúas, el resultado se reemplazará.
            </div>
          )}

          {/* Tarjetas de información */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Producto */}
            <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 space-y-3">
              <h3 className="text-lg font-semibold text-cyan-400 flex items-center gap-2"><IconInventario size={18} aria-hidden /> Producto</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Lote ID:</span>
                  <span className="font-mono text-white">{loteInfo.lote_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Número de parte:</span>
                  <span className="font-mono text-white">{loteInfo.sku_producto}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-gray-400 shrink-0">Descripción:</span>
                  <span className="text-white text-right">{loteInfo.nombre_producto || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Cantidad:</span>
                  <span className="text-white font-semibold">
                    {loteInfo.cantidad.toLocaleString('es-MX')} {loteInfo.unidad_de_medida || ''}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Tarima:</span>
                  <span className="text-white">{loteInfo.secuencia} de {loteInfo.total_etiquetas}</span>
                </div>
              </div>
            </div>

            {/* Remisión */}
            <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 space-y-3">
              <h3 className="text-lg font-semibold text-emerald-400 flex items-center gap-2"><IconRecepciones size={18} aria-hidden /> Remisión</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-gray-400 shrink-0">Proveedor:</span>
                  <span className="text-white text-right">{loteInfo.proveedor}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">No. Remisión:</span>
                  <span className="font-mono text-white">{loteInfo.numero_remision}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">PO:</span>
                  <span className="text-white">{loteInfo.po || '—'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Fecha de la hoja:</span>
                  <span className="text-white">{loteInfo.fecha_hoja}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Recibido:</span>
                  <span className="text-white">{loteInfo.fecha_recepcion}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Formato:</span>
                  <span className="text-gray-300 text-xs bg-gray-800 px-2 py-0.5 rounded">{loteInfo.tipo_documento}</span>
                </div>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* ═══ MODO: INSPECCIÓN ═══ */}
      {modo === 'inspeccion' && loteInfo && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2"><IconCalidad size={24} className="text-[var(--accent)]" aria-hidden /> Inspección IQC en Curso</h2>
              <p className="text-gray-300 text-sm mt-1">
                <span className="font-mono text-cyan-400">{loteInfo.lote_id}</span>
                {' — '}{loteInfo.sku_producto} — {loteInfo.nombre_producto || 'N/A'}
              </p>
            </div>
            <Button variant="secondary" onClick={() => setModo('info')}>Volver a Info</Button>
          </div>

          {/* Ayudas visuales + preguntas + notas + evidencia */}
          <InspeccionEvaluacion
            token={token}
            sku={loteInfo.sku_producto}
            loteId={loteInfo.lote_id}
            onRegistrar={enviarInspeccion}
            guardando={loading}
            notas={notas}
            onNotasChange={setNotas}
          />
        </div>
      )}

      {/* ═══ MODO: RESULTADO ═══ */}
      {modo === 'resultado' && loteInfo && (
        <div className="space-y-6">
          <div className={`rounded-xl border-2 p-8 text-center ${ESTILO_RESULTADO[ultimoResultado ?? 'Rechazado'].caja}`}>
            <div className="flex justify-center mb-4">
              {(() => {
                const Icono = ESTILO_RESULTADO[ultimoResultado ?? 'Rechazado'].icono;
                return <Icono size={56} className={ESTILO_RESULTADO[ultimoResultado ?? 'Rechazado'].texto} aria-hidden />;
              })()}
            </div>
            <h2 className={`text-3xl font-bold ${ESTILO_RESULTADO[ultimoResultado ?? 'Rechazado'].texto}`}>
              {(ultimoResultado ?? 'Rechazado').toUpperCase()}
            </h2>
            {ultimoResultado === 'Cuarentena' && (
              <p className="text-amber-300/80 text-sm mt-2">
                El lote queda retenido; resuélvelo desde Historial → Cuarentena → Segunda revisión.
              </p>
            )}
            <p className="text-gray-400 mt-2">
              Lote: <span className="font-mono text-white">{loteInfo.lote_id}</span>
              {' — '}SKU: <span className="font-mono text-white">{loteInfo.sku_producto}</span>
            </p>
            {ultimaInspeccionId && (
              <p className="text-gray-500 text-sm mt-1">
                ID: <span className="font-mono">{ultimaInspeccionId}</span>
              </p>
            )}
          </div>

          <div className="flex justify-center gap-4">
            {ultimaInspeccionId && (
              <Button size="lg" variant="secondary" onClick={handleDescargarPdf} leftIcon={IconDocumento}>Descargar PDF</Button>
            )}
            <Button size="lg" onClick={nuevoEscaneo} leftIcon={IconBuscar}>Escanear Otro Lote</Button>
          </div>
        </div>
      )}

      {/* ═── Modal Scanner de Cámara ───═ */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2"><IconCamara size={18} aria-hidden /> Escanear QR</h3>
              <button
                onClick={cerrarScanner}
                className="text-gray-400 hover:text-white leading-none" aria-label="Cerrar"
              ><IconCerrar size={20} aria-hidden /></button>
            </div>
            <div
              ref={scannerContainerRef}
              id="reader-iqc"
              className="w-full aspect-square rounded-xl overflow-hidden bg-black"
            />
            {scannerError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                <p className="font-semibold flex items-center gap-1"><IconAlertas size={14} aria-hidden /> Error de cámara</p>
                <p className="text-xs">{scannerError}</p>
              </div>
            )}
            <p className="text-xs text-gray-400 text-center">
              Apunta el código QR dentro del recuadro
            </p>
          </div>
        </div>
      )}
    </div>
  );
}