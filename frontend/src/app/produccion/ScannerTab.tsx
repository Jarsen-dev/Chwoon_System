'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { RegistroConMeta } from './page'
import { getFaltanStyle }  from './helpers'

interface Props {
  registros:         RegistroConMeta[]
  alertas:           { tipo: string; motivo: string; id: number }[]
  inputValue:        string
  inputRef:          React.RefObject<HTMLInputElement | null>
  setAlertas:        React.Dispatch<React.SetStateAction<{ tipo: string; motivo: string; id: number }[]>>
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleKeyDown:     (e: React.KeyboardEvent) => void
}

function getTurnoActual(): string {
  const totalMinutos = new Date().getHours() * 60 + new Date().getMinutes()
  return totalMinutos >= 450 && totalMinutos < 1170 ? 'DIA' : 'NOCHE'
}

function getFechaTurno(): string {
  const ahora        = new Date()
  const totalMinutos = ahora.getHours() * 60 + ahora.getMinutes()
  if (totalMinutos < 450) {
    const ayer = new Date(ahora)
    ayer.setDate(ayer.getDate() - 1)
    return ayer.toISOString().split('T')[0]
  }
  return ahora.toISOString().split('T')[0]
}

const COLUMNAS = [
  'Hora', 'Máquina', 'N° Parte', 'Descripción',
  'Carrito', 'QTY', 'Total', 'Meta Plan', 'Faltan', 'Usuario',
]

// ── Validación formato QR ───────────────────────────────────────────
// Formato: PARTE_TURNO_FECHA_CARRITO  (ej: 5208JJ1024A_D_13042026_1)
// PARTE:   alfanumérico con posibles guiones (mínimo 1 carácter)
// TURNO:   D o N
// FECHA:   dígitos (6-10 dígitos)
// CARRITO: dígitos (1+)
const QR_REGEX = /^[A-Z0-9]+([_-]?[A-Z0-9]+)*_[DN]_\d{6,10}_\d+$/i

function esFormatoQRValido(codigo: string): boolean {
  return QR_REGEX.test(codigo.trim())
}

