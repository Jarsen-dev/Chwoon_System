'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { subirFotoIncidencia } from '@/lib/api';
import { reescalarFoto } from '@/lib/imagen';
import type { RespuestaInspeccion, ResultadoInspeccion } from '@/types';
import { Button, AyudasVisualesGrid, LoadingSpinner } from '@/components/ui';
import {
  IconAlertas, IconCamara, IconCerrar, IconDocumento, IconEditar,
  IconEliminar, IconOk,
} from '@/lib/icons';

/** Las dos preguntas del formato de inspección. El texto se guarda tal cual en
 *  `respuestas`, así que un cambio aquí no reescribe el historial. */
export const PREGUNTAS = [
  '¿Los puntos críticos dimensionales son correctos?',
  '¿Los puntos críticos de inspección están bien?',
] as const;

export interface EvaluacionPayload {
  respuestas: RespuestaInspeccion[];
  fotos: string[];
  resultado_final: ResultadoInspeccion;
}

interface Props {
  token: string;
  /** Número de parte — determina qué ayudas visuales se muestran. */
  sku: string;
  /** Nombra la carpeta de evidencia; sin él no se pueden adjuntar fotos. */
  loteId?: string;
  onRegistrar: (payload: EvaluacionPayload) => void | Promise<void>;
  /** Bloquea los botones de acción mientras el padre guarda. */
  guardando?: boolean;
  /** El estado de las notas vive en el tab contenedor (va en el payload de
   *  registrarInspeccion); aquí solo se renderiza el campo, después de las
   *  preguntas. */
  notas: string;
  onNotasChange: (valor: string) => void;
}

type Estado = { respuesta: 'Si' | 'No'; motivo: string } | null;

