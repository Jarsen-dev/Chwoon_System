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

function KpiCard({ title, value, sub, color = 'var(--inj-surface2)' }: { title: string; value: string; sub?: string; color?: string }) {
  return (
    <div
      style={{
        background: color,
        border: '1px solid var(--inj-border)',
        borderRadius: 12,
        padding: 16,
        boxShadow: '0 1px 0 rgba(255,255,255,0.02) inset',
      }}
    >
      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--inj-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</p>
      <p style={{ fontSize: 28, fontWeight: 700, color: 'var(--inj-text)', marginTop: 6 }}>{value}</p>
      {sub && <p style={{ fontSize: 11, color: 'var(--inj-muted)', marginTop: 6 }}>{sub}</p>}
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
        <path d={`M 20 100 A ${r} ${r} 0 0 1 180 100`} fill="none" stroke="#253041" strokeWidth={stroke} strokeLinecap="round" />
        <path
          d={`M 20 100 A ${r} ${r} 0 0 1 180 100`}
          fill="none"
          stroke="url(#gaugeGrad)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          strokeDashoffset={0}
        />
        <text x="100" y="95" textAnchor="middle" fontSize="22" fontWeight="bold" fill="#e2e8f0">
          {pct.toFixed(1)}%
        </text>
      </svg>
      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--inj-muted)', marginTop: -8 }}>{label}</p>
    </div>
  )
}

function chartTheme() {
  return {
    grid: '#243041',
    axis: '#8b9ab2',
    text: '#e2e8f0',
    tooltipBg: '#161b22',
    tooltipBorder: '#2d3748',
  }
}

