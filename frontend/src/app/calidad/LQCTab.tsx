'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import {
  getProducto,
  getPuntosInspeccion,
  registrarInspeccion,
  descargarPdfInspeccion,
} from '@/lib/api';
import type { PuntoResultado, ProductoPuntosInspeccion, CaracteristicasInyeccion } from '@/types';

interface Props {
  token: string;
}

interface LoteInfoLQC {
  qr_raw: string;
  numero_parte: string;
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
// Permite 4 o 5 segmentos: PARTE[_MAQUINA]_TURNO_FECHA_CARRITO
function parseQRInyeccion(codigo: string): {
  parte: string; maquina: string; turno: string; fecha: string; carrito: string
} | null {
  const limpio = codigo.trim().toUpperCase().replace(/\?/g, '_');
  const partes = limpio.split('_');
  if (partes.length < 4 || partes.length > 5) return null;

  // Últimos 3 siempre: turno (D/N), fecha (digits), carrito (digits)
  const turno = partes[partes.length - 3];
  const fecha = partes[partes.length - 2];
  const carrito = partes[partes.length - 1];
  if (!/^[DN]$/.test(turno)) return null;
  if (!/^\d{6,10}$/.test(fecha)) return null;
  if (!/^\d+$/.test(carrito)) return null;

  if (partes.length === 5) {
    return { parte: partes[0], maquina: partes[1], turno, fecha, carrito };
  }
  return { parte: partes[0], maquina: '—', turno, fecha, carrito };
}

export default function LQCTab({ token }: Props) {
  // ── Estado ────────────────────────────────────────────────────────
  const [modo, setModo] = useState<ModoVista>('scanner');
  const [inputValue, setInputValue] = useState('');
  const [loteInfo, setLoteInfo] = useState<LoteInfoLQC | null>(null);
  const [puntosProducto, setPuntosProducto] = useState<ProductoPuntosInspeccion | null>(null);
  const [resultadosPuntos, setResultadosPuntos] = useState<PuntoResultado[]>([]);
  const [notas, setNotas] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [ultimaInspeccionId, setUltimaInspeccionId] = useState<string | null>(null);

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
        throw new Error('Formato de QR inválido. Se espera: PARTE[_MAQUINA]_TURNO_FECHA_CARRITO (ej: 5208JJ1024A_D_13042026_1)');
      }

      // Obtener producto
      const producto = await getProducto(parsed.parte);

      // Obtener puntos LQC
      let puntos: ProductoPuntosInspeccion | null = null;
      try {
        puntos = await getPuntosInspeccion(token, parsed.parte);
      } catch {
        puntos = null;
      }

