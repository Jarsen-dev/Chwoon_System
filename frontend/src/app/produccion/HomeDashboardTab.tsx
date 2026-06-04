'use client'

import { useEffect, useState } from 'react'
import { getRegistros, getPlanProduccion } from '@/lib/api'

// ── Tipos ────────────────────────────────────────────────────────
interface ProduccionPorParte {
  numero_parte: string
  descripcion:  string
  total:        number
  meta:         number
  porcentaje:   number
}

interface AlertaReciente {
  id: number; fecha: string; hora: string
  numero_parte: string; motivo: string; tipo: string
}

interface ReporteTurno {
  fecha: string; turno: string; escaneos: number; piezas: number
  partes_unicas: number; maquinas: number; primer_escaneo: string
  ultimo_escaneo: string; secado_total: number; secado_salidos: number
}

interface Props {
  token: string | null
  rol:   string | null
}

// ── Helpers ──────────────────────────────────────────────────────
const API_URL = process.env.NEXT_PUBLIC_API_URL || ''

function obtenerTurno(): 'DÍA' | 'NOCHE' {
  const h = new Date().getHours()
  return h >= 7 && h < 19 ? 'DÍA' : 'NOCHE'
}

function formatearFecha(): string {
  return new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  })
}

function formatearFechaCorta(fecha: string): string {
  try { const [y,m,d] = fecha.split('-'); return `${d}/${m}/${y}` }
  catch { return fecha }
}

function calcularPorcentaje(prod: number, meta: number): number {
  if (!meta || meta === 0) return 0
  return Math.min(100, Math.round((prod / meta) * 100))
}

function getBarColor(pct: number): string {
  if (pct >= 90) return 'bg-emerald-500'
  if (pct >= 60) return 'bg-blue-500'
  if (pct >= 30) return 'bg-yellow-500'
  return 'bg-red-500'
}

function getTipoBadge(tipo: string): string {
  switch (tipo) {
    case 'FRAUDE':        return 'bg-red-500/20 text-red-300 border-red-500/40'
    case 'MANTENIMIENTO': return 'bg-orange-500/20 text-orange-300 border-orange-500/40'
    case 'LENTITUD_PLAN': return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40'
    default:              return 'bg-gray-800 text-gray-300 border-gray-600'
  }
}

