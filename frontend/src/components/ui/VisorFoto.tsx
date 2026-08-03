'use client';

import { useEffect, useRef, useState } from 'react';
import {
  IconAjustar,
  IconRotarDerecha,
  IconRotarIzquierda,
  IconZoomIn,
  IconZoomOut,
} from '@/lib/icons';
import LoadingSpinner from './LoadingSpinner';
import Modal from './Modal';

interface VisorFotoProps {
  src: string | null;
  alt?: string;
  /** Altura del viewport, ej. "h-[70vh]". */
  alturaClase?: string;
  /** Uso interno: evita anidar el modal de pantalla completa dentro de sí mismo. */
  dentroDeModal?: boolean;
}

type Rotacion = 0 | 90 | 180 | 270;

const ZOOM_MAXIMO = 1.5; // 150% del tamaño nativo de la foto
const PASO_ZOOM = 1.5;        // por click en los botones
const PASO_ZOOM_RUEDA = 1.1;  // por "tick" de rueda del mouse (más fino, dispara seguido)

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Escala tal que la imagen (con w/h intercambiados si está rotada 90/270)
 * quepa completa dentro de las dimensiones del contenedor. */
function calcularEscalaAjustar(
  natural: { width: number; height: number },
  contenedor: { width: number; height: number },
  rotacion: Rotacion
): number {
  const rotada90 = rotacion === 90 || rotacion === 270;
  const anchoImg = rotada90 ? natural.height : natural.width;
  const altoImg = rotada90 ? natural.width : natural.height;
  if (!anchoImg || !altoImg || !contenedor.width || !contenedor.height) return 1;
  return Math.min(contenedor.width / anchoImg, contenedor.height / altoImg, 1);
}

