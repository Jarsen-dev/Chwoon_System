'use client'

import { useState, useRef, useEffect } from 'react'
import { getInfoLote } from '@/lib/api'

interface Props {
  token: string
}

interface LoteInfo {
  lote_id: string
  sku_producto: string
  nombre_producto: string | null
  oc_id: string
  nombre_proveedor: string | null
  cantidad_total_recibida: number
  cantidad_requerida: number | null
  precio_unitario: number | null
  moneda: string
  status_oc: string | null
  total_recepciones: number
  recepciones: {
    recepcion_id: string
    cantidad_recibida: number
    fecha_recepcion: string | null
    recibido_por: string | null
    notas: string | null
  }[]
}

export default function ScannerIQCTab({ token }: Props) {
  const [inputValue, setInputValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [loteInfo, setLoteInfo] = useState<LoteInfo | null>(null)
  const [historial, setHistorial] = useState<LoteInfo[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // Auto-focus al input
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleScan = async (value?: string) => {
    const loteId = (value || inputValue).trim()
    if (!loteId) return

    setError('')
    setLoading(true)

    try {
      const info = await getInfoLote(token, loteId)
      setLoteInfo(info)
      // Agregar al historial (sin duplicados consecutivos)
      setHistorial((prev) => {
        const filtered = prev.filter((h) => h.lote_id !== info.lote_id)
        return [info, ...filtered].slice(0, 20) // Máximo 20 en historial
      })
      setInputValue('')
    } catch (err: any) {
      setError(err.message)
      setLoteInfo(null)
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleScan()
    }
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('es-MX', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatCurrency = (val: number | null) => {
    if (val === null || val === undefined) return '—'
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val)
  }

  const getStatusColor = (status: string | null) => {
    switch (status) {
      case 'Completada': return 'bg-green-500/20 text-green-400 border-green-500/30'
      case 'Parcial':    return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
      case 'Creada':     return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      case 'Cancelada':  return 'bg-red-500/20 text-red-400 border-red-500/30'
      default:           return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold">🔍 Scanner de Lote IQC</h2>
        <p className="text-gray-400 text-sm mt-1">
          Escanee o ingrese un Lote ID para consultar la información del material recibido
        </p>
      </div>

      {/* Input de escaneo */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escanear o escribir Lote ID (ej: 20260417-S525-1)"
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-5 py-4 text-lg font-mono
                         focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20
                         placeholder:text-gray-600"
              autoComplete="off"
            />
            {loading && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-400" />
              </div>
            )}
          </div>
          <button
            onClick={() => handleScan()}
            disabled={loading || !inputValue.trim()}
            className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 disabled:text-gray-500
                       px-8 py-4 rounded-xl text-sm font-medium transition-colors"
          >
            🔍 Buscar
          </button>
        </div>

        {error && (
          <div className="mt-4 bg-red-900/30 border border-red-500/50 rounded-lg px-4 py-3 text-red-400 flex justify-between">
            <span>❌ {error}</span>
            <button onClick={() => setError('')} className="text-red-300 hover:text-white">✕</button>
          </div>
        )}
      </div>

      {/* Resultado del escaneo */}
      {loteInfo && (
        <div className="bg-gray-900 rounded-xl border border-emerald-500/30 overflow-hidden">
          {/* Encabezado del resultado */}
          <div className="bg-emerald-900/20 border-b border-emerald-500/20 px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="text-2xl">🏷️</span>
              <div>
                <h3 className="text-lg font-bold font-mono text-emerald-400">{loteInfo.lote_id}</h3>
                <p className="text-xs text-gray-400">Lote ID escaneado</p>
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(loteInfo.status_oc)}`}>
              OC: {loteInfo.status_oc || 'N/A'}
            </span>
          </div>

          {/* Grid de información */}
          <div className="p-6 space-y-6">
            {/* Fila 1: Producto */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">📦 Información del Producto</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoCard label="SKU" value={loteInfo.sku_producto} color="text-emerald-400" mono />
                <InfoCard label="Nombre" value={loteInfo.nombre_producto || '—'} />
                <InfoCard label="Proveedor" value={loteInfo.nombre_proveedor || '—'} />
                <InfoCard label="Moneda" value={loteInfo.moneda} />
              </div>
            </div>

            {/* Fila 2: Cantidades */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">📊 Cantidades</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoCard
                  label="Cantidad Recibida"
                  value={String(loteInfo.cantidad_total_recibida)}
                  color="text-green-400"
                  large
                />
                <InfoCard
                  label="Cantidad Requerida"
                  value={loteInfo.cantidad_requerida !== null ? String(loteInfo.cantidad_requerida) : '—'}
                />
                <InfoCard
                  label="Precio Unitario"
                  value={formatCurrency(loteInfo.precio_unitario)}
                  color="text-purple-400"
                />
                <InfoCard
                  label="Valor Total"
                  value={formatCurrency(
                    loteInfo.precio_unitario !== null
                      ? loteInfo.cantidad_total_recibida * loteInfo.precio_unitario
                      : null
                  )}
                  color="text-yellow-400"
                  large
                />
              </div>
            </div>

            {/* Fila 3: Orden de Compra */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">🛒 Orden de Compra</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <InfoCard label="OC ID" value={loteInfo.oc_id} color="text-blue-400" mono />
                <InfoCard label="Status OC" value={loteInfo.status_oc || '—'} />
                <InfoCard label="Total Recepciones" value={String(loteInfo.total_recepciones)} />
              </div>
            </div>

            {/* Fila 4: Progreso */}
            {loteInfo.cantidad_requerida && loteInfo.cantidad_requerida > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">📈 Progreso de Recepción</h4>
                <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-gray-400">
                      {loteInfo.cantidad_total_recibida} / {loteInfo.cantidad_requerida}
                    </span>
                    <span className={`font-bold ${
                      loteInfo.cantidad_total_recibida >= loteInfo.cantidad_requerida
                        ? 'text-green-400' : 'text-yellow-400'
                    }`}>
                      {((loteInfo.cantidad_total_recibida / loteInfo.cantidad_requerida) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-3">
                    <div
                      className={`h-3 rounded-full transition-all ${
                        loteInfo.cantidad_total_recibida >= loteInfo.cantidad_requerida
                          ? 'bg-green-500' : 'bg-yellow-500'
                      }`}
                      style={{
                        width: `${Math.min(100, (loteInfo.cantidad_total_recibida / loteInfo.cantidad_requerida) * 100)}%`
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Fila 5: Historial de recepciones del lote */}
            {loteInfo.recepciones.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  📥 Recepciones ({loteInfo.recepciones.length})
                </h4>
                <div className="space-y-2">
                  {loteInfo.recepciones.map((rec) => (
                    <div
                      key={rec.recepcion_id}
                      className="bg-gray-800/30 rounded-lg p-3 border border-gray-700 flex justify-between items-start"
                    >
                      <div>
                        <p className="text-sm font-mono text-blue-400">{rec.recepcion_id}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          Cantidad: <span className="text-white font-medium">{rec.cantidad_recibida}</span>
                          {' · '}Recibido por: <span className="text-white">{rec.recibido_por || 'N/A'}</span>
                        </p>
                        {rec.notas && (
                          <p className="text-xs text-gray-500 mt-1">
                            <span className="text-gray-400">Nota:</span> {rec.notas}
                          </p>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 shrink-0 ml-4">{formatDate(rec.fecha_recepcion)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Historial de escaneos */}
      {historial.length > 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-400">📋 Historial de Escaneos ({historial.length})</h3>
            <button
              onClick={() => setHistorial([])}
              className="text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              🗑️ Limpiar
            </button>
          </div>
          <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 sticky top-0">
                <tr>
                  <th className="px-4 py-2 text-left text-gray-400 text-xs">Lote ID</th>
                  <th className="px-4 py-2 text-left text-gray-400 text-xs">SKU</th>
                  <th className="px-4 py-2 text-left text-gray-400 text-xs">Producto</th>
                  <th className="px-4 py-2 text-left text-gray-400 text-xs">OC</th>
                  <th className="px-4 py-2 text-left text-gray-400 text-xs">Proveedor</th>
                  <th className="px-4 py-2 text-right text-gray-400 text-xs">Cantidad</th>
                  <th className="px-4 py-2 text-right text-gray-400 text-xs">Precio</th>
                  <th className="px-4 py-2 text-left text-gray-400 text-xs">Status OC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {historial.map((h) => (
                  <tr
                    key={h.lote_id}
                    className={`hover:bg-gray-800/50 transition-colors cursor-pointer ${
                      loteInfo?.lote_id === h.lote_id ? 'bg-emerald-900/10' : ''
                    }`}
                    onClick={() => {
                      setLoteInfo(h)
                      inputRef.current?.focus()
                    }}
                  >
                    <td className="px-4 py-2 font-mono text-emerald-400 text-xs">{h.lote_id}</td>
                    <td className="px-4 py-2 font-mono text-xs">{h.sku_producto}</td>
                    <td className="px-4 py-2 text-gray-300 text-xs">{h.nombre_producto || '—'}</td>
                    <td className="px-4 py-2 font-mono text-blue-400 text-xs">{h.oc_id}</td>
                    <td className="px-4 py-2 text-gray-300 text-xs">{h.nombre_proveedor || '—'}</td>
                    <td className="px-4 py-2 text-right text-xs">{h.cantidad_total_recibida}</td>
                    <td className="px-4 py-2 text-right text-xs">{formatCurrency(h.precio_unitario)}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${getStatusColor(h.status_oc)}`}>
                        {h.status_oc}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Estado vacío */}
      {!loteInfo && !error && historial.length === 0 && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-16 text-center">
          <p className="text-5xl mb-4">📷</p>
          <p className="text-gray-400 text-lg">Escanee un código QR de lote para comenzar</p>
          <p className="text-gray-600 text-sm mt-2">
            Formato esperado: <span className="font-mono text-gray-500">YYYYMMDD-XXXX-N</span>
          </p>
        </div>
      )}
    </div>
  )
}

// ── Componente auxiliar ──────────────────────────────────────────────
function InfoCard({
  label,
  value,
  color = 'text-white',
  mono = false,
  large = false,
}: {
  label: string
  value: string
  color?: string
  mono?: boolean
  large?: boolean
}) {
  return (
    <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`${large ? 'text-xl font-bold' : 'text-sm font-medium'} ${color} ${mono ? 'font-mono' : ''}`}>
        {value}
      </p>
    </div>
  )
}