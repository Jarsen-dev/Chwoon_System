'use client';

import { useState, useEffect } from 'react';
import { getFinanzasDashboard, getOrdenesVenta } from '@/lib/api';
import type { FinanzasDashboard, OrdenVenta } from '@/types';

interface Props {
  token: string;
}

const ESTADO_COLORS: Record<string, string> = {
  'Pendiente de Envío':  'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'Stock Insuficiente':  'bg-red-500/20 text-red-400 border-red-500/30',
  'Enviado':             'bg-green-500/20 text-green-400 border-green-500/30',
  'Embarque Parcial':    'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Devolución Parcial':  'bg-purple-500/20 text-purple-400 border-purple-500/30',
  'Cancelada':           'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

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
    <div className="h-1 bg-gray-700 rounded-full overflow-hidden mt-1 w-16 inline-block align-middle ml-2">
      <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
    </div>
  );
}

export default function DashboardTab({ token }: Props) {
  const [data, setData] = useState<FinanzasDashboard | null>(null);
  const [recientes, setRecientes] = useState<OrdenVenta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
        <button onClick={fetchData} className="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
          🔄 Actualizar
        </button>
      </div>

      {/* KPIs — Órdenes de Venta */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">💵 Órdenes de venta</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon="🧾"
            label="Total órdenes"
            value={data.total_ov}
            sub={`${data.ov_pendientes} pendientes de envío`}
            subColor="text-yellow-500"
            borderColor="border-blue-500/30"
          />
          <StatCard
            icon="✅"
            label="Enviadas"
            value={data.ov_enviadas}
            sub="Entregadas al cliente"
            valueColor="text-green-400"
            borderColor="border-green-500/30"
          />
          <StatCard
            icon="⏳"
            label="Pendientes de envío"
            value={data.ov_pendientes}
            valueColor="text-yellow-400"
            borderColor="border-yellow-500/30"
          />
          <StatCard
            icon="⚠️"
            label="Stock insuficiente"
            value={data.ov_stock_insuficiente}
            sub={`${pctInsuf}% del total`}
            subColor="text-red-500"
            valueColor="text-red-400"
            borderColor="border-red-500/30"
          />
        </div>
      </div>

      {/* KPIs — Devoluciones y Plan */}
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