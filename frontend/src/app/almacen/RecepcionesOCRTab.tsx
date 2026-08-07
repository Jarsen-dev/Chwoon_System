'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Modal, Button, FormInput, LoadingSpinner, Pagination, VisorFoto, AutocompleteSku } from '@/components/ui';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { reescalarFoto } from '@/lib/imagen';
import {
  IconCamara,
  IconCelular,
  IconSubir,
  IconNuevo,
  IconEliminar,
  IconVer,
  IconActualizar,
  IconEtiquetas,
  IconTag,
  IconDocumento,
} from '@/lib/icons';
import {
  ocrRemision,
  ocrRemisionDesdeSesion,
  crearRemision,
  getRemisionesPage,
  getTiposDocumentoRemision,
  getRemisionFotoBlob,
  crearQrSesionRemision,
  getQrSesionEstado,
  getProducto,
  getRemision,
  reimprimirEtiquetaRemision,
  getDestinosImpresion,
} from '@/lib/api';
import type {
  RemisionOCRResultado,
  RemisionRecepcion,
  RemisionCreatePayload,
  DestinoImpresion,
  DestinoImpresionId,
} from '@/types';
import ModalEtiquetas from './ModalEtiquetas';

interface Props { token: string }

const PAGE_SIZE = 50;

// Estado del último trabajo de impresión de una etiqueta. Importa porque el
// backend solo encola: si el agente de Windows está apagado, "pendiente" es la
// única señal de que la etiqueta todavía no salió físicamente.
const ESTADO_ETIQUETA: Record<string, string> = {
  pendiente: 'bg-amber-500/15 text-amber-300',
  enviado: 'bg-blue-500/15 text-blue-300',
  impreso: 'bg-emerald-500/15 text-emerald-300',
  error: 'bg-red-500/15 text-red-300',
};
const ESTADO_ETIQUETA_TEXTO: Record<string, string> = {
  pendiente: 'En cola',
  enviado: 'Enviada',
  impreso: 'Impresa',
  error: 'Error',
};

interface ItemForm {
  numero_parte: string;
  cantidad: string;          // numérico como string (convención del proyecto)
  descripcion: string;       // solo lectura — viene del catálogo de productos
  unidad_de_medida: string;  // solo lectura
  encontrado: boolean | null; // null = aún no buscado
  advertencia: boolean;      // el OCR no pudo leer algún campo del renglón
}

type Fase = 'captura' | 'procesando' | 'revision';

const ITEM_VACIO: ItemForm = {
  numero_parte: '', cantidad: '', descripcion: '', unidad_de_medida: '',
  encontrado: null, advertencia: false,
};

// Una hoja física puede traer varias remisiones impresas juntas (para ahorrar
// papel); cada una es un bloque independiente que se guarda como su propio
// registro, todos apuntando a la misma foto.
interface BloqueForm {
  proveedor: string;
  numeroRemision: string;
  po: string;
  fecha: string;
  items: ItemForm[];
}

function bloqueVacio(): BloqueForm {
  return { proveedor: '', numeroRemision: '', po: '', fecha: '', items: [{ ...ITEM_VACIO }] };
}

function clonarBloque(bloque: BloqueForm): BloqueForm {
  return { ...bloque, items: bloque.items.map(it => ({ ...it })) };
}

// Estilo ámbar para campos que el OCR no pudo leer (nunca inventados: llegan vacíos)
const WARN_CLASS = 'border-amber-500 focus:border-amber-500 focus:ring-amber-500/40 bg-amber-500/5';