export default function InspeccionEvaluacion({
  token, sku, loteId, onRegistrar, guardando = false, notas, onNotasChange,
}: Props) {
  const [estados, setEstados] = useState<Estado[]>(() => PREGUNTAS.map(() => null));
  const [fotos, setFotos] = useState<{ ruta: string; preview: string }[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState('');

  const fileRef = useRef<HTMLInputElement>(null);

  // Los object URLs de las miniaturas se liberan al desmontar; guardarlos en un
  // ref evita que el efecto de limpieza dependa del array y corra en cada alta.
  const previewsRef = useRef<string[]>([]);
  useEffect(() => { previewsRef.current = fotos.map(f => f.preview); }, [fotos]);
  useEffect(() => () => { previewsRef.current.forEach(URL.revokeObjectURL); }, []);

  const responder = (i: number, respuesta: 'Si' | 'No') =>
    setEstados(prev => prev.map((e, idx) => (idx === i ? { respuesta, motivo: e?.motivo ?? '' } : e)));

  const editar = (i: number) =>
    setEstados(prev => prev.map((e, idx) => (idx === i ? null : e)));

  const setMotivo = (i: number, motivo: string) =>
    setEstados(prev => prev.map((e, idx) => (idx === i && e ? { ...e, motivo } : e)));

  const agregarFotos = useCallback(async (files: FileList) => {
    if (!loteId) {
      setError('Captura el Lote ID antes de adjuntar evidencia.');
      return;
    }
    setSubiendo(true);
    setError('');
    try {
      for (const file of Array.from(files)) {
        const comprimida = await reescalarFoto(file, 'evidencia');
        const ruta = await subirFotoIncidencia(token, loteId, comprimida);
        setFotos(prev => [...prev, { ruta, preview: URL.createObjectURL(comprimida) }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo subir la foto');
    } finally {
      setSubiendo(false);
    }
  }, [token, loteId]);

  const quitarFoto = (ruta: string) => {
    // El archivo ya subido se queda en el servidor: no se referencia desde la
    // inspección, así que no entra al historial ni al PDF.
    setFotos(prev => {
      const fuera = prev.find(f => f.ruta === ruta);
      if (fuera) URL.revokeObjectURL(fuera.preview);
      return prev.filter(f => f.ruta !== ruta);
    });
  };

  const todasRespondidas = estados.every(e => e !== null);
  const hayNo = estados.some(e => e?.respuesta === 'No');
  const motivosCompletos = estados.every(e => e?.respuesta !== 'No' || e.motivo.trim().length > 0);

  const registrar = (resultado: ResultadoInspeccion) => {
    const respuestas: RespuestaInspeccion[] = PREGUNTAS.map((pregunta, i) => ({
      pregunta,
      respuesta: estados[i]!.respuesta,
      motivo: estados[i]!.respuesta === 'No' ? estados[i]!.motivo.trim() : null,
    }));
    void onRegistrar({ respuestas, fotos: fotos.map(f => f.ruta), resultado_final: resultado });
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-4 flex items-center justify-between">
          <p className="text-red-400 flex items-center gap-2"><IconAlertas size={16} aria-hidden /> {error}</p>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-300" aria-label="Cerrar">
            <IconCerrar size={16} aria-hidden />
          </button>
        </div>
      )}

      {/* ── Ayudas visuales del número de parte ── */}
      <div className="bg-gray-900 rounded-xl border border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-amber-400 flex items-center gap-2 mb-4">
          <IconDocumento size={18} aria-hidden /> Ayudas Visuales — {sku}
        </h3>
        <AyudasVisualesGrid sku={sku} columnasLg={3} onError={setError} />
      </div>

      {/* ── Preguntas ── */}
      <div className="bg-gray-900 rounded-xl border border-gray-700 divide-y divide-gray-800">
        {PREGUNTAS.map((pregunta, i) => {
          const estado = estados[i];
          return (
            <div key={pregunta} className="p-6 space-y-3">
              <p className="text-white font-medium">{pregunta}</p>

              {estado === null ? (
                <div className="flex gap-3">
                  <Button onClick={() => responder(i, 'Si')} leftIcon={IconOk}>Sí</Button>
                  <Button variant="danger" onClick={() => responder(i, 'No')} leftIcon={IconCerrar}>No</Button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-bold ${
                      estado.respuesta === 'Si'
                        ? 'bg-green-900/30 text-green-400 border border-green-500/40'
                        : 'bg-red-900/30 text-red-400 border border-red-500/40'
                    }`}>
                      {estado.respuesta === 'Si'
                        ? <><IconOk size={15} aria-hidden /> Sí</>
                        : <><IconCerrar size={15} aria-hidden /> No</>}
                    </span>
                    <Button variant="ghost" size="sm" leftIcon={IconEditar} onClick={() => editar(i)}>
                      Editar
                    </Button>
                  </div>

                  {estado.respuesta === 'No' && (
                    <div>
                      <label className="block text-sm text-gray-300 mb-1">Motivo *</label>
                      <textarea
                        value={estado.motivo}
                        onChange={e => setMotivo(i, e.target.value)}
                        rows={2}
                        placeholder="Describe qué se encontró fuera de especificación..."
                        className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white
                                   placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Notas (opcional) ── */}
      <div className="bg-gray-900 rounded-xl border border-gray-700 p-6">
        <label className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
          <IconDocumento size={16} aria-hidden /> Notas (opcional)
        </label>
        <textarea
          value={notas}
          onChange={e => onNotasChange(e.target.value)}
          placeholder="Observaciones adicionales de la inspección..."
          className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-3 text-sm text-white
                     placeholder-gray-500 focus:outline-none focus:border-cyan-500 resize-y"
          rows={3}
        />
      </div>

      {/* ── Evidencia fotográfica: solo cuando algo salió mal ── */}
      {todasRespondidas && hayNo && (
        <div className="bg-gray-900 rounded-xl border border-red-500/30 p-6 space-y-4">
          <div>
            <h3 className="text-lg font-semibold text-red-400 flex items-center gap-2">
              <IconCamara size={18} aria-hidden /> Evidencia fotográfica
            </h3>
            <p className="text-gray-400 text-sm mt-1">
              {loteId
                ? <>Se guarda en la carpeta del lote <span className="font-mono text-gray-300">{loteId}</span>. Puedes adjuntar varias fotos.</>
                : 'Captura el Lote ID para poder adjuntar la evidencia.'}
            </p>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={e => {
              if (e.target.files?.length) void agregarFotos(e.target.files);
              e.target.value = '';
            }}
          />
          <Button
            variant="secondary"
            leftIcon={IconCamara}
            onClick={() => fileRef.current?.click()}
            disabled={subiendo || !loteId}
          >
            {subiendo ? 'Subiendo...' : 'Tomar o subir foto'}
          </Button>
          {subiendo && <LoadingSpinner sizeClass="h-6 w-6" />}

          {fotos.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {fotos.map(f => (
                <div key={f.ruta} className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={f.preview}
                    alt="Evidencia"
                    className="w-full aspect-square object-cover rounded-lg border border-gray-700"
                  />
                  <button
                    type="button"
                    onClick={() => quitarFoto(f.ruta)}
                    title="Quitar foto"
                    aria-label="Quitar foto"
                    className="absolute top-1 right-1 bg-red-600 hover:bg-red-500 text-white rounded-full p-1.5 transition-colors"
                  >
                    <IconEliminar size={13} aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Acciones ── */}
      <div className="bg-gray-900 rounded-xl border border-gray-700 p-6">
        {!todasRespondidas ? (
          <p className="text-gray-400 text-sm text-center">
            Responde las {PREGUNTAS.length} preguntas para continuar.
          </p>
        ) : !hayNo ? (
          <div className="flex justify-end">
            <Button size="lg" leftIcon={IconOk} onClick={() => registrar('Aprobado')} disabled={guardando}>
              {guardando ? 'Registrando...' : 'Aprobar'}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {!motivosCompletos && (
              <p className="text-amber-400 text-sm flex items-center gap-2">
                <IconAlertas size={15} aria-hidden /> Falta capturar el motivo de la respuesta en No.
              </p>
            )}
            {fotos.length === 0 && (
              <p className="text-amber-400 text-sm flex items-center gap-2">
                <IconAlertas size={15} aria-hidden /> Adjunta al menos una foto de la evidencia.
              </p>
            )}
            <div className="flex justify-end gap-3">
              <Button
                variant="danger"
                size="lg"
                leftIcon={IconCerrar}
                disabled={guardando || subiendo || !motivosCompletos || fotos.length === 0}
                onClick={() => registrar('Rechazado')}
              >
                Rechazo
              </Button>
              <Button
                size="lg"
                leftIcon={IconAlertas}
                className="!bg-amber-600 hover:!bg-amber-500 !text-white"
                disabled={guardando || subiendo || !motivosCompletos || fotos.length === 0}
                onClick={() => registrar('Cuarentena')}
              >
                Cuarentena
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