export default function VisorFoto({
  src, alt = 'Foto', alturaClase = 'h-[70vh]', dentroDeModal = false,
}: VisorFotoProps) {
  // Ref de callback (no useRef+useEffect-on-mount): mientras `src` es null
  // se renderiza el spinner, sin el div del viewport — si el observer se
  // conectara una sola vez al montar, nunca vería el div real que aparece
  // después al llegar la foto. Con el nodo en estado, el efecto de abajo se
  // reconecta cada vez que el div realmente existe.
  const [viewportEl, setViewportEl] = useState<HTMLDivElement | null>(null);
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [contenedor, setContenedor] = useState<{ width: number; height: number } | null>(null);
  const [rotacion, setRotacion] = useState<Rotacion>(0);
  const [escala, setEscala] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [arrastrando, setArrastrando] = useState(false);
  const [pantallaCompleta, setPantallaCompleta] = useState(false);
  const arrastreRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);

  // Reset al cambiar de foto
  useEffect(() => {
    setNatural(null);
    setRotacion(0);
    setPan({ x: 0, y: 0 });
  }, [src]);

  useEffect(() => {
    if (!viewportEl) return;
    const medir = () => setContenedor({ width: viewportEl.clientWidth, height: viewportEl.clientHeight });
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(viewportEl);
    return () => observer.disconnect();
  }, [viewportEl]);

  const escalaAjustar = natural && contenedor ? calcularEscalaAjustar(natural, contenedor, rotacion) : 1;
  const escalaMinima = Math.min(escalaAjustar, 1);
  const escalaMaxima = Math.max(escalaAjustar, ZOOM_MAXIMO);

  // Cuando cambia la rotación (o se conoce el tamaño natural/contenedor por
  // primera vez) regresamos a la vista ajustada — un zoom manual previo ya
  // no tiene sentido tras rotar el documento.
  useEffect(() => {
    setEscala(escalaAjustar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escalaAjustar, rotacion]);

  const rotada90 = rotacion === 90 || rotacion === 270;
  const imgW = natural ? (rotada90 ? natural.height : natural.width) * escala : 0;
  const imgH = natural ? (rotada90 ? natural.width : natural.height) * escala : 0;
  const maxPanX = contenedor ? Math.max(0, (imgW - contenedor.width) / 2) : 0;
  const maxPanY = contenedor ? Math.max(0, (imgH - contenedor.height) / 2) : 0;
  const pannable = maxPanX > 0.5 || maxPanY > 0.5;

  // El zoom (botones o rueda) puede dejar el pan actual fuera de los nuevos
  // límites — se recorta en vez de resetear a centro, así se conserva la
  // posición al hacer zoom en vez de "brincar" al centro en cada paso.
  useEffect(() => {
    setPan(p => ({ x: clamp(p.x, -maxPanX, maxPanX), y: clamp(p.y, -maxPanY, maxPanY) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxPanX, maxPanY]);

  const rotarIzquierda = () => setRotacion(r => ((r + 270) % 360) as Rotacion);
  const rotarDerecha = () => setRotacion(r => ((r + 90) % 360) as Rotacion);
  const acercar = () => setEscala(e => clamp(e * PASO_ZOOM, escalaMinima, escalaMaxima));
  const alejar = () => setEscala(e => clamp(e / PASO_ZOOM, escalaMinima, escalaMaxima));

  // Rueda del mouse = zoom, en vez del scroll normal del navegador.
  useEffect(() => {
    if (!viewportEl) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? PASO_ZOOM_RUEDA : 1 / PASO_ZOOM_RUEDA;
      setEscala(prev => clamp(prev * factor, escalaMinima, escalaMaxima));
    };
    viewportEl.addEventListener('wheel', onWheel, { passive: false });
    return () => viewportEl.removeEventListener('wheel', onWheel);
  }, [viewportEl, escalaMinima, escalaMaxima]);

  // Arrastrar con click izquierdo para recorrer la imagen ampliada (como Google Maps).
  const iniciarArrastre = (e: React.PointerEvent) => {
    if (e.button !== 0 || !pannable) return;
    arrastreRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    setArrastrando(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moverArrastre = (e: React.PointerEvent) => {
    if (!arrastreRef.current) return;
    const d = arrastreRef.current;
    setPan({
      x: clamp(d.panX + (e.clientX - d.startX), -maxPanX, maxPanX),
      y: clamp(d.panY + (e.clientY - d.startY), -maxPanY, maxPanY),
    });
  };
  const terminarArrastre = (e: React.PointerEvent) => {
    arrastreRef.current = null;
    setArrastrando(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  if (!src) {
    return (
      <div className={`flex items-center justify-center ${alturaClase}`}>
        <LoadingSpinner label="Cargando foto…" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center justify-center gap-1.5 bg-gray-900 border border-gray-800 rounded-lg p-1.5 self-center">
        <button type="button" onClick={rotarIzquierda} aria-label="Rotar a la izquierda"
          className="p-2 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300">
          <IconRotarIzquierda size={16} aria-hidden />
        </button>
        <button type="button" onClick={rotarDerecha} aria-label="Rotar a la derecha"
          className="p-2 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300">
          <IconRotarDerecha size={16} aria-hidden />
        </button>
        <div className="w-px self-stretch bg-gray-800 mx-1" />
        <button type="button" onClick={alejar} disabled={escala <= escalaMinima + 0.001} aria-label="Alejar"
          className="p-2 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed">
          <IconZoomOut size={16} aria-hidden />
        </button>
        <span className="text-xs text-gray-400 w-12 text-center tabular-nums">{Math.round(escala * 100)}%</span>
        <button type="button" onClick={acercar} disabled={escala >= escalaMaxima - 0.001} aria-label="Acercar"
          className="p-2 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed">
          <IconZoomIn size={16} aria-hidden />
        </button>
        {!dentroDeModal && (
          <>
            <div className="w-px self-stretch bg-gray-800 mx-1" />
            <button type="button" onClick={() => setPantallaCompleta(true)} aria-label="Ver en pantalla completa"
              className="p-2 rounded-md bg-gray-800 hover:bg-gray-700 text-gray-300">
              <IconAjustar size={16} aria-hidden />
            </button>
          </>
        )}
      </div>

      <div
        ref={setViewportEl}
        onPointerDown={iniciarArrastre}
        onPointerMove={moverArrastre}
        onPointerUp={terminarArrastre}
        onPointerCancel={terminarArrastre}
        className={`relative bg-gray-950 rounded-xl border border-gray-800 overflow-hidden select-none ${alturaClase} ${
          pannable ? (arrastrando ? 'cursor-grabbing' : 'cursor-grab') : ''
        }`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          draggable={false}
          onDragStart={e => e.preventDefault()}
          onLoad={e => {
            const img = e.currentTarget;
            setNatural({ width: img.naturalWidth, height: img.naturalHeight });
          }}
          style={
            natural
              ? {
                  position: 'absolute', top: '50%', left: '50%',
                  width: natural.width * escala, height: natural.height * escala,
                  transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px) rotate(${rotacion}deg)`,
                  maxWidth: 'none',
                }
              : { opacity: 0 }
          }
        />
      </div>

      {!dentroDeModal && (
        <Modal open={pantallaCompleta} onClose={() => setPantallaCompleta(false)} title={alt} size="full">
          <VisorFoto src={src} alt={alt} alturaClase="h-[82vh]" dentroDeModal />
        </Modal>
      )}
    </div>
  );
}
