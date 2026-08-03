'use client';

import { useEffect, useRef, useState } from 'react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getSugerenciasSku, type SugerenciaSku } from '@/lib/api';
import FormInput from './FormInput';

interface AutocompleteSkuProps {
  value: string;
  onChange: (valor: string) => void;
  /** Se llama al elegir una sugerencia: trae sku + descripción + unidad, así
   * que el consumidor puede llenar el renglón sin pedir nada más a la red. */
  onSelect: (sugerencia: SugerenciaSku) => void;
  onBlur?: () => void;
  label?: string;
  error?: string;
  placeholder?: string;
  inputSize?: 'sm' | 'md' | 'lg';
  className?: string;
  disabled?: boolean;
}

const MIN_CARACTERES = 2;

export default function AutocompleteSku({
  value, onChange, onSelect, onBlur,
  label, error, placeholder, inputSize = 'sm', className = '', disabled,
}: AutocompleteSkuProps) {
  const [sugerencias, setSugerencias] = useState<SugerenciaSku[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [resaltado, setResaltado] = useState(-1);
  // Solo se busca si el texto viene de tecleo, no de rellenarlo por OCR ni de
  // haber elegido una sugerencia (si no, el dropdown reaparecería solo).
  const tecleandoRef = useRef(false);
  const contenedorRef = useRef<HTMLDivElement>(null);

  const busqueda = useDebouncedValue(value, 250);

  useEffect(() => {
    const termino = busqueda.trim();
    if (!tecleandoRef.current || termino.length < MIN_CARACTERES) {
      setSugerencias([]);
      setBuscando(false);
      return;
    }
    const controller = new AbortController();
    setBuscando(true);
    getSugerenciasSku(termino, controller.signal)
      .then(datos => {
        setSugerencias(datos);
        setResaltado(-1);
        setAbierto(true);
      })
      .catch(err => { if (err.name !== 'AbortError') setSugerencias([]); })
      .finally(() => setBuscando(false));
    return () => controller.abort();
  }, [busqueda]);

  // Clic fuera cierra el dropdown
  useEffect(() => {
    if (!abierto) return;
    const alClicar = (e: MouseEvent) => {
      if (!contenedorRef.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener('mousedown', alClicar);
    return () => document.removeEventListener('mousedown', alClicar);
  }, [abierto]);

  const elegir = (s: SugerenciaSku) => {
    tecleandoRef.current = false;
    setAbierto(false);
    setSugerencias([]);
    onSelect(s);
  };

  const alTeclear = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') { setAbierto(false); return; }
    if (!abierto || sugerencias.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setResaltado(i => (i + 1) % sugerencias.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setResaltado(i => (i <= 0 ? sugerencias.length - 1 : i - 1));
    } else if (e.key === 'Enter' && resaltado >= 0) {
      e.preventDefault();
      elegir(sugerencias[resaltado]);
    }
  };

  const hayTermino = value.trim().length >= MIN_CARACTERES;
  const mostrarPanel = abierto && hayTermino && (buscando || sugerencias.length > 0 || tecleandoRef.current);

  return (
    <div ref={contenedorRef} className="relative">
      <FormInput
        label={label}
        error={error}
        inputSize={inputSize}
        className={className}
        placeholder={placeholder}
        disabled={disabled}
        value={value}
        autoComplete="off"
        onChange={e => { tecleandoRef.current = true; onChange(e.target.value); }}
        onFocus={() => { if (sugerencias.length) setAbierto(true); }}
        onKeyDown={alTeclear}
        onBlur={() => { setAbierto(false); onBlur?.(); }}
      />

      {mostrarPanel && (
        <ul
          // Sin esto el blur del input dispara ANTES que el click y la
          // selección se pierde (además de disparar la validación de "no
          // registrado" con el texto a medio escribir).
          onMouseDown={e => e.preventDefault()}
          className="absolute z-20 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 shadow-xl"
          role="listbox"
        >
          {buscando && sugerencias.length === 0 && (
            <li className="px-3 py-2 text-xs text-gray-400">Buscando…</li>
          )}
          {!buscando && sugerencias.length === 0 && (
            <li className="px-3 py-2 text-xs text-gray-400">Sin coincidencias</li>
          )}
          {sugerencias.map((s, i) => (
            <li key={s.sku}>
              <button
                type="button"
                role="option"
                aria-selected={i === resaltado}
                onClick={() => elegir(s)}
                onMouseEnter={() => setResaltado(i)}
                className={`w-full text-left px-3 py-2 transition-colors ${
                  i === resaltado ? 'bg-gray-800' : 'hover:bg-gray-800/60'
                }`}
              >
                <span className="block font-mono text-xs text-white">{s.sku}</span>
                {s.descripcion && (
                  <span className="block text-[11px] text-gray-400 truncate">{s.descripcion}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
