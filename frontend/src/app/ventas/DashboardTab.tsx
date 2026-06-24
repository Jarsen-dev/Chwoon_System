'use client';

import { useState, useEffect } from 'react';
import { useRef } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell, RadialBarChart, RadialBar,
} from 'recharts';
import { getFinanzasDashboard, getOrdenesVenta, ESTADO_COLORS, importarPlanEmbarque } from '@/lib/api';
import type { FinanzasDashboard, OrdenVenta } from '@/types';
import { semaforoCoverage, colorClasesSemaforo } from '@/types';
import { Button, LoadingSpinner } from '@/components/ui';
import {
  IconInventario, IconDocumento, IconLogistica, IconCompletado, IconAlertas,
  IconGrafico, IconDevoluciones, IconCalidad, IconFinanzas, IconTiempo,
  IconActualizar, IconRecepciones, IconPendiente, type LucideIcon,
} from '@/lib/icons';

interface Props {
  token: string;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  subColor = 'text-gray-400',
  valueColor = 'text-white',
  borderColor = 'border-gray-800',
  trend,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  sub?: string;
  subColor?: string;
  valueColor?: string;
  borderColor?: string;
  trend?: 'up' | 'down' | 'neutral';
}) {
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : null;
  const trendColor = trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : '';
  return (
    <div className={`bg-gray-900 rounded-xl border ${borderColor} p-5 flex flex-col gap-1`}>
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center justify-center h-10 w-10 rounded-lg text-[var(--accent)]" style={{ backgroundColor: 'var(--accent-soft)' }}><Icon size={20} aria-hidden /></span>
        {trendIcon && <span className={`text-sm font-bold ${trendColor}`}>{trendIcon}</span>}
      </div>
      <p className={`text-3xl font-bold ${valueColor}`}>{value}</p>
      <p className="text-sm text-gray-300">{label}</p>
      {sub && <p className={`text-xs ${subColor}`}>{sub}</p>}
    </div>
  );
}

function ProgBar({ pct, color = 'bg-blue-500' }: { pct: number; color?: string }) {
  return (
    <div className="h-2 bg-gray-700 rounded-full overflow-hidden w-full mt-1">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

const PIE_COLORS = {
  'Pendiente de Envío':  '#eab308',
  'En Preparación':      '#f97316',
  'Lista para Carga':    '#06b6d4',
  'Enviado':             '#22c55e',
  'Stock Insuficiente':  '#ef4444',
  'Embarque Parcial':    '#8b5cf6',
  'Cancelada':           '#6b7280',
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs">
        <p className="text-gray-400 mb-1">{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} style={{ color: p.color }}>{p.name}: {p.value.toLocaleString()}</p>
        ))}
      </div>
    );
  }
  return null;
};

