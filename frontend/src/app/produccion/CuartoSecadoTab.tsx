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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        background: 'transparent',
        color: 'var(--inj-text)',
        minHeight: '100%',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--inj-text)' }}>
            🌡️ Cuarto de Secado
          </div>
          <div style={{ fontSize: 11, color: 'var(--inj-muted)', marginTop: 4 }}>
            {registros.length} total · {carritosAdentro} en cámara · {carritosSalidos} salidos
          </div>
        </div>

        <button
          onClick={handleDescargarExcel}
          disabled={descargando || registros.length === 0}
          className="inj-btn inj-btn-excel"
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
        <div className="inj-alert inj-alert-err">
          <span>⚠</span>
          <span style={{ flex: 1 }}>
            Error al generar Excel:{' '}
            <span style={{ fontFamily: 'var(--inj-mono)', fontSize: 11 }}>{errorExcel}</span>
          </span>
          <button
            onClick={() => setErrorExcel(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'inherit',
              cursor: 'pointer',
              fontSize: 16,
              padding: 0,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* Scanner section */}
      <div
        className="inj-card"
        style={{
          padding: 18,
          background: 'linear-gradient(180deg, rgba(22,27,34,0.96) 0%, rgba(18,23,31,0.96) 100%)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              display: 'inline-flex',
              width: '100%',
              maxWidth: 620,
              alignItems: 'center',
              gap: 10,
            }}
          >
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
              style={{
                flex: 1,
                background: 'var(--inj-bg)',
                border: '2px solid var(--inj-amber)',
                borderRadius: 10,
                padding: '16px 18px',
                fontFamily: 'var(--inj-mono)',
                fontSize: 22,
                fontWeight: 600,
                color: 'var(--inj-text)',
                textAlign: 'center',
                letterSpacing: '0.08em',
                outline: 'none',
                textTransform: 'uppercase',
                boxShadow: '0 0 0 1px rgba(245,158,11,0.12) inset',
              }}
              onFocus={e => {
                (e.target as HTMLInputElement).style.boxShadow = '0 0 0 3px rgba(245,158,11,0.18)'
              }}
              onBlur={e => {
                (e.target as HTMLInputElement).style.boxShadow = '0 0 0 1px rgba(245,158,11,0.12) inset'
              }}
            />

            <button
              onClick={abrirScanner}
              type="button"
              title="Escanear con cámara"
              className="inj-btn inj-btn-amber"
              style={{
                width: 56,
                height: 56,
                padding: 0,
                justifyContent: 'center',
                borderRadius: 10,
                flexShrink: 0,
              }}
            >
              <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>

          <p style={{ fontSize: 11, color: 'var(--inj-muted)', marginTop: 8 }}>
            1er escaneo → <span style={{ color: 'var(--inj-green)', fontWeight: 600 }}>Entrada</span>
            {' · '}
            2do escaneo → <span style={{ color: 'var(--inj-blue)', fontWeight: 600 }}>Salida</span>
          </p>
        </div>
      </div>

      {/* Modal Scanner */}
      {scannerOpen && (
        <div className="inj-overlay">
          <div className="inj-modal" style={{ maxWidth: 400 }}>
            <div className="inj-modal-header">
              <span className="inj-modal-title">📷 Escanear QR</span>
              <button className="inj-btn inj-btn-ghost" style={{ padding: '4px 10px' }} onClick={cerrarScanner}>
                ✕
              </button>
            </div>
            <div className="inj-modal-body">
              <div
                ref={scannerContainerRef}
                id="reader-secado"
                style={{
                  width: '100%',
                  aspectRatio: '1',
                  borderRadius: 8,
                  overflow: 'hidden',
                  background: '#000',
                }}
              />
              {scannerError && (
                <div className="inj-alert inj-alert-err" style={{ marginTop: 12 }}>
                  <span>⚠️</span> {scannerError}
                </div>
              )}
              <p style={{ fontSize: 11, color: 'var(--inj-muted)', textAlign: 'center', marginTop: 10 }}>
                Apunta el código QR dentro del recuadro
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
        {[
          { label: 'Total',   value: registros.length, color: 'var(--inj-blue)' },
          { label: 'Dentro',  value: carritosAdentro,  color: 'var(--inj-amber)' },
          { label: 'Salidos', value: carritosSalidos,  color: 'var(--inj-green)' },
        ].map(s => (
          <div
            key={s.label}
            className="inj-stat"
            style={{
              borderLeft: `3px solid ${s.color}`,
              background: 'linear-gradient(180deg, var(--inj-surface2), rgba(28,35,51,0.88))',
            }}
          >
            <div className="inj-stat-label">{s.label}</div>
            <div className="inj-stat-value" style={{ fontSize: 28, color: s.color }}>
              {s.value}
            </div>
          </div>
        ))}
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alertas.slice(0, 5).map(alerta => {
            const st = ALERTA_STYLES[alerta.tipo] ?? DEFAULT_ALERTA
            return (
              <div
                key={alerta.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  padding: '10px 14px',
                  borderRadius: 8,
                  gap: 10,
                  background: st.bg,
                  border: `1px solid ${st.border}`,
                  animation: 'inj-slide-in 0.2s ease',
                }}
              >
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: st.color, marginBottom: 2 }}>
                    {st.icon} {alerta.tipo}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--inj-muted)' }}>{alerta.mensaje}</div>
                </div>
                <button
                  onClick={() => setAlertas(prev => prev.filter(a => a.id !== alerta.id))}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: st.color,
                    cursor: 'pointer',
                    fontSize: 16,
                    opacity: 0.7,
                    padding: 0,
                    lineHeight: 1,
                  }}
                >
                  ✕
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Filtros */}
      <div
        className="inj-card"
        style={{
          padding: 14,
          background: 'rgba(22,27,34,0.88)',
        }}
      >
        <div
          ref={filtrosRef}
          onFocus={handleFiltroFocus}
          onBlur={handleFiltroBlur}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 10,
            alignItems: 'end',
          }}
        >
          <div style={{ gridColumn: 'span 1' }}>
            <label className="inj-label">Buscar</label>
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar máquina, parte o descripción..."
              className="inj-input"
            />
          </div>

          <div>
            <label className="inj-label">Máquina</label>
            <select value={filtroMaquina} onChange={e => setFiltroMaquina(e.target.value)} className="inj-select">
              <option value="">Todas las Máquinas</option>
              {maquinasUnicas.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div>
            <label className="inj-label">No. de Parte</label>
            <select value={filtroParte} onChange={e => setFiltroParte(e.target.value)} className="inj-select">
              <option value="">Todos los No. de Parte</option>
              {partesUnicas.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div>
            <label className="inj-label">Estado</label>
            <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} className="inj-select">
              <option value="">Cualquier Estado</option>
              <option value="dentro">🌡️ Dentro</option>
              <option value="salido">✅ Salido</option>
            </select>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              justifyContent: 'flex-end',
              flexWrap: 'wrap',
            }}
          >
            {hayFiltros && (
              <button
                onClick={limpiarFiltros}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 11,
                  color: 'var(--inj-red)',
                  cursor: 'pointer',
                  textDecoration: 'underline',
                }}
              >
                Limpiar filtros
              </button>
            )}
            <span
              style={{
                background: 'var(--inj-surface2)',
                border: '1px solid var(--inj-border)',
                borderRadius: 6,
                padding: '4px 10px',
                fontSize: 11,
                color: 'var(--inj-muted)',
                fontFamily: 'var(--inj-mono)',
                whiteSpace: 'nowrap',
              }}
            >
              {registrosFiltrados.length === registros.length
                ? `${registros.length} reg.`
                : `${registrosFiltrados.length} / ${registros.length}`}
            </span>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="inj-card inj-table-wrap" style={{ background: 'var(--inj-surface)' }}>
        <table className="inj-table">
          <thead>
            <tr>
              {COLUMNAS.map(col => <th key={col} className="c">{col}</th>)}
            </tr>
          </thead>
          <tbody>
            {cargando ? (
              <tr>
                <td colSpan={COLUMNAS.length} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--inj-muted)', fontSize: 13 }}>
                  <span style={{ animation: 'inj-blink 1s ease-in-out infinite' }}>Cargando registros...</span>
                </td>
              </tr>
            ) : registros.length === 0 ? (
              <tr>
                <td colSpan={COLUMNAS.length}>
                  <div className="inj-empty" style={{ padding: '56px 20px' }}>
                    <div className="inj-empty-icon">🌡️</div>
                    <div className="inj-empty-text">Esperando escaneo...</div>
                  </div>
                </td>
              </tr>
            ) : registrosFiltrados.length === 0 ? (
              <tr>
                <td colSpan={COLUMNAS.length}>
                  <div className="inj-empty" style={{ padding: '56px 20px' }}>
                    <div className="inj-empty-icon">🔍</div>
                    <div className="inj-empty-text">Sin resultados para los filtros aplicados</div>
                    <button
                      onClick={limpiarFiltros}
                      style={{
                        marginTop: 8,
                        background: 'none',
                        border: 'none',
                        color: 'var(--inj-blue)',
                        fontSize: 12,
                        cursor: 'pointer',
                        textDecoration: 'underline',
                      }}
                    >
                      Limpiar filtros
                    </button>
                  </div>
                </td>
              </tr>
            ) : (
              registrosFiltrados.map((reg, idx) => {
                const esNuevo = idx === 0 && !hayFiltros
                return (
                  <tr
                    key={reg.id}
                    style={esNuevo ? {
                      background: 'rgba(245,158,11,0.05)',
                      boxShadow: 'inset 3px 0 0 var(--inj-amber)',
                    } : undefined}
                  >
                    <td
                      className="c"
                      style={{
                        fontSize: 11,
                        color: esNuevo ? 'var(--inj-text)' : 'var(--inj-muted)',
                        fontWeight: esNuevo ? 600 : 400,
                      }}
                    >
                      {reg.maquina || '—'}
                    </td>

                    <td className="c">
                      <span className="inj-part">{reg.numero_parte}</span>
                    </td>

                    <td
                      style={{
                        fontSize: 11,
                        color: 'var(--inj-muted)',
                        maxWidth: 180,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      <span title={reg.descripcion}>{reg.descripcion || '—'}</span>
                    </td>

                    <td className="c mono" style={{ fontWeight: 700, color: 'var(--inj-text)' }}>
                      #{reg.carrito}
                    </td>

                    <td className="c mono" style={{ fontSize: 11, color: 'var(--inj-muted)', whiteSpace: 'nowrap' }}>
                      {reg.hora_entrada}
                    </td>

                    <td className="c mono" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                      {reg.hora_salida ?? (
                        <span style={{ color: 'var(--inj-amber)', fontWeight: 600, animation: 'inj-blink 1s ease-in-out infinite' }}>
                          En cámara...
                        </span>
                      )}
                    </td>

                    <td className="c mono" style={{ fontSize: 11, fontWeight: 600, color: 'var(--inj-text)', whiteSpace: 'nowrap' }}>
                      {reg.tiempo_en_camara ?? <span style={{ color: 'var(--inj-border2)' }}>—</span>}
                    </td>

                    <td className="c mono" style={{ fontWeight: 700, color: 'var(--inj-green)' }}>
                      {reg.qty_total != null ? reg.qty_total : '—'}
                    </td>

                    <td className="c">
                      {reg.estado === 'dentro' ? (
                        <span
                          className="inj-pill"
                          style={{
                            background: 'rgba(245,158,11,0.1)',
                            color: 'var(--inj-amber)',
                            border: '1px solid rgba(245,158,11,0.3)',
                          }}
                        >
                          🌡️ Dentro
                        </span>
                      ) : (
                        <span
                          className="inj-pill"
                          style={{
                            background: 'rgba(16,185,129,0.1)',
                            color: 'var(--inj-green)',
                            border: '1px solid rgba(16,185,129,0.3)',
                          }}
                        >
                          ✓ Salido
                        </span>
                      )}
                    </td>

                    <td className="c" style={{ fontSize: 11, color: 'var(--inj-muted)', whiteSpace: 'nowrap' }}>
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
        <p
          style={{
            textAlign: 'right',
            fontSize: 11,
            color: 'var(--inj-muted)',
            fontFamily: 'var(--inj-mono)',
          }}
        >
          {registros.length} registro(s) — {carritosAdentro} carrito(s) aún en cámara
        </p>
      )}
    </div>
  )
}