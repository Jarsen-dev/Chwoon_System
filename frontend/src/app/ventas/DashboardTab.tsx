'use client';

import { useState, useEffect } from 'react';
import { useRef } from 'react';
import { getFinanzasDashboard, getOrdenesVenta, ESTADO_COLORS, importarPlanEmbarque } from '@/lib/api';
import type { FinanzasDashboard, OrdenVenta } from '@/types';
import { semaforoCoverage, colorClasesSemaforo } from '@/types';

interface Props {
  token: string;
}

function StatCard({
  icon,
  label,
  value,
  sub,
  subColor = 'text-gray-500',
  valueColor = 'text-white',
  borderColor = 'border-gray-800',
}: {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  subColor?: string;
  valueColor?: string;
  borderColor?: string;
}) {
  return (
    <div className={`bg-gray-900 rounded-xl border ${borderColor} p-5`}>
      <p className="text-2xl mb-1">{icon}</p>
      <p className={`text-3xl font-bold ${valueColor}`}>{value}</p>
      <p className="text-sm text-gray-400 mt-1">{label}</p>
      {sub && <p className={`text-xs mt-1 ${subColor}`}>{sub}</p>}
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

function CoverageCell({ label, value }: { label: string; value: number }) {
  const cls = colorClasesSemaforo(value);
  const pct = Math.round(Math.min(value, 2) * 50);
  const color = semaforoCoverage(value) === 'green' ? 'bg-green-500' : semaforoCoverage(value) === 'yellow' ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className={`rounded-lg border p-3 ${cls}`}>
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="text-xl font-bold">{(value * 100).toFixed(0)}%</p>
      <ProgBar pct={pct} color={color} />
    </div>
  );
}

export default function DashboardTab({ token }: Props) {
  const [data, setData] = useState<FinanzasDashboard | null>(null);
  const [recientes, setRecientes] = useState<OrdenVenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
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
      setImportMsg('');
      const res = await importarPlanEmbarque(token, file);
      setImportMsg(`✅ PSI importado: Ref ${(res.coverage_ref_dday * 100).toFixed(0)}% / Oven ${(res.coverage_oven_dday * 100).toFixed(0)}%`);
      await fetchData();
    } catch (err: any) {
      setImportMsg(`❌ ${err.message}`);
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
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-6 text-center">
        <p className="text-red-400 mb-3">❌ {error}</p>
        <button onClick={fetchData} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm transition-colors">
          Reintentar
        </button>
      </div>
    );
  }

  if (!data) return null;

  const pctInsuf = data.total_ov > 0 ? Math.round((data.ov_stock_insuficiente / data.total_ov) * 100) : 0;
  const pctCumpl = data.pct_cumplimiento ?? 0;
  const cumplColor = pctCumpl >= 90 ? 'text-green-400' : pctCumpl >= 60 ? 'text-yellow-400' : 'text-red-400';
  const cumplBar   = pctCumpl >= 90 ? 'bg-green-500' : pctCumpl >= 60 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Dashboard de Ventas</h2>
          <p className="text-gray-400 text-sm">
            {new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleImportEmbarque}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="bg-teal-700 hover:bg-teal-600 disabled:opacity-50 border border-teal-600 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            {importing ? '⏳' : '📥'} Plan Embarque
          </button>
          <button onClick={fetchData} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
            🔄 Actualizar
          </button>
        </div>
      </div>

      {importMsg && (
        <p className={`text-xs px-1 ${importMsg.startsWith('✅') ? 'text-teal-400' : 'text-red-400'}`}>
          {importMsg}
        </p>
      )}

      {/* KPIs del día */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">📦 KPIs del día</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-900 rounded-xl border border-blue-500/30 p-5">
            <p className="text-2xl mb-1">📋</p>
            <p className={`text-3xl font-bold ${cumplColor}`}>{pctCumpl.toFixed(1)}%</p>
            <p className="text-sm text-gray-400 mt-1">Cumplimiento del día</p>
            <ProgBar pct={pctCumpl} color={cumplBar} />
          </div>
          <StatCard
            icon="🚛"
            label="Programado hoy"
            value={data.programado_hoy}
            sub="pzas del plan activo"
            valueColor="text-blue-400"
            borderColor="border-blue-500/30"
          />
          <StatCard
            icon="✅"
            label="Embarcado hoy"
            value={data.embarcado_hoy}
            sub="pzas con status OK"
            valueColor="text-green-400"
            borderColor="border-green-500/30"
          />
          <StatCard
            icon="⚠️"
            label="SKUs DIF negativa"
            value={data.skus_dif_negativa}
            sub="stock LG < plan acumulado"
            subColor={data.skus_dif_negativa > 0 ? 'text-red-400' : 'text-gray-500'}
            valueColor={data.skus_dif_negativa > 0 ? 'text-red-400' : 'text-gray-400'}
            borderColor={data.skus_dif_negativa > 0 ? 'border-red-500/30' : 'border-gray-800'}
          />
        </div>
      </div>

      {/* PSI Coverage */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">🔬 PSI Coverage</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <CoverageCell label="REF — D-Day" value={data.coverage_ref_dday} />
          <CoverageCell label="REF — D+1"   value={data.coverage_ref_d1} />
          <CoverageCell label="OVEN — D-Day" value={data.coverage_oven_dday} />
          <CoverageCell label="OVEN — D+1"   value={data.coverage_oven_d1} />
        </div>
      </div>

      {/* Flujo de OVs */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">🔄 Flujo de órdenes de venta</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon="🧾"
            label="Total órdenes"
            value={data.total_ov}
            borderColor="border-gray-700"
          />
          <StatCard
            icon="⏳"
            label="Pendientes de envío"
            value={data.ov_pendientes}
            valueColor="text-yellow-400"
            borderColor="border-yellow-500/30"
          />
          <StatCard
            icon="🔧"
            label="En preparación"
            value={data.ov_en_preparacion}
            valueColor="text-orange-400"
            borderColor="border-orange-500/30"
          />
          <StatCard
            icon="🏁"
            label="Lista para carga"
            value={data.ov_lista_para_carga}
            valueColor="text-cyan-400"
            borderColor="border-cyan-500/30"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-2 gap-4 mt-4">
          <StatCard
            icon="✅"
            label="Enviadas (mes)"
            value={data.ov_enviadas}
            sub="Enviado + Embarque Parcial"
            valueColor="text-green-400"
            borderColor="border-green-500/30"
          />
          <StatCard
            icon="❌"
            label="Stock insuficiente"
            value={data.ov_stock_insuficiente}
            sub={`${pctInsuf}% del total`}
            subColor={data.ov_stock_insuficiente > 0 ? 'text-red-400' : 'text-gray-500'}
            valueColor={data.ov_stock_insuficiente > 0 ? 'text-red-400' : 'text-gray-400'}
            borderColor={data.ov_stock_insuficiente > 0 ? 'border-red-500/30' : 'border-gray-800'}
          />
        </div>
      </div>

      {/* Devoluciones y plan */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">🔄 Devoluciones y plan</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            icon="🔄"
            label="Total devoluciones"
            value={data.total_devoluciones}
            sub={`${data.devoluciones_pendientes} pendientes inspección`}
            subColor={data.devoluciones_pendientes > 0 ? 'text-orange-400' : 'text-gray-500'}
            borderColor="border-orange-500/30"
          />
          <StatCard
            icon="📋"
            label="Planes de venta activos"
            value={data.planes_venta_activos}
            valueColor="text-violet-400"
            borderColor="border-violet-500/30"
          />
          <StatCard
            icon="💰"
            label="Valor ventas (mes)"
            value={fmtMXN(data.valor_ventas_mes)}
            sub="Mes en curso"
            valueColor="text-purple-400"
            borderColor="border-purple-500/30"
          />
        </div>
      </div>

      {/* Tabla de órdenes recientes */}
      {recientes.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">🕐 Órdenes recientes</p>
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-800">
                <tr>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium text-xs">OV ID</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium text-xs">Cliente</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium text-xs">Estado</th>
                  <th className="px-4 py-3 text-right text-gray-400 font-medium text-xs">Valor</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium text-xs">Fecha</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium text-xs">CW Invoice</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium text-xs">Progreso</th>
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
                        {ov.nombre_cliente && <p className="text-xs text-gray-500">{ov.cliente_id}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${ESTADO_COLORS[ov.estado] || 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                          {ov.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-medium text-sm">{fmtMXN(ov.valor_total ?? 0)}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{fmtDate(ov.fecha_creacion)}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-400">{(ov as any).cw_invoice || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-medium ${pct === 100 ? 'text-green-400' : pct > 0 ? 'text-blue-400' : 'text-gray-500'}`}>
                            {pct}%
                          </span>
                          <div className="h-1 bg-gray-700 rounded-full overflow-hidden w-16">
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
