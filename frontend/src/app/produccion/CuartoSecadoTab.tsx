'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { useAuth } from '@/context/AuthContext'
import { Html5Qrcode } from 'html5-qrcode'

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

// ── Helpers ───────────────────────────────────────────────────────────
function getTurnoActual(): 'D' | 'N' {
  const totalMinutos = new Date().getHours() * 60 + new Date().getMinutes()
  return totalMinutos >= 450 && totalMinutos < 1170 ? 'D' : 'N'
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

function getTurnoLabel(t: 'D' | 'N'): string {
  return t === 'D' ? 'DIA' : 'NOCHE'
}

// ── Validación formato QR ───────────────────────────────────────────
// Formato: PARTE_TURNO_FECHA_CARRITO  (ej: 5208JJ1024A_D_13042026_1)
const QR_REGEX = /^[A-Z0-9]+([_-]?[A-Z0-9]+)*_[DN]_\d{6,10}_\d+$/i

function esFormatoQRValido(codigo: string): boolean {
  return QR_REGEX.test(codigo.trim())
}

const COLUMNAS = [
  'Máquina', 'No. de Parte', 'Descripción', 'Carrito',
  'Hora Entrada', 'Hora Salida', 'Tiempo en Cámara',
  'Total Piezas', 'Estado', 'Usuario',
]

export default function CuartoSecadoTab() {
  const { token } = useAuth()

  const [registros,   setRegistros]   = useState<RegistroSecado[]>([])
  const [inputValue,  setInputValue]  = useState('')
  const [alertas,     setAlertas]     = useState<Alerta[]>([])
  const [cargando,    setCargando]    = useState(false)
  const [descargando, setDescargando] = useState(false)
  const [errorExcel,  setErrorExcel]  = useState<string | null>(null)

  // ── Scanner de cámara ─────────────────────────────────────────────
  const [scannerOpen,  setScannerOpen]  = useState(false)
  const [scannerError, setScannerError] = useState<string | null>(null)
  const scannerRef          = useRef<Html5Qrcode | null>(null)
  const scannerContainerRef = useRef<HTMLDivElement | null>(null)
  const procesarEscaneoRef  = useRef<(codigo: string) => Promise<void>>(async () => {})

  // ── Filtros ───────────────────────────────────────────────────────
  const [busqueda,      setBusqueda]      = useState('')
  const [filtroMaquina, setFiltroMaquina] = useState('')
  const [filtroParte,   setFiltroParte]   = useState('')
  const [filtroEstado,  setFiltroEstado]  = useState('')

  // ── Refs ──────────────────────────────────────────────────────────
  const inputRef      = useRef<HTMLInputElement | null>(null)
  const inputValueRef = useRef('')
  const turnoRef      = useRef<'D' | 'N'>(getTurnoActual())
  const filtrosRef    = useRef<HTMLDivElement>(null)
  const enFiltros     = useRef(false)

  // ── Anti-escritura manual ─────────────────────────────────────────
  const firstKeyTime = useRef<number>(0)
  const keyCount     = useRef<number>(0)
  const checkTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Control de foco: respeta cuando el usuario está en filtros ────
  const handleFiltroFocus = () => { enFiltros.current = true }
  const handleFiltroBlur  = () => {
    setTimeout(() => {
      enFiltros.current = !!(
        filtrosRef.current &&
        filtrosRef.current.contains(document.activeElement)
      )
    }, 50)
  }

  // ── Focus automático — respeta filtros ────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      if (enFiltros.current) return

      const tag = document.activeElement?.tagName ?? ''
      if (
        ['INPUT', 'SELECT', 'TEXTAREA'].includes(tag) &&
        document.activeElement !== inputRef.current
      ) return

      if (document.activeElement !== inputRef.current) {
        inputRef.current?.focus()
      }
    }, 1_000)
    return () => clearInterval(interval)
  }, [])

  // ── Cargar registros al montar ────────────────────────────────────
  useEffect(() => {
    cargarRegistros()
  }, [])

  // ── Detectar cambio de turno cada 30s ─────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const turnoActual = getTurnoActual()
      if (turnoActual !== turnoRef.current) {
        turnoRef.current = turnoActual
        limpiarFiltros()
        cargarRegistros()
        agregarAlerta({
          tipo:    'TURNO',
          mensaje: `Turno cambiado a ${turnoActual === 'D' ? 'Día' : 'Noche'}.`,
        })
      }
    }, 30_000)
    return () => clearInterval(interval)
  }, [])

  // ── Cargar registros ──────────────────────────────────────────────
  const cargarRegistros = async () => {
    try {
      setCargando(true)
      const fecha = getFechaTurno()
      const turno = getTurnoLabel(getTurnoActual())
      const res   = await fetch(`/secado/registros?fecha=${fecha}&turno=${turno}`)
      if (!res.ok) return
      const data  = await res.json()
      setRegistros(data)
    } catch (e) {
      console.error('Error cargando registros secado:', e)
    } finally {
      setCargando(false)
    }
  }

  // ── Alertas ───────────────────────────────────────────────────────
  const agregarAlerta = (alerta: Omit<Alerta, 'id'>) => {
    const id = Date.now() + Math.random()
    setAlertas(prev => {
      // Evitar duplicados del mismo tipo
      if (prev.some(a => a.tipo === alerta.tipo)) return prev
      return [{ ...alerta, id }, ...prev]
    })
    setTimeout(() => {
      setAlertas(prev => prev.filter(a => a.id !== id))
    }, 15_000)
  }

  // ── Detectar si entrada es de scanner ─────────────────────────────
  const esEntradaDeScanner = (): boolean => {
    if (keyCount.current < 3) return false
    const elapsed = Date.now() - firstKeyTime.current
    const charsPorSegundo = (keyCount.current / elapsed) * 1000
    return charsPorSegundo > 12
  }

  // ── Escaneo ───────────────────────────────────────────────────────
  const procesarEscaneo = async (codigo: string) => {
    // Reset contadores
    firstKeyTime.current = 0
    keyCount.current     = 0

    if (!codigo.trim()) return

    // Normalizar: ? → _ (por si acaso)
    const codigoNormalizado = codigo.replace(/\?/g, '_').trim()

    // Validar formato QR
    if (!esFormatoQRValido(codigoNormalizado)) {
      agregarAlerta({
        tipo:    'FORMATO INVÁLIDO',
        mensaje: `Código rechazado: "${codigoNormalizado}". Formato esperado: PARTE_TURNO_FECHA_CARRITO (ej: 5208JJ1024A_D_13042026_1)`,
      })
      inputValueRef.current = ''
      setInputValue('')
      return
    }

    try {
      const res  = await fetch('/secado/escanear/', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ codigo: codigoNormalizado, token: token || '' }),
      })
      const data = await res.json()

      agregarAlerta({ tipo: data.tipo, mensaje: data.mensaje })
      if (data.tipo === 'ERROR') return

      const reg: RegistroSecado = data.registro
      if (data.tipo === 'ENTRADA') {
        setRegistros(prev => [reg, ...prev])
      } else if (data.tipo === 'SALIDA') {
        setRegistros(prev => prev.map(r => r.id === reg.id ? reg : r))
      }
    } catch (e) {
      console.error('Error escaneo secado:', e)
      agregarAlerta({ tipo: 'ERROR', mensaje: 'Error de conexión con el servidor' })
    }
    inputValueRef.current = ''
    setInputValue('')
  }

  // Guardar referencia siempre actualizada de procesarEscaneo para el scanner de cámara
  useEffect(() => {
    procesarEscaneoRef.current = procesarEscaneo
  }, [procesarEscaneo])

  // ── Scanner de cámara: abrir / cerrar ─────────────────────────────
  const abrirScanner = async () => {
    setScannerError(null)
    setScannerOpen(true)
    // Pequeño delay para que el DOM del modal ya esté renderizado
    setTimeout(async () => {
      if (!scannerContainerRef.current) return
      try {
        const scanner = new Html5Qrcode('reader-secado')
        scannerRef.current = scanner
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            // Detener inmediatamente al leer un código
            void scanner.stop().then(() => {
              scannerRef.current = null
              setScannerOpen(false)
              // Actualizar input visualmente
              const normalizado = decodedText.toUpperCase().replace(/\?/g, '_')
              inputValueRef.current = normalizado
              setInputValue(normalizado)
              // Procesar
              void procesarEscaneoRef.current(normalizado)
            })
          },
          () => { /* ignorar errores de frame individual */ }
        )
      } catch (err: any) {
        setScannerError(err?.message || 'No se pudo iniciar la cámara. Asegúrate de dar permisos.')
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

  // Limpiar scanner al desmontar
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        void scannerRef.current.stop()
        scannerRef.current = null
      }
    }
  }, [])

  // ── Interceptar KeyDown ───────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Permitir navegación
    if (e.key === 'Tab' || e.key === 'Escape') return

    if (e.key === 'Enter') {
      e.preventDefault()
      if (checkTimer.current) {
        clearTimeout(checkTimer.current)
        checkTimer.current = null
      }

      const codigo = inputValueRef.current.trim()
      procesarEscaneo(codigo)
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

    // Timer de seguridad: si no llega Enter en 800ms, revisar
    if (checkTimer.current) clearTimeout(checkTimer.current)
    checkTimer.current = setTimeout(() => {
      const valor = inputValueRef.current.trim()
      if (!valor) return

      if (!esEntradaDeScanner() && !esFormatoQRValido(valor)) {
        // Escritura manual lenta → limpiar
        inputValueRef.current = ''
        setInputValue('')
        firstKeyTime.current = 0
        keyCount.current     = 0
        agregarAlerta({
          tipo:    'TECLADO BLOQUEADO',
          mensaje: 'Solo se permite entrada por escáner QR. La escritura manual está deshabilitada.',
        })
      } else if (esEntradaDeScanner()) {
        // Scanner que no envió Enter → procesar igual
        procesarEscaneo(valor)
      }
    }, 800)
  }

  // ── onChange: dejar acumular siempre ───────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Convertir ? → _ (el scanner envía _ pero el input lo interpreta como ?)
    const valor = e.target.value.toUpperCase().replace(/\?/g, '_')
    inputValueRef.current = valor
    setInputValue(valor)
  }

  // ── Bloquear paste ────────────────────────────────────────────────
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    agregarAlerta({
      tipo:    'PEGADO BLOQUEADO',
      mensaje: 'No se permite pegar texto. Use el escáner QR.',
    })
  }

  // ── Descarga Excel ────────────────────────────────────────────────
  const handleDescargarExcel = async () => {
    setErrorExcel(null)
    try {
      setDescargando(true)
      const fecha    = getFechaTurno()
      const turno    = getTurnoLabel(getTurnoActual())
      const url      = `/secado/registros/excel?fecha=${fecha}&turno=${turno}&t=${Date.now()}`
      const response = await fetch(url, { method: 'GET' })

      const contentType = response.headers.get('content-type') ?? ''
      if (!response.ok || !contentType.includes('spreadsheetml')) {
        setErrorExcel(`Error ${response.status}: ${response.statusText}`)
        return
      }

      const blob    = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const link    = document.createElement('a')
      link.href     = blobUrl
      link.download = `secado_${fecha}_${turno}.xlsx`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(blobUrl)
    } catch (error) {
      setErrorExcel(error instanceof Error ? error.message : 'Error desconocido')
    } finally {
      setDescargando(false)
    }
  }

  // ── Opciones únicas para selects ──────────────────────────────────
  const maquinasUnicas = useMemo(() =>
    [...new Set(registros.map(r => r.maquina).filter(Boolean))].sort()
  , [registros])

  const partesUnicas = useMemo(() =>
    [...new Set(registros.map(r => r.numero_parte).filter(Boolean))].sort()
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
      const pasaEstado  = !filtroEstado  || reg.estado       === filtroEstado
      return pasaBusqueda && pasaMaquina && pasaParte && pasaEstado
    })
  }, [registros, busqueda, filtroMaquina, filtroParte, filtroEstado])

  const hayFiltros = busqueda || filtroMaquina || filtroParte || filtroEstado

  const limpiarFiltros = () => {
    setBusqueda('')
    setFiltroMaquina('')
    setFiltroParte('')
    setFiltroEstado('')
  }

  // ── Stats ─────────────────────────────────────────────────────────
  const carritosAdentro = registros.filter(r => r.estado === 'dentro').length
  const carritosSalidos = registros.filter(r => r.estado === 'salido').length

  return (
    <div className="space-y-4">

      {/* ── Título + Botón Excel ──────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-lg font-bold text-blue-700 tracking-wide uppercase">
          🌡️ Cuarto de Secado
        </h2>

        <button
          onClick={handleDescargarExcel}
          disabled={descargando || registros.length === 0}
          title={registros.length === 0 ? 'No hay registros' : 'Descargar Excel del turno actual'}
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

      {/* ── Error Excel ───────────────────────────────────────────── */}
      {errorExcel && (
        <div className="bg-red-50 border border-red-300 text-red-700 rounded-lg
                        p-3 text-sm flex justify-between items-start">
          <div>
            <p className="font-semibold mb-1">❌ Error al generar Excel</p>
            <p className="font-mono text-xs">{errorExcel}</p>
          </div>
          <button
            onClick={() => setErrorExcel(null)}
            className="text-red-400 hover:text-red-700 font-bold ml-4 text-lg leading-none"
          >✖</button>
        </div>
      )}

      {/* ── Input QR (bloqueado para escritura manual) + Botón Cámara ─ */}
      <div className="text-center">
        <div className="inline-flex w-full max-w-xl items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="Esperando lectura de código QR..."
            className="flex-1 text-center text-2xl p-4 border-2 border-blue-400
                       rounded-lg shadow-inner focus:outline-none focus:ring-4
                       focus:ring-blue-200 uppercase tracking-widest
                       placeholder:text-gray-300 placeholder:text-lg"
            autoComplete="off"
            autoFocus
          />
          <button
            onClick={abrirScanner}
            type="button"
            title="Escanear con cámara"
            className="shrink-0 inline-flex items-center justify-center
                       w-14 h-14 rounded-lg border-2 border-blue-400
                       bg-blue-50 text-blue-600 hover:bg-blue-100
                       hover:text-blue-700 hover:border-blue-500
                       active:scale-95 transition-all"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          1er escaneo → <span className="text-green-600 font-semibold">Entrada</span>
          &nbsp;|&nbsp;
          2do escaneo → <span className="text-red-500 font-semibold">Salida</span>
        </p>
      </div>

      {/* ── Modal Scanner de Cámara ───────────────────────────────── */}
      {scannerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-800">📷 Escanear QR</h3>
              <button
                onClick={cerrarScanner}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none"
              >✖</button>
            </div>
            <div
              ref={scannerContainerRef}
              id="reader-secado"
              className="w-full aspect-square rounded-xl overflow-hidden bg-black"
            />
            {scannerError && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3 text-sm">
                <p className="font-semibold">⚠️ Error de cámara</p>
                <p className="text-xs">{scannerError}</p>
              </div>
            )}
            <p className="text-xs text-gray-400 text-center">
              Apunta el código QR dentro del recuadro
            </p>
          </div>
        </div>
      )}

      {/* ── Tarjetas resumen ─────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total</p>
          <p className="text-3xl font-bold text-blue-700 mt-1">{registros.length}</p>
        </div>
        <div className="rounded-lg border-l-4 border-orange-500 bg-orange-50 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Dentro</p>
          <p className="text-3xl font-bold text-orange-600 mt-1">{carritosAdentro}</p>
        </div>
        <div className="rounded-lg border-l-4 border-emerald-500 bg-emerald-50 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Salidos</p>
          <p className="text-3xl font-bold text-emerald-600 mt-1">{carritosSalidos}</p>
        </div>
      </div>

      {/* ── Alertas ──────────────────────────────────────────────── */}
      {alertas.length > 0 && (
        <div className="flex flex-col gap-2">
          {alertas.slice(0, 5).map(alerta => (
            <div
              key={alerta.id}
              className={`border-l-4 p-3 rounded flex justify-between items-start ${
                alerta.tipo === 'TECLADO BLOQUEADO' || alerta.tipo === 'PEGADO BLOQUEADO'
                  ? 'bg-yellow-50  border-yellow-500  text-yellow-700'
                  : alerta.tipo === 'FORMATO INVÁLIDO'
                  ? 'bg-orange-50  border-orange-500  text-orange-700'
                  : alerta.tipo === 'ENTRADA'
                  ? 'bg-green-50   border-green-500   text-green-700'
                  : alerta.tipo === 'SALIDA'
                  ? 'bg-blue-50    border-blue-500    text-blue-700'
                  : alerta.tipo === 'ERROR'
                  ? 'bg-red-50     border-red-500     text-red-700'
                  : 'bg-yellow-50  border-yellow-500  text-yellow-700'
              }`}
            >
              <div>
                <p className="font-bold text-sm">
                  {alerta.tipo === 'TECLADO BLOQUEADO'  ? '⌨️' :
                   alerta.tipo === 'PEGADO BLOQUEADO'   ? '📋' :
                   alerta.tipo === 'FORMATO INVÁLIDO'   ? '⚠️' :
                   alerta.tipo === 'ENTRADA'            ? '🟢' :
                   alerta.tipo === 'SALIDA'             ? '🔵' :
                   alerta.tipo === 'ERROR'              ? '🚨' :
                   '🔄'} {alerta.tipo}
                </p>
                <p className="text-sm mt-0.5">{alerta.mensaje}</p>
              </div>
              <button
                onClick={() => setAlertas(alertas.filter(a => a.id !== alerta.id))}
                className="font-bold ml-4 text-lg opacity-50 hover:opacity-100 leading-none"
              >✖</button>
            </div>
          ))}
        </div>
      )}

      {/* ── Buscador + Filtros ────────────────────────────────────── */}
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
          <option value="">Todos los No. de Parte</option>
          {partesUnicas.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>

        <select
          value={filtroEstado}
          onChange={e => setFiltroEstado(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-200
                     focus:border-blue-400 bg-white text-gray-700"
        >
          <option value="">Cualquier Estado</option>
          <option value="dentro">🌡️ Dentro</option>
          <option value="salido">✅ Salido</option>
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

      {/* ── Tabla ────────────────────────────────────────────────── */}
      <div className="overflow-x-auto border border-gray-200 rounded-xl">
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
            {cargando ? (
              <tr>
                <td colSpan={COLUMNAS.length} className="p-12 text-center text-gray-400">
                  <span className="animate-pulse">Cargando registros...</span>
                </td>
              </tr>
            ) : registros.length === 0 ? (
              <tr>
                <td colSpan={COLUMNAS.length} className="p-12 text-center">
                  <span className="text-4xl block mb-2">🌡️</span>
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
                    className="block mx-auto mt-2 text-blue-600 hover:underline text-sm"
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
                    key={reg.id}
                    className={`border-b transition-colors ${
                      esNuevo
                        ? 'bg-blue-50 border-l-4 border-l-blue-500'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <td className={`p-3 text-center text-xs whitespace-nowrap ${
                      esNuevo ? 'text-slate-700 font-semibold' : 'text-slate-500'
                    }`}>
                      {reg.maquina || '—'}
                    </td>

                    <td className={`p-3 text-center font-mono font-bold whitespace-nowrap ${
                      esNuevo ? 'text-blue-700' : 'text-blue-600'
                    }`}>
                      {reg.numero_parte}
                    </td>

                    <td className={`p-3 text-left text-xs max-w-[160px] ${
                      esNuevo ? 'text-slate-700' : 'text-slate-500'
                    }`}>
                      <span className="block truncate" title={reg.descripcion}>
                        {reg.descripcion || '—'}
                      </span>
                    </td>

                    <td className={`p-3 text-center font-mono font-bold ${
                      esNuevo ? 'text-slate-800' : 'text-slate-600'
                    }`}>
                      #{reg.carrito}
                    </td>

                    <td className="p-3 text-center font-mono text-slate-600 whitespace-nowrap">
                      {reg.hora_entrada}
                    </td>

                    <td className="p-3 text-center font-mono text-slate-600 whitespace-nowrap">
                      {reg.hora_salida ?? (
                        <span className="text-orange-400 font-semibold animate-pulse">
                          En cámara...
                        </span>
                      )}
                    </td>

                    <td className="p-3 text-center font-semibold text-slate-700 whitespace-nowrap">
                      {reg.tiempo_en_camara ?? (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>

                    <td className={`p-3 text-center font-bold ${
                      esNuevo ? 'text-emerald-700' : 'text-emerald-600'
                    }`}>
                      {reg.qty_total != null ? reg.qty_total : '—'}
                    </td>

                                        <td className="p-3 text-center">
                      {reg.estado === 'dentro' ? (
                        <span className="px-2 py-1 rounded-full text-xs font-bold
                                         bg-orange-100 text-orange-700 border
                                         border-orange-300 whitespace-nowrap">
                          🌡️ Dentro
                        </span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs font-bold
                                         bg-emerald-100 text-emerald-700 border
                                         border-emerald-300 whitespace-nowrap">
                          ✅ Salido
                        </span>
                      )}
                    </td>

                    {/* Usuario */}
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
        <p className="text-right text-xs text-gray-400">
          {registros.length} registro(s) — {carritosAdentro} carrito(s) aún en cámara
        </p>
      )}

    </div>
  )
}
