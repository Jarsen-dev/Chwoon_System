'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getDashboardInyeccion } from '@/lib/api'
import { toPng } from 'html-to-image'
import jsPDF from 'jspdf'
import {
  ResponsiveContainer,
  LineChart, Line, AreaChart, Area,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, PieChart, Pie, Cell,
  ComposedChart, ReferenceLine,
} from 'recharts'

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16', '#ec4899', '#14b8a6']

function formatNumber(n: number): string {
  if (!n && n !== 0) return '—'
  return n.toLocaleString('es-MX')
}

function startOfMonth(): string {
  const d = new Date()
  d.setDate(1)
  return d.toISOString().slice(0, 10)
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function KpiCard({ title, value, sub, color = 'bg-white' }: { title: string; value: string; sub?: string; color?: string }) {
  return (
    <div className={`${color} rounded-xl border border-gray-200 p-4 shadow-sm`}>
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{title}</p>
      <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function GaugeChart({ value, label }: { value: number; label: string }) {
  const pct = Math.min(100, Math.max(0, value))
  const color = pct >= 100 ? '#10b981' : pct >= 80 ? '#f59e0b' : '#ef4444'
  const r = 80
  const stroke = 12
  const circ = 2 * Math.PI * r
  const dash = (pct / 100) * circ
  return (
    <div className="flex flex-col items-center justify-center">
      <svg width={200} height={120} viewBox="0 0 200 120">
        <defs>
          <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={color} />
          </linearGradient>
        </defs>
        <path d={`M 20 100 A ${r} ${r} 0 0 1 180 100`} fill="none" stroke="#e5e7eb" strokeWidth={stroke} strokeLinecap="round" />
        <path d={`M 20 100 A ${r} ${r} 0 0 1 180 100`} fill="none" stroke="url(#gaugeGrad)" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`} strokeDashoffset={0} />
        <text x="100" y="95" textAnchor="middle" fontSize="22" fontWeight="bold" fill="#1f2937">{pct.toFixed(1)}%</text>
      </svg>
      <p className="text-sm font-medium text-gray-600 -mt-2">{label}</p>
    </div>
  )
}

function ParetoChart({ data, xKey, yKey, title }: { data: any[]; xKey: string; yKey: string; title: string }) {
  const sorted = useMemo(() => {
    const s = [...data].sort((a, b) => b[yKey] - a[yKey])
    let acc = 0
    const total = s.reduce((sum, d) => sum + (d[yKey] || 0), 0)
    return s.map(d => {
      acc += d[yKey] || 0
      return { ...d, acumulado: total > 0 ? (acc / total) * 100 : 0 }
    })
  }, [data, yKey])

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h4 className="text-sm font-semibold text-gray-700 mb-3">{title}</h4>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={sorted} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis dataKey={xKey} angle={-30} textAnchor="end" height={60} tick={{ fontSize: 11 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="right" orientation="right" unit="%" tick={{ fontSize: 11 }} domain={[0, 100]} />
          <Tooltip formatter={(v: any, n: any) => n === 'acumulado' ? [`${Number(v).toFixed(1)}%`, 'Acumulado'] : [v, n]} />
          <Legend />
          <Bar yAxisId="left" dataKey={yKey} name="Cantidad" fill="#6366f1" radius={[4, 4, 0, 0]} />
          <Line yAxisId="right" type="monotone" dataKey="acumulado" name="Acumulado %" stroke="#ef4444" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}

export default function DashboardInyeccionTab() {
  const { token } = useAuth()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>(null)
  const dashboardRef = useRef<HTMLDivElement>(null)

  const [groupBy, setGroupBy] = useState<'day' | 'week' | 'month'>('day')
  const [fechaDesde, setFechaDesde] = useState(startOfMonth)
  const [fechaHasta, setFechaHasta] = useState(today)
  const [filtroTurno, setFiltroTurno] = useState('')
  const [filtroParte, setFiltroParte] = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroMaquina, setFiltroMaquina] = useState('')

  const cargar = async () => {
    if (!token) return
    setLoading(true)
    try {
      const res = await getDashboardInyeccion(token, {
        group_by: groupBy,
        fecha_desde: fechaDesde,
        fecha_hasta: fechaHasta,
        turno: filtroTurno,
        numero_parte: filtroParte,
        cliente: filtroCliente,
        maquina: filtroMaquina,
      })
      setData(res)
    } catch (e: any) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [token, groupBy, fechaDesde, fechaHasta, filtroTurno, filtroParte, filtroCliente, filtroMaquina])

  const setRango = (tipo: string) => {
    const hoy = new Date()
    const y = hoy.getFullYear()
    const m = hoy.getMonth()
    const d = hoy.getDate()
    if (tipo === 'hoy') {
      setFechaDesde(hoy.toISOString().slice(0, 10))
      setFechaHasta(hoy.toISOString().slice(0, 10))
    } else if (tipo === 'semana') {
      const inicio = new Date(hoy); inicio.setDate(d - inicio.getDay())
      setFechaDesde(inicio.toISOString().slice(0, 10))
      setFechaHasta(hoy.toISOString().slice(0, 10))
    } else if (tipo === 'mes') {
      setFechaDesde(new Date(y, m, 1).toISOString().slice(0, 10))
      setFechaHasta(hoy.toISOString().slice(0, 10))
    }
  }

  const exportarPDF = async () => {
    if (!dashboardRef.current) return
    try {
      // html-to-image soporta colores modernos (lab, oklch, etc.)
      const imgData = await toPng(dashboardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#ffffff',
      })

      // Obtener dimensiones reales de la imagen generada
      const img = new Image()
      img.src = imgData
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = reject
      })

      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      const pdfWidth = pdf.internal.pageSize.getWidth()
      const pdfHeight = pdf.internal.pageSize.getHeight()
      const imgWidth = img.width
      const imgHeight = img.height
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight)
      const scaledWidth = imgWidth * ratio
      const scaledHeight = imgHeight * ratio
      const imgX = (pdfWidth - scaledWidth) / 2
      const margin = 10

      // Si la imagen es más alta que una página, dividir en varias páginas
      if (scaledHeight > pdfHeight - margin * 2) {
        let heightLeft = scaledHeight
        let srcY = 0
        while (heightLeft > 0) {
          const sliceHeight = Math.min(pdfHeight - margin * 2, heightLeft)
          const sliceRatio = sliceHeight / scaledHeight
          const srcHeight = imgHeight * sliceRatio
          pdf.addImage(imgData, 'PNG', imgX, margin, scaledWidth, sliceHeight, undefined, 'FAST', srcY)
          heightLeft -= sliceHeight
          srcY += srcHeight
          if (heightLeft > 0) pdf.addPage()
        }
      } else {
        pdf.addImage(imgData, 'PNG', imgX, margin, scaledWidth, scaledHeight)
      }

      pdf.save(`dashboard_inyeccion_${new Date().toISOString().slice(0, 10)}.pdf`)
    } catch (err: any) {
      console.error('Error exportando PDF:', err)
      alert('Error al exportar PDF. Intenta de nuevo.')
    }
  }

  const totales = data?.totales || {}
  const porPeriodo = data?.por_periodo || []
  const porMaquina = data?.por_maquina || []
  const porTurno = data?.por_turno || []
  const porMotivoParo = data?.por_motivo_paro || []
  const porMotivoScrap = data?.por_motivo_scrap || []

  const pieTurnoData = useMemo(() => porTurno.map((t: any) => ({ name: t.turno, value: t.produccion_total })), [porTurno])
  const pieParoData = useMemo(() => porMotivoParo.map((p: any) => ({ name: p.motivo, value: p.valor })), [porMotivoParo])
  const pieScrapData = useMemo(() => porMotivoScrap.map((s: any) => ({ name: s.motivo, value: s.valor })), [porMotivoScrap])

  const prodMetaData = useMemo(() => porPeriodo.map((p: any) => ({
    periodo: p.periodo,
    produccion: p.produccion_buena,
    meta: Math.round(p.produccion_buena / (p.produccion_porcentaje / 100)) || p.produccion_buena,
    porcentaje: p.produccion_porcentaje,
  })), [porPeriodo])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h2 className="text-xl font-bold text-gray-800">📊 Dashboard — Inyección</h2>
        <div className="flex gap-2">
          <button onClick={exportarPDF}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm bg-red-600 hover:bg-red-700 active:scale-95 text-white transition-all">
            📄 Exportar PDF
          </button>
          <button onClick={cargar} disabled={loading}
            className="bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg text-sm font-medium text-gray-700">
            🔄
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase">Rápido:</span>
          {(['hoy', 'semana', 'mes'] as const).map(r => (
            <button key={r} onClick={() => setRango(r)}
              className="px-3 py-1 rounded-lg text-xs font-medium bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200 transition-colors capitalize">
              {r === 'hoy' ? 'Hoy' : r === 'semana' ? 'Esta semana' : 'Este mes'}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Agrupar</label>
            <select value={groupBy} onChange={e => setGroupBy(e.target.value as any)}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
              <option value="day">Día</option>
              <option value="week">Semana</option>
              <option value="month">Mes</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Desde</label>
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Hasta</label>
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Turno</label>
            <select value={filtroTurno} onChange={e => setFiltroTurno(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm">
              <option value="">Todos</option>
              <option value="DIA">DIA</option>
              <option value="NOCHE">NOCHE</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">No. Parte</label>
            <input value={filtroParte} onChange={e => setFiltroParte(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm uppercase" placeholder="Filtrar..." />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Cliente</label>
            <input value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm" placeholder="Filtrar..." />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Máquina</label>
            <input value={filtroMaquina} onChange={e => setFiltroMaquina(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm uppercase" placeholder="Filtrar..." />
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600" />
        </div>
      )}

      {!loading && data && (
        <div ref={dashboardRef} className="space-y-6 bg-white p-4 rounded-xl">
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <KpiCard title="Producción Total" value={formatNumber(totales.produccion_total)} color="bg-blue-50" />
            <KpiCard title="Producción Buena" value={formatNumber(totales.produccion_buena)} color="bg-emerald-50" />
            <KpiCard title="Scrap Total" value={formatNumber(totales.scrap_total)} color="bg-orange-50" />
            <KpiCard title="Tiempo Paro" value={`${totales.tiempo_paro_total || 0} hrs`} color="bg-red-50" />
            <KpiCard title="Prod. % Prom." value={`${(totales.produccion_porcentaje_promedio || 0).toFixed(1)}%`} color="bg-indigo-50" />
            <KpiCard title="Scrap % Prom." value={`${(totales.scrap_porcentaje_promedio || 0).toFixed(1)}%`} color="bg-amber-50" />
            <KpiCard title="Registros" value={formatNumber(totales.cantidad_registros)} color="bg-gray-50" />
          </div>

          {/* Gauges */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-center">
              <GaugeChart value={totales.produccion_porcentaje_promedio || 0} label="Producción % vs Meta" />
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-center">
              <GaugeChart value={totales.scrap_porcentaje_promedio || 0} label="Scrap % vs Producción" />
            </div>
          </div>

          {/* MODULO PRODUCCION */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <span className="w-2 h-6 bg-emerald-500 rounded-full inline-block" /> 🏭 Producción
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Produccion vs Meta */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Producción vs Meta por Período</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={prodMetaData} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
                    <defs>
                      <linearGradient id="colorProd" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorMeta" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="periodo" angle={-30} textAnchor="end" height={50} tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => formatNumber(Number(v))} />
                    <Legend />
                    <Area type="monotone" dataKey="produccion" name="Producción Buena" stroke="#10b981" fill="url(#colorProd)" strokeWidth={2} />
                    <Area type="monotone" dataKey="meta" name="Meta" stroke="#6366f1" fill="url(#colorMeta)" strokeWidth={2} strokeDasharray="5 5" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Produccion % */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Producción % por Período</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={prodMetaData} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="periodo" angle={-30} textAnchor="end" height={50} tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit="%" />
                    <Tooltip formatter={(v: any) => `${v}%`} />
                    <Legend />
                    <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="3 3" label="Meta 100%" />
                    <Line type="monotone" dataKey="porcentaje" name="Producción %" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Produccion por Maquina */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Producción por Máquina</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={porMaquina} layout="vertical" margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="maquina" type="category" width={80} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => formatNumber(Number(v))} />
                    <Bar dataKey="produccion_total" name="Producción Total" fill="#6366f1" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Distribucion Turno */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Distribución por Turno</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={pieTurnoData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3}
                      dataKey="value" nameKey="name" label={({ name, percent }: any) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}>
                      {pieTurnoData.map((_: any, i: number) => (
                        <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => formatNumber(Number(v))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* MODULO PAROS */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <span className="w-2 h-6 bg-red-500 rounded-full inline-block" /> 🛑 Paros
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Tiempo Paro por Periodo */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Tiempo Paro por Período</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={porPeriodo} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="periodo" angle={-30} textAnchor="end" height={50} tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit=" hrs" />
                    <Tooltip formatter={(v: any) => `${v} hrs`} />
                    <Bar dataKey="tiempo_paro_total" name="Tiempo Paro" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Paros por Maquina */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Tiempo Paro por Máquina</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={porMaquina} layout="vertical" margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="maquina" type="category" width={80} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v: any) => `${v} hrs`} />
                    <Bar dataKey="tiempo_paro_total" name="Tiempo Paro" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Distribucion Paros */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Distribución de Paros por Motivo</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={pieParoData} cx="50%" cy="50%" outerRadius={100} paddingAngle={2}
                      dataKey="value" nameKey="name" label={({ name, percent }: any) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}>
                      {pieParoData.map((_: any, i: number) => (
                        <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => `${v} hrs`} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Pareto Paros */}
              <ParetoChart data={porMotivoParo} xKey="motivo" yKey="valor" title="Pareto: Motivos de Paro" />
            </div>
          </div>

          {/* MODULO SCRAP */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <span className="w-2 h-6 bg-orange-500 rounded-full inline-block" /> ♻️ Scrap
            </h3>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Scrap por Periodo */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Scrap por Período</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={porPeriodo} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="periodo" angle={-30} textAnchor="end" height={50} tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                    <YAxis yAxisId="right" orientation="right" unit="%" tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Bar yAxisId="left" dataKey="scrap_total" name="Scrap Total" fill="#f97316" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="scrap_porcentaje" name="Scrap %" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              {/* Scrap por Motivo */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Scrap por Motivo</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={porMotivoScrap} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                    <XAxis dataKey="motivo" angle={-30} textAnchor="end" height={60} tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="valor" name="Cantidad" fill="#f97316" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Distribucion Scrap */}
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Distribución de Scrap</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={pieScrapData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2}
                      dataKey="value" nameKey="name" label={({ name, percent }: any) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}>
                      {pieScrapData.map((_: any, i: number) => (
                        <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: any) => formatNumber(Number(v))} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Pareto Scrap */}
              <ParetoChart data={porMotivoScrap} xKey="motivo" yKey="valor" title="Pareto: Motivos de Scrap" />
            </div>
          </div>

          {/* Tabla Resumen */}
          {data?.registros_detalle?.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-gray-800">📋 Registros Detalle</h3>
              <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">Fecha</th>
                      <th className="px-3 py-2 text-left">Turno</th>
                      <th className="px-3 py-2 text-left">No. Parte</th>
                      <th className="px-3 py-2 text-left">Cliente</th>
                      <th className="px-3 py-2 text-left">Máquina</th>
                      <th className="px-3 py-2 text-right">Prod. Total</th>
                      <th className="px-3 py-2 text-right">Prod. Buena</th>
                      <th className="px-3 py-2 text-right">Scrap</th>
                      <th className="px-3 py-2 text-right">Paro (hrs)</th>
                      <th className="px-3 py-2 text-right">Prod %</th>
                      <th className="px-3 py-2 text-right">Scrap %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.registros_detalle.map((r: any) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2">{r.fecha?.slice(0, 10) || '—'}</td>
                        <td className="px-3 py-2">{r.turno}</td>
                        <td className="px-3 py-2 font-medium">{r.numero_parte}</td>
                        <td className="px-3 py-2">{r.cliente}</td>
                        <td className="px-3 py-2">{r.maquina}</td>
                        <td className="px-3 py-2 text-right">{formatNumber(r.produccion_total)}</td>
                        <td className="px-3 py-2 text-right text-emerald-600 font-medium">{formatNumber(r.produccion_buena)}</td>
                        <td className="px-3 py-2 text-right text-orange-600">{formatNumber(r.scrap_total)}</td>
                        <td className="px-3 py-2 text-right text-red-600">{r.tiempo_paro_total}</td>
                        <td className="px-3 py-2 text-right">{r.produccion_porcentaje}%</td>
                        <td className="px-3 py-2 text-right">{r.scrap_porcentaje}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && !data && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-12 text-center">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-gray-400">No hay datos para mostrar. Ajusta los filtros.</p>
        </div>
      )}
    </div>
  )
}
