'use client';

import { useEffect, useState } from 'react';
import { Modal, Button, FormInput } from '@/components/ui';
import { IconNuevo, IconEliminar, IconEtiquetas, IconTag, IconDocumento } from '@/lib/icons';
import { crearEtiquetasRemision, getDestinosImpresion } from '@/lib/api';
import type { RemisionRecepcion, DestinoImpresion, DestinoImpresionId } from '@/types';

/** Etiquetas que entran en una hoja carta (grilla 2 x 4) — ver pdf_etiquetas.py */
const POR_HOJA = 8;

const ICONO_DESTINO = { zebra: IconTag, carta: IconDocumento };

interface Props {
  open: boolean;
  remision: RemisionRecepcion | null;
  token: string;
  onClose: () => void;
  /** El padre refresca el listado y el detalle con las etiquetas ya creadas. */
  onImpreso: (mensaje: string) => void;
}

/** Cantidades por partida (item_id → una entrada de texto por etiqueta). */
type Cantidades = Record<number, string[]>;

/** 4 → "4", 3.5 → "3.5" (sin ceros de relleno) */
const fmt = (n: number) => String(Math.round(n * 100) / 100);

/**
 * Reparte el total entre `n` etiquetas en números enteros; el sobrante (y la
 * fracción, si la cantidad recibida no era entera) se va a la primera.
 * 10 entre 3 → 4, 3, 3.
 */
function repartir(total: number, n: number): string[] {
  if (n <= 1) return [fmt(total)];
  const base = Math.floor(total / n);
  const primera = Math.round((total - base * (n - 1)) * 100) / 100;
  return [fmt(primera), ...Array.from({ length: n - 1 }, () => fmt(base))];
}

