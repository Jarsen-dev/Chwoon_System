'use client';

import { useState, useEffect } from 'react';
import { getFinanzasDashboard } from '@/lib/api';
import type { FinanzasDashboard } from '@/types';

interface Props {
  token: string;
}

function StatCard({
  icon,
  label,
  value,
  badge,
  badgeColor = 'text-violet-400',
  borderColor = 'border-violet-500/30',
  valueColor = 'text-white',
}: {
  icon: string;
  label: string;
  value: string | number;
  badge?: string;
  badgeColor?: string;
  borderColor?: string;
  valueColor?: string;
}) {
  return (
    <div className={`bg-gray-900 rounded-xl border ${borderColor} p-5 flex flex-col gap-2`}>
      <div className="flex items-center justify-between">
        <span className="text-2xl">{icon}</span>
        {badge && (
          <span className={`text-xs font-medium ${badgeColor} bg-gray-800 px-2 py-1 rounded-full`}>
            {badge}
          </span>
        )}
      </div>
      <p className={`text-3xl font-bold ${valueColor}`}>{value}</p>
      <p className="text-sm text-gray-400">{label}</p>
    </div>
  );
}

export default function DashboardTab({ token }: Props) {
  const [data, setData] = useState<FinanzasDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await getFinanzasDashboard(token);
      setData(res);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-violet-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-6 text-center">
        <p className="text-red-400">❌ {error}</p>
        <button onClick={fetchData} className="mt-3 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm">
          Reintentar
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Dashboard de Ventas</h2>
          <p className="text-gray-400 text-sm">
            Resumen de ventas — {new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button
          onClick={fetchData}
          className="bg-violet-600 hover:bg-violet-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          🔄 Actualizar
        </button>
      </div>

      {/* Ventas */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">💵 Ventas</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            icon="📋"
            label="Total Órdenes de Venta"
            value={data.total_ov}
            badge={`${data.ov_pendientes} pendientes`}
            badgeColor="text-orange-400"
            borderColor="border-violet-500/30"
          />
          <StatCard
            icon="🚚"
            label="OV Enviadas"
            value={data.ov_enviadas}
            borderColor="border-green-500/30"
            valueColor="text-green-400"
          />
          <StatCard
            icon="⚠️"
            label="Stock Insuficiente"
            value={data.ov_stock_insuficiente}
            borderColor="border-red-500/30"
            valueColor="text-red-400"
          />
          <StatCard
            icon="💵"
            label="Valor Ventas (Mes)"
            value={formatCurrency(data.valor_ventas_mes)}
            badge="Mes actual"
            borderColor="border-violet-500/30"
            valueColor="text-violet-400"
          />
        </div>
      </div>

      {/* Devoluciones y Plan */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">🔄 Devoluciones & Plan</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            icon="🔄"
            label="Total Devoluciones"
            value={data.total_devoluciones}
            badge={`${data.devoluciones_pendientes} pendientes`}
            badgeColor="text-red-400"
            borderColor="border-orange-500/30"
          />
          <StatCard
            icon="🔍"
            label="Devoluciones Pendientes Inspección"
            value={data.devoluciones_pendientes}
            borderColor="border-yellow-500/30"
            valueColor="text-yellow-400"
          />
          <StatCard
            icon="📅"
            label="Planes de Venta Activos"
            value={data.planes_venta_activos}
            badge="Semanas registradas"
            borderColor="border-indigo-500/30"
            valueColor="text-indigo-400"
          />
        </div>
      </div>
    </div>
  );
}