function ParetoChart({ data, xKey, yKey, title }: { data: any[]; xKey: string; yKey: string; title: string }) {
  const theme = chartTheme()

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
    <div style={{ background: 'var(--inj-surface)', border: '1px solid var(--inj-border)', borderRadius: 12, padding: 16 }}>
      <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--inj-text)', marginBottom: 12 }}>{title}</h4>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={sorted} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
          <XAxis dataKey={xKey} angle={-30} textAnchor="end" height={60} tick={{ fontSize: 11, fill: theme.axis }} />
          <YAxis yAxisId="left" tick={{ fontSize: 11, fill: theme.axis }} />
          <YAxis yAxisId="right" orientation="right" unit="%" tick={{ fontSize: 11, fill: theme.axis }} domain={[0, 100]} />
          <Tooltip
            contentStyle={{ background: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`, color: theme.text, borderRadius: 8 }}
            formatter={(v: any, n: any) => n === 'acumulado' ? [`${Number(v).toFixed(1)}%`, 'Acumulado'] : [v, n]}
          />
          <Legend wrapperStyle={{ color: theme.text }} />
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
      const inicio = new Date(hoy)
      inicio.setDate(d - inicio.getDay())
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
      const imgData = await toPng(dashboardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: '#0d1117',
      })

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

  const theme = chartTheme()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--inj-text)' }}>📊 Dashboard — Inyección</h2>
        <div className="flex gap-2">
          <button
            onClick={exportarPDF}
            className="inj-btn inj-btn-red"
          >
            📄 Exportar PDF
          </button>
          <button
            onClick={cargar}
            disabled={loading}
            className="inj-btn inj-btn-ghost"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div style={{ background: 'var(--inj-surface)', border: '1px solid var(--inj-border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="flex flex-wrap items-center gap-2">
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--inj-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Rápido:</span>
          {(['hoy', 'semana', 'mes'] as const).map(r => (
            <button
              key={r}
              onClick={() => setRango(r)}
              className="inj-btn inj-btn-ghost"
              style={{ padding: '6px 10px' }}
            >
              {r === 'hoy' ? 'Hoy' : r === 'semana' ? 'Esta semana' : 'Este mes'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <div>
            <label className="inj-label">Agrupar</label>
            <select value={groupBy} onChange={e => setGroupBy(e.target.value as any)} className="inj-select">
              <option value="day">Día</option>
              <option value="week">Semana</option>
              <option value="month">Mes</option>
            </select>
          </div>
          <div>
            <label className="inj-label">Desde</label>
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="inj-input" />
          </div>
          <div>
            <label className="inj-label">Hasta</label>
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="inj-input" />
          </div>
          <div>
            <label className="inj-label">Turno</label>
            <select value={filtroTurno} onChange={e => setFiltroTurno(e.target.value)} className="inj-select">
              <option value="">Todos</option>
              <option value="DIA">DIA</option>
              <option value="NOCHE">NOCHE</option>
            </select>
          </div>
          <div>
            <label className="inj-label">No. Parte</label>
            <input value={filtroParte} onChange={e => setFiltroParte(e.target.value)} className="inj-input uppercase" placeholder="Filtrar..." />
          </div>
          <div>
            <label className="inj-label">Cliente</label>
            <input value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} className="inj-input" placeholder="Filtrar..." />
          </div>
          <div>
            <label className="inj-label">Máquina</label>
            <input value={filtroMaquina} onChange={e => setFiltroMaquina(e.target.value)} className="inj-input uppercase" placeholder="Filtrar..." />
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500" />
        </div>
      )}

      {!loading && data && (
        <div ref={dashboardRef} style={{ display: 'flex', flexDirection: 'column', gap: 24, background: '#0d1117', padding: 4, borderRadius: 12 }}>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
            <KpiCard title="Producción Total" value={formatNumber(totales.produccion_total)} color="rgba(59,130,246,0.12)" />
            <KpiCard title="Producción Buena" value={formatNumber(totales.produccion_buena)} color="rgba(16,185,129,0.12)" />
            <KpiCard title="Scrap Total" value={formatNumber(totales.scrap_total)} color="rgba(249,115,22,0.12)" />
            <KpiCard title="Tiempo Paro" value={`${totales.tiempo_paro_total || 0} hrs`} color="rgba(239,68,68,0.12)" />
            <KpiCard title="Prod. % Prom." value={`${(totales.produccion_porcentaje_promedio || 0).toFixed(1)}%`} color="rgba(99,102,241,0.12)" />
            <KpiCard title="Scrap % Prom." value={`${(totales.scrap_porcentaje_promedio || 0).toFixed(1)}%`} color="rgba(245,158,11,0.12)" />
            <KpiCard title="Registros" value={formatNumber(totales.cantidad_registros)} color="rgba(139,154,178,0.12)" />
          </div>

          {/* Gauges */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div style={{ background: 'var(--inj-surface)', border: '1px solid var(--inj-border)', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <GaugeChart value={totales.produccion_porcentaje_promedio || 0} label="Producción % vs Meta" />
            </div>
            <div style={{ background: 'var(--inj-surface)', border: '1px solid var(--inj-border)', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <GaugeChart value={totales.scrap_porcentaje_promedio || 0} label="Scrap % vs Producción" />
            </div>
          </div>

          {/* PRODUCCIÓN */}
          <div className="space-y-4">
            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--inj-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="inline-block w-2 h-6 rounded-full" style={{ background: '#10b981' }} /> 🏭 Producción
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div style={{ background: 'var(--inj-surface)', border: '1px solid var(--inj-border)', borderRadius: 12, padding: 16 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--inj-text)', marginBottom: 12 }}>Producción vs Meta por Período</h4>
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
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
                    <XAxis dataKey="periodo" angle={-30} textAnchor="end" height={50} tick={{ fontSize: 11, fill: theme.axis }} />
                    <YAxis tick={{ fontSize: 11, fill: theme.axis }} />
                    <Tooltip contentStyle={{ background: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`, borderRadius: 8 }} formatter={(v: any) => formatNumber(Number(v))} />
                    <Legend wrapperStyle={{ color: theme.text }} />
                    <Area type="monotone" dataKey="produccion" name="Producción Buena" stroke="#10b981" fill="url(#colorProd)" strokeWidth={2} />
                    <Area type="monotone" dataKey="meta" name="Meta" stroke="#6366f1" fill="url(#colorMeta)" strokeWidth={2} strokeDasharray="5 5" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: 'var(--inj-surface)', border: '1px solid var(--inj-border)', borderRadius: 12, padding: 16 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--inj-text)', marginBottom: 12 }}>Producción % por Período</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={prodMetaData} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
                    <XAxis dataKey="periodo" angle={-30} textAnchor="end" height={50} tick={{ fontSize: 11, fill: theme.axis }} />
                    <YAxis tick={{ fontSize: 11, fill: theme.axis }} unit="%" />
                    <Tooltip contentStyle={{ background: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`, borderRadius: 8 }} formatter={(v: any) => `${v}%`} />
                    <Legend wrapperStyle={{ color: theme.text }} />
                    <ReferenceLine y={100} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Meta 100%', fill: theme.axis, fontSize: 10 }} />
                    <Line type="monotone" dataKey="porcentaje" name="Producción %" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: 'var(--inj-surface)', border: '1px solid var(--inj-border)', borderRadius: 12, padding: 16 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--inj-text)', marginBottom: 12 }}>Producción por Máquina</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={porMaquina} layout="vertical" margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: theme.axis }} />
                    <YAxis dataKey="maquina" type="category" width={80} tick={{ fontSize: 11, fill: theme.axis }} />
                    <Tooltip contentStyle={{ background: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`, borderRadius: 8 }} formatter={(v: any) => formatNumber(Number(v))} />
                    <Bar dataKey="produccion_total" name="Producción Total" fill="#6366f1" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: 'var(--inj-surface)', border: '1px solid var(--inj-border)', borderRadius: 12, padding: 16 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--inj-text)', marginBottom: 12 }}>Distribución por Turno</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieTurnoData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={3}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }: any) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                    >
                      {pieTurnoData.map((_: any, i: number) => (
                        <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`, borderRadius: 8 }} formatter={(v: any) => formatNumber(Number(v))} />
                    <Legend wrapperStyle={{ color: theme.text }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* PAROS */}
          <div className="space-y-4">
            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--inj-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="inline-block w-2 h-6 rounded-full" style={{ background: '#ef4444' }} /> 🛑 Paros
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div style={{ background: 'var(--inj-surface)', border: '1px solid var(--inj-border)', borderRadius: 12, padding: 16 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--inj-text)', marginBottom: 12 }}>Tiempo Paro por Período</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={porPeriodo} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
                    <XAxis dataKey="periodo" angle={-30} textAnchor="end" height={50} tick={{ fontSize: 11, fill: theme.axis }} />
                    <YAxis tick={{ fontSize: 11, fill: theme.axis }} unit=" hrs" />
                    <Tooltip contentStyle={{ background: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`, borderRadius: 8 }} formatter={(v: any) => `${v} hrs`} />
                    <Bar dataKey="tiempo_paro_total" name="Tiempo Paro" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: 'var(--inj-surface)', border: '1px solid var(--inj-border)', borderRadius: 12, padding: 16 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--inj-text)', marginBottom: 12 }}>Tiempo Paro por Máquina</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={porMaquina} layout="vertical" margin={{ top: 10, right: 20, bottom: 10, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: theme.axis }} />
                    <YAxis dataKey="maquina" type="category" width={80} tick={{ fontSize: 11, fill: theme.axis }} />
                    <Tooltip contentStyle={{ background: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`, borderRadius: 8 }} formatter={(v: any) => `${v} hrs`} />
                    <Bar dataKey="tiempo_paro_total" name="Tiempo Paro" fill="#ef4444" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: 'var(--inj-surface)', border: '1px solid var(--inj-border)', borderRadius: 12, padding: 16 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--inj-text)', marginBottom: 12 }}>Distribución de Paros por Motivo</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieParoData}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }: any) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                    >
                      {pieParoData.map((_: any, i: number) => (
                        <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`, borderRadius: 8 }} formatter={(v: any) => `${v} hrs`} />
                    <Legend wrapperStyle={{ color: theme.text }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <ParetoChart data={porMotivoParo} xKey="motivo" yKey="valor" title="Pareto: Motivos de Paro" />
            </div>
          </div>

          {/* SCRAP */}
          <div className="space-y-4">
            <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--inj-text)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="inline-block w-2 h-6 rounded-full" style={{ background: '#f97316' }} /> ♻️ Scrap
            </h3>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div style={{ background: 'var(--inj-surface)', border: '1px solid var(--inj-border)', borderRadius: 12, padding: 16 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--inj-text)', marginBottom: 12 }}>Scrap por Período</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={porPeriodo} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
                    <XAxis dataKey="periodo" angle={-30} textAnchor="end" height={50} tick={{ fontSize: 11, fill: theme.axis }} />
                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: theme.axis }} />
                    <YAxis yAxisId="right" orientation="right" unit="%" tick={{ fontSize: 11, fill: theme.axis }} />
                    <Tooltip contentStyle={{ background: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ color: theme.text }} />
                    <Bar yAxisId="left" dataKey="scrap_total" name="Scrap Total" fill="#f97316" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="scrap_porcentaje" name="Scrap %" stroke="#ef4444" strokeWidth={2} dot={{ r: 3 }} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: 'var(--inj-surface)', border: '1px solid var(--inj-border)', borderRadius: 12, padding: 16 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--inj-text)', marginBottom: 12 }}>Scrap por Motivo</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={porMotivoScrap} margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
                    <XAxis dataKey="motivo" angle={-30} textAnchor="end" height={60} tick={{ fontSize: 11, fill: theme.axis }} />
                    <YAxis tick={{ fontSize: 11, fill: theme.axis }} />
                    <Tooltip contentStyle={{ background: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`, borderRadius: 8 }} />
                    <Bar dataKey="valor" name="Cantidad" fill="#f97316" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ background: 'var(--inj-surface)', border: '1px solid var(--inj-border)', borderRadius: 12, padding: 16 }}>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--inj-text)', marginBottom: 12 }}>Distribución de Scrap</h4>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieScrapData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                      label={({ name, percent }: any) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                    >
                      {pieScrapData.map((_: any, i: number) => (
                        <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ background: theme.tooltipBg, border: `1px solid ${theme.tooltipBorder}`, borderRadius: 8 }} formatter={(v: any) => formatNumber(Number(v))} />
                    <Legend wrapperStyle={{ color: theme.text }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <ParetoChart data={porMotivoScrap} xKey="motivo" yKey="valor" title="Pareto: Motivos de Scrap" />
            </div>
          </div>

          {/* Tabla Resumen */}
          {data?.registros_detalle?.length > 0 && (
            <div className="space-y-2">
              <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--inj-text)' }}>📋 Registros Detalle</h3>
              <div style={{ background: 'var(--inj-surface)', border: '1px solid var(--inj-border)', borderRadius: 12, overflowX: 'auto', maxHeight: 500, overflowY: 'auto' }}>
                <table className="w-full text-xs" style={{ color: 'var(--inj-text)' }}>
                  <thead style={{ background: 'var(--inj-surface2)', position: 'sticky', top: 0 }}>
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
                  <tbody>
                    {data.registros_detalle.map((r: any) => (
                      <tr key={r.id} style={{ borderTop: '1px solid var(--inj-border)' }}>
                        <td className="px-3 py-2" style={{ color: 'var(--inj-muted)' }}>{r.fecha?.slice(0, 10) || '—'}</td>
                        <td className="px-3 py-2">{r.turno}</td>
                        <td className="px-3 py-2" style={{ fontWeight: 600 }}>{r.numero_parte}</td>
                        <td className="px-3 py-2">{r.cliente}</td>
                        <td className="px-3 py-2">{r.maquina}</td>
                        <td className="px-3 py-2 text-right">{formatNumber(r.produccion_total)}</td>
                        <td className="px-3 py-2 text-right" style={{ color: '#10b981', fontWeight: 600 }}>{formatNumber(r.produccion_buena)}</td>
                        <td className="px-3 py-2 text-right" style={{ color: '#f97316' }}>{formatNumber(r.scrap_total)}</td>
                        <td className="px-3 py-2 text-right" style={{ color: '#ef4444' }}>{r.tiempo_paro_total}</td>
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
        <div style={{ background: 'var(--inj-surface)', border: '1px solid var(--inj-border)', borderRadius: 12, padding: 48, textAlign: 'center' }}>
          <p style={{ fontSize: 40, marginBottom: 12 }}>📊</p>
          <p style={{ color: 'var(--inj-muted)' }}>No hay datos para mostrar. Ajusta los filtros.</p>
        </div>
      )}
    </div>
  )
}