export default function ModalEtiquetas({ open, remision, token, onClose, onImpreso }: Props) {
  const [cantidades, setCantidades] = useState<Cantidades>({});
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [destinos, setDestinos] = useState<DestinoImpresion[] | null>(null);
  const [destino, setDestino] = useState<DestinoImpresionId>('zebra');

  // Al abrir: una etiqueta por partida con la cantidad completa de la remisión
  useEffect(() => {
    if (!open || !remision) return;
    const inicial: Cantidades = {};
    remision.items.forEach(it => { inicial[it.id] = [fmt(it.cantidad)]; });
    setCantidades(inicial);
    setError('');
  }, [open, remision]);

  // Las impresoras se consultan al abrir: entre una apertura y otra el agente
  // pudo caerse o la HP quedarse sin red.
  useEffect(() => {
    if (!open) return;
    let vigente = true;
    setDestinos(null);
    getDestinosImpresion(token)
      .then(lista => {
        if (!vigente) return;
        setDestinos(lista);
        // La Zebra manda si está; si no, la primera que responda
        const preferida = lista.find(d => d.id === 'zebra' && d.disponible)
          ?? lista.find(d => d.disponible);
        if (preferida) setDestino(preferida.id);
      })
      .catch(() => { if (vigente) setDestinos([]); });
    return () => { vigente = false; };
  }, [open, token]);

  if (!remision) return null;

  const añadir = (itemId: number, total: number) =>
    setCantidades(prev => ({ ...prev, [itemId]: repartir(total, (prev[itemId]?.length || 0) + 1) }));

  const quitar = (itemId: number, total: number) =>
    setCantidades(prev => ({ ...prev, [itemId]: repartir(total, Math.max(1, (prev[itemId]?.length || 1) - 1)) }));

  const editar = (itemId: number, i: number, valor: string) =>
    setCantidades(prev => ({
      ...prev,
      [itemId]: (prev[itemId] || []).map((v, j) => (j === i ? valor : v)),
    }));

  /** Una etiqueta está mal si no es un número positivo o si sola ya excede el total. */
  const invalida = (valor: string, total: number) => {
    const n = Number(valor);
    return valor.trim() === '' || Number.isNaN(n) || n <= 0 || n > total;
  };

  const sumaDe = (itemId: number) =>
    (cantidades[itemId] || []).reduce((acc, v) => acc + (Number(v) || 0), 0);

  const totalEtiquetas = Object.values(cantidades).reduce((acc, arr) => acc + arr.length, 0);
  const hayErrores = remision.items.some(it => {
    const valores = cantidades[it.id] || [];
    return valores.some(v => invalida(v, it.cantidad)) || sumaDe(it.id) > it.cantidad;
  });

  const disponibles = (destinos || []).filter(d => d.disponible);
  const sinImpresora = destinos !== null && disponibles.length === 0;
  const hojas = Math.ceil(totalEtiquetas / POR_HOJA);

  const imprimirTodo = async () => {
    if (hayErrores) {
      setError('Corrige las cantidades marcadas en rojo: ninguna etiqueta puede exceder lo recibido.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      const etiquetas = await crearEtiquetasRemision(token, remision.id, {
        items: remision.items.map(it => ({
          item_id: it.id,
          cantidades: (cantidades[it.id] || []).map(Number),
        })),
        destino,
      });
      onImpreso(`${etiquetas.length} etiqueta${etiquetas.length !== 1 ? 's' : ''} enviada${etiquetas.length !== 1 ? 's' : ''} a la impresora`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron generar las etiquetas');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Imprimir etiquetas — Remisión ${remision.numero_remision}`}
      size="3xl"
      footer={
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-gray-400">
            {totalEtiquetas} etiqueta{totalEtiquetas !== 1 ? 's' : ''} en total
            {destino === 'carta' && ` · ${hojas} hoja${hojas !== 1 ? 's' : ''}`}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={guardando}>Cancelar</Button>
            <Button
              leftIcon={IconEtiquetas}
              onClick={imprimirTodo}
              disabled={guardando || hayErrores || destinos === null || sinImpresora}
            >
              {guardando ? 'Enviando...' : 'Imprimir todo'}
            </Button>
          </div>
        </div>
      }
    >
      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* ── Destino: solo se ofrecen las impresoras que responden ── */}
      <div className="mb-4">
        {destinos === null ? (
          <p className="text-xs text-gray-500">Buscando impresoras disponibles…</p>
        ) : sinImpresora ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
            <p className="font-semibold">No hay ninguna impresora disponible.</p>
            <ul className="mt-1 space-y-0.5 text-xs text-amber-200/80">
              {(destinos || []).map(d => <li key={d.id}>· {d.nombre} — {d.detalle}</li>)}
            </ul>
            <p className="mt-2 text-xs text-amber-200/80">
              Las etiquetas no se generan sin imprimir: se daría de alta el lote de material
              que no tiene nada pegado en la caja.
            </p>
          </div>
        ) : disponibles.length === 1 ? (
          <p className="text-xs text-gray-400">
            Se imprimirá en <span className="text-gray-200">{disponibles[0].nombre}</span>
          </p>
        ) : (
          <>
            <span className="block mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-300">
              Imprimir en
            </span>
            <div className="flex flex-wrap gap-2">
              {disponibles.map(d => {
                const Icono = ICONO_DESTINO[d.id];
                const activo = destino === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDestino(d.id)}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs transition ${
                      activo
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-white'
                        : 'border-gray-800 bg-gray-950 text-gray-400 hover:border-gray-700'
                    }`}
                  >
                    <Icono size={15} aria-hidden />
                    {d.nombre}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="space-y-4">
        {remision.items.map(it => {
          const valores = cantidades[it.id] || [];
          const suma = sumaDe(it.id);
          const excede = suma > it.cantidad;

          return (
            <div key={it.id} className="rounded-lg border border-gray-800 bg-gray-950 p-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
                <span className="font-mono text-sm text-white">{it.numero_parte}</span>
                <span className="text-xs text-gray-400 flex-1 truncate">{it.descripcion || '—'}</span>
                <span className="text-xs text-gray-300 whitespace-nowrap">
                  Recibido: <strong className="text-white">{it.cantidad.toLocaleString('es-MX')}</strong>{' '}
                  {it.unidad_de_medida || ''}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {valores.map((valor, i) => (
                  <div key={i} className="flex items-end gap-1">
                    <div className="flex-1">
                      <FormInput
                        label={`Etiqueta ${i + 1}`}
                        inputSize="sm"
                        type="number"
                        min="0"
                        step="any"
                        value={valor}
                        onChange={e => editar(it.id, i, e.target.value)}
                        className={
                          invalida(valor, it.cantidad) || excede
                            ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20'
                            : ''
                        }
                      />
                    </div>
                    {valores.length > 1 && (
                      <button
                        type="button"
                        onClick={() => quitar(it.id, it.cantidad)}
                        title="Quitar etiqueta"
                        className="mb-1 p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-gray-800 transition"
                      >
                        <IconEliminar size={14} aria-hidden />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => añadir(it.id, it.cantidad)}
                  className="inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline underline-offset-2"
                >
                  <IconNuevo size={13} aria-hidden /> Añadir nueva etiqueta
                </button>
                <span className={`ml-auto text-xs ${excede ? 'text-red-400' : 'text-gray-500'}`}>
                  Etiquetado: {suma.toLocaleString('es-MX')} de {it.cantidad.toLocaleString('es-MX')}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
