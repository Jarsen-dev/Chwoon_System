'use client'

import { useEffect, useState, useRef } from 'react'
import { useAuth }            from '@/context/AuthContext'
import { useRouter }          from 'next/navigation'
import { RegistroProduccion } from '@/types'
import Link                   from 'next/link'
import {
  getRegistros,
  getProyeccion,
  getSaludMaquinas,
  getPlanProduccion,
} from '@/lib/api'

import { RegistroConMeta } from './produccion/helpers'

import HomeDashboardTab from './produccion/HomeDashboardTab'
import ScannerTab       from './produccion/ScannerTab'
import DashboardTab     from './produccion/DashboardTab'
import PlanTab          from './produccion/PlanTab'
import PredictionTab    from './produccion/PredictionTab'
import AnomaliesTab     from './produccion/AnomaliesTab'
import CuartoSecadoTab  from './produccion/CuartoSecadoTab'
import PartesTab        from './produccion/PartesTab'
import ProductosTab     from './produccion/ProductosTab'
import EtiquetasTab     from './produccion/EtiquetasTab'

// ── Tipos ─────────────────────────────────────────────────────────

interface Anomalia {
  id: number; fecha: string; hora: string
  numero_parte: string; motivo: string; tipo: string
}

// ── Helpers ───────────────────────────────────────────────────────
const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

function getTurnoActual(): string {
  const m = new Date().getHours() * 60 + new Date().getMinutes()
  return m >= 450 && m < 1170 ? 'DIA' : 'NOCHE'
}

function getFechaTurno(): string {
  const now = new Date()
  const m   = now.getHours() * 60 + now.getMinutes()
  if (m < 450) {
    const y = new Date(now)
    y.setDate(y.getDate() - 1)
    return y.toISOString().split('T')[0]
  }
  return now.toISOString().split('T')[0]
}

// ── Tabs config ──────────────────────────────────────────────────
const ALL_TABS = [
  { id: 'home',          label: '🏠 Inicio',         roles: ['admin','supervisor','operador','calidad'] },
  { id: 'captura',       label: '📷 Captura',        roles: ['admin','supervisor','operador','calidad'] },
  { id: 'dashboard',     label: '📊 Dashboard',      roles: ['admin','supervisor','operador','calidad'] },
  { id: 'partes',        label: '⚙️ Partes',         roles: ['admin','supervisor','operador'] },
  { id: 'productos',     label: '📦 Productos',      roles: ['admin','supervisor','operador'] },
  { id: 'etiquetas',     label: '🖨️ Etiquetas',      roles: ['admin','supervisor','operador'] },
  { id: 'plan',          label: '📋 Plan Prod.',     roles: ['admin','supervisor'] },
  { id: 'prediccion',    label: '🤖 Predicción IA',  roles: ['admin','supervisor'] },
  { id: 'anomalias',     label: '🚨 Anomalías',      roles: ['admin','supervisor'] },
  { id: 'cuarto_secado', label: '🌡️ Cuarto Secado',  roles: ['admin','supervisor','operador'] },
]

const ROL_BADGE: Record<string, { icon: string; color: string }> = {
  admin:      { icon: '👑', color: 'text-yellow-400' },
  supervisor: { icon: '🔵', color: 'text-blue-400'   },
  operador:   { icon: '🟢', color: 'text-green-400'  },
  calidad:    { icon: '🔬', color: 'text-cyan-400'   },
  finanzas:   { icon: '💰', color: 'text-emerald-400' },
}

