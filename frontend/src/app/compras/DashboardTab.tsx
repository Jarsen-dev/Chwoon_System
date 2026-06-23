'use client';

import { useState, useEffect } from 'react';
import { getFinanzasDashboard } from '@/lib/api';
import type { FinanzasDashboard } from '@/types';
import { Button, LoadingSpinner } from '@/components/ui';
import {
  IconCompras, IconInventario, IconCompletado, IconPendiente, IconFinanzas,
  IconActualizar, IconAlertas, type LucideIcon,
} from '@/lib/icons';

interface Props {
  token: string;
}

function StatCard({
  icon: Icon,
  label,
  value,
  badge,
  badgeColor = 'text-emerald-400',
  borderColor = 'border-emerald-500/30',
  valueColor = 'text-white',
}: {
  icon: LucideIcon;
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
        <span
          className="inline-flex items-center justify-center h-10 w-10 rounded-lg text-[var(--accent)]"
          style={{ backgroundColor: 'var(--accent-soft)' }}
        >
          <Icon size={20} aria-hidden />
        </span>
        {badge && (
          <span className={`text-xs font-medium ${badgeColor} bg-gray-800 px-2 py-1 rounded-full`}>
            {badge}
          </span>
        )}
      </div>
      <p className={`text-3xl font-bold ${valueColor}`}>{value}</p>
      <p className="text-sm text-gray-300">{label}</p>
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
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-6 text-center">
        <p className="text-red-400 flex items-center justify-center gap-2"><IconAlertas size={16} aria-hidden /> {error}</p>
        <Button variant="danger" onClick={fetchData} className="mt-3">Reintentar</Button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Dashboard de Compras</h2>
          <p className="text-gray-300 text-sm">
            Resumen de compras — {new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Button onClick={fetchData} leftIcon={IconActualizar}>Actualizar</Button>
      </div>

      {/* Compras */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2">
          <IconCompras size={16} aria-hidden /> Compras
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            icon={IconInventario}
            label="Total Órdenes de Compra"
            value={data.total_oc}
            badge={`${data.oc_pendientes} pendientes`}
            badgeColor="text-yellow-400"
            borderColor="border-blue-500/30"
          />
          <StatCard
            icon={IconCompletado}
            label="OC Completadas"
            value={data.oc_completadas}
            borderColor="border-green-500/30"
            valueColor="text-green-400"
          />
          <StatCard
            icon={IconPendiente}
            label="OC Pendientes/Parciales"
            value={data.oc_pendientes}
            borderColor="border-yellow-500/30"
            valueColor="text-yellow-400"
          />
          <StatCard
            icon={IconFinanzas}
            label="Valor Compras (Mes)"
            value={formatCurrency(data.valor_compras_mes)}
            badge="Mes actual"
            borderColor="border-purple-500/30"
            valueColor="text-purple-400"
          />
        </div>
      </div>
    </div>
  );
}