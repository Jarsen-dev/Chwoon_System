'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useAuth } from '@/context/AuthContext'
import { Html5Qrcode } from 'html5-qrcode'

// ─── Types ────────────────────────────────────────────────────────────────────
interface RegistroSecado {
  id:               number
  numero_parte:     string
  descripcion:      string
  maquina:          string
  carrito:          string
  hora_entrada:     string
  hora_salida:      string | null
  tiempo_en_camara: string | null
  qty_total:        number | null
  estado:           'dentro' | 'salido'
  usuario:          string
}

interface Alerta {
  id:      number
  tipo:    string
  mensaje: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getTurnoActual(): 'D' | 'N' {
  const mins = new Date().getHours() * 60 + new Date().getMinutes()
  return mins >= 450 && mins < 1170 ? 'D' : 'N'
}

function getFechaTurno(): string {
  const ahora = new Date()
  const mins  = ahora.getHours() * 60 + ahora.getMinutes()
  if (mins < 450) {
    const ayer = new Date(ahora)
    ayer.setDate(ayer.getDate() - 1)
    return ayer.toISOString().split('T')[0]
  }
  return ahora.toISOString().split('T')[0]
}

const QR_REGEX = /^[A-Z0-9]+([_-]?[A-Z0-9]+)*_[DN]_\d{6,10}_\d+$/i
function esFormatoQRValido(codigo: string): boolean {
  return QR_REGEX.test(codigo.trim())
}

// ─── Alert color map ──────────────────────────────────────────────────────────
const ALERTA_STYLES: Record<string, { bg: string; border: string; color: string; icon: string }> = {
  'TECLADO BLOQUEADO': { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)',  color: '#fbbf24', icon: '⌨️' },
  'PEGADO BLOQUEADO':  { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.3)',  color: '#fbbf24', icon: '📋' },
  'FORMATO INVÁLIDO':  { bg: 'rgba(249,115,22,0.08)', border: 'rgba(249,115,22,0.3)',  color: '#fb923c', icon: '⚠️' },
  'ENTRADA':           { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.3)',  color: '#10b981', icon: '🟢' },
  'SALIDA':            { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.3)',  color: '#3b82f6', icon: '🔵' },
  'ERROR':             { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.3)',   color: '#ef4444', icon: '🚨' },
  'TURNO':             { bg: 'rgba(139,92,246,0.08)', border: 'rgba(139,92,246,0.3)',  color: '#8b5cf6', icon: '🔄' },
}

const DEFAULT_ALERTA = {
  bg: 'rgba(245,158,11,0.08)',
  border: 'rgba(245,158,11,0.3)',
  color: '#fbbf24',
  icon: '⚠️',
}

const COLUMNAS = [
  'Máquina', 'No. de Parte', 'Descripción', 'Carrito',
  'Hora Entrada', 'Hora Salida', 'Tiempo en Cámara',
  'Total Piezas', 'Estado', 'Usuario',
]

// ─── Component ────────────────────────────────────────────────────────────────
export default function CuartoSecadoTab() {
  const { token } = useAuth()

  const [registros,   setRegistros]   = useState<RegistroSecado[]>([])
  const [inputValue,  setInputValue]  = useState('')
  const [alertas,     setAlertas]     = useState<Alerta[]>([])
  const [cargando,    setCargando]    = useState(false)
  const [descargando, setDescargando] = useState(false)
  const [errorExcel,  setErrorExcel]  = useState<string | null>(null)

  // Scanner de cámara
  const [scannerOpen,  setScannerOpen]  = useState(false)
  const [scannerError, setScannerError] = useState<string | null>(null)
  const scannerRef          = useRef<Html5Qrcode | null>(null)
  const scannerContainerRef = useRef<HTMLDivElement | null>(null)
  const procesarEscaneoRef  = useRef<(codigo: string) => Promise<void>>(async () => {})

  // Filtros
  const [busqueda,      setBusqueda]      = useState('')
  const [filtroMaquina, setFiltroMaquina] = useState('')
  const [filtroParte,   setFiltroParte]   = useState('')
  const [filtroEstado,  setFiltroEstado]  = useState('')

  // Refs
  const inputRef      = useRef<HTMLInputElement | null>(null)
  const inputValueRef = useRef('')
  const turnoRef      = useRef<'D' | 'N'>(getTurnoActual())
  const filtrosRef    = useRef<HTMLDivElement>(null)
  const enFiltros     = useRef(false)
  const firstKeyTime  = useRef<number>(0)
  const keyCount      = useRef<number>(0)
  const checkTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleFiltroFocus = () => { enFiltros.current = true }
  const handleFiltroBlur  = () => {
    setTimeout(() => {
      enFiltros.current = !!(filtrosRef.current?.contains(document.activeElement))
    }, 50)
  }

  // Auto-focus (respeta filtros)
  useEffect(() => {
    const iv = setInterval(() => {
      if (enFiltros.current) return
      const tag = document.activeElement?.tagName ?? ''
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag) && document.activeElement !== inputRef.current) return
      if (document.activeElement !== inputRef.current) inputRef.current?.focus()
    }, 1_000)
    return () => clearInterval(iv)
  }, [])

  useEffect(() => { cargarRegistros() }, [])

  useEffect(() => {
    const iv = setInterval(() => {
      const t = getTurnoActual()
      if (t !== turnoRef.current) {
        turnoRef.current = t
        limpiarFiltros()
        cargarRegistros()
        agregarAlerta({ tipo: 'TURNO', mensaje: `Turno cambiado a ${t === 'D' ? 'Día' : 'Noche'}.` })
      }
    }, 30_000)
    return () => clearInterval(iv)
  }, [])

  const cargarRegistros = async () => {
    try {
      setCargando(true)
      const fecha = getFechaTurno()
      const turno = turnoRef.current === 'D' ? 'DIA' : 'NOCHE'
      const res   = await fetch(`/secado/registros?fecha=${fecha}&turno=${turno}`)
      if (!res.ok) return
      setRegistros(await res.json())
    } catch (e) {
      console.error('Error cargando registros secado:', e)
    } finally {
      setCargando(false)
    }
  }

  const agregarAlerta = (alerta: Omit<Alerta, 'id'>) => {
    const id = Date.now() + Math.random()
    setAlertas(prev => {
      if (prev.some(a => a.tipo === alerta.tipo && a.mensaje === alerta.mensaje)) return prev
      return [{ ...alerta, id }, ...prev]
    })
    setTimeout(() => setAlertas(prev => prev.filter(a => a.id !== id)), 15_000)
  }

  const esEntradaDeScanner = (): boolean => {
    if (keyCount.current < 3) return false
    return (keyCount.current / (Date.now() - firstKeyTime.current)) * 1000 > 12
  }

  const procesarEscaneo = async (codigo: string) => {
    firstKeyTime.current = 0
    keyCount.current     = 0
    if (!codigo.trim()) return

    const codigoNorm = codigo.replace(/\?/g, '_').trim()
    if (!esFormatoQRValido(codigoNorm)) {
      agregarAlerta({
        tipo: 'FORMATO INVÁLIDO',
        mensaje: `Código rechazado: "${codigoNorm}". Formato: PARTE_TURNO_FECHA_CARRITO`,
      })
      inputValueRef.current = ''
      setInputValue('')
      return
    }

    try {
      const res  = await fetch('/secado/escanear/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo: codigoNorm, token: token || '' }),
      })
      const data = await res.json()
      agregarAlerta({ tipo: data.tipo, mensaje: data.mensaje })
      if (data.tipo === 'ERROR') return

      const reg: RegistroSecado = data.registro
      if (data.tipo === 'ENTRADA') setRegistros(prev => [reg, ...prev])
      else if (data.tipo === 'SALIDA') setRegistros(prev => prev.map(r => r.id === reg.id ? reg : r))
    } catch {
      agregarAlerta({ tipo: 'ERROR', mensaje: 'Error de conexión con el servidor' })
    }

    inputValueRef.current = ''
    setInputValue('')
  }

  useEffect(() => { procesarEscaneoRef.current = procesarEscaneo }, [procesarEscaneo])

  const abrirScanner = async () => {
    setScannerError(null)
    setScannerOpen(true)

    setTimeout(async () => {
      if (!scannerContainerRef.current) return
      try {
        const scanner = new Html5Qrcode('reader-secado')
        scannerRef.current = scanner
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            void scanner.stop().then(() => {
              scannerRef.current = null
              setScannerOpen(false)
              const norm = decodedText.toUpperCase().replace(/\?/g, '_')
              inputValueRef.current = norm
              setInputValue(norm)
              void procesarEscaneoRef.current(norm)
            })
          },
          () => {}
        )
      } catch (err: any) {
        setScannerError(err?.message || 'No se pudo iniciar la cámara.')
        if (scannerRef.current) {
          try { await scannerRef.current.stop() } catch {}
          scannerRef.current = null
        }
      }
    }, 300)
  }

  const cerrarScanner = async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop() } catch {}
      scannerRef.current = null
    }
    setScannerOpen(false)
    setScannerError(null)
  }

  useEffect(() => {
    return () => { if (scannerRef.current) void scannerRef.current.stop() }
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab' || e.key === 'Escape') return

    if (e.key === 'Enter') {
      e.preventDefault()
      if (checkTimer.current) {
        clearTimeout(checkTimer.current)
        checkTimer.current = null
      }
      procesarEscaneo(inputValueRef.current.trim())
      return
    }

    if (e.key.length !== 1) return

    const now = Date.now()
    if (keyCount.current === 0) firstKeyTime.current = now
    keyCount.current++

    if (checkTimer.current) clearTimeout(checkTimer.current)
    checkTimer.current = setTimeout(() => {
      const val = inputValueRef.current.trim()
      if (!val) return

      if (!esEntradaDeScanner() && !esFormatoQRValido(val)) {
        inputValueRef.current = ''
        setInputValue('')
        firstKeyTime.current = 0
        keyCount.current     = 0
        agregarAlerta({ tipo: 'TECLADO BLOQUEADO', mensaje: 'Solo se permite entrada por escáner QR.' })
      } else if (esEntradaDeScanner()) {
        procesarEscaneo(val)
      }
    }, 800)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase().replace(/\?/g, '_')
    inputValueRef.current = val
    setInputValue(val)
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    agregarAlerta({ tipo: 'PEGADO BLOQUEADO', mensaje: 'No se permite pegar texto. Use el escáner QR.' })
  }

  const handleDescargarExcel = async () => {
    setErrorExcel(null)
    setDescargando(true)
    try {
      const fecha    = getFechaTurno()
      const turno    = turnoRef.current === 'D' ? 'DIA' : 'NOCHE'
      const response = await fetch(`/secado/registros/excel?fecha=${fecha}&turno=${turno}&t=${Date.now()}`)
      const ct = response.headers.get('content-type') ?? ''
      if (!response.ok || !ct.includes('spreadsheetml')) {
        setErrorExcel(`Error ${response.status}: ${response.statusText}`)
        return
      }
      const blob = await response.blob()
      const url  = window.URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `secado_${fecha}_${turno}.xlsx`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
    } catch (err) {
      setErrorExcel(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setDescargando(false)
    }
  }

  const maquinasUnicas = useMemo(
    () => [...new Set(registros.map(r => r.maquina).filter(Boolean))].sort(),
    [registros]
  )

  const partesUnicas = useMemo(
    () => [...new Set(registros.map(r => r.numero_parte).filter(Boolean))].sort(),
    [registros]
  )

  const registrosFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    return registros.filter(r => {
      if (
        q &&
        ![(r.maquina || ''), (r.numero_parte || ''), (r.descripcion || '')]
          .some(s => s.toLowerCase().includes(q))
      ) return false
      if (filtroMaquina && r.maquina      !== filtroMaquina) return false
      if (filtroParte   && r.numero_parte !== filtroParte)   return false
      if (filtroEstado  && r.estado       !== filtroEstado)  return false
      return true
    })
  }, [registros, busqueda, filtroMaquina, filtroParte, filtroEstado])

  const hayFiltros      = !!(busqueda || filtroMaquina || filtroParte || filtroEstado)
  const limpiarFiltros  = () => {
    setBusqueda('')
    setFiltroMaquina('')
    setFiltroParte('')
    setFiltroEstado('')
  }

  const carritosAdentro = registros.filter(r => r.estado === 'dentro').length
  const carritosSalidos = registros.filter(r => r.estado === 'salido').length


  return (
    <div className="flex flex-col gap-5">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="text-lg font-bold text-white">🌡️ Cuarto de Secado</div>
          <div className="text-xs text-gray-400 mt-1">
            {registros.length} total · {carritosAdentro} en cámara · {carritosSalidos} salidos
          </div>
        </div>
        <button
          onClick={handleDescargarExcel}
          disabled={descargando || registros.length === 0}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {descargando ? (
            <>
              <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" strokeOpacity=".25" />
                <path fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Generando...
            </>
          ) : (
            <>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Excel
            </>
          )}
        </button>
      </div>

      {/* Error Excel */}
      {errorExcel && (
        <div className="flex items-start gap-2 px-3.5 py-2.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/30">
          <span>⚠</span>
          <span className="flex-1">
            Error al generar Excel:{' '}
            <span className="font-mono text-[11px]">{errorExcel}</span>
          </span>
          <button onClick={() => setErrorExcel(null)} className="text-red-400 hover:text-red-300 text-base leading-none bg-transparent border-none cursor-pointer p-0">✕</button>
        </div>
      )}

      {/* Scanner section */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex flex-col items-center gap-3">
          <div className="flex w-full max-w-xl items-center gap-2.5">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Esperando lectura de código QR..."
              autoComplete="off"
              autoFocus
              className="flex-1 bg-gray-950 border-2 border-amber-500 rounded-xl px-4 py-3.5 font-mono text-xl font-semibold text-white text-center tracking-wider outline-none uppercase focus:ring-2 focus:ring-amber-500/30 transition-shadow"
            />
            <button
              onClick={abrirScanner}
              type="button"
              title="Escanear con cámara"
              className="w-14 h-14 flex items-center justify-center rounded-xl shrink-0 bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
            >
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
          <p className="text-xs text-gray-400">
            1er escaneo → <span className="text-emerald-400 font-semibold">Entrada</span>
            {' · '}
            2do escaneo → <span className="text-blue-400 font-semibold">Salida</span>
          </p>
        </div>
      </div>

      {/* Modal Scanner */}
      {scannerOpen && (
        <div className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] w-full max-w-sm">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <span className="text-sm font-bold text-white">📷 Escanear QR</span>
              <button className="text-gray-400 hover:text-white transition-colors text-lg leading-none" onClick={cerrarScanner}>✕</button>
            </div>
            <div className="p-5 flex flex-col gap-3">
              <div ref={scannerContainerRef} id="reader-secado" className="w-full aspect-square rounded-lg overflow-hidden bg-black" />
              {scannerError && (
                <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg text-xs bg-red-500/10 text-red-400 border border-red-500/30">
                  <span>⚠️</span> {scannerError}
                </div>
              )}
              <p className="text-xs text-gray-400 text-center">Apunta el código QR dentro del recuadro</p>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total',   value: registros.length,  colorClass: 'border-blue-500 text-blue-400' },
          { label: 'Dentro',  value: carritosAdentro,   colorClass: 'border-amber-500 text-amber-400' },
          { label: 'Salidos', value: carritosSalidos,   colorClass: 'border-emerald-500 text-emerald-400' },
        ].map(s => (
          <div key={s.label} className={`bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 border-l-[3px] ${s.colorClass.split(' ')[0]}`}>
            <div className="text-[10px] font-semibold tracking-wider uppercase text-gray-400">{s.label}</div>
            <div className={`font-mono text-3xl font-semibold mt-0.5 ${s.colorClass.split(' ')[1]}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="flex flex-col gap-2">
          {alertas.slice(0, 5).map(alerta => {
            const st = ALERTA_STYLES[alerta.tipo] ?? DEFAULT_ALERTA
            return (
              <div
                key={alerta.id}
                className="flex justify-between items-start px-3.5 py-2.5 rounded-lg gap-2.5"
                style={{ background: st.bg, border: `1px solid ${st.border}` }}
              >
                <div>
                  <div className="text-xs font-bold mb-0.5" style={{ color: st.color }}>{st.icon} {alerta.tipo}</div>
                  <div className="text-xs text-gray-400">{alerta.mensaje}</div>
                </div>
                <button
                  onClick={() => setAlertas(prev => prev.filter(a => a.id !== alerta.id))}
                  className="bg-transparent border-none cursor-pointer text-base leading-none p-0 opacity-70 hover:opacity-100 transition-opacity"
                  style={{ color: st.color }}
                >✕</button>
              </div>
            )
          })}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-3.5">
        <div
          ref={filtrosRef}
          onFocus={handleFiltroFocus}
          onBlur={handleFiltroBlur}
          className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2.5 items-end"
        >
          <div>
            <label className="block text-[10px] font-bold tracking-wider uppercase text-gray-400 mb-1">Buscar</label>
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar máquina, parte o descripción..."
              className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 placeholder:text-gray-400"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold tracking-wider uppercase text-gray-400 mb-1">Máquina</label>
            <select value={filtroMaquina} onChange={e => setFiltroMaquina(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15">
              <option value="">Todas las Máquinas</option>
              {maquinasUnicas.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold tracking-wider uppercase text-gray-400 mb-1">No. de Parte</label>
            <select value={filtroParte} onChange={e => setFiltroParte(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15">
              <option value="">Todos los No. de Parte</option>
              {partesUnicas.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold tracking-wider uppercase text-gray-400 mb-1">Estado</label>
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15">
              <option value="">Cualquier Estado</option>
              <option value="dentro">🌡️ Dentro</option>
              <option value="salido">✅ Salido</option>
            </select>
          </div>

          <div className="flex items-center gap-2 justify-end flex-wrap">
            {hayFiltros && (
              <button onClick={limpiarFiltros} className="text-xs text-red-400 hover:text-red-300 underline bg-transparent border-none cursor-pointer">
                Limpiar filtros
              </button>
            )}
            <span className="bg-gray-800 border border-gray-800 rounded px-2.5 py-1 text-xs text-gray-400 font-mono whitespace-nowrap">
              {registrosFiltrados.length === registros.length
                ? `${registros.length} reg.`
                : `${registrosFiltrados.length} / ${registros.length}`}
            </span>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden overflow-x-auto">
        <table className="w-full text-sm divide-y divide-gray-800">
          <thead>
            <tr className="bg-gray-800">
              {COLUMNAS.map(col => (
                <th key={col} className="px-3 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider whitespace-nowrap">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {cargando ? (
              <tr>
                <td colSpan={COLUMNAS.length} className="px-4 py-12 text-center text-gray-400 text-sm">
                  Cargando registros...
                </td>
              </tr>
            ) : registros.length === 0 ? (
              <tr>
                <td colSpan={COLUMNAS.length} className="px-4 py-14 text-center">
                  <div className="text-3xl mb-2">🌡️</div>
                  <div className="text-sm text-gray-400">Esperando escaneo...</div>
                </td>
              </tr>
            ) : registrosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={COLUMNAS.length} className="px-4 py-14 text-center">
                  <div className="text-3xl mb-2">🔍</div>
                  <div className="text-sm text-gray-400 mb-2">Sin resultados para los filtros aplicados</div>
                  <button onClick={limpiarFiltros} className="text-xs text-blue-400 hover:text-blue-300 underline bg-transparent border-none cursor-pointer">
                    Limpiar filtros
                  </button>
                </td>
              </tr>
            ) : (
              registrosFiltrados.map((reg, idx) => {
                const esNuevo = idx === 0 && !hayFiltros
                return (
                  <tr
                    key={reg.id}
                    className={`transition-colors ${esNuevo ? 'bg-amber-500/5 border-l-[3px] border-amber-500' : 'hover:bg-gray-800/50'}`}
                  >
                    <td className="px-3 py-2.5 text-center text-xs font-mono whitespace-nowrap">
                      <span className={esNuevo ? 'text-white font-semibold' : 'text-gray-400'}>{reg.maquina || '—'}</span>
                    </td>

                    <td className="px-3 py-2.5 text-center">
                      <span className="font-mono text-xs font-medium text-cyan-400">{reg.numero_parte}</span>
                    </td>

                    <td className="px-3 py-2.5 text-xs text-gray-400 max-w-[180px] truncate">
                      <span title={reg.descripcion}>{reg.descripcion || '—'}</span>
                    </td>

                    <td className="px-3 py-2.5 text-center font-mono text-xs font-bold text-white whitespace-nowrap">
                      #{reg.carrito}
                    </td>

                    <td className="px-3 py-2.5 text-center font-mono text-xs text-gray-400 whitespace-nowrap">
                      {reg.hora_entrada}
                    </td>

                    <td className="px-3 py-2.5 text-center font-mono text-xs whitespace-nowrap">
                      {reg.hora_salida ?? (
                        <span className="text-amber-400 font-semibold animate-pulse">En cámara...</span>
                      )}
                    </td>

                    <td className="px-3 py-2.5 text-center font-mono text-xs font-semibold text-white whitespace-nowrap">
                      {reg.tiempo_en_camara ?? <span className="text-gray-600">—</span>}
                    </td>

                    <td className="px-3 py-2.5 text-center font-mono text-xs font-bold text-emerald-400">
                      {reg.qty_total != null ? reg.qty_total : '—'}
                    </td>

                    <td className="px-3 py-2.5 text-center">
                      {reg.estado === 'dentro' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30">
                          🌡️ Dentro
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                          ✓ Salido
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-2.5 text-center text-xs text-gray-400 whitespace-nowrap">
                      👤 {reg.usuario || '—'}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {registros.length > 0 && (
        <p className="text-right text-xs text-gray-500 font-mono">
          {registros.length} registro(s) — {carritosAdentro} carrito(s) aún en cámara
        </p>
      )}
    </div>
  )
}