// ══════════════════════════════════════════════════════════════════
export default function ProduccionPage() {
  const { token, rol, username, logout, loading } = useAuth()
  const router = useRouter()

  // ── UI ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('home')
  const [wsStatus, setWsStatus]   = useState<'conectado'|'desconectado'|'conectando'>('desconectado')

  // ── Scanner state ──────────────────────────────────────────────
  const [registros,  setRegistros]  = useState<RegistroConMeta[]>([])
  const [inputValue, setInputValue] = useState('')
  const [alertas, setAlertas]       = useState<{tipo:string;motivo:string;id:number}[]>([])

  // ── Datos ──────────────────────────────────────────────────────
  const [planes,        setPlanes]        = useState<any[]>([])
  const [proyecciones,  setProyecciones]  = useState<any[]>([])
  const [saludMaquinas, setSaludMaquinas] = useState<any[]>([])
  const [anomalias,     setAnomalias]     = useState<Anomalia[]>([])

  // ── Turno ──────────────────────────────────────────────────────
  const [turnoActual, setTurnoActual] = useState(getTurnoActual)
  const [fechaTurno,  setFechaTurno]  = useState(getFechaTurno)

  // ── Dashboard prod ─────────────────────────────────────────────
  const [dashPorParte,    setDashPorParte]    = useState<
    { numero_parte: string; total: number; meta: number; porcentaje: number }[]
  >([])
  const [dashTotalPiezas, setDashTotalPiezas] = useState(0)
  const [dashLoadedTab,   setDashLoadedTab]   = useState(false)

  // ── Refs ───────────────────────────────────────────────────────
  const ws            = useRef<WebSocket|null>(null)
  const inputRef      = useRef<HTMLInputElement>(null)
  const planMap       = useRef<Record<string,number>>({})
  const scanTimer     = useRef<ReturnType<typeof setTimeout>|null>(null)
  const inputValueRef = useRef('')
  const tokenRef      = useRef<string|null>(null)
  const [scannerKey, setScannerKey] = useState(0)

  // ── Auth guard ─────────────────────────────────────────────────
  useEffect(() => {
    if (loading) return
    if (!token) {
      router.push('/login')
      return
    }
    if (rol && !['admin','supervisor','operador','calidad'].includes(rol)) {
      router.push('/unauthorized')
    }
  }, [token, rol, loading, router])

  // ── Sync tokenRef ──────────────────────────────────────────────
  useEffect(() => { tokenRef.current = token ?? null }, [token])

  // ── Turno label update ─────────────────────────────────────────
  useEffect(() => {
    const i = setInterval(() => {
      setTurnoActual(getTurnoActual())
      setFechaTurno(getFechaTurno())
    }, 60_000)
    return () => clearInterval(i)
  }, [])

  // ── WS + carga inicial ─────────────────────────────────────────
  useEffect(() => {
    if (token === undefined) return
    cargarHistorial()
    cargarPlanInicial()
    if (ws.current) { ws.current.onclose = null; ws.current.close(); ws.current = null }
    conectarWebSocket()
    return () => { if (ws.current) { ws.current.onclose = null; ws.current.close(); ws.current = null } }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  // ── Tab change reactions ───────────────────────────────────────
  useEffect(() => {
    if (activeTab === 'plan')                          cargarPlan()
    if (activeTab === 'prediccion')                    cargarIA()
    if (activeTab === 'anomalias')                     cargarAnomalias()
    if (activeTab === 'dashboard' && !dashLoadedTab)   cargarDashboard()
    if (activeTab === 'captura') {
      setScannerKey(p => p + 1)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // ── Focus input ────────────────────────────────────────────────
  useEffect(() => {
    const i = setInterval(() => {
      if (activeTab !== 'captura') return
      const enFiltros = (inputRef as any)._enFiltros?.() ?? false
      if (enFiltros) return
      const tag = document.activeElement?.tagName ?? ''
      if (['INPUT','SELECT','TEXTAREA'].includes(tag) && document.activeElement !== inputRef.current) return
      if (document.activeElement !== inputRef.current) inputRef.current?.focus()
    }, 1_000)
    return () => clearInterval(i)
  }, [activeTab])

  // ── WebSocket ──────────────────────────────────────────────────
  const conectarWebSocket = () => {
    setWsStatus('conectando')
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000'
    const tkn   = tokenRef.current
    const wsUri = tkn ? `${wsUrl}/produccion/ws/scanner?token=${tkn}` : `${wsUrl}/produccion/ws/scanner`
    const socket = new WebSocket(wsUri)
    ws.current   = socket

    socket.onopen  = () => { if (ws.current === socket) setWsStatus('conectado') }
    socket.onerror = () => { if (ws.current === socket) setWsStatus('desconectado') }
    socket.onclose = () => {
      if (ws.current !== socket) return
      setWsStatus('desconectado')
      setTimeout(() => { if (ws.current === socket || ws.current === null) conectarWebSocket() }, 3_000)
    }

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'scan_complete') {
        const reg  = data.registro
        const meta = planMap.current[reg.numero_parte]
        const nuevoRegistro: RegistroConMeta = {
          ...reg,
          descripcion: reg.descripcion ?? '',
          usuario:     reg.usuario?.trim() ? reg.usuario : '—',
          meta_plan:   meta ?? 'N/A',
          faltan:      meta != null ? Math.max(0, meta - reg.total_acumulado) : 'N/A',
        }
        setRegistros(prev => [nuevoRegistro, ...prev])
        actualizarDashEnTiempoReal(reg, meta)
        if (data.alertas?.length > 0) {
          data.alertas.forEach((a: any) => agregarAlerta({ tipo: a.tipo, motivo: a.motivo }))
        }
      } else if (data.type === 'error') {
        agregarAlerta({ tipo: 'ERROR', motivo: data.message })
      }
    }
  }

  // ── Dashboard en tiempo real ───────────────────────────────────
  const actualizarDashEnTiempoReal = (reg: any, meta?: number) => {
    setDashPorParte(prev => {
      const metaVal = meta ?? reg.meta_plan ?? 0
      const existe  = prev.find(p => p.numero_parte === reg.numero_parte)
      let nueva: typeof prev
      if (existe) {
        nueva = prev.map(p =>
          p.numero_parte === reg.numero_parte
            ? { ...p, total: reg.total_acumulado, porcentaje: p.meta > 0 ? Math.min(100, Math.round((reg.total_acumulado / p.meta) * 100)) : 0 }
            : p
        )
      } else {
        nueva = [...prev, {
          numero_parte: reg.numero_parte, total: reg.total_acumulado,
          meta: metaVal, porcentaje: metaVal > 0 ? Math.min(100, Math.round((reg.total_acumulado / metaVal) * 100)) : 0,
        }]
      }
      return nueva.sort((a, b) => b.total - a.total)
    })
    setDashTotalPiezas(prev => prev + (reg.qty_bolsa || 0))
  }

  // ── Input handlers ─────────────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value.toUpperCase()
    inputValueRef.current = valor
    setInputValue(valor)
    if (scanTimer.current) clearTimeout(scanTimer.current)
    if (valor.trim()) scanTimer.current = setTimeout(enviarCodigo, 600)
  }

  const enviarCodigo = () => {
    const codigo = inputValueRef.current.trim()
    if (!codigo) return
    const codigoFinal = codigo.includes('°') ? codigo.split('°')[0].trim() : codigo
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(codigoFinal)
    } else {
      agregarAlerta({ tipo: 'ERROR', motivo: 'Sin conexión al servidor. Reconectando...' })
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

  // ── Carga de datos ─────────────────────────────────────────────
  const cargarPlanInicial = async () => {
    try {
      const data = await getPlanProduccion()
      const map: Record<string,number> = {}
      data.forEach((p: any) => { map[p.numero_parte] = p.meta_piezas })
      planMap.current = map
    } catch (e) { console.error('Error plan inicial', e) }
  }

  const cargarHistorial = async () => {
    try {
      await cargarPlanInicial()
      const turno = getTurnoActual()
      const fecha = getFechaTurno()
      const data  = await getRegistros(fecha, turno)
      setRegistros(
        data.map((reg: any) => {
          const meta = planMap.current[reg.numero_parte]
          return {
            ...reg,
            descripcion: reg.descripcion ?? '',
            usuario:     reg.usuario?.trim() ? reg.usuario : '—',
            meta_plan:   meta ?? 'N/A',
            faltan:      meta != null ? Math.max(0, meta - reg.total_acumulado) : 'N/A',
          }
        })
      )
    } catch (e) { console.error('Error historial', e) }
  }

  const cargarPlan = async () => {
    try {
      const data = await getPlanProduccion()
      setPlanes(data)
      const map: Record<string,number> = {}
      data.forEach((p: any) => { map[p.numero_parte] = p.meta_piezas })
      planMap.current = map
    } catch (e) { console.error('Error plan', e) }
  }

  const cargarIA = async () => {
    try {
      const turno = getTurnoActual()
      const [proyData, saludData] = await Promise.all([
        getProyeccion(turno),
        getSaludMaquinas(),
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
      const turno = getTurnoActual()
      const fecha = getFechaTurno()
      const [regs, plan] = await Promise.all([
        getRegistros(fecha, turno),
        getPlanProduccion(),
      ])
      const acumulado: Record<string,number> = {}
      regs.forEach((r: any) => {
        if (!acumulado[r.numero_parte] || r.total_acumulado > acumulado[r.numero_parte])
          acumulado[r.numero_parte] = r.total_acumulado
      })
      const planMapLocal: Record<string,number> = {}
      plan.forEach((p: any) => { planMapLocal[p.numero_parte] = p.meta_piezas })
      const porParte = Object.entries(acumulado)
        .map(([parte, total]) => ({
          numero_parte: parte, total,
          meta: planMapLocal[parte] || 0,
          porcentaje: planMapLocal[parte] ? Math.min(100, Math.round((total / planMapLocal[parte]) * 100)) : 0,
        }))
        .sort((a, b) => b.total - a.total)
      setDashPorParte(porParte)
      setDashTotalPiezas(regs.reduce((acc: number, r: any) => acc + (r.qty_bolsa || 0), 0))
      setDashLoadedTab(true)
    } catch (e) { console.error('Error dashboard', e) }
  }

  const agregarAlerta = (alerta: Omit<{tipo:string;motivo:string;id:number}, 'id'>) => {
    const id = Date.now()
    setAlertas(prev => [{ ...alerta, id }, ...prev])
    setTimeout(() => { setAlertas(prev => prev.filter(a => a.id !== id)) }, 15_000)
  }

  // ── Computed ───────────────────────────────────────────────────
  const tabs = ALL_TABS.filter(t => t.roles.includes(rol ?? ''))
  const badge = ROL_BADGE[rol || ''] || { icon: '👤', color: 'text-gray-400' }

  const wsStatusConfig = {
    conectado:    { label: 'Conectado',    dot: 'bg-green-400',  badge: 'bg-green-900/40  text-green-300  border-green-700'  },
    desconectado: { label: 'Desconectado', dot: 'bg-red-400',    badge: 'bg-red-900/40    text-red-300    border-red-700'    },
    conectando:   { label: 'Conectando…',  dot: 'bg-yellow-400', badge: 'bg-yellow-900/40 text-yellow-300 border-yellow-700' },
  }
  const ws_cfg = wsStatusConfig[wsStatus]

  // ── Loading / guard ────────────────────────────────────────────
  if (loading) {
    return (
      <div className="fixed inset-0 bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    )
  }

  if (!token || (rol && !['admin','supervisor','operador','calidad'].includes(rol))) {
    return null
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════
  return (
    <div className="fixed inset-0 bg-white text-gray-900 flex flex-col">

      {/* ═══ HEADER ═══ */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <img src="/Logo.png" alt="Logo" className="h-10 w-auto" />
          <h1 className="text-xl font-bold text-white">Panel de Producción</h1>
        </div>

        <div className="flex items-center gap-3">
          {/* WS Status */}
          <div className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border ${ws_cfg.badge}`}>
            <span className={`w-2 h-2 rounded-full animate-pulse ${ws_cfg.dot}`} />
            {ws_cfg.label}
          </div>

          {/* Turno */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border ${
            turnoActual === 'DIA'
              ? 'bg-yellow-500/10 border-yellow-500/40 text-yellow-400'
              : 'bg-indigo-500/10 border-indigo-500/40 text-indigo-400'
          }`}>
            <span>{turnoActual === 'DIA' ? '☀️' : '🌙'}</span>
            <span>{turnoActual}</span>
          </div>

          {/* Nav links */}
          {['admin', 'finanzas'].includes(rol || '') && (
            <Link href="/finanzas" className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors">
              💰 Compras
            </Link>
          )}

          {['admin', 'calidad'].includes(rol || '') && (
            <Link href="/calidad" className="bg-cyan-600 hover:bg-cyan-700 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors">
              🔬 Calidad
            </Link>
          )}

          {rol === 'admin' && (
            <Link href="/admin" className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors">
              👑 Admin
            </Link>
          )}

          <span className={`text-sm font-medium ${badge.color}`}>
            {badge.icon} {username}
          </span>

          <button
            onClick={logout}
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
          >
            🚪 Salir
          </button>
        </div>
      </header>

      {/* ═══ TABS ═══ */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 shrink-0">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-white text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ CONTENT ═══ */}
      <main className="flex-1 overflow-y-auto p-6 bg-gray-50">
        {activeTab === 'home' && (
          <HomeDashboardTab token={token} rol={rol} />
        )}
        {activeTab === 'captura' && (
          <ScannerTab
            key={scannerKey}
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
        {activeTab === 'partes' && <PartesTab />}
        {activeTab === 'productos' && <ProductosTab />}
        {activeTab === 'etiquetas' && <EtiquetasTab />}
        {activeTab === 'plan' && (
          <PlanTab planes={planes} onRefresh={cargarPlan} onGoToTab={setActiveTab} />
        )}
        {activeTab === 'prediccion' && (
          <PredictionTab proyecciones={proyecciones} saludMaquinas={saludMaquinas} />
        )}
        {activeTab === 'anomalias' && (
          <AnomaliesTab anomalias={anomalias} cargarAnomalias={cargarAnomalias} />
        )}
        {activeTab === 'cuarto_secado' && <CuartoSecadoTab />}
      </main>
    </div>
  )
}