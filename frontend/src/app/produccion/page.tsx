'use client'

import { useEffect, useState, useRef } from 'react'
import { RegistroProduccion } from '@/types'
import { getRegistros, getProyeccion, getSaludMaquinas, getPlanProduccion } from '@/lib/api'

// ==========================================
// TIPOS
// ==========================================
interface RegistroConMeta extends RegistroProduccion {
  meta_plan?: number | string
  faltan?:    number | string
}

interface Anomalia {
  id:           number
  fecha:        string
  hora:         string
  numero_parte: string
  motivo:       string
  tipo:         string
}

// ==========================================
// HELPERS
// ==========================================
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function getTipoBadge(tipo: string): string {
  switch (tipo) {
    case 'FRAUDE':        return 'bg-red-100    text-red-800    border border-red-300'
    case 'MANTENIMIENTO': return 'bg-orange-100 text-orange-800 border border-orange-300'
    case 'LENTITUD_PLAN': return 'bg-yellow-100 text-yellow-800 border border-yellow-300'
    default:              return 'bg-gray-100   text-gray-700   border border-gray-300'
  }
}

function getTipoIcon(tipo: string): string {
  switch (tipo) {
    case 'FRAUDE':        return '🕵️'
    case 'MANTENIMIENTO': return '⚙️'
    case 'LENTITUD_PLAN': return '🐢'
    default:              return '⚠️'
  }
}

function getBarColor(pct: number): string {
  if (pct >= 90) return 'bg-emerald-500'
  if (pct >= 60) return 'bg-blue-500'
  if (pct >= 30) return 'bg-yellow-500'
  return 'bg-red-500'
}

function getFaltanStyle(faltan: number | string): string {
  if (faltan === 'N/A') return 'text-gray-400'
  if (faltan === 0)     return 'text-emerald-600 font-bold'
  if (typeof faltan === 'number' && faltan > 0) return 'text-orange-500 font-semibold'
  return 'text-gray-600'
}

