'use client'

import { useEffect, useState, useRef } from 'react'
import { RegistroProduccion }          from '@/types'
import { getRegistros, getProyeccion, getSaludMaquinas, getPlanProduccion } from '@/lib/api'

import ScannerTab    from './ScannerTab'
import DashboardTab  from './DashboardTab'
import PlanTab       from './PlanTab'
import PredictionTab from './PredictionTab'
import AnomaliesTab  from './AnomaliesTab'
import CuartoSecadoTab  from './CuartoSecadoTab'

// ── Tipos exportados para los componentes hijos ──
export interface RegistroConMeta extends RegistroProduccion {
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

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

export default function ProduccionPage() {
  const [activeTab, setActiveTab] = useState('captura')
  const [wsStatus, setWsStatus]   = useState<'conectado' | 'desconectado' | 'conectando'>('desconectado')

  const [registros, setRegistros]         = useState<RegistroConMeta[]>([])
  const [planes, setPlanes]               = useState<any[]>([])
  const [proyecciones, setProyecciones]   = useState<any[]>([])
  const [saludMaquinas, setSaludMaquinas] = useState<any[]>([])
  const [anomalias, setAnomalias]         = useState<Anomalia[]>([])
  const [alertas, setAlertas]             = useState<{ tipo: string; motivo: string; id: number }[]>([])
  const [inputValue, setInputValue]       = useState('')

  const ws            = useRef<WebSocket | null>(null)
  const inputRef      = useRef<HTMLInputElement>(null)
  const planMap       = useRef<Record<string, number>>({})
  const scanTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputValueRef = useRef('')

  const [dashPorParte, setDashPorParte]     = useState<{ numero_parte: string; total: number; meta: number; porcentaje: number }[]>([])
  const [dashTotalPiezas, setDashTotalPiezas] = useState(0)
  const [dashLoadedTab, setDashLoadedTab]     = useState(false)

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
          data.alertas.forEach((a: any) => agregarAlerta({
            tipo:   a.tipo,
            motivo: a.motivo
          }))
        }

      } else if (data.type === 'error') {
        agregarAlerta({
          tipo:   'ERROR',
          motivo: data.message
        })
      }
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const valor = e.target.value.toUpperCase()  // ✅ Ya puede usar uppercase
  inputValueRef.current = valor
  setInputValue(valor)

  if (scanTimer.current) clearTimeout(scanTimer.current)
  if (valor.trim()) {
    scanTimer.current = setTimeout(enviarCodigo, 600)
  }
}

const enviarCodigo = () => {
  const codigo = inputValueRef.current.trim()
  if (!codigo) return

  // Extrae solo el número de parte si tiene formato con °
  let codigoFinal = codigo
  if (codigo.includes('°')) {
    codigoFinal = codigo.split('°')[0].trim()
  }

  if (ws.current?.readyState === WebSocket.OPEN) {
    ws.current.send(codigoFinal)
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (scanTimer.current) clearTimeout(scanTimer.current)
      enviarCodigo()
    }
  }

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
        return { ...reg, meta_plan: meta ?? 'N/A', faltan: meta != null ? Math.max(0, meta - reg.total_acumulado) : 'N/A' }
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
      const [proyData, saludData] = await Promise.all([getProyeccion(turno), getSaludMaquinas()])
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
      const hoy  = new Date().toISOString().split('T')[0]
      const [regs, plan] = await Promise.all([getRegistros(hoy), getPlanProduccion()])
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
          porcentaje:   planMapLocal[parte] ? Math.min(100, Math.round((total / planMapLocal[parte]) * 100)) : 0
        }))
        .sort((a, b) => b.total - a.total)
      setDashPorParte(porParte)
      setDashTotalPiezas(regs.reduce((acc: number, r: any) => acc + (r.qty_bolsa || 0), 0))
      setDashLoadedTab(true)
    } catch (e) { console.error('Error dashboard', e) }
  }

  const wsStatusConfig = {
    conectado:    { label: 'Conectado',    dot: 'bg-green-400',  badge: 'bg-green-900/40  text-green-300  border-green-700'  },
    desconectado: { label: 'Desconectado', dot: 'bg-red-400',    badge: 'bg-red-900/40    text-red-300    border-red-700'    },
    conectando:   { label: 'Conectando…',  dot: 'bg-yellow-400', badge: 'bg-yellow-900/40 text-yellow-300 border-yellow-700' },
  }
  const ws_cfg = wsStatusConfig[wsStatus]

  const tabs = [
    { id: 'captura',    label: '📷 Captura'      },
    { id: 'dashboard',  label: '📊 Dashboard'     },
    { id: 'plan',       label: '📋 Plan Prod.'    },
    { id: 'prediccion', label: '🤖 Predicción IA' },
    { id: 'anomalias',  label: '🚨 Anomalías'     },
    { id: 'cuarto_secado', label: '🌡️ Cuarto Secado'  },
  ]

  const agregarAlerta = (alerta: Omit<{ tipo: string; motivo: string; id: number }, 'id'>) => {
    const id = Date.now()
    setAlertas(prev => [{ ...alerta, id }, ...prev])
    // Auto-elimina después de 15 segundos
    setTimeout(() => {
      setAlertas(prev => prev.filter(a => a.id !== id))
    }, 15000)
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">

      {/* HEADER */}
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

      {/* PESTAÑAS */}
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

      {/* CONTENIDO */}
      <div className="bg-white p-6 rounded-b-lg shadow min-h-[600px]">
        {activeTab === 'captura' && (
          <ScannerTab
            registros={registros}
            alertas={alertas}
            inputValue={inputValue}
            inputRef={inputRef}
            setAlertas={setAlertas}
            handleInputChange={handleInputChange}
            handleKeyDown={handleKeyDown}
          />
        )}
        {activeTab === 'dashboard' && (
          <DashboardTab
            dashPorParte={dashPorParte}
            dashTotalPiezas={dashTotalPiezas}
            cargarDashboard={cargarDashboard}
          />
        )}
        {activeTab === 'plan' && (
          <PlanTab planes={planes}
          onRefresh={cargarPlan} />
        )}
        {activeTab === 'prediccion' && (
          <PredictionTab
            proyecciones={proyecciones}
            saludMaquinas={saludMaquinas}
          />
        )}
        {activeTab === 'anomalias' && (
          <AnomaliesTab
            anomalias={anomalias}
            cargarAnomalias={cargarAnomalias}
          />
        )}
        {activeTab === 'cuarto_secado' && (
          <CuartoSecadoTab />
        )}
      </div>

    </div>
  )
}