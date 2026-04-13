'use client'

import { useEffect, useState, useRef } from 'react'
import { RegistroProduccion }          from '@/types'
import {
  getRegistros,
  getProyeccion,
  getSaludMaquinas,
  getPlanProduccion,
} from '@/lib/api'
import { useAuth } from '@/context/AuthContext'

import ScannerTab      from './ScannerTab'
import DashboardTab    from './DashboardTab'
import PlanTab         from './PlanTab'
import PredictionTab   from './PredictionTab'
import AnomaliesTab    from './AnomaliesTab'
import CuartoSecadoTab from './CuartoSecadoTab'

// ── Tipos ─────────────────────────────────────────────────────────────
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

// ── Helpers de turno ──────────────────────────────────────────────────
function getTurnoActual(): string {
  const totalMin = new Date().getHours() * 60 + new Date().getMinutes()
  return totalMin >= 450 && totalMin < 1170 ? 'DIA' : 'NOCHE'
}

function getFechaTurno(): string {
  const ahora    = new Date()
  const totalMin = ahora.getHours() * 60 + ahora.getMinutes()
  if (totalMin < 450) {
    const ayer = new Date(ahora)
    ayer.setDate(ayer.getDate() - 1)
    return ayer.toISOString().split('T')[0]
  }
  return ahora.toISOString().split('T')[0]
}