      setLoteInfo({
        qr_raw: raw.trim().toUpperCase(),
        numero_parte: parsed.parte,
        maquina: parsed.maquina,
        turno: parsed.turno,
        fecha: parsed.fecha,
        carrito: parsed.carrito,
        sku_producto: producto.sku,
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

      setPuntosProducto(puntos);
      if (puntos && puntos.puntos_inspeccion_lqc) {
        setResultadosPuntos(
          puntos.puntos_inspeccion_lqc.map((p: any) => ({
            punto: p.punto || p.nombre || p.name || String(p),
            especificacion: p.especificacion || p.spec || '',
            resultado: '',
          }))
        );
      } else {
        setResultadosPuntos([]);
      }

      setModo('info');
    } catch (err: any) {
      setError(err.message || 'Error al procesar código QR');
    } finally {
      setLoading(false);
    }
  }, [token]);

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

  // ── Actualizar resultado de un punto ──────────────────────────────
  const actualizarPunto = (index: number, resultado: string) => {
    setResultadosPuntos(prev =>
      prev.map((p, i) => (i === index ? { ...p, resultado } : p))
    );
  };

  // ── Calcular resultado final ──────────────────────────────────────
  const calcularResultadoFinal = (): string => {
    if (resultadosPuntos.length === 0) return 'Aprobado';
    const todosConformes = resultadosPuntos.every(
      p => p.resultado === 'Conforme'
    );
    return todosConformes ? 'Aprobado' : 'Rechazado';
  };

  // ── Todos los puntos evaluados ────────────────────────────────────
  const todosEvaluados = resultadosPuntos.length === 0 || resultadosPuntos.every(p => p.resultado !== '');

  // ── Enviar inspección ─────────────────────────────────────────────
  const enviarInspeccion = async () => {
    if (!loteInfo) return;

    setLoading(true);
    setError('');

    try {
      const resultado = calcularResultadoFinal();

      const res = await registrarInspeccion(token, {
        sku_producto: loteInfo.sku_producto,
        nombre_producto: loteInfo.nombre_producto || undefined,
        tipo_inspeccion: 'LQC',
        resultado_final: resultado,
        resultados_puntos: resultadosPuntos.map(p => ({
          punto: p.punto,
          especificacion: p.especificacion || '',
          resultado: p.resultado || 'No evaluado',
        })),
        cantidad_inspeccionada: loteInfo.cantidad_carrito,
        notas: notas || undefined,
      });

      setUltimaInspeccionId(res.inspeccion_id);
      setSuccess(`✅ Inspección LQC ${res.inspeccion_id} — Resultado: ${resultado}`);
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
    setPuntosProducto(null);
    setResultadosPuntos([]);
    setNotas('');
    setInputValue('');
    setUltimaInspeccionId(null);
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
          <p className="text-red-400">❌ {error}</p>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-300">✕</button>
        </div>
      )}
      {success && (
        <div className="bg-green-900/30 border border-green-500/50 rounded-xl p-4 flex items-center justify-between">
          <p className="text-green-400">{success}</p>
          <button onClick={() => setSuccess('')} className="text-green-400 hover:text-green-300">✕</button>
        </div>
      )}

      {/* ═══ MODO: SCANNER ═══ */}
      {modo === 'scanner' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">🏭 Inspección LQC</h2>
            <p className="text-gray-400 text-sm mt-1">
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
              Formato esperado: <span className="text-purple-400 font-mono">PARTE[_MAQUINA]_TURNO_FECHA_CARRITO</span>
            </p>
          </div>
        </div>
      )}

      {/* ═══ MODO: INFO LOTE ═══ */}
      {modo === 'info' && loteInfo && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">🏭 LQC — Información del Lote</h2>
              <p className="text-gray-400 text-sm mt-1">Verifique los datos antes de iniciar la inspección</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={nuevoEscaneo}
                className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors"
              >
                ← Escanear otro
              </button>
              <button
                onClick={iniciarInspeccion}
                className="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                🔬 Iniciar Inspección LQC
              </button>
            </div>
          </div>

          {/* Datos del QR escaneado */}
          <div className="bg-gray-900 rounded-xl border border-purple-500/30 p-6 space-y-3">
            <h3 className="text-lg font-semibold text-purple-400">📷 Datos del QR</h3>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-sm">
              <div>
                <span className="text-gray-400 block">No. Parte</span>
                <span className="font-mono text-white font-semibold">{loteInfo.numero_parte}</span>
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
              <h3 className="text-lg font-semibold text-purple-400">📦 Producto</h3>
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
              <h3 className="text-lg font-semibold text-pink-400">💉 Características Inyección</h3>
              {loteInfo.caracteristicas_inyeccion && Object.keys(loteInfo.caracteristicas_inyeccion).length > 0 ? (
                <div className="space-y-2 text-sm">
                  {loteInfo.caracteristicas_inyeccion.id_proceso && (
                    <div className="flex justify-between"><span className="text-gray-400">ID Proceso:</span><span className="text-white font-mono">{loteInfo.caracteristicas_inyeccion.id_proceso}</span></div>
                  )}
                  {loteInfo.caracteristicas_inyeccion.tipo_resina && (
                    <div className="flex justify-between"><span className="text-gray-400">Tipo Resina:</span><span className="text-white">{loteInfo.caracteristicas_inyeccion.tipo_resina}</span></div>
                  )}
                  {loteInfo.caracteristicas_inyeccion.resina && (
                    <div className="flex justify-between"><span className="text-gray-400">Resina:</span><span className="text-white">{loteInfo.caracteristicas_inyeccion.resina}</span></div>
                  )}
                  {loteInfo.caracteristicas_inyeccion.densidad != null && (
                    <div className="flex justify-between"><span className="text-gray-400">Densidad:</span><span className="text-white font-mono">{loteInfo.caracteristicas_inyeccion.densidad}</span></div>
                  )}
                  {loteInfo.caracteristicas_inyeccion.peso != null && (
                    <div className="flex justify-between"><span className="text-gray-400">Peso:</span><span className="text-white font-mono">{loteInfo.caracteristicas_inyeccion.peso}</span></div>
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

          {/* Puntos de inspección disponibles */}
          {puntosProducto && puntosProducto.puntos_inspeccion_lqc && puntosProducto.puntos_inspeccion_lqc.length > 0 && (
            <div className="bg-gray-900 rounded-xl border border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-yellow-400 mb-3">📋 Puntos de Inspección LQC</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {puntosProducto.puntos_inspeccion_lqc.map((p: any, i: number) => (
                  <div key={i} className="bg-gray-800 rounded-lg px-4 py-2 text-sm flex items-center gap-2">
                    <span className="text-purple-400">•</span>
                    <span>{p.punto || p.nombre || p.name || String(p)}</span>
                    {p.especificacion && (
                      <span className="text-gray-500 ml-auto text-xs">{p.especificacion}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ MODO: INSPECCIÓN ═══ */}
      {modo === 'inspeccion' && loteInfo && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2">🔬 Inspección LQC en Curso</h2>
              <p className="text-gray-400 text-sm mt-1">
                <span className="font-mono text-purple-400">{loteInfo.numero_parte}</span>
                {' — '}{loteInfo.sku_producto} — {loteInfo.nombre_producto || 'N/A'}
              </p>
            </div>
            <button
              onClick={() => setModo('info')}
              className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors"
            >
              ← Volver a Info
            </button>
          </div>

          {/* Tabla de puntos de inspección */}
          {resultadosPuntos.length > 0 ? (
            <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-800">
                    <th className="text-left px-6 py-3 text-sm font-semibold text-gray-300">#</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-gray-300">Punto de Inspección</th>
                    <th className="text-left px-6 py-3 text-sm font-semibold text-gray-300">Especificación</th>
                    <th className="text-center px-6 py-3 text-sm font-semibold text-gray-300">Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {resultadosPuntos.map((punto, idx) => (
                    <tr key={idx} className={`border-t border-gray-800 ${
                      punto.resultado === 'Conforme' ? 'bg-green-900/10' :
                      punto.resultado === 'No Conforme' ? 'bg-red-900/10' : ''
                    }`}>
                      <td className="px-6 py-3 text-sm text-gray-500">{idx + 1}</td>
                      <td className="px-6 py-3 text-sm text-white">{punto.punto}</td>
                      <td className="px-6 py-3 text-sm text-gray-400">{punto.especificacion || '—'}</td>
                      <td className="px-6 py-3">
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() => actualizarPunto(idx, 'Conforme')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              punto.resultado === 'Conforme'
                                ? 'bg-green-600 text-white'
                                : 'bg-gray-700 text-gray-400 hover:bg-green-800 hover:text-green-300'
                            }`}
                          >
                            ✅ Conforme
                          </button>
                          <button
                            onClick={() => actualizarPunto(idx, 'No Conforme')}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              punto.resultado === 'No Conforme'
                                ? 'bg-red-600 text-white'
                                : 'bg-gray-700 text-gray-400 hover:bg-red-800 hover:text-red-300'
                            }`}
                          >
                            ❌ No Conforme
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="bg-gray-900 rounded-xl border border-yellow-500/30 p-6 text-center">
              <p className="text-yellow-400">⚠️ Este producto no tiene puntos de inspección LQC configurados.</p>
              <p className="text-gray-400 text-sm mt-2">La inspección se registrará sin puntos de evaluación.</p>
            </div>
          )}

          {/* Notas */}
          <div className="bg-gray-900 rounded-xl border border-gray-700 p-6">
            <label className="block text-sm font-semibold text-gray-300 mb-2">📝 Notas (opcional)</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Observaciones adicionales de la inspección..."
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-sm text-white
                         placeholder-gray-500 focus:outline-none focus:border-purple-500 resize-y"
              rows={3}
            />
          </div>

          {/* Resumen y enviar */}
          <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">
                Puntos evaluados: <span className="text-white font-semibold">
                  {resultadosPuntos.filter(p => p.resultado).length}/{resultadosPuntos.length}
                </span>
              </p>
              <p className="text-sm mt-1">
                Resultado esperado:{' '}
                <span className={`font-bold ${
                  !todosEvaluados ? 'text-gray-500' :
                  calcularResultadoFinal() === 'Aprobado' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {!todosEvaluados ? 'Pendiente...' : calcularResultadoFinal() === 'Aprobado' ? '✅ APROBADO' : '❌ RECHAZADO'}
                </span>
              </p>
            </div>
            <button
              onClick={enviarInspeccion}
              disabled={loading || (!todosEvaluados && resultadosPuntos.length > 0)}
              className={`px-8 py-3 rounded-lg font-medium text-sm transition-colors ${
                loading || (!todosEvaluados && resultadosPuntos.length > 0)
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
              }`}
            >
              {loading ? '⏳ Registrando...' : '📤 Registrar Inspección LQC'}
            </button>
          </div>
        </div>
      )}

      {/* ═══ MODO: RESULTADO ═══ */}
      {modo === 'resultado' && loteInfo && (
        <div className="space-y-6">
          <div className={`rounded-xl border-2 p-8 text-center ${
            calcularResultadoFinal() === 'Aprobado'
              ? 'bg-green-900/20 border-green-500/50'
              : 'bg-red-900/20 border-red-500/50'
          }`}>
            <div className="text-6xl mb-4">
              {calcularResultadoFinal() === 'Aprobado' ? '✅' : '❌'}
            </div>
            <h2 className={`text-3xl font-bold ${
              calcularResultadoFinal() === 'Aprobado' ? 'text-green-400' : 'text-red-400'
            }`}>
              {calcularResultadoFinal() === 'Aprobado' ? 'APROBADO' : 'RECHAZADO'}
            </h2>
            <p className="text-gray-400 mt-2">
              Parte: <span className="font-mono text-white">{loteInfo.numero_parte}</span>
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
              <button
                onClick={handleDescargarPdf}
                className="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-lg text-sm font-medium transition-colors"
              >
                📄 Descargar PDF
              </button>
            )}
            <button
              onClick={nuevoEscaneo}
              className="bg-purple-600 hover:bg-purple-700 px-6 py-3 rounded-lg text-sm font-medium transition-colors"
            >
              🔍 Escanear Otro Lote
            </button>
          </div>
        </div>
      )}

      {/* ═── Modal Scanner de Cámara ───═ */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-800">📷 Escanear QR</h3>
              <button
                onClick={cerrarScanner}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none"
              >✖</button>
            </div>
            <div
              ref={scannerContainerRef}
              id="reader-lqc"
              className="w-full aspect-square rounded-xl overflow-hidden bg-black"
            />
            {scannerError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                <p className="font-semibold">⚠️ Error de cámara</p>
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
