'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  getProducto,
  searchProductos,
  registrarInspeccion,
  descargarPdfInspeccion,
} from '@/lib/api';
import type { CaracteristicasInyeccion } from '@/types';
import { Button } from '@/components/ui';
import InspeccionEvaluacion, { type EvaluacionPayload } from '@/components/calidad/InspeccionEvaluacion';
import {
  IconProduccion, IconCalidad, IconCamara, IconInventario, IconInyeccion,
  IconDocumento, IconOk, IconCerrar, IconAlertas, IconBuscar,
} from '@/lib/icons';

interface Props {
  token: string;
}

interface LoteInfoLQC {
  qr_raw: string;
  numero_parte: string;          // Código escaneado del QR (ej: 024A)
  numero_parte_completo: string; // SKU completo encontrado en BD (ej: 5208JJ1024A)
  maquina: string;
  turno: string;
  fecha: string;
  carrito: string;
  sku_producto: string;
  nombre_producto: string;
  tipo: string;
  clase_producto: string;
  unidad_de_medida: string;
  descripcion: string;
  cantidad_carrito: number;
  linea_produccion: string;
  ubicacion: string;
  controles_calidad: string[];
  caracteristicas_inyeccion?: CaracteristicasInyeccion;
}

type ModoVista = 'scanner' | 'info' | 'inspeccion' | 'resultado';

// ── Validación QR inyección ────────────────────────────────────────
// Formato obligatorio: PARTE_TURNO_FECHA_MAQUINA_CARRITO
function parseQRInyeccion(codigo: string): {
  parte: string; turno: string; fecha: string; maquina: string; carrito: string
} | null {
  const limpio = codigo.trim().toUpperCase().replace(/\?/g, '_');
  const partes = limpio.split('_');
  if (partes.length !== 5) return null;

  const parte = partes[0];
  const turno = partes[1];
  const fecha = partes[2];
  const maquina = partes[3];
  const carrito = partes[4];

  if (!/^[DN]$/.test(turno)) return null;
  if (!/^\d{6,10}$/.test(fecha)) return null;
  if (!/^\d+$/.test(carrito)) return null;

  return { parte, turno, fecha, maquina, carrito };
}

const ESTILO_RESULTADO: Record<string, { caja: string; texto: string; icono: typeof IconOk }> = {
  Aprobado:   { caja: 'bg-green-900/20 border-green-500/50', texto: 'text-green-400', icono: IconOk },
  Rechazado:  { caja: 'bg-red-900/20 border-red-500/50',     texto: 'text-red-400',   icono: IconCerrar },
  Cuarentena: { caja: 'bg-amber-900/20 border-amber-500/50', texto: 'text-amber-400', icono: IconAlertas },
};

