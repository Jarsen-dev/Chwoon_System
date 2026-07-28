'use client';

/**
 * Página móvil ligera para el handoff QR de remisiones (patrón WhatsApp Web):
 * el usuario escanea el QR en la computadora, esta página abre la cámara,
 * sube la foto a la sesión temporal y la computadora continúa el flujo.
 *
 * Es pública a propósito (no está en el matcher del middleware): la seguridad
 * recae en el UUID de sesión no adivinable, su expiración corta y su uso único.
 * No carga el resto del ERP.
 */

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { getQrSesionEstado, subirFotoQrSesion } from '@/lib/api';
import { IconCamara } from '@/lib/icons';

type Estado = 'verificando' | 'lista' | 'invalida' | 'subiendo' | 'completada';

export default function MovilUploadPage() {
  const params = useParams<{ sessionId: string }>();
  const sessionId = params?.sessionId ?? '';

  const [estado, setEstado] = useState<Estado>('verificando');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const [archivo, setArchivo] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!sessionId) return;
    getQrSesionEstado(sessionId)
      .then(s => setEstado(s.valida && s.estado === 'pendiente' ? 'lista' : 'invalida'))
      .catch(() => setEstado('invalida'));
  }, [sessionId]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const seleccionar = (f: File) => {
    setArchivo(f);
    setPreview(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(f);
    });
  };

  const subir = async () => {
    if (!archivo) return;
    setEstado('subiendo');
    setError('');
    try {
      await subirFotoQrSesion(sessionId, archivo);
      setEstado('completada');
    } catch (err) {
      setEstado('lista');
      setError(err instanceof Error ? err.message : 'Error al subir la foto');
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6 gap-6">
      <div className="flex items-center gap-3">
        <IconCamara size={28} className="text-orange-500" aria-hidden />
        <h1 className="text-lg font-bold">Foto de remisión</h1>
      </div>

      {estado === 'verificando' && (
        <p className="text-sm text-gray-400">Verificando sesión…</p>
      )}

      {estado === 'invalida' && (
        <div className="text-center space-y-2 max-w-sm">
          <p className="text-red-400 font-semibold">Sesión no válida o expirada</p>
          <p className="text-sm text-gray-400">
            Regresa a la computadora y genera un código QR nuevo.
          </p>
        </div>
      )}

      {(estado === 'lista' || estado === 'subiendo') && (
        <div className="w-full max-w-sm flex flex-col items-center gap-4">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) seleccionar(f);
              e.target.value = '';
            }}
          />

          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Vista previa" className="w-full rounded-xl border border-gray-800" />
          ) : (
            <button
              onClick={() => inputRef.current?.click()}
              className="w-full aspect-[3/4] rounded-xl border-2 border-dashed border-gray-700 flex flex-col items-center justify-center gap-3 text-gray-400 hover:border-orange-500 hover:text-orange-400 transition"
            >
              <IconCamara size={48} aria-hidden />
              <span className="text-sm font-medium">Toca para tomar la foto</span>
            </button>
          )}

          {error && <p className="text-sm text-red-400 text-center">{error}</p>}

          {preview && (
            <div className="w-full flex gap-3">
              <button
                onClick={() => inputRef.current?.click()}
                disabled={estado === 'subiendo'}
                className="flex-1 px-4 py-3 rounded-lg bg-gray-800 text-gray-200 text-sm font-semibold hover:bg-gray-700 transition disabled:opacity-50"
              >
                Repetir
              </button>
              <button
                onClick={() => void subir()}
                disabled={estado === 'subiendo'}
                className="flex-1 px-4 py-3 rounded-lg bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700 transition disabled:opacity-50"
              >
                {estado === 'subiendo' ? 'Subiendo…' : 'Subir foto'}
              </button>
            </div>
          )}
        </div>
      )}

      {estado === 'completada' && (
        <div className="text-center space-y-2 max-w-sm">
          <p className="text-green-400 text-lg font-bold">✓ Foto enviada</p>
          <p className="text-sm text-gray-400">
            Listo — regresa a la computadora, el análisis continúa automáticamente ahí.
            Ya puedes cerrar esta página.
          </p>
        </div>
      )}
    </div>
  );
}