export default function ScannerTab({
  registros, alertas, inputValue,
  inputRef, setAlertas,
  handleInputChange, handleKeyDown,
}: Props) {

  const [descargando, setDescargando] = useState(false)
  const [errorMsg,    setErrorMsg]    = useState<string | null>(null)

  // ── Anti-escritura manual ─────────────────────────────────────────
  // Estrategia: dejar que el input acumule todo libremente.
  // Detectar scanner vs humano por la VELOCIDAD TOTAL de entrada.
  // Scanner: muchos caracteres en <300ms total. Humano: lento.
  const firstKeyTime  = useRef<number>(0)
  const keyCount      = useRef<number>(0)
  const manualBlocked = useRef<boolean>(false)
  const checkTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Filtros ───────────────────────────────────────────────────────
  const [busqueda,      setBusqueda]      = useState('')
  const [filtroMaquina, setFiltroMaquina] = useState('')
  const [filtroParte,   setFiltroParte]   = useState('')
  const [filtroDesc,    setFiltroDesc]    = useState('')

  const filtrosRef = useRef<HTMLDivElement>(null)
  const enFiltros  = useRef(false)

  const handleFiltroFocus = () => { enFiltros.current = true }
  const handleFiltroBlur  = () => {
    setTimeout(() => {
      if (
        filtrosRef.current &&
        filtrosRef.current.contains(document.activeElement)
      ) {
        enFiltros.current = true
      } else {
        enFiltros.current = false
      }
    }, 50)
  }

  useEffect(() => {
    if (inputRef && 'current' in inputRef) {
      (inputRef as any)._enFiltros = () => enFiltros.current
    }
  }, [inputRef])

  // ── Opciones únicas para selects ─────────────────────────────────
  const maquinasUnicas = useMemo(() =>
    [...new Set(registros.map(r => r.maquina).filter(Boolean))].sort()
  , [registros])

  const partesUnicas = useMemo(() =>
    [...new Set(registros.map(r => r.numero_parte).filter(Boolean))].sort()
  , [registros])

  const descsUnicas = useMemo(() =>
    [...new Set(registros.map(r => r.descripcion).filter(Boolean))].sort()
  , [registros])

  // ── Registros filtrados ───────────────────────────────────────────
  const registrosFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    return registros.filter(reg => {
      const pasaBusqueda = !q || (
        (reg.maquina      || '').toLowerCase().includes(q) ||
        (reg.numero_parte || '').toLowerCase().includes(q) ||
        (reg.descripcion  || '').toLowerCase().includes(q)
      )
      const pasaMaquina = !filtroMaquina || reg.maquina      === filtroMaquina
      const pasaParte   = !filtroParte   || reg.numero_parte === filtroParte
      const pasaDesc    = !filtroDesc    || reg.descripcion  === filtroDesc
      return pasaBusqueda && pasaMaquina && pasaParte && pasaDesc
    })
  }, [registros, busqueda, filtroMaquina, filtroParte, filtroDesc])

  const hayFiltros = busqueda || filtroMaquina || filtroParte || filtroDesc

  const limpiarFiltros = () => {
    setBusqueda('')
    setFiltroMaquina('')
    setFiltroParte('')
    setFiltroDesc('')
  }

  // ── Helper: agregar alerta local (no duplicar) ────────────────────
  const agregarAlertaLocal = (tipo: string, motivo: string, duracion = 8_000) => {
    const id = Date.now() + Math.random()
    setAlertas(prev => {
      // Evitar duplicados del mismo tipo
      if (prev.some(a => a.tipo === tipo)) return prev
      return [{ tipo, motivo, id }, ...prev]
    })
    setTimeout(() => {
      setAlertas(prev => prev.filter(a => a.id !== id))
    }, duracion)
  }

  // ── Limpiar input del padre ───────────────────────────────────────
  const limpiarInput = () => {
    const fakeEvent = {
      target: { value: '' }
    } as React.ChangeEvent<HTMLInputElement>
    handleInputChange(fakeEvent)
  }

  // ── Detectar si la entrada fue por scanner (rápida) ───────────────
  // Scanner QR: ~20 caracteres en <200ms. Humano: 1 char cada ~150ms+.
  // Regla: si ≥5 caracteres llegaron en <500ms → scanner.
  const esEntradaDeScanner = (): boolean => {
    if (keyCount.current < 3) return false
    const elapsed = Date.now() - firstKeyTime.current
    const charsPorSegundo = (keyCount.current / elapsed) * 1000
    // Scanner: >15 chars/segundo. Humano: <8 chars/segundo típicamente
    return charsPorSegundo > 12
  }

  // ── Validar y procesar cuando se completa la entrada ──────────────
  const validarYProcesar = (codigo: string) => {
    // Reset contadores
    firstKeyTime.current = 0
    keyCount.current     = 0
    manualBlocked.current = false

    if (!codigo.trim()) return

    // ¿Fue entrada rápida (scanner)?
    // Si el código tiene formato QR válido, lo aceptamos sin importar velocidad
    // (por si el scanner es lento). Si NO tiene formato válido, rechazamos.
    if (!esFormatoQRValido(codigo)) {
      limpiarInput()
      agregarAlertaLocal(
        'FORMATO INVÁLIDO',
        `Código rechazado: "${codigo}". Formato esperado: PARTE_TURNO_FECHA_CARRITO (ej: 5208JJ1024A_D_13042026_1)`,
        10_000
      )
      return
    }

    // Formato válido → pasar al handler del padre (handleKeyDown con Enter)
    // El padre (page.tsx) procesa con enviarCodigo()
    handleKeyDown({ key: 'Enter', preventDefault: () => {} } as React.KeyboardEvent)
  }

  // ── Interceptar KeyDown ───────────────────────────────────────────
  const handleScannerKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Permitir navegación
    if (e.key === 'Tab' || e.key === 'Escape') return

    if (e.key === 'Enter') {
      e.preventDefault()
      if (checkTimer.current) {
        clearTimeout(checkTimer.current)
        checkTimer.current = null
      }

      const codigo = (inputRef.current?.value || '').trim()
      validarYProcesar(codigo)
      return
    }

    // Teclas no imprimibles → ignorar
    if (e.key.length !== 1) return

    // Rastrear velocidad de entrada
    const now = Date.now()
    if (keyCount.current === 0) {
      firstKeyTime.current = now
    }
    keyCount.current++

    // Dejar pasar la tecla al input (NO bloquear)
    // El onChange del padre acumulará el valor

    // Timer de seguridad: si después de 800ms no llega Enter,
    // revisar si parece escritura manual
    if (checkTimer.current) clearTimeout(checkTimer.current)
    checkTimer.current = setTimeout(() => {
      const valor = (inputRef.current?.value || '').trim()
      if (!valor) return

      // Si hay contenido pero no llegó Enter en 800ms,
      // probablemente escritura manual lenta
      if (!esEntradaDeScanner() && !esFormatoQRValido(valor)) {
        limpiarInput()
        firstKeyTime.current  = 0
        keyCount.current      = 0
        agregarAlertaLocal(
          'TECLADO BLOQUEADO',
          'Solo se permite entrada por escáner QR. La escritura manual está deshabilitada.',
          5_000
        )
      }
      // Si parece scanner pero no llegó Enter, procesar de todos modos
      else if (esEntradaDeScanner()) {
        validarYProcesar(valor)
      }
    }, 800)
  }

  // ── onChange: pasar siempre al padre (dejar acumular) ─────────────
  const handleScannerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleInputChange(e)
  }

  // ── Bloquear paste ────────────────────────────────────────────────
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    agregarAlertaLocal(
      'PEGADO BLOQUEADO',
      'No se permite pegar texto. Use el escáner QR.',
      5_000
    )
  }

  // ── Descarga Excel ────────────────────────────────────────────────
  const handleDescargarExcel = async () => {
    setErrorMsg(null)
    try {
      setDescargando(true)
      const turno    = getTurnoActual()
      const fecha    = getFechaTurno()
      const url      = `/produccion/registros/excel?fecha=${fecha}&turno=${turno}&t=${Date.now()}`
      const response = await fetch(url, { method: 'GET' })

      const contentType = response.headers.get('content-type') ?? ''
      if (!response.ok || !contentType.includes('spreadsheetml')) {
        setErrorMsg(`Error ${response.status}: ${response.statusText}`)
        return
      }

      const blob    = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const link    = document.createElement('a')
      link.href     = blobUrl
      link.download = `produccion_${fecha}_${turno}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(blobUrl)

    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : 'Error desconocido')
    } finally {
      setDescargando(false)
    }
  }

  return (
    <div className="space-y-4">

      {/* ── Título + Botón Excel ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-lg font-bold text-blue-700 tracking-wide uppercase">
          Escanee el Código del Carrito
        </h2>

        <button
          onClick={handleDescargarExcel}
          disabled={descargando || registros.length === 0}
          title={registros.length === 0 ? 'No hay registros' : `Excel turno ${getTurnoActual()}`}
          className={`
            inline-flex items-center gap-2 px-4 py-2 rounded-lg
            text-sm font-semibold shadow-sm transition-all duration-200
            focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-400
            ${descargando || registros.length === 0
              ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
              : 'bg-green-600 hover:bg-green-700 active:scale-95 text-white'
            }
          `}
        >
          {descargando ? (
            <>
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10"
                  stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              Generando Excel...
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M9 17v-2m3 2v-4m3 4v-6M4 20h16a1 1 0 001-1V5
                     a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"/>
              </svg>
              Descargar Excel
            </>
          )}
        </button>
      </div>

      {/* ── Error Excel ────────────────────────────────────────────── */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg
                        p-3 text-sm flex justify-between items-start">
          <div>
            <p className="font-semibold mb-1">❌ Error al generar Excel</p>
            <p className="whitespace-pre-wrap font-mono text-xs">{errorMsg}</p>
          </div>
          <button
            onClick={() => setErrorMsg(null)}
            className="text-red-400 hover:text-red-700 font-bold ml-4
                       text-lg leading-none flex-shrink-0"
          >✖</button>
        </div>
      )}

      {/* ── Input QR ──────────────────────────────────────────────── */}
      <div className="flex justify-center">
        <div className="w-full max-w-xl relative">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleScannerChange}
            onKeyDown={handleScannerKeyDown}
            onPaste={handlePaste}
            placeholder="Esperando lectura de código QR..."
            className="w-full text-center text-2xl p-4 border-2 border-blue-400
                       rounded-lg shadow-inner focus:outline-none focus:ring-4
                       focus:ring-blue-200 uppercase tracking-widest
                       placeholder:text-gray-300 placeholder:text-lg"
            autoComplete="off"
            autoFocus
          />
        </div>
      </div>

      {/* ── Alertas ───────────────────────────────────────────────── */}
      {alertas.length > 0 && (
        <div className="flex flex-col gap-2">
          {alertas.slice(0, 5).map(alerta => (
            <div key={alerta.id}
              className={`border-l-4 p-3 rounded flex justify-between items-start ${
                alerta.tipo === 'TECLADO BLOQUEADO' || alerta.tipo === 'PEGADO BLOQUEADO'
                  ? 'bg-yellow-50 border-yellow-500 text-yellow-700'
                  : alerta.tipo === 'FORMATO INVÁLIDO'
                  ? 'bg-orange-50 border-orange-500 text-orange-700'
                  : 'bg-red-50 border-red-500 text-red-700'
              }`}
            >
              <div>
                <p className="font-bold text-sm">
                  {alerta.tipo === 'TECLADO BLOQUEADO'  ? '⌨️' :
                   alerta.tipo === 'PEGADO BLOQUEADO'   ? '📋' :
                   alerta.tipo === 'FORMATO INVÁLIDO'   ? '⚠️' :
                   '🚨'} ALERTA: {alerta.tipo}
                </p>
                <p className="text-sm mt-0.5">{alerta.motivo}</p>
              </div>
              <button
                onClick={() => setAlertas(alertas.filter(a => a.id !== alerta.id))}
                className="font-bold ml-4 text-lg leading-none opacity-50
                           hover:opacity-100"
              >✖</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Filtros ───────────────────────────────────────────────── */}
      <div
        ref={filtrosRef}
        onFocus={handleFiltroFocus}
        onBlur={handleFiltroBlur}
        className="flex flex-wrap items-center gap-2"
      >
        <input
          type="text"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar máquina, parte o descripción..."
          className="flex-1 min-w-[200px] border border-gray-300 rounded-lg
                     px-3 py-2 text-sm focus:outline-none focus:ring-2
                     focus:ring-blue-200 focus:border-blue-400
                     placeholder:text-gray-400"
        />

        <select
          value={filtroMaquina}
          onChange={e => setFiltroMaquina(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-200
                     focus:border-blue-400 bg-white text-gray-700"
        >
          <option value="">Todas las Máquinas</option>
          {maquinasUnicas.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <select
          value={filtroParte}
          onChange={e => setFiltroParte(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-200
                     focus:border-blue-400 bg-white text-gray-700"
        >
          <option value="">Todos los N° Parte</option>
          {partesUnicas.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <select
          value={filtroDesc}
          onChange={e => setFiltroDesc(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-200
                     focus:border-blue-400 bg-white text-gray-700"
        >
          <option value="">Todas las Descripciones</option>
          {descsUnicas.map(d => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>

        <div className="flex items-center gap-2 ml-auto">
          {hayFiltros && (
            <button
              onClick={limpiarFiltros}
              className="text-xs text-gray-500 hover:text-red-600
                         underline underline-offset-2 transition-colors"
            >
              Limpiar filtros
            </button>
          )}
          <span className="bg-gray-100 text-gray-600 text-xs font-semibold
                           px-3 py-2 rounded-lg whitespace-nowrap border border-gray-200">
            {registrosFiltrados.length === registros.length
              ? `${registros.length} registro${registros.length !== 1 ? 's' : ''}`
              : `${registrosFiltrados.length} de ${registros.length} registros`
            }
          </span>
        </div>
      </div>

      {/* ── Tabla ─────────────────────────────────────────────────── */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100 border-b border-gray-200">
              {COLUMNAS.map(col => (
                <th key={col}
                  className="p-3 text-center font-semibold text-slate-600 whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {registros.length === 0 ? (
              <tr>
                <td colSpan={COLUMNAS.length} className="p-12 text-center">
                  <span className="text-4xl block mb-2">📷</span>
                  <span className="text-gray-400">Esperando escaneo...</span>
                </td>
              </tr>
            ) : registrosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={COLUMNAS.length} className="p-12 text-center">
                  <span className="text-3xl block mb-2">🔍</span>
                  <span className="text-gray-400">
                    Sin resultados para los filtros aplicados
                  </span>
                  <button
                    onClick={limpiarFiltros}
                    className="block mx-auto mt-2 text-blue-600
                               hover:underline text-sm"
                  >
                    Limpiar filtros
                  </button>
                </td>
              </tr>
            ) : (
              registrosFiltrados.map((reg, idx) => {
                const esNuevo = idx === 0 && !hayFiltros
                return (
                  <tr
                    key={`${reg.hora}-${reg.numero_parte}-${idx}`}
                    className={`border-b transition-colors ${
                      esNuevo
                        ? 'bg-blue-50 border-l-4 border-l-blue-500'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className={`p-3 text-center font-mono text-sm whitespace-nowrap ${
                      esNuevo ? 'text-blue-700 font-semibold' : 'text-slate-500'
                    }`}>
                      {reg.hora}
                    </td>

                    <td className={`p-3 text-center ${
                      esNuevo ? 'text-slate-800 font-semibold' : 'text-slate-600'
                    }`}>
                      {reg.maquina}
                    </td>

                    <td className={`p-3 text-center font-mono font-bold whitespace-nowrap ${
                      esNuevo ? 'text-blue-700' : 'text-blue-600'
                    }`}>
                      {reg.numero_parte}
                    </td>

                    <td className={`p-3 text-left text-xs max-w-[160px] ${
                      esNuevo ? 'text-slate-700' : 'text-slate-500'
                    }`}>
                      <span className="block truncate" title={reg.descripcion || ''}>
                        {reg.descripcion || '—'}
                      </span>
                    </td>

                    <td className="p-3 text-center text-slate-600 whitespace-nowrap">
                      #{reg.carrito_numero}
                    </td>

                    <td className={`p-3 text-center font-semibold ${
                      esNuevo ? 'text-slate-800' : 'text-slate-700'
                    }`}>
                      {reg.qty_bolsa}
                    </td>

                    <td className={`p-3 text-center font-bold ${
                      esNuevo ? 'text-emerald-700' : 'text-emerald-600'
                    }`}>
                      {reg.total_acumulado}
                    </td>

                    <td className="p-3 text-center text-slate-500">
                      {reg.meta_plan ?? 'N/A'}
                    </td>

                    <td className={`p-3 text-center font-semibold
                      ${getFaltanStyle(reg.faltan ?? 'N/A')}`}>
                      {reg.faltan === 0 ? '✅ 0' : (reg.faltan ?? 'N/A')}
                    </td>

                    <td className={`p-3 text-center text-xs whitespace-nowrap ${
                      esNuevo ? 'text-slate-700 font-semibold' : 'text-slate-500'
                    }`}>
                      <span className="inline-flex items-center gap-1">
                        <span>👤</span>
                        <span>{reg.usuario || '—'}</span>
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {registros.length > 0 && (
        <p className="text-right text-xs text-gray-400 mt-1">
          {registros.length} registro(s) en este turno
        </p>
      )}

    </div>
  )
}