export default function LQCTab({ token }: Props) {
  // ── Estado ────────────────────────────────────────────────────────
  const [modo, setModo] = useState<ModoVista>('scanner');
  const [inputValue, setInputValue] = useState('');
  const [loteInfo, setLoteInfo] = useState<LoteInfoLQC | null>(null);
  const [notas, setNotas] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [ultimaInspeccionId, setUltimaInspeccionId] = useState<string | null>(null);
  const [ultimoResultado, setUltimoResultado] = useState<string | null>(null);

  // ── Scanner cámara ────────────────────────────────────────────────
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerContainerRef = useRef<HTMLDivElement | null>(null);
  const procesarLoteRef = useRef<(loteId: string) => Promise<void>>(async () => {});

  const inputRef = useRef<HTMLInputElement>(null);
  const scanTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const procesarLote = useCallback(async (raw: string) => {
    if (!raw.trim()) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      const parsed = parseQRInyeccion(raw);
      if (!parsed) {
        throw new Error('Formato de QR inválido. Se espera: PARTE_TURNO_FECHA_MAQUINA_CARRITO (ej: 024A_D_20260518_16_01)');
      }

      // ── Obtener producto (con fallback por búsqueda) ──
      let producto;
      try {
        producto = await getProducto(parsed.parte);
      } catch {
        // 1) Intentar búsqueda por sufijo en BD
        const busqueda = await searchProductos(parsed.parte);
        const candidatos = busqueda.filter(p =>
          p.sku.toUpperCase().endsWith(parsed.parte)
        );
        if (candidatos.length > 0) {
          // Elegir el más corto (generalmente el más específico)
          candidatos.sort((a, b) => a.sku.length - b.sku.length);
          producto = candidatos[0];
        } else if (busqueda.length > 0) {
          producto = busqueda[0];
        } else {
          // 2) Fallback: parte_turno
          producto = await getProducto(`${parsed.parte}_${parsed.turno}`);
        }
      }

      const skuCompleto = producto.sku;

      setLoteInfo({
        qr_raw: raw.trim().toUpperCase(),
        numero_parte: parsed.parte,
        numero_parte_completo: skuCompleto,
        maquina: parsed.maquina,
        turno: parsed.turno,
        fecha: parsed.fecha,
        carrito: parsed.carrito,
        sku_producto: skuCompleto,
        nombre_producto: producto.descripcion || producto.sku,
        tipo: producto.tipo,
        clase_producto: producto.clase_producto,
        unidad_de_medida: producto.unidad_de_medida,
        descripcion: producto.descripcion,
        cantidad_carrito: producto.cantidad_carrito,
        linea_produccion: producto.linea_produccion,
        ubicacion: producto.ubicacion,
        controles_calidad: producto.controles_calidad || [],
        caracteristicas_inyeccion: producto.caracteristicas_inyeccion,
      });

      setModo('info');
    } catch (err: any) {
      setError(err.message || 'Error al procesar código QR');
    } finally {
      setLoading(false);
    }
    // Sin dependencias: getProducto y searchProductos son endpoints públicos,
    // aquí ya no se piden los puntos de inspección con el token.
  }, []);

  // Guardar ref siempre actualizada
  useEffect(() => {
    procesarLoteRef.current = procesarLote;
  }, [procesarLote]);

  // ── Handlers input ────────────────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value.replace(/'/g, '-').toUpperCase();
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

  // ── Scanner cámara ──────────────────────────────────────────────
  const abrirScanner = async () => {
    setScannerError(null);
    setScannerOpen(true);
    setTimeout(async () => {
      if (!scannerContainerRef.current) return;
      try {
        const scanner = new Html5Qrcode('reader-lqc');
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            void scanner.stop().then(() => {
              scannerRef.current = null;
              setScannerOpen(false);
              const normalizado = decodedText.toUpperCase().replace(/'/g, '-');
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
        // El QR del carrito identifica el lote inspeccionado: nombra la carpeta
        // de evidencia y llena la columna Lote ID del historial. El backend solo
        // toca lotes_inventario cuando el tipo es IQC, así que no afecta stock.
        lote_id: loteInfo.qr_raw,
        sku_producto: loteInfo.sku_producto,
        nombre_producto: loteInfo.nombre_producto || undefined,
        tipo_inspeccion: 'LQC',
        resultado_final: payload.resultado_final,
        resultados_puntos: [],
        respuestas: payload.respuestas,
        fotos: payload.fotos,
        cantidad_inspeccionada: loteInfo.cantidad_carrito,
        notas: notas || undefined,
      });

      setUltimaInspeccionId(res.inspeccion_id);
      setUltimoResultado(payload.resultado_final);
      setSuccess(`Inspección LQC ${res.inspeccion_id} — Resultado: ${payload.resultado_final}`);
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
            <h2 className="text-2xl font-bold flex items-center gap-2"><IconProduccion size={24} className="text-[var(--accent)]" aria-hidden /> Inspección LQC</h2>
            <p className="text-gray-300 text-sm mt-1">
              Escanee el código QR del carrito de inyección para iniciar la inspección en línea
            </p>
          </div>

          <div className="bg-gray-900 rounded-xl border border-purple-500/30 p-8">
            <div className="flex justify-center">
              <div className="w-full max-w-xl relative flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Escanear código QR..."
                  className="flex-1 bg-gray-800 border-2 border-purple-500/50 rounded-xl px-6 py-5 text-xl
                             text-white placeholder-gray-500 focus:outline-none focus:border-purple-400
                             focus:ring-2 focus:ring-purple-400/30 transition-all"
                  autoFocus
                  autoComplete="off"
                />
                <button
                  onClick={abrirScanner}
                  type="button"
                  title="Escanear con cámara"
                  className="shrink-0 inline-flex items-center justify-center
                             w-14 h-14 rounded-xl border-2 border-purple-500/50
                             bg-purple-900/30 text-purple-400 hover:bg-purple-900/50
                             hover:text-purple-300 hover:border-purple-400
                             active:scale-95 transition-all"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </button>
              </div>
            </div>
            <p className="text-gray-500 text-sm mt-3 text-center">
              Formato esperado: <span className="text-purple-400 font-mono">PARTE_TURNO_FECHA_MAQUINA_CARRITO</span>
            </p>
          </div>
        </div>
      )}

      {/* ═══ MODO: INFO LOTE ═══ */}
      {modo === 'info' && loteInfo && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2"><IconProduccion size={24} className="text-[var(--accent)]" aria-hidden /> LQC — Información del Lote</h2>
              <p className="text-gray-300 text-sm mt-1">Verifique los datos antes de iniciar la inspección</p>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={nuevoEscaneo}>Escanear otro</Button>
              <Button onClick={iniciarInspeccion} leftIcon={IconCalidad}>Iniciar Inspección LQC</Button>
            </div>
          </div>

          {/* Datos del QR escaneado */}
          <div className="bg-gray-900 rounded-xl border border-purple-500/30 p-6 space-y-3">
            <h3 className="text-lg font-semibold text-purple-400 flex items-center gap-2"><IconCamara size={18} aria-hidden /> Datos del QR</h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-sm">
              <div>
                <span className="text-gray-400 block">No. Parte</span>
                <span className="font-mono text-white font-semibold">{loteInfo.numero_parte_completo}</span>
                {loteInfo.numero_parte !== loteInfo.numero_parte_completo && (
                  <span className="text-xs text-gray-500 block">(QR: {loteInfo.numero_parte})</span>
                )}
              </div>
              <div>
                <span className="text-gray-400 block">Máquina</span>
                <span className="text-white font-semibold">{loteInfo.maquina}</span>
              </div>
              <div>
                <span className="text-gray-400 block">Carrito</span>
                <span className="font-mono text-white font-semibold">#{loteInfo.carrito}</span>
              </div>
              <div>
                <span className="text-gray-400 block">Turno</span>
                <span className="text-white">{loteInfo.turno === 'D' ? 'Día' : 'Noche'}</span>
              </div>
              <div>
                <span className="text-gray-400 block">Fecha</span>
                <span className="font-mono text-white">{loteInfo.fecha}</span>
              </div>
            </div>
          </div>

          {/* Producto */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 space-y-3">
              <h3 className="text-lg font-semibold text-purple-400 flex items-center gap-2"><IconInventario size={18} aria-hidden /> Producto</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">SKU:</span>
                  <span className="font-mono text-white">{loteInfo.sku_producto}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Nombre:</span>
                  <span className="text-white">{loteInfo.nombre_producto || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Tipo:</span>
                  <span className="text-white">{loteInfo.tipo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Clase:</span>
                  <span className="text-white">{loteInfo.clase_producto}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">UOM:</span>
                  <span className="text-white">{loteInfo.unidad_de_medida}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Cantidad Carrito:</span>
                  <span className="text-white font-semibold">{loteInfo.cantidad_carrito}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Línea Producción:</span>
                  <span className="text-white">{loteInfo.linea_produccion || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Ubicación:</span>
                  <span className="text-white">{loteInfo.ubicacion || 'N/A'}</span>
                </div>
              </div>
            </div>

            {/* Características de Inyección */}
            <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 space-y-3">
              <h3 className="text-lg font-semibold text-pink-400 flex items-center gap-2"><IconInyeccion size={18} aria-hidden /> Características Inyección</h3>
              {loteInfo.caracteristicas_inyeccion && Object.keys(loteInfo.caracteristicas_inyeccion).length > 0 ? (
                <div className="space-y-2 text-sm">
                  {loteInfo.caracteristicas_inyeccion.id_proceso && (
                    <div className="flex justify-between"><span className="text-gray-400">ID Proceso:</span><span className="text-white font-mono">{loteInfo.caracteristicas_inyeccion.id_proceso}</span></div>
                  )}
                  {loteInfo.caracteristicas_inyeccion.tipo_resina && (
                    <div className="flex justify-between"><span className="text-gray-400">Tipo Resina:</span><span className="text-white">{loteInfo.caracteristicas_inyeccion.tipo_resina}</span></div>
                  )}
                  {loteInfo.caracteristicas_inyeccion.resina && (
                    <div className="flex justify-between"><span className="text-gray-400">Grado:</span><span className="text-white">{loteInfo.caracteristicas_inyeccion.resina}</span></div>
                  )}
                  {loteInfo.caracteristicas_inyeccion.densidad != null && (
                    <div className="flex justify-between"><span className="text-gray-400">Densidad:</span><span className="text-white font-mono">{loteInfo.caracteristicas_inyeccion.densidad}</span></div>
                  )}
                  {loteInfo.caracteristicas_inyeccion.peso_spec != null && (
                    <div className="flex justify-between"><span className="text-gray-400">Peso Spec:</span><span className="text-white font-mono">{loteInfo.caracteristicas_inyeccion.peso_spec}</span></div>
                  )}
                  {loteInfo.caracteristicas_inyeccion.peso_seco != null && (
                    <div className="flex justify-between"><span className="text-gray-400">Peso Seco:</span><span className="text-white font-mono">{loteInfo.caracteristicas_inyeccion.peso_seco}</span></div>
                  )}
                  {loteInfo.caracteristicas_inyeccion.cav != null && (
                    <div className="flex justify-between"><span className="text-gray-400">Cavidades:</span><span className="text-white font-mono">{loteInfo.caracteristicas_inyeccion.cav}</span></div>
                  )}
                  {loteInfo.caracteristicas_inyeccion.ciclo != null && (
                    <div className="flex justify-between"><span className="text-gray-400">Ciclo:</span><span className="text-white font-mono">{loteInfo.caracteristicas_inyeccion.ciclo}</span></div>
                  )}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">Sin características de inyección configuradas.</p>
              )}
            </div>
          </div>

        </div>
      )}

      {/* ═══ MODO: INSPECCIÓN ═══ */}
      {modo === 'inspeccion' && loteInfo && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2"><IconCalidad size={24} className="text-[var(--accent)]" aria-hidden /> Inspección LQC en Curso</h2>
              <p className="text-gray-400 text-sm mt-1">
                <span className="font-mono text-purple-400">{loteInfo.numero_parte_completo}</span>
                {' — '}{loteInfo.sku_producto} — {loteInfo.nombre_producto || 'N/A'}
              </p>
            </div>
            <Button variant="secondary" onClick={() => setModo('info')}>Volver a Info</Button>
          </div>

          {/* Ayudas visuales + preguntas + notas + evidencia */}
          <InspeccionEvaluacion
            token={token}
            sku={loteInfo.sku_producto}
            loteId={loteInfo.qr_raw}
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
                Resuélvelo desde Historial → Cuarentena → Segunda revisión.
              </p>
            )}
            <p className="text-gray-400 mt-2">
              Parte: <span className="font-mono text-white">{loteInfo.numero_parte_completo}</span>
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
              id="reader-lqc"
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