function formatFecha(iso: string) {
  try {
    return new Date(iso).toLocaleString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

/** Normaliza la fecha que devuelva el OCR a YYYY-MM-DD; si no se puede, ''. */
function parseFechaOCR(valor: string | null): string {
  if (!valor) return '';
  const m = valor.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(valor);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

/** AbortSignal.timeout lanza un DOMException con mensaje en inglés
 *  ("signal timed out"); no sirve para el operador. */
function mensajeError(err: unknown, fallback: string): string {
  if (err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
    return 'El servidor no respondió a tiempo. La foto puede haberse guardado; revisa el historial antes de reintentar.';
  }
  return err instanceof Error ? err.message : fallback;
}

export default function RecepcionesOCRTab({ token }: Props) {
  // ── Captura / OCR ──────────────────────────────────────────────
  const [fase, setFase] = useState<Fase>('captura');
  const [resultado, setResultado] = useState<RemisionOCRResultado | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Formulario de revisión ─────────────────────────────────────
  // Un bloque por remisión detectada en la foto (normalmente 1; "Añadir nueva
  // remisión" agrega más cuando la hoja trae varias impresas juntas).
  const [bloques, setBloques] = useState<BloqueForm[]>([bloqueVacio()]);
  const [warnPaths, setWarnPaths] = useState<Set<string>>(new Set());
  const [erroresForm, setErroresForm] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [fotoUrl, setFotoUrl] = useState<string | null>(null);
  const primerFaltanteRef = useRef<HTMLDivElement>(null);

  // ── Formato nuevo ──────────────────────────────────────────────
  const [modalNuevoFormato, setModalNuevoFormato] = useState(false);
  const [nombreFormato, setNombreFormato] = useState('');

  // ── Producto no registrado ─────────────────────────────────────
  const [skuNoRegistrado, setSkuNoRegistrado] = useState<string | null>(null);

  // ── QR handoff ─────────────────────────────────────────────────
  const [modalQR, setModalQR] = useState(false);
  const [qrSessionId, setQrSessionId] = useState<string | null>(null);
  const [qrError, setQrError] = useState('');
  const qrPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Listado ────────────────────────────────────────────────────
  const [remisiones, setRemisiones] = useState<RemisionRecepcion[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loadingList, setLoadingList] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [detalle, setDetalle] = useState<RemisionRecepcion | null>(null);
  const [detalleFotoUrl, setDetalleFotoUrl] = useState<string | null>(null);

  // ── Etiquetas de lote ──────────────────────────────────────────
  const [etiquetasDe, setEtiquetasDe] = useState<RemisionRecepcion | null>(null);
  const [reimprimiendo, setReimprimiendo] = useState<number | null>(null);
  const [destinos, setDestinos] = useState<DestinoImpresion[]>([]);

  // ── Filtros del listado (patrón ProductosTab) ────────────────────
  const [busqueda, setBusqueda] = useState('');
  const [filtroFechaRecepcion, setFiltroFechaRecepcion] = useState('');
  const [filtroFechaHoja, setFiltroFechaHoja] = useState('');
  const [filtroFormato, setFiltroFormato] = useState('');
  const busquedaDebounced = useDebouncedValue(busqueda, 300);
  const [formatosDisponibles, setFormatosDisponibles] = useState<string[]>([]);
  const hayFiltros = Boolean(busqueda || filtroFechaRecepcion || filtroFechaHoja || filtroFormato);
  const limpiarFiltros = () => {
    setBusqueda('');
    setFiltroFechaRecepcion('');
    setFiltroFechaHoja('');
    setFiltroFormato('');
  };

  // ── Mensajes con auto-dismiss ──────────────────────────────────
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const msgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mostrarMsg = useCallback((tipo: 'ok' | 'error', texto: string) => {
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    if (tipo === 'ok') { setSuccessMsg(texto); setErrorMsg(''); }
    else { setErrorMsg(texto); setSuccessMsg(''); }
    msgTimerRef.current = setTimeout(() => { setSuccessMsg(''); setErrorMsg(''); }, 15000);
  }, []);

  // ── Etiquetas: enviar a imprimir y reimprimir sueltas ──────────
  // Al abrir un detalle con etiquetas se refrescan las impresoras: entre una
  // apertura y otra el agente pudo caerse o la HP quedarse sin red.
  useEffect(() => {
    if (!detalle?.etiquetas.length) return;
    let vigente = true;
    getDestinosImpresion(token)
      .then(lista => { if (vigente) setDestinos(lista.filter(d => d.disponible)); })
      .catch(() => { if (vigente) setDestinos([]); });
    return () => { vigente = false; };
  }, [detalle?.id, detalle?.etiquetas.length, token]);

  const trasImprimir = (mensaje: string) => {
    setEtiquetasDe(null);
    mostrarMsg('ok', mensaje);
    // Refresca el listado: la remisión ya tiene etiquetas y su botón de
    // imprimir desaparece; las etiquetas quedan en el modal de detalle.
    setRefreshKey(k => k + 1);
  };

  const reimprimirEtiqueta = async (etiquetaId: number, destino: DestinoImpresionId) => {
    setReimprimiendo(etiquetaId);
    try {
      await reimprimirEtiquetaRemision(token, etiquetaId, destino);
      if (detalle) setDetalle(await getRemision(token, detalle.id));
      mostrarMsg('ok', destino === 'carta'
        ? 'Etiqueta impresa en hoja carta'
        : 'Etiqueta reenviada a la Zebra');
    } catch (e) {
      mostrarMsg('error', e instanceof Error ? e.message : 'No se pudo reimprimir la etiqueta');
    } finally {
      setReimprimiendo(null);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // Listado paginado (patrón ProductosTab: server-side, AbortController)
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    const controller = new AbortController();
    setLoadingList(true);
    getRemisionesPage(token, {
      search: busquedaDebounced,
      fecha_recepcion: filtroFechaRecepcion,
      fecha_hoja: filtroFechaHoja,
      formato: filtroFormato,
      limit: PAGE_SIZE,
      offset,
    }, controller.signal)
      .then(data => {
        setRemisiones(data.items);
        setTotal(data.total);
        if (data.total > 0 && offset >= data.total) {
          setOffset(Math.floor((data.total - 1) / PAGE_SIZE) * PAGE_SIZE);
        }
      })
      .catch(err => { if (err.name !== 'AbortError') mostrarMsg('error', err.message); })
      .finally(() => setLoadingList(false));
    return () => controller.abort();
  }, [token, busquedaDebounced, filtroFechaRecepcion, filtroFechaHoja, filtroFormato, offset, refreshKey, mostrarMsg]);

  // Cambiar búsqueda o filtros regresa a la primera página
  useEffect(() => {
    setOffset(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaDebounced, filtroFechaRecepcion, filtroFechaHoja, filtroFormato]);

  useEffect(() => {
    getTiposDocumentoRemision(token).then(setFormatosDisponibles).catch(() => {});
  }, [token]);

  // ══════════════════════════════════════════════════════════════
  // Foto (blob autenticado — patrón ValidacionTab)
  // ══════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!resultado) { setFotoUrl(null); return; }
    let url: string | null = null;
    let activo = true;
    getRemisionFotoBlob(token, resultado.foto_path)
      .then(blob => { if (activo) { url = URL.createObjectURL(blob); setFotoUrl(url); } })
      .catch(() => { if (activo) setFotoUrl(null); });
    return () => { activo = false; if (url) URL.revokeObjectURL(url); };
  }, [token, resultado]);

  useEffect(() => {
    if (!detalle) { setDetalleFotoUrl(null); return; }
    let url: string | null = null;
    let activo = true;
    getRemisionFotoBlob(token, detalle.foto_path)
      .then(blob => { if (activo) { url = URL.createObjectURL(blob); setDetalleFotoUrl(url); } })
      .catch(() => { if (activo) setDetalleFotoUrl(null); });
    return () => { activo = false; if (url) URL.revokeObjectURL(url); };
  }, [token, detalle]);

  // ══════════════════════════════════════════════════════════════
  // OCR → formulario
  // ══════════════════════════════════════════════════════════════
  const cargarResultado = useCallback((res: RemisionOCRResultado) => {
    setResultado(res);
    // El OCR devuelve paths sin prefijo ("fecha", "items[0].cantidad"); solo se
    // conoce el bloque 0 (única remisión que la IA extrae de la foto) — las que
    // se agreguen luego con "Añadir nueva remisión" son copias del usuario.
    const warns = new Set(res.advertencias);
    const f = parseFechaOCR(res.fecha);
    if (res.fecha && !f) warns.add('fecha'); // fecha ilegible para el parser → tratar como faltante
    const itemsForm: ItemForm[] = (res.items.length ? res.items : [null]).map((it, i) => ({
      numero_parte: it?.numero_parte ?? '',
      cantidad: it?.cantidad != null ? String(it.cantidad) : '',
      descripcion: '',
      unidad_de_medida: '',
      encontrado: null,
      advertencia: warns.has(`items[${i}].numero_parte`) || warns.has(`items[${i}].cantidad`),
    }));
    setBloques([{
      proveedor: res.proveedor ?? '',
      numeroRemision: res.numero_remision ?? '',
      po: res.po ?? '',
      fecha: f,
      items: itemsForm,
    }]);
    setWarnPaths(new Set(Array.from(warns).map(p => `remisiones[0].${p}`)));
    setErroresForm({});
    setNombreFormato('');
    setFase('revision');
    // Solo se pide "formato nuevo" cuando la IA sí corrió y clasificó como
    // desconocido; si ocr_ok es false (timeout/IA caída) no sabemos el tipo,
    // así que no hay que ensuciar el catálogo de templates con eso.
    if (res.ocr_ok && !res.tipo_conocido) setModalNuevoFormato(true);
    if (!res.ocr_ok) {
      mostrarMsg('error', res.error || 'La IA no pudo leer el documento; captura los campos manualmente. La foto ya quedó guardada.');
    }
  }, [mostrarMsg]);

  // Completar descripción/unidad de los items que el OCR sí leyó
  useEffect(() => {
    if (fase !== 'revision') return;
    bloques.forEach((bloque, b) => {
      bloque.items.forEach((it, i) => {
        if (it.numero_parte && it.encontrado === null) void buscarProducto(b, i, it.numero_parte, false);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase]);

  // Scroll automático al primer campo faltante al entrar a revisión
  useEffect(() => {
    if (fase === 'revision' && warnPaths.size > 0) {
      setTimeout(() => primerFaltanteRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase]);

  const procesarArchivo = async (file: File) => {
    setFase('procesando');
    try {
      const res = await ocrRemision(token, await reescalarFoto(file));
      cargarResultado(res);
    } catch (err) {
      setFase('captura');
      mostrarMsg('error', mensajeError(err, 'Error al procesar la imagen'));
    }
  };

  const actualizarItem = (b: number, idx: number, patch: Partial<ItemForm>) => {
    setBloques(prev => prev.map((bloque, bi) => bi !== b
      ? bloque
      : { ...bloque, items: bloque.items.map((it, i) => i === idx ? { ...it, ...patch } : it) }));
  };

  const buscarProducto = async (b: number, idx: number, sku: string, avisar: boolean) => {
    const limpio = sku.trim().toUpperCase();
    if (!limpio) return;
    try {
      const p = await getProducto(limpio);
      actualizarItem(b, idx, { numero_parte: limpio, descripcion: p.descripcion || '', unidad_de_medida: p.unidad_de_medida || '', encontrado: true });
    } catch {
      actualizarItem(b, idx, { numero_parte: limpio, descripcion: '', unidad_de_medida: '', encontrado: false });
      if (avisar) setSkuNoRegistrado(limpio);
    }
  };

  // ══════════════════════════════════════════════════════════════
  // QR handoff
  // ══════════════════════════════════════════════════════════════
  const detenerPollQR = useCallback(() => {
    if (qrPollRef.current) { clearInterval(qrPollRef.current); qrPollRef.current = null; }
  }, []);

  const abrirModalQR = async () => {
    setQrError('');
    setModalQR(true);
    try {
      const sesion = await crearQrSesionRemision(token);
      setQrSessionId(sesion.session_id);
      detenerPollQR();
      qrPollRef.current = setInterval(async () => {
        try {
          const estado = await getQrSesionEstado(sesion.session_id);
          if (estado.estado === 'subida') {
            detenerPollQR();
            setModalQR(false);
            setFase('procesando');
            try {
              const res = await ocrRemisionDesdeSesion(token, sesion.session_id);
              cargarResultado(res);
            } catch (err) {
              setFase('captura');
              mostrarMsg('error', mensajeError(err, 'Error al procesar la foto'));
            }
          } else if (!estado.valida) {
            detenerPollQR();
            setQrError('La sesión expiró. Cierra y vuelve a generar el código.');
          }
        } catch { /* red intermitente: se reintenta en el siguiente tick */ }
      }, 2000);
    } catch (err) {
      setQrError(err instanceof Error ? err.message : 'Error al crear la sesión');
    }
  };

  const cerrarModalQR = () => { detenerPollQR(); setModalQR(false); setQrSessionId(null); };
  useEffect(() => detenerPollQR, [detenerPollQR]);

  // ══════════════════════════════════════════════════════════════
  // Guardar
  // ══════════════════════════════════════════════════════════════
  const validar = (): string | null => {
    const errores: Record<string, string> = {};
    bloques.forEach((bloque, b) => {
      if (!bloque.proveedor.trim()) errores[`remisiones[${b}].proveedor`] = 'Obligatorio';
      if (!bloque.numeroRemision.trim()) errores[`remisiones[${b}].numero_remision`] = 'Obligatorio';
      if (!bloque.fecha) errores[`remisiones[${b}].fecha`] = 'Obligatorio';
      bloque.items.forEach((it, i) => {
        if (!it.numero_parte.trim()) errores[`remisiones[${b}].items[${i}].numero_parte`] = 'Obligatorio';
        const cant = parseFloat(it.cantidad);
        if (!it.cantidad || isNaN(cant) || cant <= 0) errores[`remisiones[${b}].items[${i}].cantidad`] = 'Cantidad inválida';
        if (it.encontrado === false) errores[`remisiones[${b}].items[${i}].numero_parte`] = 'No registrado en Productos';
      });
    });
    setErroresForm(errores);
    if (Object.keys(errores).length > 0) return 'Corrige los campos marcados en rojo';
    if (resultado && resultado.ocr_ok && !resultado.tipo_conocido && !nombreFormato.trim()) {
      setModalNuevoFormato(true);
      return 'Este formato es nuevo: asígnale un nombre para guardarlo como template';
    }
    return null;
  };

  const guardar = async () => {
    const error = validar();
    if (error) { mostrarMsg('error', error); return; }
    if (!resultado) return;

    // Los items sin verificar se validan también en el backend (400 con lista)
    const noEncontrado = bloques.flatMap(b => b.items).find(it => it.encontrado === false);
    if (noEncontrado) { setSkuNoRegistrado(noEncontrado.numero_parte); return; }

    setGuardando(true);
    // El tipo de documento y el "formato nuevo" son del documento completo, no
    // de cada remisión: solo la primera llamada propone crear el template; las
    // siguientes reusan el tipo ya resuelto (si se repitiera nuevo_formato, el
    // backend respondería 409 porque el slug ya existiría).
    let tipoResuelto = resultado.tipo_detectado;
    let nuevoFormatoPend = resultado.ocr_ok && !resultado.tipo_conocido && nombreFormato.trim()
      ? { tipo_documento: nombreFormato.trim() }
      : null;
    let guardadas = 0;
    try {
      for (const bloque of bloques) {
        const payload: RemisionCreatePayload = {
          proveedor: bloque.proveedor.trim(),
          numero_remision: bloque.numeroRemision.trim(),
          po: bloque.po.trim() || null,
          fecha: bloque.fecha,
          tipo_documento: tipoResuelto,
          foto_path: resultado.foto_path,
          ocr_raw: resultado.ocr_ok ? {
            proveedor: resultado.proveedor, numero_remision: resultado.numero_remision,
            po: resultado.po, fecha: resultado.fecha, items: resultado.items,
          } : null,
          advertencias: resultado.advertencias,
          items: bloque.items.map(it => ({
            numero_parte: it.numero_parte.trim().toUpperCase(),
            cantidad: parseFloat(it.cantidad),
          })),
          nuevo_formato: nuevoFormatoPend,
        };
        const creada = await crearRemision(token, payload);
        guardadas++;
        tipoResuelto = creada.tipo_documento;
        nuevoFormatoPend = null;
      }
      mostrarMsg('ok', `${guardadas} remisión${guardadas !== 1 ? 'es' : ''} guardada${guardadas !== 1 ? 's' : ''} correctamente`);
      cancelarRevision();
      setOffset(0);
      setRefreshKey(k => k + 1);
    } catch (err) {
      // Las primeras `guardadas` ya quedaron en la BD (no hay transacción entre
      // llamadas): se sacan del formulario para no reenviarlas duplicadas y se
      // deja el resto listo para corregir y reintentar.
      if (guardadas > 0) setBloques(prev => prev.slice(guardadas));
      const msg = err instanceof Error ? err.message : 'Error al guardar';
      if (msg.includes('no registrados en Productos')) {
        setSkuNoRegistrado(msg);
      } else {
        mostrarMsg('error', guardadas > 0 ? `${guardadas} remisión(es) ya guardada(s). ${msg}` : msg);
      }
    } finally {
      setGuardando(false);
    }
  };

  const cancelarRevision = () => {
    setFase('captura');
    setResultado(null);
    setBloques([bloqueVacio()]);
    setWarnPaths(new Set()); setErroresForm({});
    setNombreFormato(''); setModalNuevoFormato(false);
  };

  // ══════════════════════════════════════════════════════════════
  // Render helpers
  // ══════════════════════════════════════════════════════════════
  const esWarn = (path: string) => (resultado && !resultado.ocr_ok) || warnPaths.has(path);
  const clase = (path: string) =>
    erroresForm[path] ? '' : (esWarn(path) ? WARN_CLASS : '');
  const primerWarn = bloques
    .flatMap((bloque, b) => [
      `remisiones[${b}].proveedor`, `remisiones[${b}].numero_remision`, `remisiones[${b}].fecha`,
      ...bloque.items.map((_, i) => `remisiones[${b}].items[${i}].numero_parte`),
    ])
    .find(p => esWarn(p) || erroresForm[p]);

  const inputFile = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={e => {
        const f = e.target.files?.[0];
        if (f) void procesarArchivo(f);
        e.target.value = '';
      }}
    />
  );

  // ══════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      {errorMsg && (
        <div className="bg-red-900/30 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm font-medium">
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div className="bg-green-900/30 border border-green-500/50 text-green-400 px-4 py-3 rounded-lg text-sm font-medium">
          {successMsg}
        </div>
      )}

      {/* ── CAPTURA ─────────────────────────────────────────────── */}
      {fase === 'captura' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-8">
          <div className="flex flex-col items-center text-center gap-2 mb-6">
            <IconCamara size={40} className="text-[var(--accent)]" aria-hidden />
            <h2 className="text-lg font-bold text-white">Captura de remisión por foto</h2>
            <p className="text-sm text-gray-400 max-w-xl">
              Sube o toma una foto de la hoja de remisión física. La IA local extrae los campos
              automáticamente; los que no pueda leer con certeza quedan vacíos y resaltados para
              que los completes a mano. La foto siempre se guarda como evidencia.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-4">
            {inputFile}
            <Button leftIcon={IconSubir} onClick={() => fileInputRef.current?.click()}>
              Subir o tomar foto
            </Button>
            <Button variant="secondary" leftIcon={IconCelular} onClick={() => void abrirModalQR()}>
              Tomar con el celular (QR)
            </Button>
          </div>
        </div>
      )}

      {/* ── PROCESANDO ──────────────────────────────────────────── */}
      {fase === 'procesando' && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 flex flex-col items-center gap-4">
          <LoadingSpinner label="Analizando documento con IA local…" />
          <p className="text-xs text-gray-500">Esto puede tardar 30–90 segundos según la carga del servidor.</p>
        </div>
      )}

      {/* ── REVISIÓN (lado a lado) ──────────────────────────────── */}
      {fase === 'revision' && resultado && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <h2 className="text-lg font-bold text-white">Revisar y confirmar</h2>
              <p className="text-xs text-gray-400">
                Formato detectado:{' '}
                <span className={resultado.tipo_conocido ? 'text-[var(--accent)] font-semibold' : 'text-amber-400 font-semibold'}>
                  {resultado.tipo_conocido
                    ? resultado.tipo_detectado
                    : resultado.ocr_ok ? 'desconocido (formato nuevo)' : 'no determinado (IA no disponible)'}
                </span>
              </p>
            </div>
            {warnPaths.size > 0 && resultado.ocr_ok && (
              <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-semibold px-3 py-1.5 rounded-lg">
                {warnPaths.size} campo(s) ilegibles — completa los resaltados en ámbar
              </span>
            )}
          </div>

          <div className="flex flex-col lg:flex-row gap-6">
            {/* Foto original */}
            <div className="lg:w-1/2 lg:sticky lg:top-0 self-start">
              <VisorFoto src={fotoUrl} alt="Foto de la remisión" alturaClase="h-[70vh]" />
            </div>

            {/* Formulario */}
            <div className="lg:w-1/2 space-y-4">
              {bloques.map((bloque, b) => (
                <div key={b} className="space-y-4">
                  {bloques.length > 1 && (
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white">Remisión {b + 1}</h3>
                      {b > 0 && (
                        <button
                          onClick={() => setBloques(prev => prev.filter((_, bi) => bi !== b))}
                          className="inline-flex items-center gap-1 text-xs text-red-400 hover:underline underline-offset-2"
                        >
                          <IconEliminar size={13} aria-hidden /> Quitar esta remisión
                        </button>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div ref={primerWarn === `remisiones[${b}].proveedor` ? primerFaltanteRef : undefined} className="sm:col-span-2">
                      <FormInput
                        label="Proveedor *"
                        value={bloque.proveedor}
                        onChange={e => setBloques(prev => prev.map((bl, bi) => bi === b ? { ...bl, proveedor: e.target.value } : bl))}
                        error={erroresForm[`remisiones[${b}].proveedor`]}
                        className={clase(`remisiones[${b}].proveedor`)}
                        placeholder={esWarn(`remisiones[${b}].proveedor`) ? 'La IA no pudo leerlo — captúralo de la foto' : ''}
                      />
                    </div>
                    <div ref={primerWarn === `remisiones[${b}].numero_remision` ? primerFaltanteRef : undefined}>
                      <FormInput
                        label="No. Remisión *"
                        value={bloque.numeroRemision}
                        onChange={e => setBloques(prev => prev.map((bl, bi) => bi === b ? { ...bl, numeroRemision: e.target.value } : bl))}
                        error={erroresForm[`remisiones[${b}].numero_remision`]}
                        className={clase(`remisiones[${b}].numero_remision`)}
                        placeholder={esWarn(`remisiones[${b}].numero_remision`) ? 'Ilegible — captúralo' : ''}
                      />
                    </div>
                    <FormInput
                      label="Purchase Order (PO)"
                      value={bloque.po}
                      onChange={e => setBloques(prev => prev.map((bl, bi) => bi === b ? { ...bl, po: e.target.value } : bl))}
                      className={clase(`remisiones[${b}].po`)}
                      placeholder="Opcional"
                    />
                    <div ref={primerWarn === `remisiones[${b}].fecha` ? primerFaltanteRef : undefined}>
                      <FormInput
                        label="Fecha *"
                        type="date"
                        value={bloque.fecha}
                        onChange={e => setBloques(prev => prev.map((bl, bi) => bi === b ? { ...bl, fecha: e.target.value } : bl))}
                        error={erroresForm[`remisiones[${b}].fecha`]}
                        className={clase(`remisiones[${b}].fecha`)}
                      />
                    </div>
                  </div>

                  {/* Items */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-300">
                        Items ({bloque.items.length})
                      </h4>
                      <Button size="sm" variant="ghost" leftIcon={IconNuevo}
                        onClick={() => setBloques(prev => prev.map((bl, bi) => bi === b ? { ...bl, items: [...bl.items, { ...ITEM_VACIO }] } : bl))}>
                        Agregar renglón
                      </Button>
                    </div>
                    <div className="space-y-3">
                      {bloque.items.map((it, i) => (
                        <div
                          key={i}
                          ref={primerWarn === `remisiones[${b}].items[${i}].numero_parte` ? primerFaltanteRef : undefined}
                          className={`rounded-lg border p-3 space-y-3 ${it.advertencia || esWarn(`remisiones[${b}].items[${i}].numero_parte`) || esWarn(`remisiones[${b}].items[${i}].cantidad`)
                            ? 'border-amber-500/50 bg-amber-500/5' : 'border-gray-800 bg-gray-950'}`}
                        >
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <AutocompleteSku
                              label="No. Parte *"
                              inputSize="sm"
                              value={it.numero_parte}
                              onChange={valor => actualizarItem(b, i, { numero_parte: valor, encontrado: null, descripcion: '', unidad_de_medida: '' })}
                              onSelect={s => actualizarItem(b, i, { numero_parte: s.sku, descripcion: s.descripcion, unidad_de_medida: s.unidad_de_medida, encontrado: true })}
                              // Ya validado al elegir de la lista: no se repite la
                              // consulta ni se arriesga el modal de "no registrado".
                              onBlur={() => { if (it.encontrado !== true) void buscarProducto(b, i, it.numero_parte, true); }}
                              error={erroresForm[`remisiones[${b}].items[${i}].numero_parte`]}
                              className={clase(`remisiones[${b}].items[${i}].numero_parte`)}
                              placeholder={esWarn(`remisiones[${b}].items[${i}].numero_parte`) ? 'Ilegible — captúralo' : ''}
                            />
                            <FormInput
                              label="Cantidad *"
                              inputSize="sm"
                              type="number"
                              min="0"
                              step="any"
                              value={it.cantidad}
                              onChange={e => actualizarItem(b, i, { cantidad: e.target.value })}
                              error={erroresForm[`remisiones[${b}].items[${i}].cantidad`]}
                              className={clase(`remisiones[${b}].items[${i}].cantidad`)}
                              placeholder={esWarn(`remisiones[${b}].items[${i}].cantidad`) ? 'Ilegible' : ''}
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <FormInput label="Descripción" inputSize="sm" value={it.descripcion} readOnly disabled
                              placeholder={it.encontrado === false ? 'Producto NO registrado' : 'Se llena del catálogo'} />
                            <div className="flex items-end gap-2">
                              <div className="flex-1">
                                <FormInput label="Unidad" inputSize="sm" value={it.unidad_de_medida} readOnly disabled
                                  placeholder="—" />
                              </div>
                              {bloque.items.length > 1 && (
                                <button
                                  onClick={() => setBloques(prev => prev.map((bl, bi) => bi === b ? { ...bl, items: bl.items.filter((_, j) => j !== i) } : bl))}
                                  className="p-2 rounded-lg text-red-400 bg-red-500/10 hover:bg-red-500/20 transition"
                                  title="Quitar renglón"
                                >
                                  <IconEliminar size={16} aria-hidden />
                                </button>
                              )}
                            </div>
                          </div>
                          {it.encontrado === false && (
                            <p className="text-xs text-red-400">
                              Este número de parte no existe en Productos — regístralo primero.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}

              <div>
                <Button size="sm" variant="ghost" leftIcon={IconNuevo}
                  onClick={() => setBloques(prev => [...prev, clonarBloque(prev[prev.length - 1])])}>
                  Añadir nueva remisión
                </Button>
              </div>

              {!resultado.tipo_conocido && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
                  <p className="text-xs text-amber-400 mb-2 font-semibold">
                    Formato nuevo: al guardar, la foto y los datos corregidos se guardarán como
                    template para que la IA reconozca este formato en el futuro.
                  </p>
                  <FormInput
                    label="Nombre del nuevo formato *"
                    inputSize="sm"
                    value={nombreFormato}
                    onChange={e => setNombreFormato(e.target.value)}
                    placeholder="ej. remision_acme"
                  />
                </div>
              )}

              <div className="flex gap-3 justify-end pt-2">
                <Button variant="secondary" onClick={cancelarRevision} disabled={guardando}>
                  Cancelar
                </Button>
                <Button onClick={() => void guardar()} disabled={guardando}>
                  {guardando ? 'Guardando…' : 'Guardar recepción'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── LISTADO ─────────────────────────────────────────────── */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Recepciones registradas</h2>
          <div className="flex items-center gap-3">
            <span className="bg-gray-800 text-gray-400 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-800">
              {total} registro{total !== 1 ? 's' : ''}
            </span>
            <Button size="sm" variant="ghost" leftIcon={IconActualizar} onClick={() => setRefreshKey(k => k + 1)}>
              Actualizar
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2 mb-4">
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label htmlFor="filtro-busqueda" className="text-xs font-semibold uppercase tracking-wider text-gray-300">
              Búsqueda
            </label>
            <div className="relative">
              <input
                id="filtro-busqueda"
                type="text"
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar proveedor, no. remisión, PO, no. parte, descripción, cantidad..."
                className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 placeholder:text-gray-400"
              />
              {loadingList && (
                <span
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full border-2 border-gray-600 border-t-blue-400 animate-spin"
                  aria-label="Buscando..."
                />
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="filtro-fecha-recepcion" className="text-xs font-semibold uppercase tracking-wider text-gray-300">
              Fecha recepción
            </label>
            <input
              id="filtro-fecha-recepcion"
              type="date"
              value={filtroFechaRecepcion}
              onChange={e => setFiltroFechaRecepcion(e.target.value)}
              className="bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="filtro-fecha-hoja" className="text-xs font-semibold uppercase tracking-wider text-gray-300">
              Fecha hoja
            </label>
            <input
              id="filtro-fecha-hoja"
              type="date"
              value={filtroFechaHoja}
              onChange={e => setFiltroFechaHoja(e.target.value)}
              className="bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="filtro-formato" className="text-xs font-semibold uppercase tracking-wider text-gray-300">
              Formato
            </label>
            <select
              id="filtro-formato"
              value={filtroFormato}
              onChange={e => setFiltroFormato(e.target.value)}
              // h-[34px]: el select mide 36px por defecto y quedaría 2px fuera de línea
              className="h-[34px] bg-gray-950 border border-gray-800 rounded-md px-2.5 py-1.5 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
            >
              <option value="">Todos los Formatos</option>
              {formatosDisponibles.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
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
                <th className="px-4 py-3">Capturada</th>
                <th className="px-4 py-3">Proveedor</th>
                <th className="px-4 py-3">No. Remisión</th>
                <th className="px-4 py-3">PO</th>
                <th className="px-4 py-3">Fecha hoja</th>
                <th className="px-4 py-3">Formato</th>
                <th className="px-4 py-3 text-right">Items</th>
                <th className="px-4 py-3">Capturó</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {loadingList ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center"><LoadingSpinner label="Cargando…" /></td></tr>
              ) : remisiones.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-10 text-center text-gray-500">Sin recepciones registradas</td></tr>
              ) : remisiones.map(r => (
                <tr key={r.id} className="hover:bg-gray-800/50 transition">
                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{formatFecha(r.fecha_captura)}</td>
                  <td className="px-4 py-3 text-white font-medium max-w-[220px] truncate" title={r.proveedor}>{r.proveedor}</td>
                  <td className="px-4 py-3 text-gray-300">{r.numero_remision}</td>
                  <td className="px-4 py-3 text-gray-400">{r.po || '—'}</td>
                  <td className="px-4 py-3 text-gray-300 whitespace-nowrap">{r.fecha}</td>
                  <td className="px-4 py-3">
                    <span className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded">{r.tipo_documento}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-gray-300">{r.items.length}</td>
                  <td className="px-4 py-3 text-gray-400">{r.creado_por}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setDetalle(r)}
                        className="p-1.5 rounded-lg text-[var(--accent)] hover:bg-gray-800 transition"
                        title="Ver detalle y foto"
                      >
                        <IconVer size={16} aria-hidden />
                      </button>
                      {/* Solo mientras no se hayan generado: después se reimprime
                          etiqueta por etiqueta desde el modal de detalle */}
                      {r.etiquetas.length === 0 && (
                        <button
                          onClick={() => setEtiquetasDe(r)}
                          className="p-1.5 rounded-lg text-[var(--accent)] hover:bg-gray-800 transition"
                          title="Imprimir etiquetas de lote"
                        >
                          <IconEtiquetas size={16} aria-hidden />
                        </button>
                      )}
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
            Mostrando {remisiones.length} de {total} recepciones
          </div>
        </div>
      </div>

      {/* ── MODAL: QR handoff ───────────────────────────────────── */}
      <Modal open={modalQR} onClose={cerrarModalQR} title="Tomar foto con el celular" size="sm">
        <div className="flex flex-col items-center gap-4 text-center">
          {qrError ? (
            <p className="text-sm text-red-400">{qrError}</p>
          ) : qrSessionId ? (
            <>
              <div className="bg-white p-4 rounded-xl">
                <QRCodeSVG
                  value={`${process.env.NEXT_PUBLIC_APP_URL || (typeof window !== 'undefined' ? window.location.origin : '')}/movil/${qrSessionId}`}
                  size={200}
                />
              </div>
              <p className="text-sm text-gray-300">
                Escanea el código con la cámara del celular, toma la foto de la remisión y súbela.
                Esta pantalla continuará automáticamente.
              </p>
              <p className="text-xs text-gray-500">La sesión expira en 10 minutos.</p>
              <LoadingSpinner label="Esperando foto…" />
            </>
          ) : (
            <LoadingSpinner label="Generando código…" />
          )}
        </div>
      </Modal>

      {/* ── MODAL: formato nuevo ────────────────────────────────── */}
      <Modal
        open={modalNuevoFormato}
        onClose={() => setModalNuevoFormato(false)}
        title="Formato de remisión nuevo"
        size="md"
        footer={<Button onClick={() => setModalNuevoFormato(false)}>Entendido</Button>}
      >
        <div className="space-y-3 text-sm text-gray-300">
          <p>
            Este documento no coincide con ningún formato conocido, por lo que la IA no pudo
            pre-llenar los campos con precisión. <span className="text-amber-400 font-semibold">
            Revisa y corrige todo el formulario antes de guardar.</span>
          </p>
          <p>
            Al guardar, la foto y el JSON corregido se registrarán como template nuevo:
            las próximas remisiones con este formato se leerán automáticamente.
            Asigna un nombre corto al formato en el campo indicado (ej. <code className="text-[var(--accent)]">remision_acme</code>).
          </p>
        </div>
      </Modal>

      {/* ── MODAL: producto no registrado ───────────────────────── */}
      <Modal
        open={skuNoRegistrado !== null}
        onClose={() => setSkuNoRegistrado(null)}
        title="Producto no registrado"
        size="md"
        footer={<Button onClick={() => setSkuNoRegistrado(null)}>Entendido</Button>}
      >
        <div className="space-y-3 text-sm text-gray-300">
          <p className="text-red-400 font-semibold break-words">{skuNoRegistrado}</p>
          <p>
            El número de parte no existe en la base de datos de Productos. Agrégalo primero en el
            catálogo (Producción → Productos) y vuelve a intentar guardar esta recepción.
          </p>
        </div>
      </Modal>

      {/* ── MODAL: detalle de registro ──────────────────────────── */}
      <Modal
        open={detalle !== null}
        onClose={() => setDetalle(null)}
        title={detalle ? `Remisión ${detalle.numero_remision} — ${detalle.proveedor}` : ''}
        size="5xl"
      >
        {detalle && (
          <div className="flex flex-col lg:flex-row gap-6">
            <div className="lg:w-1/2">
              <VisorFoto src={detalleFotoUrl} alt="Foto de la remisión" alturaClase="h-[65vh]" />
            </div>
            <div className="lg:w-1/2 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><p className="text-xs text-gray-500 uppercase">Fecha hoja</p><p className="text-gray-200">{detalle.fecha}</p></div>
                <div><p className="text-xs text-gray-500 uppercase">PO</p><p className="text-gray-200">{detalle.po || '—'}</p></div>
                <div><p className="text-xs text-gray-500 uppercase">Formato</p><p className="text-gray-200">{detalle.tipo_documento}</p></div>
                <div><p className="text-xs text-gray-500 uppercase">Capturó</p><p className="text-gray-200">{detalle.creado_por} · {formatFecha(detalle.fecha_captura)}</p></div>
              </div>
              <table className="w-full text-sm border border-gray-800 rounded-lg overflow-hidden">
                <thead className="bg-gray-950 text-xs uppercase text-gray-400">
                  <tr>
                    <th className="px-3 py-2 text-left">No. Parte</th>
                    <th className="px-3 py-2 text-left">Descripción</th>
                    <th className="px-3 py-2 text-right">Cantidad</th>
                    <th className="px-3 py-2 text-left">Unidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {detalle.items.map(it => (
                    <tr key={it.id}>
                      <td className="px-3 py-2 text-white font-mono">{it.numero_parte}</td>
                      <td className="px-3 py-2 text-gray-300">{it.descripcion || '—'}</td>
                      <td className="px-3 py-2 text-right text-gray-200">{it.cantidad.toLocaleString('es-MX')}</td>
                      <td className="px-3 py-2 text-gray-400">{it.unidad_de_medida || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {detalle.etiquetas.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 uppercase mb-2">
                    Etiquetas de lote ({detalle.etiquetas.length})
                  </p>
                  <table className="w-full text-sm border border-gray-800 rounded-lg overflow-hidden">
                    <thead className="bg-gray-950 text-xs uppercase text-gray-400">
                      <tr>
                        <th className="px-3 py-2 text-left">Lote ID</th>
                        <th className="px-3 py-2 text-left">No. Parte</th>
                        <th className="px-3 py-2 text-right">Cantidad</th>
                        <th className="px-3 py-2 text-left">Estado</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                      {detalle.etiquetas.map(et => (
                        <tr key={et.id}>
                          <td className="px-3 py-2 text-white font-mono text-xs">{et.lote_id}</td>
                          <td className="px-3 py-2 text-gray-300 font-mono text-xs">{et.numero_parte}</td>
                          <td className="px-3 py-2 text-right text-gray-200">{et.cantidad.toLocaleString('es-MX')}</td>
                          <td className="px-3 py-2">
                            <span className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${ESTADO_ETIQUETA[et.estado_impresion] || 'bg-gray-800 text-gray-300'}`}>
                              {ESTADO_ETIQUETA_TEXTO[et.estado_impresion] || et.estado_impresion}
                            </span>
                          </td>
                          {/* Un botón por impresora disponible: con una sola queda
                              igual que antes, sin menús de por medio */}
                          <td className="px-3 py-2">
                            <div className="flex items-center justify-end gap-1">
                              {destinos.length === 0 && (
                                <span className="text-xs text-gray-600">Sin impresora</span>
                              )}
                              {destinos.map(d => {
                                const Icono = d.id === 'carta' ? IconDocumento : IconTag;
                                return (
                                  <button
                                    key={d.id}
                                    onClick={() => reimprimirEtiqueta(et.id, d.id)}
                                    disabled={reimprimiendo === et.id}
                                    className="p-1.5 rounded-lg text-[var(--accent)] hover:bg-gray-800 transition disabled:opacity-40"
                                    title={`Reimprimir en ${d.nombre}`}
                                  >
                                    <Icono size={15} aria-hidden />
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ── MODAL: imprimir etiquetas de lote ────────────────────── */}
      <ModalEtiquetas
        open={etiquetasDe !== null}
        remision={etiquetasDe}
        token={token}
        onClose={() => setEtiquetasDe(null)}
        onImpreso={trasImprimir}
      />
    </div>
  );
}
