'use client'

import { useState, useRef, useEffect } from 'react'

interface RegistroSecado {
  id:                 number
  carrito:            string
  hora_entrada:       string
  hora_salida:        string | null
  tiempo_en_camara:   string | null
  estado:             'dentro' | 'salido'
}

export default function CuartoSecadoTab() {
  const [registros, setRegistros] = useState<RegistroSecado[]>([])
  const [inputValue, setInputValue] = useState('')
  const [alertas, setAlertas]       = useState<{ id: number; tipo: string; mensaje: string }[]>([])

  const inputRef      = useRef<HTMLInputElement | null>(null)
  const inputValueRef = useRef('')
  const scanTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Mantener foco en el input
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.activeElement !== inputRef.current) {
        inputRef.current?.focus()
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // ── Helpers de tiempo ──
  const getHoraActual = () => {
    const now = new Date()
    return now.toTimeString().slice(0, 8) // HH:MM:SS
  }

  const calcularTiempo = (entrada: string, salida: string): string => {
    const [hE, mE, sE] = entrada.split(':').map(Number)
    const [hS, mS, sS] = salida.split(':').map(Number)
    const totalSegE = hE * 3600 + mE * 60 + sE
    const totalSegS = hS * 3600 + mS * 60 + sS
    const diff      = totalSegS - totalSegE

    if (diff <= 0) return '—'

    const h = Math.floor(diff / 3600)
    const m = Math.floor((diff % 3600) / 60)
    const s = diff % 60

    if (h > 0) return `${h}h ${m}min ${s}s`
    if (m > 0) return `${m}min ${s}s`
    return `${s}s`
  }

  // ── Procesar escaneo ──
  const procesarEscaneo = (codigo: string) => {
    if (!codigo.trim()) return

    const horaActual = getHoraActual()
    const carritoNorm = codigo.trim().toUpperCase()

    // Busca si el carrito ya tiene entrada y está "dentro"
    const idx = registros.findIndex(
      r => r.carrito === carritoNorm && r.estado === 'dentro'
    )

    if (idx === -1) {
      // ── ENTRADA ──
      const nuevo: RegistroSecado = {
        id:               Date.now(),
        carrito:          carritoNorm,
        hora_entrada:     horaActual,
        hora_salida:      null,
        tiempo_en_camara: null,
        estado:           'dentro',
      }
      setRegistros(prev => [nuevo, ...prev])
      setAlertas(prev => [{
        id:      Date.now(),
        tipo:    'ENTRADA',
        mensaje: `Carrito #${carritoNorm} registrado. Hora entrada: ${horaActual}`
      }, ...prev])

    } else {
      // ── SALIDA ──
      const entrada = registros[idx].hora_entrada
      const tiempo  = calcularTiempo(entrada, horaActual)

      setRegistros(prev => prev.map((r, i) =>
        i === idx
          ? { ...r, hora_salida: horaActual, tiempo_en_camara: tiempo, estado: 'salido' }
          : r
      ))
      setAlertas(prev => [{
        id:      Date.now(),
        tipo:    'SALIDA',
        mensaje: `Carrito #${carritoNorm} salió. Tiempo en cámara: ${tiempo}`
      }, ...prev])
    }

    inputValueRef.current = ''
    setInputValue('')
  }

  // ── Handlers input ──
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value.toUpperCase()
    inputValueRef.current = valor
    setInputValue(valor)

    if (scanTimer.current) clearTimeout(scanTimer.current)
    if (valor.trim()) {
      scanTimer.current = setTimeout(() => {
        procesarEscaneo(inputValueRef.current)
      }, 600)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (scanTimer.current) clearTimeout(scanTimer.current)
      procesarEscaneo(inputValueRef.current)
    }
  }

  // ── Stats ──
  const carritosAdentro = registros.filter(r => r.estado === 'dentro').length
  const carritosSalidos = registros.filter(r => r.estado === 'salido').length

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="text-center">
        <h2 className="text-lg font-bold text-blue-700 mb-3 tracking-wide uppercase">
          🌡️ Escanee el Código del Carrito — Cuarto de Secado
        </h2>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Esperando lectura de código de barras..."
          className="w-full max-w-xl text-center text-2xl p-4 border-2 border-blue-400 rounded-lg shadow-inner focus:outline-none focus:ring-4 focus:ring-blue-200 uppercase tracking-widest placeholder:text-gray-300 placeholder:text-lg"
          autoComplete="off"
          autoFocus
        />
        <p className="text-xs text-gray-400 mt-2">
          1er escaneo → <span className="text-green-600 font-semibold">Entrada</span> &nbsp;|&nbsp;
          2do escaneo → <span className="text-red-500 font-semibold">Salida</span>
        </p>
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border-l-4 border-blue-500 bg-blue-50 p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Total Escaneados</p>
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

      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="flex flex-col gap-2">
          {alertas.slice(0, 3).map(alerta => (
            <div
              key={alerta.id}
              className={`border-l-4 p-3 rounded flex justify-between items-start ${
                alerta.tipo === 'ENTRADA'
                  ? 'bg-green-50 border-green-500 text-green-700'
                  : 'bg-blue-50 border-blue-500 text-blue-700'
              }`}
            >
              <div>
                <p className="font-bold text-sm">
                  {alerta.tipo === 'ENTRADA' ? '🟢' : '🔵'} {alerta.tipo}
                </p>
                <p className="text-sm mt-0.5">{alerta.mensaje}</p>
              </div>
              <button
                onClick={() => setAlertas(alertas.filter(a => a.id !== alerta.id))}
                className="font-bold ml-4 text-lg opacity-50 hover:opacity-100"
              >✖</button>
            </div>
          ))}
        </div>
      )}

      {/* Tabla */}
      <div className="overflow-x-auto border border-gray-200 rounded-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100 border-b border-gray-200">
              {['Carrito', 'Hora Entrada', 'Hora Salida', 'Tiempo en Cámara', 'Estado'].map(col => (
                <th key={col} className="p-3 text-center font-semibold text-slate-600 whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {registros.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-12 text-center">
                  <span className="text-4xl block mb-2">🌡️</span>
                  <span className="text-gray-400">Esperando escaneo...</span>
                </td>
              </tr>
            ) : (
              registros.map((reg, idx) => (
                <tr
                  key={reg.id}
                  className={`border-b transition-colors ${
                    idx === 0
                      ? 'bg-blue-50 border-l-4 border-l-blue-500'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  {/* Carrito */}
                  <td className={`p-3 text-center font-mono font-bold ${
                    idx === 0 ? 'text-blue-700' : 'text-blue-600'
                  }`}>
                    #{reg.carrito}
                  </td>

                  {/* Hora Entrada */}
                  <td className="p-3 text-center font-mono text-slate-600">
                    {reg.hora_entrada}
                  </td>

                  {/* Hora Salida */}
                  <td className="p-3 text-center font-mono text-slate-600">
                    {reg.hora_salida ?? (
                      <span className="text-orange-400 font-semibold animate-pulse">
                        En cámara...
                      </span>
                    )}
                  </td>

                  {/* Tiempo en Cámara */}
                  <td className="p-3 text-center font-semibold text-slate-700">
                    {reg.tiempo_en_camara ?? (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>

                  {/* Estado */}
                  <td className="p-3 text-center">
                    {reg.estado === 'dentro' ? (
                      <span className="px-2 py-1 rounded-full text-xs font-bold bg-orange-100 text-orange-700 border border-orange-300">
                        🌡️ Dentro
                      </span>
                    ) : (
                      <span className="px-2 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-300">
                        ✅ Salido
                      </span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {registros.length > 0 && (
        <p className="text-right text-xs text-gray-400">
          {registros.length} registro(s) — {carritosAdentro} carritos aún en cámara
        </p>
      )}

    </div>
  )
}