// ==========================================
// PÁGINA
// ==========================================
export default function ProduccionPage() {
  const [activeTab, setActiveTab] = useState('captura')
  const [wsStatus, setWsStatus]   = useState<'conectado' | 'desconectado' | 'conectando'>('desconectado')

  // Datos
  const [registros, setRegistros]         = useState<RegistroConMeta[]>([])
  const [planes, setPlanes]               = useState<any[]>([])
  const [proyecciones, setProyecciones]   = useState<any[]>([])
  const [saludMaquinas, setSaludMaquinas] = useState<any[]>([])
  const [anomalias, setAnomalias]         = useState<Anomalia[]>([])
  const [alertas, setAlertas]             = useState<{ tipo: string, motivo: string, id: number }[]>([])

  // Escáner
  const [inputValue, setInputValue] = useState('')
  const ws           = useRef<WebSocket | null>(null)
  const inputRef     = useRef<HTMLInputElement>(null)
  const planMap      = useRef<Record<string, number>>({})
  const scanTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputValueRef = useRef('')

  // Dashboard
  const [dashPorParte, setDashPorParte]     = useState<{
    numero_parte: string
    total: number
    meta: number
    porcentaje: number
  }[]>([])
  const [dashTotalPiezas, setDashTotalPiezas] = useState(0)
  const [dashLoadedTab, setDashLoadedTab]     = useState(false)

  // ── Efectos ──
  useEffect(() => {
    cargarHistorial()
    cargarPlanInicial()
    conectarWebSocket()
    return () => ws.current?.close()
  }, [])

  useEffect(() => {
    if (activeTab === 'plan')       cargarPlan()
    if (activeTab === 'prediccion') cargarIA()
    if (activeTab === 'anomalias')  cargarAnomalias()
    if (activeTab === 'dashboard' && !dashLoadedTab) cargarDashboard()
  }, [activeTab])

  useEffect(() => {
    const interval = setInterval(() => {
      if (activeTab === 'captura' && document.activeElement !== inputRef.current) {
        inputRef.current?.focus()
      }
    }, 1000)
    return () => clearInterval(interval)
  }, [activeTab])

  // ==========================================
  // WEBSOCKET
  // ==========================================
  const conectarWebSocket = () => {
    setWsStatus('conectando')
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000'
    ws.current  = new WebSocket(`${wsUrl}/produccion/ws/scanner`)

    ws.current.onopen  = () => setWsStatus('conectado')
    ws.current.onerror = () => setWsStatus('desconectado')
    ws.current.onclose = () => {
      setWsStatus('desconectado')
      setTimeout(conectarWebSocket, 3000)
    }

    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.type === 'scan_complete') {
        const reg  = data.registro
        const meta = planMap.current[reg.numero_parte]

        setRegistros(prev => [{
          ...reg,
          meta_plan: meta ?? 'N/A',
          faltan:    meta != null ? Math.max(0, meta - reg.total_acumulado) : 'N/A'
        }, ...prev])

        if (data.alertas?.length > 0) {
          data.alertas.forEach((a: any) =>
            setAlertas(prev => [{ ...a, id: Date.now() }, ...prev])
          )
        }
      } else if (data.type === 'error') {
        setAlertas(prev => [{
          tipo:   'ERROR',
          motivo: data.message,
          id:     Date.now()
        }, ...prev])
      }
    }
  }

  // ==========================================
  // ESCÁNER
  // ==========================================
  const enviarCodigo = () => {
    const codigo = inputValueRef.current.trim()
    if (!codigo) return

    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(codigo)
    } else {
      setAlertas(prev => [{
        tipo:   'ERROR',
        motivo: 'Sin conexión al servidor. Reconectando...',
        id:     Date.now()
      }, ...prev])
    }

    inputValueRef.current = ''
    setInputValue('')
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value.toUpperCase()
    inputValueRef.current = valor
    setInputValue(valor)

    if (scanTimer.current) clearTimeout(scanTimer.current)
    if (valor.trim()) {
      scanTimer.current = setTimeout(enviarCodigo, 600)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (scanTimer.current) clearTimeout(scanTimer.current)
      enviarCodigo()
    }
  }

  // ==========================================
  // CARGA DE DATOS
  // ==========================================
  const cargarPlanInicial = async () => {
    try {
      const data = await getPlanProduccion()
      const map: Record<string, number> = {}
      data.forEach((p: any) => { map[p.numero_parte] = p.meta_piezas })
      planMap.current = map
    } catch (e) { console.error('Error plan inicial', e) }
  }

  const cargarHistorial = async () => {
    try {
      const hoy  = new Date().toISOString().split('T')[0]
      const data = await getRegistros(hoy)
      await cargarPlanInicial()
      setRegistros(data.map((reg: RegistroProduccion) => {
        const meta = planMap.current[reg.numero_parte]
        return {
          ...reg,
          meta_plan: meta ?? 'N/A',
          faltan:    meta != null ? Math.max(0, meta - reg.total_acumulado) : 'N/A'
        }
      }))
    } catch (e) { console.error('Error historial', e) }
  }

  const cargarPlan = async () => {
    try {
      const data = await getPlanProduccion()
      setPlanes(data)
      const map: Record<string, number> = {}
      data.forEach((p: any) => { map[p.numero_parte] = p.meta_piezas })
      planMap.current = map
    } catch (e) { console.error('Error plan', e) }
  }

  const cargarIA = async () => {
    try {
      const hora  = new Date().getHours()
      const turno = hora >= 7 && hora < 19 ? 'DIA' : 'NOCHE'
      const [proyData, saludData] = await Promise.all([
        getProyeccion(turno),
        getSaludMaquinas()
      ])
      setProyecciones(proyData.proyecciones || [])
      setSaludMaquinas(saludData || [])
    } catch (e) { console.error('Error IA', e) }
  }

  const cargarAnomalias = async () => {
    try {
      const res  = await fetch(`${API_URL}/produccion/anomalias/?limite=100`)
      const data = await res.json()
      setAnomalias(data)
    } catch (e) { console.error('Error anomalías', e) }
  }

  const cargarDashboard = async () => {
    try {
      const hoy      = new Date().toISOString().split('T')[0]
      const hora     = new Date().getHours()
      const turno    = hora >= 7 && hora < 19 ? 'DIA' : 'NOCHE'
      const [regs, plan] = await Promise.all([
        getRegistros(hoy),
        getPlanProduccion()
      ])

      // Acumulado por parte
      const acumulado: Record<string, number> = {}
      regs.forEach((r: any) => {
        if (!acumulado[r.numero_parte] || r.total_acumulado > acumulado[r.numero_parte]) {
          acumulado[r.numero_parte] = r.total_acumulado
        }
      })

      const planMapLocal: Record<string, number> = {}
      plan.forEach((p: any) => { planMapLocal[p.numero_parte] = p.meta_piezas })

      const porParte = Object.entries(acumulado)
        .map(([parte, total]) => ({
          numero_parte: parte,
          total,
          meta:         planMapLocal[parte] || 0,
          porcentaje:   planMapLocal[parte]
            ? Math.min(100, Math.round((total / planMapLocal[parte]) * 100))
            : 0
        }))
        .sort((a, b) => b.total - a.total)

      setDashPorParte(porParte)
      setDashTotalPiezas(regs.reduce((acc: number, r: any) => acc + (r.qty_bolsa || 0), 0))
      setDashLoadedTab(true)
    } catch (e) { console.error('Error dashboard', e) }
  }

  // ==========================================
  // UI HELPERS
  // ==========================================
  const wsStatusConfig = {
    conectado:    { label: 'Conectado',    dot: 'bg-green-400',  badge: 'bg-green-900/40  text-green-300  border-green-700'  },
    desconectado: { label: 'Desconectado', dot: 'bg-red-400',    badge: 'bg-red-900/40    text-red-300    border-red-700'    },
    conectando:   { label: 'Conectando…',  dot: 'bg-yellow-400', badge: 'bg-yellow-900/40 text-yellow-300 border-yellow-700' },
  }
  const ws_cfg = wsStatusConfig[wsStatus]

  const tabs = [
    { id: 'captura',    label: '📷 Captura'       },
    { id: 'dashboard',  label: '📊 Dashboard'      },
    { id: 'plan',       label: '📋 Plan Prod.'     },
    { id: 'prediccion', label: '🤖 Predicción IA'  },
    { id: 'anomalias',  label: '🚨 Anomalías'      },
  ]

  // ==========================================
  // RENDER
  // ==========================================
  return (
    <div className="p-4 max-w-6xl mx-auto">

      {/* ── HEADER ── */}
      <div className="bg-slate-800 text-white p-4 rounded-t-lg flex justify-between items-center shadow">
        <div>
          <h1 className="text-xl font-bold">Control de Producción</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Turno actual:{' '}
            <span className="font-semibold text-white">
              {new Date().getHours() >= 7 && new Date().getHours() < 19 ? 'DÍA' : 'NOCHE'}
            </span>
          </p>
        </div>
        <div className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full border ${ws_cfg.badge}`}>
          <span className={`w-2.5 h-2.5 rounded-full animate-pulse ${ws_cfg.dot}`} />
          Escáner: {ws_cfg.label}
        </div>
      </div>

      {/* ── PESTAÑAS ── */}
      <div className="flex bg-white border-b shadow-sm overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-3 font-semibold whitespace-nowrap transition-colors ${
              activeTab === tab.id
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── CONTENIDO ── */}
      <div className="bg-white p-6 rounded-b-lg shadow min-h-[600px]">

        {/* ======================================== */}
        {/* PESTAÑA: CAPTURA                         */}
        {/* ======================================== */}
        {activeTab === 'captura' && (
          <div className="space-y-5">

            <div className="text-center">
              <h2 className="text-lg font-bold text-blue-700 mb-3 tracking-wide uppercase">
                Escanee el Código del Carrito
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
            </div>

            {/* Alertas */}
            {alertas.length > 0 && (
              <div className="flex flex-col gap-2">
                {alertas.slice(0, 3).map(alerta => (
                  <div key={alerta.id} className="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 rounded flex justify-between items-start">
                    <div>
                      <p className="font-bold text-sm">🚨 ALERTA: {alerta.tipo}</p>
                      <p className="text-sm mt-0.5">{alerta.motivo}</p>
                    </div>
                    <button
                      onClick={() => setAlertas(alertas.filter(a => a.id !== alerta.id))}
                      className="text-red-400 hover:text-red-700 font-bold ml-4 text-lg"
                    >✖</button>
                  </div>
                ))}
              </div>
            )}

            {/* Tabla registros */}
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-200">
                    {['Hora','Máquina','N° Parte','Carrito','QTY','Total','Meta Plan','Faltan'].map(col => (
                      <th key={col} className="p-3 text-center font-semibold text-slate-600 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {registros.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-12 text-center">
                        <span className="text-4xl block mb-2">📷</span>
                        <span className="text-gray-400">Esperando escaneo...</span>
                      </td>
                    </tr>
                  ) : (
                    registros.map((reg, idx) => (
                      <tr
                        key={`${reg.hora}-${reg.numero_parte}-${idx}`}
                        className={`border-b transition-colors ${
                          idx === 0
                            ? 'bg-blue-50 border-l-4 border-l-blue-500'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <td className={`p-3 text-center font-mono text-sm ${idx === 0 ? 'text-blue-700 font-semibold' : 'text-slate-500'}`}>
                          {reg.hora}
                        </td>
                        <td className={`p-3 text-center ${idx === 0 ? 'text-slate-800 font-semibold' : 'text-slate-600'}`}>
                          {reg.maquina}
                        </td>
                        <td className={`p-3 text-center font-mono font-bold ${idx === 0 ? 'text-blue-700' : 'text-blue-600'}`}>
                          {reg.numero_parte}
                        </td>
                        <td className="p-3 text-center text-slate-600">#{reg.carrito_numero}</td>
                        <td className={`p-3 text-center font-semibold ${idx === 0 ? 'text-slate-800' : 'text-slate-700'}`}>
                          {reg.qty_bolsa}
                        </td>
                        <td className={`p-3 text-center font-bold ${idx === 0 ? 'text-emerald-700' : 'text-emerald-600'}`}>
                          {reg.total_acumulado}
                        </td>
                        <td className="p-3 text-center text-slate-500">
                          {reg.meta_plan ?? 'N/A'}
                        </td>
                        <td className={`p-3 text-center ${getFaltanStyle(reg.faltan ?? 'N/A')}`}>
                          {reg.faltan === 0 ? '✅ 0' : (reg.faltan ?? 'N/A')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {registros.length > 0 && (
              <p className="text-right text-xs text-gray-400">
                {registros.length} registro(s) en este turno
              </p>
            )}
          </div>
        )}

        {/* ======================================== */}
        {/* PESTAÑA: DASHBOARD                       */}
        {/* ======================================== */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">

            {/* Tarjetas resumen */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {
                  label: 'Total Piezas',
                  value: dashTotalPiezas.toLocaleString(),
                  icon:  '📦',
                  color: 'border-blue-500 bg-blue-50',
                  text:  'text-blue-700'
                },
                {
                  label: 'Partes Activas',
                  value: dashPorParte.length,
                  icon:  '🔢',
                  color: 'border-purple-500 bg-purple-50',
                  text:  'text-purple-700'
                },
                {
                  label: 'Completadas',
                  value: dashPorParte.filter(p => p.porcentaje >= 100).length,
                  icon:  '✅',
                  color: 'border-emerald-500 bg-emerald-50',
                  text:  'text-emerald-700'
                },
                {
                  label: 'En Proceso',
                  value: dashPorParte.filter(p => p.porcentaje > 0 && p.porcentaje < 100).length,
                  icon:  '🔄',
                  color: 'border-yellow-500 bg-yellow-50',
                  text:  'text-yellow-700'
                },
              ].map((card, idx) => (
                <div key={idx} className={`rounded-lg border-l-4 p-4 ${card.color}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {card.label}
                    </span>
                    <span className="text-xl">{card.icon}</span>
                  </div>
                  <p className={`text-3xl font-bold ${card.text}`}>{card.value}</p>
                </div>
              ))}
            </div>

            {/* Gráfica de barras horizontal */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-800">
                    📊 Producción por Número de Parte
                  </h2>
                  <p className="text-xs text-gray-400 mt-0.5">Acumulado del turno · ordenado por mayor producción</p>
                </div>
                <button
                  onClick={cargarDashboard}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 transition"
                >
                  🔄 Actualizar
                </button>
              </div>

              <div className="p-5 space-y-4 max-h-96 overflow-y-auto">
                {dashPorParte.length === 0 ? (
                  <div className="py-12 text-center">
                    <span className="text-4xl block mb-2">📊</span>
                    <p className="text-gray-400">Sin producción registrada hoy.</p>
                  </div>
                ) : (
                  dashPorParte.map((item, idx) => (
                    <div key={idx} className="space-y-1">

                      {/* Etiqueta superior */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 font-medium w-5 text-right">
                            {idx + 1}
                          </span>
                          <span className="font-mono font-bold text-slate-800 text-sm">
                            {item.numero_parte}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-700">
                            {item.total.toLocaleString()}
                          </span>
                          {item.meta > 0 && (
                            <>
                              <span className="text-xs text-gray-400">
                                / {item.meta.toLocaleString()}
                              </span>
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                item.porcentaje >= 100
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : item.porcentaje >= 60
                                    ? 'bg-blue-100 text-blue-700'
                                    : item.porcentaje >= 30
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : 'bg-red-100 text-red-700'
                              }`}>
                                {item.porcentaje}%
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Barra */}
                      <div className="flex items-center gap-2">
                        <span className="w-5" />
                        <div className="flex-1 bg-gray-100 rounded-full h-3 overflow-hidden">
                          <div
                            className={`h-3 rounded-full transition-all duration-700 ${getBarColor(item.porcentaje)}`}
                            style={{
                              width: item.meta > 0
                                ? `${item.porcentaje}%`
                                // Sin meta: barra relativa al máximo
                                : `${Math.round((item.total / (dashPorParte[0]?.total || 1)) * 100)}%`
                            }}
                          />
                        </div>
                      </div>

                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}

        {/* ======================================== */}
        {/* PESTAÑA: PLAN DE PRODUCCIÓN              */}
        {/* ======================================== */}
        {activeTab === 'plan' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-700">Gestor de Plan de Producción</h2>
              <div className="space-x-2">
                <button className="bg-purple-600 text-white px-4 py-2 rounded font-medium hover:bg-purple-700 transition">
                  📥 Importar Excel
                </button>
                <button className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 transition">
                  🤖 Sugerir por IA
                </button>
              </div>
            </div>
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 text-slate-700 border-b">
                  <tr>
                    {['N° Parte','Turno Objetivo','Meta (Piezas)','Estado'].map(col => (
                      <th key={col} className="p-3 text-center font-semibold">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {planes.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-12 text-center">
                        <span className="text-4xl block mb-2">📋</span>
                        <span className="text-gray-400">No hay un plan activo.</span>
                      </td>
                    </tr>
                  ) : (
                    planes.map((p, idx) => (
                      <tr key={idx} className="border-t hover:bg-gray-50 transition">
                        <td className="p-3 text-center font-mono font-medium text-blue-800">{p.numero_parte}</td>
                        <td className="p-3 text-center">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                            p.turno_objetivo === 'Día'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}>
                            {p.turno_objetivo}
                          </span>
                        </td>
                        <td className="p-3 text-center font-bold text-slate-700">{p.meta_piezas}</td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-bold">
                            ⏸️ Pendiente
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ======================================== */}
        {/* PESTAÑA: PREDICCIÓN IA                   */}
        {/* ======================================== */}
        {activeTab === 'prediccion' && (
          <div className="space-y-8">

            {/* Proyecciones */}
            <div>
              <h2 className="text-xl font-bold text-slate-700 mb-4 border-b pb-2">
                📊 Proyección de Cierre de Turno
              </h2>
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-blue-50 text-blue-900 border-b">
                    <tr>
                      {['N° Parte','Producidas','Ritmo (Pz/Hr)','Meta Plan','Faltan','Tiempo Estimado'].map(col => (
                        <th key={col} className="p-3 text-center font-semibold">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {proyecciones.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-12 text-center">
                          <span className="text-4xl block mb-2">🤖</span>
                          <span className="text-gray-400">Sin datos suficientes para proyectar.</span>
                        </td>
                      </tr>
                    ) : (
                      proyecciones.map((proy, idx) => (
                        <tr key={idx} className="border-t hover:bg-blue-50/50 transition">
                          <td className="p-3 text-center font-mono font-medium text-blue-800">{proy.numero_parte}</td>
                          <td className="p-3 text-center font-semibold">{proy.producido}</td>
                          <td className="p-3 text-center text-orange-600 font-medium">{proy.ritmo_por_hora ?? '—'}</td>
                          <td className="p-3 text-center">{proy.meta_plan}</td>
                          <td className={`p-3 text-center font-bold ${getFaltanStyle(proy.faltan)}`}>{proy.faltan}</td>
                          <td className="p-3 text-center font-bold text-blue-700">{proy.tiempo_estimado}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Salud máquinas */}
            <div>
              <h2 className="text-xl font-bold text-slate-700 mb-4 border-b pb-2">
                ⚙️ Mantenimiento Predictivo
              </h2>
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-purple-50 text-purple-900 border-b">
                    <tr>
                      {['Máquina','Último Ciclo (seg)','Tendencia IA','Diagnóstico'].map(col => (
                        <th key={col} className="p-3 text-center font-semibold">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {saludMaquinas.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-12 text-center">
                          <span className="text-4xl block mb-2">⚙️</span>
                          <span className="text-gray-400">Escanea más códigos para detectar patrones.</span>
                        </td>
                      </tr>
                    ) : (
                      saludMaquinas.map((maq, idx) => (
                        <tr key={idx} className="border-t hover:bg-purple-50/50 transition">
                          <td className="p-3 text-center font-medium">{maq.maquina}</td>
                          <td className="p-3 text-center">{maq.ultimo_ciclo_segundos}</td>
                          <td className="p-3 text-center font-mono">{maq.tendencia}</td>
                          <td className="p-3 text-center">{maq.estado}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400 mt-2 italic">
                * La IA necesita al menos 5 registros continuos de la misma máquina.
              </p>
            </div>

          </div>
        )}

        {/* ======================================== */}
        {/* PESTAÑA: ANOMALÍAS                       */}
        {/* ======================================== */}
        {activeTab === 'anomalias' && (
          <div className="space-y-4">

            {/* Header + resumen */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-800">
                  🚨 Registro de Alertas y Anomalías
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Detecciones automáticas por Inteligencia Artificial
                </p>
              </div>

              {/* Badges resumen por tipo */}
              <div className="flex flex-wrap gap-2">
                {['FRAUDE', 'MANTENIMIENTO', 'LENTITUD_PLAN'].map(tipo => {
                  const count = anomalias.filter(a => a.tipo === tipo).length
                  return (
                    <div key={tipo} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${getTipoBadge(tipo)}`}>
                      <span>{getTipoIcon(tipo)}</span>
                      <span>{tipo}</span>
                      <span className="bg-white/60 px-1.5 rounded-full">{count}</span>
                    </div>
                  )
                })}
                <button
                  onClick={cargarAnomalias}
                  className="px-3 py-1.5 rounded-full text-xs font-bold border border-gray-300 bg-gray-50 hover:bg-gray-100 text-gray-600 transition flex items-center gap-1"
                >
                  🔄 Actualizar
                </button>
              </div>
            </div>

            {/* Tabla */}
            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-gray-200">
                    <th className="p-3 text-center font-semibold text-slate-600">Tipo</th>
                    <th className="p-3 text-center font-semibold text-slate-600">Fecha</th>
                    <th className="p-3 text-center font-semibold text-slate-600">Hora</th>
                    <th className="p-3 text-center font-semibold text-slate-600">N° Parte</th>
                    <th className="p-3 text-left   font-semibold text-slate-600">Motivo Detectado</th>
                  </tr>
                </thead>
                <tbody>
                  {anomalias.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-16 text-center">
                        <span className="text-5xl block mb-3">✅</span>
                        <p className="text-gray-500 font-medium">Sin anomalías detectadas.</p>
                        <p className="text-gray-400 text-xs mt-1">
                          El sistema de IA está monitoreando en tiempo real.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    anomalias.map((a, idx) => (
                      <tr
                        key={idx}
                        className="border-b border-gray-100 hover:bg-gray-50 transition"
                      >
                        {/* Tipo */}
                        <td className="p-3 text-center">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${getTipoBadge(a.tipo)}`}>
                            {getTipoIcon(a.tipo)} {a.tipo}
                          </span>
                        </td>

                        {/* Fecha */}
                        <td className="p-3 text-center font-mono text-xs text-slate-500">
                          {a.fecha}
                        </td>

                        {/* Hora */}
                        <td className="p-3 text-center font-mono text-xs text-slate-500">
                          {a.hora}
                        </td>

                        {/* N° Parte */}
                        <td className="p-3 text-center">
                          <span className={`font-mono font-bold text-sm ${
                            a.numero_parte === 'MANTENIMIENTO'
                              ? 'text-orange-600'
                              : 'text-blue-700'
                          }`}>
                            {a.numero_parte}
                          </span>
                        </td>

                        {/* Motivo */}
                        <td className="p-3 text-slate-600 text-xs max-w-md">
                          {a.motivo}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {anomalias.length > 0 && (
              <p className="text-right text-xs text-gray-400">
                {anomalias.length} alerta(s) registrada(s) en total
              </p>
            )}

          </div>
        )}

      </div>
    </div>
  )
}