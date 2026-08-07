'use client';

import { useEffect, useState } from 'react';
import { getAyudasVisuales, ayudaVisualPdfUrl, ayudaVisualThumbnailUrl } from '@/lib/api';
import type { AyudaVisual } from '@/types';
import LoadingSpinner from './LoadingSpinner';
import { IconDocumento } from '@/lib/icons';

interface Props {
  sku: string;
  /** Columnas del grid en pantallas grandes. 4 en el modal de Productos,
   *  3 en el panel de inspección, que comparte ancho con el resto del flujo. */
  columnasLg?: 3 | 4;
  onError?: (mensaje: string) => void;
}

/** Miniaturas de las ayudas visuales de un número de parte; al hacer clic se
 *  abre el PDF en una pestaña nueva. Los archivos vienen del espejo local del
 *  Synology, así que se siguen viendo aunque el share esté caído. */
export default function AyudasVisualesGrid({ sku, columnasLg = 4, onError }: Props) {
  const [ayudas, setAyudas] = useState<AyudaVisual[] | null>(null); // null = cargando

  useEffect(() => {
    let vigente = true;
    setAyudas(null);
    if (!sku) { setAyudas([]); return; }

    getAyudasVisuales(sku)
      .then(data => { if (vigente) setAyudas(data); })
      .catch(() => {
        if (!vigente) return;
        setAyudas([]);
        onError?.('No se pudieron cargar las ayudas visuales.');
      });

    return () => { vigente = false; };
    // onError suele ser una lambda del padre: incluirlo relanzaría la carga en
    // cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sku]);

  if (ayudas === null) {
    return (
      <div className="py-10 text-center">
        <LoadingSpinner />
        <p className="text-gray-400 text-sm mt-2">Cargando ayudas visuales...</p>
      </div>
    );
  }

  if (ayudas.length === 0) {
    return (
      <div className="py-10 text-center text-gray-400">
        <IconDocumento size={36} className="mx-auto mb-2 text-gray-600" aria-hidden />
        <p className="text-sm">Este producto no tiene ayudas visuales indexadas.</p>
        <p className="text-xs text-gray-500 mt-1">
          Verifica que el PDF incluya el No. de Parte en el nombre y ejecuta &quot;Reindexar AV&quot;.
        </p>
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-2 md:grid-cols-3 gap-3 ${columnasLg === 4 ? 'lg:grid-cols-4' : ''}`}>
      {ayudas.map((av) => (
        <button
          key={av.id}
          type="button"
          onClick={() => window.open(ayudaVisualPdfUrl(av.id), '_blank', 'noopener')}
          className="group text-left bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-amber-500/50 rounded-lg overflow-hidden transition"
          title={`${av.nombre_archivo}\n${av.ruta}`}
        >
          <div className="w-full aspect-[3/4] bg-white flex items-center justify-center overflow-hidden">
            {av.tiene_thumbnail ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={ayudaVisualThumbnailUrl(av.id)}
                alt={av.nombre_archivo}
                loading="lazy"
                className="w-full h-full object-contain"
              />
            ) : (
              <IconDocumento size={40} className="text-gray-400" aria-hidden />
            )}
          </div>
          <div className="p-2">
            {av.codigo_av && (
              <p className="text-xs font-bold text-amber-400 truncate">{av.codigo_av}</p>
            )}
            <p className="text-xs text-gray-300 truncate">{av.nombre_archivo}</p>
            <p className="text-[10px] text-gray-500 truncate">
              {av.ruta.split('/').slice(0, -1).join(' / ') || '—'}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