// ── Componente ────────────────────────────────────────────────────────
export default function ProduccionPage() {
  const { rol, token } = useAuth()

  // ── UI ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState('captura')
  const [wsStatus,  setWsStatus]  = useState<
    'conectado' | 'desconectado' | 'conectando'
  >('desconectado')

  // ── Datos ─────────────────────────────────────────────────────────
  const [registros,     setRegistros]     = useState<RegistroConMeta[]>([])
  const [planes,        setPlanes]        = useState<any[]>([])
  const [proyecciones,  setProyecciones]  = useState<any[]>([])
  const [saludMaquinas, setSaludMaquinas] = useState<any[]>([])
  const [anomalias,     setAnomalias]     = useState<Anomalia[]>([])
  const [alertas,       setAlertas]       = useState<
    { tipo: string; motivo: string; id: number }[]
  >([])
  const [inputValue, setInputValue] = useState('')

  // ── Turno visible en UI ───────────────────────────────────────────
  const [turnoActual, setTurnoActual] = useState(getTurnoActual)
  const [fechaTurno,  setFechaTurno]  = useState(getFechaTurno)

  // ── Dashboard ─────────────────────────────────────────────────────
  const [dashPorParte,    setDashPorParte]    = useState<
    { numero_parte: string; total: number; meta: number; porcentaje: number }[]
  >([])
  const [dashTotalPiezas, setDashTotalPiezas] = useState(0)
  const [dashLoadedTab,   setDashLoadedTab]   = useState(false)

  // ── Refs ──────────────────────────────────────────────────────────
  const ws            = useRef<WebSocket | null>(null)
  const inputRef      = useRef<HTMLInputElement>(null)
  const planMap       = useRef<Record<string, number>>({})
  const scanTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputValueRef = useRef('')
  const tokenRef      = useRef<string | null>(null)

  // ── 1. Sincronizar tokenRef cuando cambia el token ────────────────
  useEffect(() => {
    tokenRef.current = token ?? null
  }, [token])

  // ── 2. Actualizar label de turno cada minuto ──────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setTurnoActual(getTurnoActual())
      setFechaTurno(getFechaTurno())
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  // ── 3. Conectar WS y cargar datos cuando token esté listo ─────────
  // token === undefined → AuthContext aún hidratando → esperar
  // token === null      → no logueado (conectar sin token)
  // token === string    → logueado (conectar con token)
  useEffect(() => {
    if (token === undefined) return   // esperar hidratación

    cargarHistorial()
    cargarPlanInicial()

    // Cerrar conexión anterior limpiamente
    if (ws.current) {
      ws.current.onclose = null       // evitar reconexión automática
      ws.current.close()
      ws.current = null
    }

    conectarWebSocket()

    return () => {
      if (ws.current) {
        ws.current.onclose = null
        ws.current.close()
        ws.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])
  
  // ── 4. Reacción al cambio de pestaña ─────────────────────────────

  const [scannerKey, setScannerKey] = useState(0)

  useEffect(() => {
    if (activeTab === 'plan')                        cargarPlan()
    if (activeTab === 'prediccion')                  cargarIA()
    if (activeTab === 'anomalias')                   cargarAnomalias()
    if (activeTab === 'dashboard' && !dashLoadedTab) cargarDashboard()
    // Al volver a captura: incrementar key (resetea filtros) y dar foco
    if (activeTab === 'captura') {
      setScannerKey(prev => prev + 1)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab])

  // ── 5. Foco en input de captura ───────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      if (activeTab !== 'captura') return

      // No robar foco si el usuario está en los filtros
      const enFiltros = (inputRef as any)._enFiltros?.() ?? false
      if (enFiltros) return

      // No robar foco si el elemento activo es un input/select/textarea
      const tag = document.activeElement?.tagName ?? ''
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(tag) &&
          document.activeElement !== inputRef.current) return

      // Solo dar foco si realmente no está en el QR input
      if (document.activeElement !== inputRef.current) {
        inputRef.current?.focus()
      }
    }, 1_000)
    return () => clearInterval(interval)
  }, [activeTab])

  // ── WebSocket ─────────────────────────────────────────────────────
  const conectarWebSocket = () => {
    setWsStatus('conectando')

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000'
    const tkn   = tokenRef.current

    const wsUri = tkn
      ? `${wsUrl}/produccion/ws/scanner?token=${tkn}`
      : `${wsUrl}/produccion/ws/scanner`

    const socket = new WebSocket(wsUri)
    ws.current   = socket

    socket.onopen = () => {
      if (ws.current === socket) setWsStatus('conectado')
    }

    socket.onerror = () => {
      if (ws.current === socket) setWsStatus('desconectado')
    }

    socket.onclose = () => {
      if (ws.current !== socket) return   // fue reemplazado, ignorar
      setWsStatus('desconectado')
      setTimeout(() => {
        if (ws.current === socket || ws.current === null) {
          conectarWebSocket()
        }
      }, 3_000)
    }

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data)

      if (data.type === 'scan_complete') {
        const reg  = data.registro
        const meta = planMap.current[reg.numero_parte]

        const nuevoRegistro: RegistroConMeta = {
          ...reg,
          descripcion: reg.descripcion ?? '',
          usuario: reg.usuario && reg.usuario.trim() !== ''
                    ? reg.usuario
                    : '—',
          meta_plan:   meta            ?? 'N/A',
          faltan:      meta != null
            ? Math.max(0, meta - reg.total_acumulado)
            : 'N/A',
        }

        setRegistros(prev => [nuevoRegistro, ...prev])
        actualizarDashEnTiempoReal(reg, meta)

        if (data.alertas?.length > 0) {
          data.alertas.forEach((a: any) =>
            agregarAlerta({ tipo: a.tipo, motivo: a.motivo })
          )
        }

      } else if (data.type === 'error') {
        agregarAlerta({ tipo: 'ERROR', motivo: data.message })
      }
    }
  }

  // ── Dashboard en tiempo real ──────────────────────────────────────
  const actualizarDashEnTiempoReal = (reg: any, meta?: number) => {
    setDashPorParte(prev => {
      const metaVal = meta ?? reg.meta_plan ?? 0
      const existe  = prev.find(p => p.numero_parte === reg.numero_parte)
      let nueva: typeof prev

      if (existe) {
        nueva = prev.map(p =>
          p.numero_parte === reg.numero_parte
            ? {
                ...p,
                total:      reg.total_acumulado,
                porcentaje: p.meta > 0
                  ? Math.min(100, Math.round((reg.total_acumulado / p.meta) * 100))
                  : 0,
              }
            : p
        )
      } else {
        nueva = [
          ...prev,
          {
            numero_parte: reg.numero_parte,
            total:        reg.total_acumulado,
            meta:         metaVal,
            porcentaje:   metaVal > 0
              ? Math.min(100, Math.round((reg.total_acumulado / metaVal) * 100))
              : 0,
          },
        ]
      }
      return nueva.sort((a, b) => b.total - a.total)
    })
    setDashTotalPiezas(prev => prev + (reg.qty_bolsa || 0))
  }

  // ── Input handlers ────────────────────────────────────────────────
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valor = e.target.value.toUpperCase()
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

    const codigoFinal = codigo.includes('°')
      ? codigo.split('°')[0].trim()
      : codigo

    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(codigoFinal)
    } else {
      agregarAlerta({
        tipo:   'ERROR',
        motivo: 'Sin conexión al servidor. Reconectando...',
      })
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

  // ── Carga de datos ────────────────────────────────────────────────
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
            usuario: reg.usuario && reg.usuario.trim() !== ''
                      ? reg.usuario        // ← muestra "admin", "desconocido", etc.
                      : '—',    
            meta_plan:   meta            ?? 'N/A',
            faltan:      meta != null
              ? Math.max(0, meta - reg.total_acumulado)
              : 'N/A',
          }
        })
      )
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
      const res  = await fetch('/produccion/anomalias/?limite=100')
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

      const acumulado: Record<string, number> = {}
      regs.forEach((r: any) => {
        if (
          !acumulado[r.numero_parte] ||
          r.total_acumulado > acumulado[r.numero_parte]
        ) {
          acumulado[r.numero_parte] = r.total_acumulado
        }
      })

      const planMapLocal: Record<string, number> = {}
      plan.forEach((p: any) => { planMapLocal[p.numero_parte] = p.meta_piezas })

      const porParte = Object.entries(acumulado)
        .map(([parte, total]) => ({
          numero_parte: parte,
          total,
          meta:       planMapLocal[parte] || 0,
          porcentaje: planMapLocal[parte]
            ? Math.min(100, Math.round((total / planMapLocal[parte]) * 100))
            : 0,
        }))
        .sort((a, b) => b.total - a.total)

      setDashPorParte(porParte)
      setDashTotalPiezas(
        regs.reduce((acc: number, r: any) => acc + (r.qty_bolsa || 0), 0)
      )
      setDashLoadedTab(true)
    } catch (e) { console.error('Error dashboard', e) }
  }

  const agregarAlerta = (
    alerta: Omit<{ tipo: string; motivo: string; id: number }, 'id'>
  ) => {
    const id = Date.now()
    setAlertas(prev => [{ ...alerta, id }, ...prev])
    setTimeout(() => {
      setAlertas(prev => prev.filter(a => a.id !== id))
    }, 15_000)
  }

  // ── Config WS badge ───────────────────────────────────────────────
  const wsStatusConfig = {
    conectado:    { label: 'Conectado',    dot: 'bg-green-400',  badge: 'bg-green-900/40  text-green-300  border-green-700'  },
    desconectado: { label: 'Desconectado', dot: 'bg-red-400',    badge: 'bg-red-900/40    text-red-300    border-red-700'    },
    conectando:   { label: 'Conectando…',  dot: 'bg-yellow-400', badge: 'bg-yellow-900/40 text-yellow-300 border-yellow-700' },
  }
  const ws_cfg = wsStatusConfig[wsStatus]

  const tabs = [
    { id: 'captura',       label: '📷 Captura',       roles: ['admin', 'supervisor', 'operador'] },
    { id: 'dashboard',     label: '📊 Dashboard',     roles: ['admin', 'supervisor', 'operador'] },
    { id: 'plan',          label: '📋 Plan Prod.',    roles: ['admin', 'supervisor']             },
    { id: 'prediccion',    label: '🤖 Predicción IA', roles: ['admin', 'supervisor']             },
    { id: 'anomalias',     label: '🚨 Anomalías',     roles: ['admin', 'supervisor']             },
    { id: 'cuarto_secado', label: '🌡️ Cuarto Secado', roles: ['admin', 'supervisor', 'operador'] },
  ].filter(tab => tab.roles.includes(rol ?? ''))

  // ── Loading guard — no renderizar hasta tener token ───────────────
  if (token === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-gray-400 animate-pulse">Cargando sesión...</p>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="p-4 max-w-6xl mx-auto">

      {/* HEADER */}
      <div className="bg-slate-800 text-white p-4 rounded-t-lg flex justify-between items-center shadow">
        <div>
          <h1 className="text-xl font-bold">Control de Producción</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            Turno actual:{' '}
            <span className="font-semibold text-white">{turnoActual}</span>
            <span className="ml-2 text-slate-500 text-xs">{fechaTurno}</span>
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
        {activeTab === 'plan' && (
          <PlanTab planes={planes} onRefresh={cargarPlan} />
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