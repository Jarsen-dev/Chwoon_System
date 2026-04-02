'use client'

import { useEffect, useState } from 'react'
import { getRegistros, getPlanProduccion, getInventario } from '@/lib/api'

// ==========================================
// TIPOS
// ==========================================
interface MetricaCard {
  label: string
  value: string | number
  sub: string
  icon: string
  color: string
  border: string
}

interface ProduccionPorParte {
  numero_parte: string
  descripcion: string
  total: number
  meta: number
  porcentaje: number
}

interface AlertaReciente {
  id: number
  fecha: string
  hora: string
  numero_parte: string
  motivo: string
  tipo: string
}

// ==========================================
// HELPERS
// ==========================================
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function obtenerTurno(): 'DÍA' | 'NOCHE' {
  const h = new Date().getHours()
  return h >= 7 && h < 19 ? 'DÍA' : 'NOCHE'
}

function formatearFecha(): string {
  return new Date().toLocaleDateString('es-MX', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
}

function calcularPorcentaje(producido: number, meta: number): number {
  if (!meta || meta === 0) return 0
  return Math.min(100, Math.round((producido / meta) * 100))
}

function getBarColor(pct: number): string {
  if (pct >= 90) return 'bg-emerald-500'
  if (pct >= 60) return 'bg-blue-500'
  if (pct >= 30) return 'bg-yellow-500'
  return 'bg-red-500'
}

function getTipoBadge(tipo: string): string {
  switch (tipo) {
    case 'FRAUDE':        return 'bg-red-100    text-red-800    border-red-300'
    case 'MANTENIMIENTO': return 'bg-orange-100 text-orange-800 border-orange-300'
    case 'LENTITUD_PLAN': return 'bg-yellow-100 text-yellow-800 border-yellow-300'
    default:              return 'bg-gray-100   text-gray-700   border-gray-300'
  }
}

// ==========================================
// COMPONENTE: TARJETA DE MÉTRICA
// ==========================================
function MetricCard({ label, value, sub, icon, color, border }: MetricaCard) {
  return (
    <div className={`bg-white rounded-lg border-l-4 ${border} shadow-sm p-5 flex items-center gap-4`}>
      <div className={`w-12 h-12 rounded-lg ${color} flex items-center justify-center text-2xl flex-shrink-0`}>
        {icon}
      </div>
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{label}</p>
        <p className="text-3xl font-bold text-slate-800 leading-tight">{value}</p>
        <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
      </div>
    </div>
  )
}

// ==========================================
// PÁGINA PRINCIPAL
// ==========================================
export default function DashboardPage() {
  const [loading, setLoading]                       = useState(true)
  const [produccionPorParte, setProduccionPorParte] = useState<ProduccionPorParte[]>([])
  const [alertasRecientes, setAlertasRecientes]     = useState<AlertaReciente[]>([])
  const [planData, setPlanData]                     = useState<any[]>([])
  const [totalPiezas, setTotalPiezas]               = useState(0)
  const [maquinasActivas, setMaquinasActivas]       = useState(0)
  const [totalAlertas, setTotalAlertas]             = useState(0)
  const [porcentajePlan, setPorcentajePlan]         = useState(0)
  const [ultimaActualizacion, setUltimaActualizacion] = useState('')

  const turno     = obtenerTurno()
  const fechaHoy  = new Date().toISOString().split('T')[0]

  useEffect(() => {
    cargarDatos()
    // Refrescar cada 30 segundos
    const interval = setInterval(cargarDatos, 30_000)
    return () => clearInterval(interval)
  }, [])

  const cargarDatos = async () => {
    try {
      const [registros, plan, anomalias] = await Promise.all([
        getRegistros(fechaHoy),
        getPlanProduccion(),
        fetch(`${API_URL}/produccion/anomalias/?limite=10`).then(r => r.json()).catch(() => [])
      ])

      // ── Métricas generales ──
      const totalPzs = registros.reduce((acc: number, r: any) => acc + (r.qty_bolsa || 0), 0)
      setTotalPiezas(totalPzs)

      const maqSet = new Set(registros.map((r: any) => r.maquina).filter(Boolean))
      setMaquinasActivas(maqSet.size)

      const alertasHoy = Array.isArray(anomalias)
        ? anomalias.filter((a: any) => a.fecha === fechaHoy)
        : []
      setTotalAlertas(alertasHoy.length)
      setAlertasRecientes(alertasHoy.slice(0, 6))

      // ── Producción por parte ──
      const acumulado: Record<string, number> = {}
      registros.forEach((r: any) => {
        if (!acumulado[r.numero_parte] || r.total_acumulado > acumulado[r.numero_parte]) {
          acumulado[r.numero_parte] = r.total_acumulado
        }
      })

      const planMap: Record<string, { meta: number, desc: string }> = {}
      plan.forEach((p: any) => {
        planMap[p.numero_parte] = { meta: p.meta_piezas, desc: p.descripcion || '' }
      })

      const porParteArr: ProduccionPorParte[] = Object.entries(acumulado)
        .map(([parte, total]) => ({
          numero_parte: parte,
          descripcion:  planMap[parte]?.desc || '',
          total,
          meta:         planMap[parte]?.meta || 0,
          porcentaje:   calcularPorcentaje(total, planMap[parte]?.meta || 0)
        }))
        .sort((a, b) => b.total - a.total)

      setProduccionPorParte(porParteArr)

      // ── % Plan completado global ──
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

  // ── Tarjetas ──
  const metricas: MetricaCard[] = [
    {
      label:  'Total Piezas Hoy',
      value:  totalPiezas.toLocaleString(),
      sub:    `Turno ${turno}`,
      icon:   '📦',
      color:  'bg-blue-50',
      border: 'border-blue-500',
    },
    {
      label:  'Máquinas Activas',
      value:  maquinasActivas,
      sub:    'Con producción hoy',
      icon:   '⚙️',
      color:  'bg-emerald-50',
      border: 'border-emerald-500',
    },
    {
      label:  'Alertas Detectadas',
      value:  totalAlertas,
      sub:    'Hoy por IA',
      icon:   '🚨',
      color:  totalAlertas > 0 ? 'bg-red-50'    : 'bg-gray-50',
      border: totalAlertas > 0 ? 'border-red-500' : 'border-gray-300',
    },
    {
      label:  'Plan Completado',
      value:  `${porcentajePlan}%`,
      sub:    `${planData.filter(p => p.porcentaje >= 100).length} de ${planData.length} partes`,
      icon:   '📋',
      color:  porcentajePlan >= 80 ? 'bg-emerald-50' : 'bg-yellow-50',
      border: porcentajePlan >= 80 ? 'border-emerald-500' : 'border-yellow-500',
    },
  ]

  if (loading) return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500 font-medium">Cargando dashboard...</p>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-100 p-6">

      {/* ======================================================= */}
      {/* HEADER                                                   */}
      {/* ======================================================= */}
      <div className="bg-slate-900 rounded-xl px-6 py-5 mb-6 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-lg">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-2 h-8 bg-blue-500 rounded-full" />
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Panel de Control de Producción
            </h1>
          </div>
          <p className="text-slate-400 text-sm ml-5 capitalize">{formatearFecha()}</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Badge turno */}
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border font-semibold text-sm ${
            turno === 'DÍA'
              ? 'bg-yellow-500/10 border-yellow-500/40 text-yellow-400'
              : 'bg-indigo-500/10 border-indigo-500/40 text-indigo-400'
          }`}>
            <span>{turno === 'DÍA' ? '☀️' : '🌙'}</span>
            <span>TURNO {turno}</span>
          </div>

          {/* Última actualización */}
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 text-sm">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
            <span>Actualizado: {ultimaActualizacion}</span>
          </div>

          {/* Botón refrescar */}
          <button
            onClick={cargarDatos}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition flex items-center gap-2"
          >
            🔄 Refrescar
          </button>
        </div>
      </div>

      {/* ======================================================= */}
      {/* TARJETAS DE MÉTRICAS                                     */}
      {/* ======================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {metricas.map((m, i) => (
          <MetricCard key={i} {...m} />
        ))}
      </div>

      {/* ======================================================= */}
      {/* FILA CENTRAL: GRÁFICA + ALERTAS                         */}
      {/* ======================================================= */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">

        {/* ── Producción por parte (2/3) ── */}
        <div className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-800">
                📊 Producción por Número de Parte
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">Acumulado del turno actual</p>
            </div>
            <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full font-semibold">
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
                  {/* Fila de datos */}
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs font-bold text-gray-400 w-5 text-right flex-shrink-0">
                        {idx + 1}
                      </span>
                      <div className="min-w-0">
                        <span className="font-mono font-bold text-slate-800 text-sm">
                          {item.numero_parte}
                        </span>
                        {item.descripcion && (
                          <span className="text-gray-400 text-xs ml-2 truncate hidden sm:inline">
                            {item.descripcion}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                      <span className="text-slate-700 font-bold text-sm">
                        {item.total.toLocaleString()}
                      </span>
                      {item.meta > 0 && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          item.porcentaje >= 100
                            ? 'bg-emerald-100 text-emerald-700'
                            : item.porcentaje >= 60
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {item.porcentaje}%
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Barra de progreso */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-5 flex-shrink-0" />
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${getBarColor(item.porcentaje)}`}
                        style={{ width: `${item.meta > 0 ? item.porcentaje : 100}%` }}
                      />
                    </div>
                    {item.meta > 0 && (
                      <span className="text-xs text-gray-400 w-16 text-right flex-shrink-0">
                        / {item.meta.toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Alertas recientes (1/3) ── */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-800">🚨 Alertas IA</h2>
              <p className="text-xs text-gray-400 mt-0.5">Detecciones de hoy</p>
            </div>
            {totalAlertas > 0 && (
              <span className="text-xs bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 rounded-full font-bold">
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
                <div
                  key={idx}
                  className="p-3 rounded-lg border bg-gray-50 hover:bg-gray-100 transition"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${getTipoBadge(alerta.tipo)}`}>
                      {alerta.tipo}
                    </span>
                    <span className="text-xs text-gray-400 font-mono ml-auto">
                      {alerta.hora}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-700 font-mono">
                    {alerta.numero_parte}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                    {alerta.motivo}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ======================================================= */}
      {/* TABLA DE ESTADO DEL PLAN                                 */}
      {/* ======================================================= */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-800">📋 Estado del Plan de Producción</h2>
            <p className="text-xs text-gray-400 mt-0.5">Avance por número de parte</p>
          </div>
          {planData.length > 0 && (
            <span className="text-xs bg-slate-100 text-slate-600 border border-slate-200 px-2.5 py-1 rounded-full font-semibold">
              {planData.length} parte{planData.length !== 1 ? 's' : ''} en plan
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-gray-100">
                <th className="p-3 text-left   font-semibold text-slate-600">#</th>
                <th className="p-3 text-left   font-semibold text-slate-600">N° Parte</th>
                <th className="p-3 text-center font-semibold text-slate-600">Turno</th>
                <th className="p-3 text-center font-semibold text-slate-600">Meta</th>
                <th className="p-3 text-center font-semibold text-slate-600">Producido</th>
                <th className="p-3 text-center font-semibold text-slate-600">Faltan</th>
                <th className="p-3 text-left   font-semibold text-slate-600 min-w-[160px]">Progreso</th>
                <th className="p-3 text-center font-semibold text-slate-600">Estado</th>
              </tr>
            </thead>
            <tbody>
              {planData.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-12 text-center">
                    <span className="text-4xl block mb-2">📋</span>
                    <p className="text-gray-400">
                      No hay plan de producción activo.
                    </p>
                  </td>
                </tr>
              ) : (
                planData.map((p, idx) => {
                  const faltan = Math.max(0, p.meta_piezas - p.producido)
                  return (
                    <tr
                      key={idx}
                      className="border-b border-gray-50 hover:bg-gray-50 transition"
                    >
                      {/* # */}
                      <td className="p-3 text-gray-400 text-xs font-medium">{idx + 1}</td>

                      {/* N° Parte */}
                      <td className="p-3">
                        <span className="font-mono font-bold text-slate-800 text-sm">
                          {p.numero_parte}
                        </span>
                      </td>

                      {/* Turno */}
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          p.turno_objetivo === 'Día'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}>
                          {p.turno_objetivo}
                        </span>
                      </td>

                      {/* Meta */}
                      <td className="p-3 text-center font-semibold text-slate-700">
                        {p.meta_piezas.toLocaleString()}
                      </td>

                      {/* Producido */}
                      <td className="p-3 text-center font-bold text-blue-700">
                        {p.producido.toLocaleString()}
                      </td>

                      {/* Faltan */}
                      <td className={`p-3 text-center font-semibold ${
                        faltan === 0
                          ? 'text-emerald-600'
                          : 'text-orange-500'
                      }`}>
                        {faltan === 0 ? '—' : faltan.toLocaleString()}
                      </td>

                      {/* Barra de progreso */}
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-2 rounded-full transition-all duration-500 ${getBarColor(p.porcentaje)}`}
                              style={{ width: `${p.porcentaje}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-gray-500 w-9 text-right">
                            {p.porcentaje}%
                          </span>
                        </div>
                      </td>

                      {/* Estado */}
                      <td className="p-3 text-center">
                        {p.porcentaje >= 100 ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                            ✅ Completo
                          </span>
                        ) : p.producido > 0 ? (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-700 border border-blue-200">
                            🔄 En Proceso
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-gray-100 text-gray-600 border border-gray-200">
                            ⏸️ En Cola
                          </span>
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

      {/* ======================================================= */}
      {/* FOOTER                                                   */}
      {/* ======================================================= */}
      <div className="mt-6 text-center text-xs text-gray-400">
        Sistema de Control de Producción — Datos en tiempo real · Auto-refresco cada 30 seg
      </div>

    </div>
  )
}