export default function DashboardTab({ token }: Props) {
  const [data, setData] = useState<FinanzasDashboard | null>(null);
  const [recientes, setRecientes] = useState<OrdenVenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');
      const [dash, ovs] = await Promise.all([
        getFinanzasDashboard(token),
        getOrdenesVenta(token).catch(() => [] as OrdenVenta[]),
      ]);
      setData(dash);
      setRecientes(ovs.slice(0, 8));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [token]);

  const handleImportEmbarque = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setImporting(true);
      setImportMsg(null);
      const res = await importarPlanEmbarque(token, file);
      setImportMsg({ text: `PSI importado: Ref ${(res.coverage_ref_dday * 100).toFixed(0)}% / Oven ${(res.coverage_oven_dday * 100).toFixed(0)}%`, ok: true });
      await fetchData();
    } catch (err: any) {
      setImportMsg({ text: err.message, ok: false });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const fmtMXN = (v: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(v);
  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner sizeClass="h-10 w-10" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-6 text-center">
        <p className="text-red-400 mb-3 flex items-center justify-center gap-2"><IconAlertas size={16} aria-hidden /> {error}</p>
        <Button variant="danger" onClick={fetchData}>Reintentar</Button>
      </div>
    );
  }

  if (!data) return null;

  const pctCumpl = data.pct_cumplimiento ?? 0;
  const cumplColor = pctCumpl >= 90 ? 'text-green-400' : pctCumpl >= 60 ? 'text-yellow-400' : 'text-red-400';
  const cumplBar   = pctCumpl >= 90 ? 'bg-green-500' : pctCumpl >= 60 ? 'bg-yellow-500' : 'bg-red-500';

  // Datos para gráfica de barras (programado vs embarcado)
  const barData = [
    { name: 'Hoy', Programado: data.programado_hoy, Embarcado: data.embarcado_hoy },
  ];

  // Datos para donut de estados OV
  const pieData = [
    { name: 'Pendiente de Envío', value: data.ov_pendientes },
    { name: 'En Preparación',     value: data.ov_en_preparacion },
    { name: 'Lista para Carga',   value: data.ov_lista_para_carga },
    { name: 'Enviado',            value: data.ov_enviadas },
    { name: 'Stock Insuficiente', value: data.ov_stock_insuficiente },
  ].filter(d => d.value > 0);

  // Datos para radial PSI
  const psiData = [
    { name: 'REF D-Day',  value: Math.round(Math.min(data.coverage_ref_dday, 2) * 50),  fill: semaforoCoverage(data.coverage_ref_dday) === 'green' ? '#22c55e' : semaforoCoverage(data.coverage_ref_dday) === 'yellow' ? '#eab308' : '#ef4444' },
    { name: 'REF D+1',   value: Math.round(Math.min(data.coverage_ref_d1, 2) * 50),    fill: semaforoCoverage(data.coverage_ref_d1) === 'green' ? '#22c55e' : semaforoCoverage(data.coverage_ref_d1) === 'yellow' ? '#eab308' : '#ef4444' },
    { name: 'OVEN D-Day', value: Math.round(Math.min(data.coverage_oven_dday, 2) * 50), fill: semaforoCoverage(data.coverage_oven_dday) === 'green' ? '#22c55e' : semaforoCoverage(data.coverage_oven_dday) === 'yellow' ? '#eab308' : '#ef4444' },
    { name: 'OVEN D+1',  value: Math.round(Math.min(data.coverage_oven_d1, 2) * 50),   fill: semaforoCoverage(data.coverage_oven_d1) === 'green' ? '#22c55e' : semaforoCoverage(data.coverage_oven_d1) === 'yellow' ? '#eab308' : '#ef4444' },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Dashboard de Ventas</h2>
          <p className="text-gray-300 text-sm">
            {new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportEmbarque} />
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={importing} leftIcon={importing ? IconPendiente : IconRecepciones}>
            Plan Embarque
          </Button>
          <Button variant="secondary" onClick={fetchData} leftIcon={IconActualizar}>Actualizar</Button>
        </div>
      </div>

      {importMsg && (
        <p className={`text-xs px-1 ${importMsg.ok ? 'text-teal-400' : 'text-red-400'}`}>
          {importMsg.text}
        </p>
      )}

      {/* Fila 1: KPIs del día */}
      <div>
        <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2"><IconInventario size={14} aria-hidden /> KPIs del día</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-900 rounded-xl border border-blue-500/30 p-5">
            <div className="flex items-center justify-between mb-1">
              <span className="inline-flex items-center justify-center h-10 w-10 rounded-lg text-[var(--accent)]" style={{ backgroundColor: 'var(--accent-soft)' }}><IconDocumento size={20} aria-hidden /></span>
              <span className={`text-sm font-bold ${cumplColor}`}>{pctCumpl >= 90 ? '↑' : pctCumpl >= 60 ? '→' : '↓'}</span>
            </div>
            <p className={`text-3xl font-bold ${cumplColor}`}>{pctCumpl.toFixed(1)}%</p>
            <p className="text-sm text-gray-400 mt-1">Cumplimiento del día</p>
            <ProgBar pct={pctCumpl} color={cumplBar} />
          </div>
          <StatCard
            icon={IconLogistica}
            label="Programado hoy"
            value={data.programado_hoy.toLocaleString()}
            sub="pzas del plan activo"
            valueColor="text-blue-400"
            borderColor="border-blue-500/30"
          />
          <StatCard
            icon={IconCompletado}
            label="Embarcado hoy"
            value={data.embarcado_hoy.toLocaleString()}
            sub="pzas con status OK"
            valueColor="text-green-400"
            borderColor="border-green-500/30"
            trend={data.embarcado_hoy >= data.programado_hoy ? 'up' : 'down'}
          />
          <StatCard
            icon={IconAlertas}
            label="SKUs DIF negativa"
            value={data.skus_dif_negativa}
            sub="stock LG < plan acumulado"
            subColor={data.skus_dif_negativa > 0 ? 'text-red-400' : 'text-gray-500'}
            valueColor={data.skus_dif_negativa > 0 ? 'text-red-400' : 'text-gray-400'}
            borderColor={data.skus_dif_negativa > 0 ? 'border-red-500/30' : 'border-gray-800'}
            trend={data.skus_dif_negativa === 0 ? 'up' : 'down'}
          />
        </div>
      </div>

      {/* Fila 2: Gráfica de barras + Donut OV */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Bar chart: Programado vs Embarcado */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2"><IconGrafico size={14} aria-hidden /> Programado vs Embarcado</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData} barGap={8}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12, color: '#9ca3af' }} />
              <Bar dataKey="Programado" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Embarcado"  fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center">
            <div className="bg-blue-500/10 rounded-lg p-2">
              <p className="text-xs text-gray-500">Pendiente</p>
              <p className="text-lg font-bold text-blue-400">{(data.programado_hoy - data.embarcado_hoy).toLocaleString()}</p>
            </div>
            <div className="bg-green-500/10 rounded-lg p-2">
              <p className="text-xs text-gray-500">Completado</p>
              <p className="text-lg font-bold text-green-400">{pctCumpl.toFixed(0)}%</p>
            </div>
          </div>
        </div>

        {/* Donut: distribución de OVs por estado */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
          <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2"><IconDevoluciones size={14} aria-hidden /> Distribución de Órdenes de Venta</p>
          {pieData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-gray-600">
              <p className="text-sm">Sin órdenes activas</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={index} fill={PIE_COLORS[entry.name as keyof typeof PIE_COLORS] || '#6b7280'} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-1 mt-2">
                {pieData.map((entry) => (
                  <div key={entry.name} className="flex items-center gap-1.5 text-xs">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[entry.name as keyof typeof PIE_COLORS] || '#6b7280' }} />
                    <span className="text-gray-400 truncate">{entry.name}</span>
                    <span className="text-white font-medium ml-auto">{entry.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Fila 3: PSI Coverage con RadialBar */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider flex items-center gap-2"><IconCalidad size={14} aria-hidden /> PSI Coverage</p>
          <span className="text-xs text-gray-600">100% = cobertura completa · &gt;100% = excedente</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'REF — D-Day', value: data.coverage_ref_dday },
            { label: 'REF — D+1',   value: data.coverage_ref_d1 },
            { label: 'OVEN — D-Day', value: data.coverage_oven_dday },
            { label: 'OVEN — D+1',   value: data.coverage_oven_d1 },
          ].map(({ label, value }) => {
            const sem = semaforoCoverage(value);
            const barColor = sem === 'green' ? '#22c55e' : sem === 'yellow' ? '#eab308' : '#ef4444';
            const pct = Math.round(Math.min(value, 2) * 50);
            const cls = colorClasesSemaforo(value);
            return (
              <div key={label} className={`rounded-xl border p-4 flex flex-col items-center gap-2 ${cls}`}>
                <ResponsiveContainer width={80} height={80}>
                  <RadialBarChart cx="50%" cy="50%" innerRadius={25} outerRadius={40} startAngle={180} endAngle={0} data={[{ value: pct, fill: barColor }]}>
                    <RadialBar dataKey="value" cornerRadius={4} background={{ fill: '#374151' }} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <p className="text-xl font-bold">{(value * 100).toFixed(0)}%</p>
                <p className="text-xs text-center text-gray-400">{label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fila 4: Resumen financiero */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          icon={IconDevoluciones}
          label="Total devoluciones"
          value={data.total_devoluciones}
          sub={`${data.devoluciones_pendientes} pendientes inspección`}
          subColor={data.devoluciones_pendientes > 0 ? 'text-orange-400' : 'text-gray-500'}
          borderColor="border-orange-500/30"
        />
        <StatCard
          icon={IconDocumento}
          label="Planes de venta activos"
          value={data.planes_venta_activos}
          valueColor="text-violet-400"
          borderColor="border-violet-500/30"
        />
        <StatCard
          icon={IconFinanzas}
          label="Valor ventas (mes)"
          value={fmtMXN(data.valor_ventas_mes)}
          sub="Mes en curso"
          valueColor="text-purple-400"
          borderColor="border-purple-500/30"
          trend="up"
        />
      </div>

      {/* Fila 5: Tabla de órdenes recientes */}
      {recientes.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2"><IconTiempo size={14} aria-hidden /> Órdenes recientes</p>
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-gray-300 font-medium text-xs">OV ID</th>
                  <th className="px-4 py-3 text-left text-gray-300 font-medium text-xs">Cliente</th>
                  <th className="px-4 py-3 text-left text-gray-300 font-medium text-xs">Estado</th>
                  <th className="px-4 py-3 text-right text-gray-300 font-medium text-xs">Valor</th>
                  <th className="px-4 py-3 text-left text-gray-300 font-medium text-xs">Fecha</th>
                  <th className="px-4 py-3 text-left text-gray-300 font-medium text-xs">Progreso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {recientes.map((ov) => {
                  const totalPed = ov.items?.reduce((s, i) => s + i.cantidad, 0) ?? 0;
                  const totalEnv = ov.items?.reduce((s, i) => s + i.cantidad_enviada, 0) ?? 0;
                  const pct = totalPed > 0 ? Math.round((totalEnv / totalPed) * 100) : 0;
                  return (
                    <tr key={ov.ov_id} className="hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-blue-400 text-xs">{ov.ov_id}</td>
                      <td className="px-4 py-3">
                        <p className="text-white text-sm">{ov.nombre_cliente || ov.cliente_id}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${ESTADO_COLORS[ov.estado] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                          {ov.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-sm">{fmtMXN(ov.valor_total ?? 0)}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(ov.fecha_creacion)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium ${pct === 100 ? 'text-green-400' : pct > 0 ? 'text-blue-400' : 'text-gray-500'}`}>
                            {pct}%
                          </span>
                          <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden w-16">
                            <div
                              className={`h-full rounded-full ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