// ── Componente ───────────────────────────────────────────────────
export default function HomeDashboardTab({ token, rol }: Props) {
  const [loading, setLoading] = useState(true)
  const [produccionPorParte, setProduccionPorParte] = useState<ProduccionPorParte[]>([])
  const [alertasRecientes, setAlertasRecientes]     = useState<AlertaReciente[]>([])
  const [planData, setPlanData]                     = useState<any[]>([])
  const [totalPiezas, setTotalPiezas]               = useState(0)
  const [maquinasActivas, setMaquinasActivas]       = useState(0)
  const [totalAlertas, setTotalAlertas]             = useState(0)
  const [porcentajePlan, setPorcentajePlan]         = useState(0)
  const [ultimaActualizacion, setUltimaActualizacion] = useState('')

  const [reportes, setReportes]                     = useState<ReporteTurno[]>([])
  const [loadingReportes, setLoadingReportes]       = useState(false)
  const [showReportes, setShowReportes]             = useState(false)
  const [descargandoExcel, setDescargandoExcel]     = useState<string|null>(null)

  const turno   = obtenerTurno()
  const fechaHoy = new Date().toISOString().split('T')[0]

  useEffect(() => {
    cargarDatos()
    const interval = setInterval(cargarDatos, 30_000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cargarDatos = async () => {
    try {
      const [registros, plan, anomalias] = await Promise.all([
        getRegistros(fechaHoy),
        getPlanProduccion(),
        fetch(`${API_URL}/produccion/anomalias/?limite=10`).then(r => r.json()).catch(() => [])
      ])

      const totalPzs = registros.reduce((acc: number, r: any) => acc + (r.qty_bolsa || 0), 0)
      setTotalPiezas(totalPzs)

      const maqSet = new Set(registros.map((r: any) => r.maquina).filter(Boolean))
      setMaquinasActivas(maqSet.size)

      const alertasHoy = Array.isArray(anomalias) ? anomalias.filter((a: any) => a.fecha === fechaHoy) : []
      setTotalAlertas(alertasHoy.length)
      setAlertasRecientes(alertasHoy.slice(0, 6))

      const acumulado: Record<string, number> = {}
      registros.forEach((r: any) => {
        if (!acumulado[r.numero_parte] || r.total_acumulado > acumulado[r.numero_parte])
          acumulado[r.numero_parte] = r.total_acumulado
      })

      const planMapLocal: Record<string, {meta:number;desc:string}> = {}
      plan.forEach((p: any) => { planMapLocal[p.numero_parte] = { meta: p.meta_piezas, desc: p.descripcion || '' } })

      const porParteArr: ProduccionPorParte[] = Object.entries(acumulado)
        .map(([parte, total]) => ({
          numero_parte: parte,
          descripcion:  planMapLocal[parte]?.desc || '',
          total,
          meta:         planMapLocal[parte]?.meta || 0,
          porcentaje:   calcularPorcentaje(total, planMapLocal[parte]?.meta || 0)
        }))
        .sort((a, b) => b.total - a.total)

      setProduccionPorParte(porParteArr)

      if (plan.length > 0) {
        const completadas = porParteArr.filter(p => p.porcentaje >= 100).length
        setPorcentajePlan(Math.round((completadas / plan.length) * 100))
      }

      setPlanData(
        plan.map((p: any) => ({
          ...p,
          producido:  acumulado[p.numero_parte] || 0,
          porcentaje: calcularPorcentaje(acumulado[p.numero_parte] || 0, p.meta_piezas)
        }))
      )

      setUltimaActualizacion(new Date().toLocaleTimeString('es-MX'))
    } catch (error) {
      console.error('Error cargando dashboard:', error)
    } finally {
      setLoading(false)
    }
  }

  const cargarReportes = async () => {
    if (!token) return
    try {
      setLoadingReportes(true)
      const res = await fetch('/api/admin/reportes-turnos?limite=30', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) { setReportes(await res.json()); setShowReportes(true) }
    } catch (e) { console.error('Error cargando reportes:', e) }
    finally { setLoadingReportes(false) }
  }

  const descargarExcelTurno = async (fecha: string, turnoExcel: string) => {
    const key = `${fecha}_${turnoExcel}`
    setDescargandoExcel(key)
    try {
      const url = `/produccion/registros/excel?fecha=${fecha}&turno=${turnoExcel}&t=${Date.now()}`
      const response = await fetch(url, { method: 'GET' })
      const ct = response.headers.get('content-type') ?? ''
      if (!response.ok || !ct.includes('spreadsheetml')) { console.error('Error descargando Excel'); return }
      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = blobUrl; link.download = `produccion_${fecha}_${turnoExcel}.xlsx`
      document.body.appendChild(link); link.click(); link.remove()
      window.URL.revokeObjectURL(blobUrl)
    } catch (e) { console.error('Error:', e) }
    finally { setDescargandoExcel(null) }
  }

  const esAdmin = rol === 'admin' || rol === 'supervisor'

  const metricas = [
    { label: 'Total Piezas Hoy', value: totalPiezas.toLocaleString(), sub: `Turno ${turno}`, icon: '📦', color: 'bg-blue-500/10', border: 'border-blue-500' },
    { label: 'Máquinas Activas', value: maquinasActivas, sub: 'Con producción hoy', icon: '⚙️', color: 'bg-emerald-500/10', border: 'border-emerald-500' },
    { label: 'Alertas Detectadas', value: totalAlertas, sub: 'Hoy por IA', icon: '🚨',
      color: totalAlertas > 0 ? 'bg-red-500/10' : 'bg-gray-800', border: totalAlertas > 0 ? 'border-red-500' : 'border-gray-600' },
    { label: 'Plan Completado', value: `${porcentajePlan}%`, sub: `${planData.filter(p => p.porcentaje >= 100).length} de ${planData.length} partes`, icon: '📋',
      color: porcentajePlan >= 80 ? 'bg-emerald-500/10' : 'bg-yellow-500/10', border: porcentajePlan >= 80 ? 'border-emerald-500' : 'border-yellow-500' },
  ]

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-400 font-medium">Cargando dashboard...</p>
      </div>
    </div>
  )

  return (
    <div>
      {/* ═══ SUBHEADER ═══ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Panel de Control</h2>
          <p className="text-sm text-gray-400 capitalize">{formatearFecha()}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 text-sm">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            Actualizado: {ultimaActualizacion}
          </div>
          <button onClick={cargarDatos}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition flex items-center gap-2">
            🔄 Refrescar
          </button>
          {esAdmin && (
            <button
              onClick={() => showReportes ? setShowReportes(false) : cargarReportes()}
              disabled={loadingReportes}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
                showReportes ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-gray-700 hover:bg-gray-300 text-gray-300'
              }`}
            >
              {loadingReportes ? (
                <><span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" /> Cargando...</>
              ) : showReportes ? '✖ Cerrar Reportes' : '📈 Reportes por Turno'}
            </button>
          )}
        </div>
      </div>

      {/* ═══ REPORTES ═══ */}
      {showReportes && (
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-700 overflow-hidden mb-6">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between bg-gradient-to-r from-purple-500/10 to-gray-900">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">📈 Reportes por Turno</h3>
              <p className="text-xs text-gray-400 mt-0.5">Historial — últimos {reportes.length} turnos</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={cargarReportes} disabled={loadingReportes}
                className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 px-3 py-1.5 rounded-lg transition-colors">
                {loadingReportes ? '⏳' : '🔄'} Actualizar
              </button>
              <button onClick={() => setShowReportes(false)}
                className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-400 px-3 py-1.5 rounded-lg transition-colors">
                ✖ Cerrar
              </button>
            </div>
          </div>

          {reportes.length === 0 ? (
            <div className="p-12 text-center">
              <span className="text-4xl block mb-2">📊</span>
              <p className="text-gray-400">No hay datos de turnos anteriores.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-800 border-b border-gray-800">
                    {['Fecha','Turno','Escaneos','Piezas','Partes','Máquinas','Primer Escaneo','Último Escaneo','Secado','Acciones'].map(col => (
                      <th key={col} className="p-3 text-center font-semibold text-gray-300">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportes.map((r, idx) => {
                    const esHoy = r.fecha === fechaHoy
                    const key   = `${r.fecha}_${r.turno}`
                    return (
                      <tr key={idx} className={`border-b border-gray-800 transition ${esHoy ? 'bg-blue-500/10' : 'hover:bg-gray-800'}`}>
                        <td className="p-3">
                          <div className="flex items-center gap-2">
                            {esHoy && <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />}
                            <span className={`font-mono text-sm ${esHoy ? 'font-bold text-blue-400' : 'text-gray-200'}`}>
                              {formatearFechaCorta(r.fecha)}
                            </span>
                            {esHoy && <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded font-medium">Hoy</span>}
                          </div>
                        </td>
                        <td className="p-3 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                            r.turno === 'DIA' ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                          }`}>{r.turno === 'DIA' ? '☀️' : '🌙'} {r.turno}</span>
                        </td>
                        <td className="p-3 text-center font-bold text-gray-200">{r.escaneos.toLocaleString()}</td>
                        <td className="p-3 text-center font-bold text-blue-400 text-base">{r.piezas.toLocaleString()}</td>
                        <td className="p-3 text-center"><span className="bg-gray-800 text-gray-300 px-2 py-0.5 rounded-full text-xs font-semibold">{r.partes_unicas}</span></td>
                        <td className="p-3 text-center"><span className="bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full text-xs font-semibold">{r.maquinas}</span></td>
                        <td className="p-3 text-center font-mono text-xs text-gray-400">{r.primer_escaneo || '—'}</td>
                        <td className="p-3 text-center font-mono text-xs text-gray-400">{r.ultimo_escaneo || '—'}</td>
                        <td className="p-3 text-center">
                          {r.secado_total > 0
                            ? <span className="text-xs text-orange-400 font-semibold">🌡️ {r.secado_salidos}/{r.secado_total}</span>
                            : <span className="text-xs text-gray-300">—</span>}
                        </td>
                        <td className="p-3 text-center">
                          <button onClick={() => descargarExcelTurno(r.fecha, r.turno)} disabled={descargandoExcel === key}
                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-400 ${
                              descargandoExcel === key ? 'bg-gray-400 text-white cursor-not-allowed' : 'bg-green-600 hover:bg-green-700 active:scale-95 text-white'
                            }`}>
                            {descargandoExcel === key ? (
                              <>
                                <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                                </svg>
                                ...
                              </>
                            ) : (
                              <>
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6M4 20h16a1 1 0 001-1V5 a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"/>
                                </svg>
                                Excel
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {reportes.length > 0 && (
            <div className="px-5 py-3 bg-gray-800 border-t border-gray-800 flex items-center justify-between text-xs text-gray-400">
              <span>Total: <strong className="text-gray-300">{reportes.reduce((a,r) => a + r.piezas, 0).toLocaleString()}</strong> piezas en <strong className="text-gray-300">{reportes.length}</strong> turnos</span>
              <span>Promedio: <strong className="text-gray-300">{Math.round(reportes.reduce((a,r) => a + r.piezas, 0) / reportes.length).toLocaleString()}</strong> piezas/turno</span>
            </div>
          )}
        </div>
      )}

      {/* ═══ TARJETAS ═══ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {metricas.map((m, i) => (
          <div key={i} className={`bg-gray-900 rounded-lg border-l-4 ${m.border} shadow-sm p-5 flex items-center gap-4`}>
            <div className={`w-12 h-12 rounded-lg ${m.color} flex items-center justify-center text-2xl flex-shrink-0`}>
              {m.icon}
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{m.label}</p>
              <p className="text-3xl font-bold text-white leading-tight">{m.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{m.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ═══ PRODUCCIÓN + ALERTAS ═══ */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        {/* Producción por parte */}
        <div className="xl:col-span-2 bg-gray-900 rounded-xl shadow-sm border border-gray-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">📊 Producción por Número de Parte</h3>
              <p className="text-xs text-gray-400 mt-0.5">Acumulado del turno actual</p>
            </div>
            <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/30 px-2.5 py-1 rounded-full font-semibold">
              {produccionPorParte.length} partes
            </span>
          </div>
          <div className="p-5 space-y-3 max-h-80 overflow-y-auto">
            {produccionPorParte.length === 0 ? (
              <div className="py-12 text-center">
                <span className="text-4xl block mb-2">📦</span>
                <p className="text-gray-400">Sin producción registrada hoy.</p>
              </div>
            ) : (
              produccionPorParte.map((item, idx) => (
                <div key={idx}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-gray-400 w-5 text-right flex-shrink-0">{idx+1}</span>
                      <div className="min-w-0">
                        <span className="font-mono font-bold text-white text-sm">{item.numero_parte}</span>
                        {item.descripcion && <span className="text-gray-400 text-xs ml-2 truncate hidden sm:inline">{item.descripcion}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                      <span className="text-gray-200 font-bold text-sm">{item.total.toLocaleString()}</span>
                      {item.meta > 0 && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          item.porcentaje >= 100 ? 'bg-emerald-500/20 text-emerald-400' : item.porcentaje >= 60 ? 'bg-blue-500/20 text-blue-400' : 'bg-yellow-500/20 text-yellow-400'
                        }`}>{item.porcentaje}%</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-5 flex-shrink-0" />
                    <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
                      <div className={`h-2 rounded-full transition-all duration-500 ${getBarColor(item.porcentaje)}`}
                        style={{ width: `${item.meta > 0 ? item.porcentaje : 100}%` }} />
                    </div>
                    {item.meta > 0 && <span className="text-xs text-gray-400 w-16 text-right flex-shrink-0">/ {item.meta.toLocaleString()}</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Alertas */}
        <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-700 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-white">🚨 Alertas IA</h3>
              <p className="text-xs text-gray-400 mt-0.5">Detecciones de hoy</p>
            </div>
            {totalAlertas > 0 && (
              <span className="text-xs bg-red-500/10 text-red-400 border border-red-500/30 px-2.5 py-1 rounded-full font-bold">
                {totalAlertas} alerta{totalAlertas !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <div className="p-4 space-y-2 max-h-80 overflow-y-auto">
            {alertasRecientes.length === 0 ? (
              <div className="py-12 text-center">
                <span className="text-4xl block mb-2">✅</span>
                <p className="text-gray-400 text-sm">Sin alertas detectadas hoy.</p>
              </div>
            ) : (
              alertasRecientes.map((alerta, idx) => (
                <div key={idx} className="p-3 rounded-lg border bg-gray-800 hover:bg-gray-800 transition">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${getTipoBadge(alerta.tipo)}`}>
                      {alerta.tipo}
                    </span>
                    <span className="text-xs text-gray-400 font-mono ml-auto">{alerta.hora}</span>
                  </div>
                  <p className="text-xs font-semibold text-gray-200 font-mono">{alerta.numero_parte}</p>
                  <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{alerta.motivo}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ═══ TABLA PLAN ═══ */}
      <div className="bg-gray-900 rounded-xl shadow-sm border border-gray-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">📋 Estado del Plan de Producción</h3>
            <p className="text-xs text-gray-400 mt-0.5">Avance por número de parte</p>
          </div>
          {planData.length > 0 && (
            <span className="text-xs bg-gray-800 text-gray-300 border border-gray-600 px-2.5 py-1 rounded-full font-semibold">
              {planData.length} parte{planData.length !== 1 ? 's' : ''} en plan
            </span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800 border-b border-gray-800">
                {['#','No. de Parte','Proceso','Turno','Meta','Producido','Faltan','Progreso','Estado'].map(col => (
                  <th key={col} className={`p-3 font-semibold text-gray-300 ${col === 'No. de Parte' || col === 'Progreso' ? 'text-left' : 'text-center'}`}>{col}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {planData.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-12 text-center">
                    <span className="text-4xl block mb-2">📋</span>
                    <p className="text-gray-400">No hay plan de producción activo.</p>
                  </td>
                </tr>
              ) : (
                planData.map((p: any, idx: number) => {
                  const faltan = Math.max(0, p.meta_piezas - p.producido)
                  return (
                    <tr key={idx} className="border-b border-gray-800 hover:bg-gray-800 transition">
                      <td className="p-3 text-center text-gray-400 text-xs font-medium">{idx+1}</td>
                      <td className="p-3"><span className="font-mono font-bold text-white text-sm">{p.numero_parte}</span></td>
                      <td className="p-3 text-center">
                        <span className="font-bold text-gray-200 uppercase">{p.proceso || '—'}</span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          p.turno_objetivo === 'Día' ? 'bg-yellow-500/20 text-yellow-300' : 'bg-indigo-500/20 text-indigo-300'
                        }`}>{p.turno_objetivo}</span>
                      </td>
                      <td className="p-3 text-center font-semibold text-gray-200">{p.meta_piezas.toLocaleString()}</td>
                      <td className="p-3 text-center font-bold text-blue-400">{p.producido.toLocaleString()}</td>
                      <td className={`p-3 text-center font-semibold ${faltan === 0 ? 'text-emerald-400' : 'text-orange-500'}`}>
                        {faltan === 0 ? '—' : faltan.toLocaleString()}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-800 rounded-full h-2 overflow-hidden">
                            <div className={`h-2 rounded-full transition-all duration-500 ${getBarColor(p.porcentaje)}`}
                              style={{ width: `${p.porcentaje}%` }} />
                          </div>
                          <span className="text-xs font-bold text-gray-400 w-9 text-right">{p.porcentaje}%</span>
                        </div>
                      </td>
                      <td className="p-3 text-center">
                        {p.porcentaje >= 100 ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">✅ Completo</span>
                        ) : p.producido > 0 ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">🔄 En Proceso</span>
                        ) : (
                                                    <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-800 text-gray-400 border border-gray-700">⏸️ En Cola</span>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ═══ FOOTER ═══ */}
      <div className="mt-6 text-center text-xs text-gray-400">
        Sistema de Control de Producción — Datos en tiempo real · Auto-refresco cada 30 seg
      </div>
    </div>
  )
}