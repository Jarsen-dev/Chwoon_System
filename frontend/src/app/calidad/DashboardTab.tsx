'use client';

import { useState, useEffect } from 'react';
import { getCalidadDashboard } from '@/lib/api';
import type { CalidadDashboard } from '@/types';
import { Button, LoadingSpinner } from '@/components/ui';
import {
  IconGrafico, IconDocumento, IconCompletado, IconEliminar, IconInventario,
  IconBuscar, IconProduccion, IconOQC, IconDevoluciones, IconFecha, IconCerrar,
  IconActualizar, IconAlertas, type LucideIcon,
} from '@/lib/icons';

interface Props {
  token: string;
}

function StatCard({
  icon: Icon, label, value, badge, badgeColor = 'text-cyan-400',
  borderColor = 'border-cyan-500/30', valueColor = 'text-white',
}: {
  icon: LucideIcon; label: string; value: string | number;
  badge?: string; badgeColor?: string; borderColor?: string; valueColor?: string;
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
  const [data, setData] = useState<CalidadDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');
      const res = await getCalidadDashboard(token);
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
          <h2 className="text-2xl font-bold">Dashboard de Calidad</h2>
          <p className="text-gray-300 text-sm">
            Resumen de inspecciones — {new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Button onClick={fetchData} leftIcon={IconActualizar}>Actualizar</Button>
      </div>

      {/* Fila 1: General */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2"><IconGrafico size={16} aria-hidden /> General</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard
            icon={IconDocumento}
            label="Total Inspecciones"
            value={data.total_inspecciones}
            badge={`${data.inspecciones_hoy} hoy`}
            badgeColor="text-cyan-400"
            borderColor="border-cyan-500/30"
          />
          <StatCard
            icon={IconCompletado}
            label="Tasa de Aprobación"
            value={`${data.tasa_aprobacion}%`}
            borderColor="border-green-500/30"
            valueColor={data.tasa_aprobacion >= 90 ? 'text-green-400' : data.tasa_aprobacion >= 70 ? 'text-yellow-400' : 'text-red-400'}
          />
          <StatCard
            icon={IconEliminar}
            label="Scrap Hoy"
            value={data.scrap_hoy}
            borderColor="border-red-500/30"
            valueColor="text-red-400"
          />
          <StatCard
            icon={IconInventario}
            label="Scrap del Mes"
            value={data.scrap_mes}
            badge="Acumulado"
            badgeColor="text-orange-400"
            borderColor="border-orange-500/30"
            valueColor="text-orange-400"
          />
        </div>
      </div>

      {/* Fila 2: IQC */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2"><IconBuscar size={16} aria-hidden /> IQC — Inspección de Entrada</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            icon={IconInventario}
            label="Total IQC"
            value={data.iqc_total}
            borderColor="border-blue-500/30"
          />
          <StatCard
            icon={IconCompletado}
            label="IQC Aprobadas"
            value={data.iqc_aprobadas}
            borderColor="border-green-500/30"
            valueColor="text-green-400"
          />
          <StatCard
            icon={IconCerrar}
            label="IQC Rechazadas"
            value={data.iqc_rechazadas}
            borderColor="border-red-500/30"
            valueColor="text-red-400"
          />
        </div>
      </div>

      {/* Fila 3: LQC */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2"><IconProduccion size={16} aria-hidden /> LQC — Inspección en Línea</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            icon={IconProduccion}
            label="Total LQC"
            value={data.lqc_total}
            borderColor="border-purple-500/30"
          />
          <StatCard
            icon={IconCompletado}
            label="LQC Aprobadas"
            value={data.lqc_aprobadas}
            borderColor="border-green-500/30"
            valueColor="text-green-400"
          />
          <StatCard
            icon={IconCerrar}
            label="LQC Rechazadas"
            value={data.lqc_rechazadas}
            borderColor="border-red-500/30"
            valueColor="text-red-400"
          />
        </div>
      </div>

      {/* Fila 4: OQC */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2"><IconOQC size={16} aria-hidden /> OQC — Inspección de Salida</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            icon={IconOQC}
            label="Total OQC"
            value={data.oqc_total}
            borderColor="border-indigo-500/30"
          />
          <StatCard
            icon={IconCompletado}
            label="OQC Aprobadas"
            value={data.oqc_aprobadas}
            borderColor="border-green-500/30"
            valueColor="text-green-400"
          />
          <StatCard
            icon={IconCerrar}
            label="OQC Rechazadas"
            value={data.oqc_rechazadas}
            borderColor="border-red-500/30"
            valueColor="text-red-400"
          />
        </div>
      </div>

      {/* Fila 5: Devoluciones */}
      <div>
        <h3 className="text-sm font-semibold text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2"><IconDevoluciones size={16} aria-hidden /> Devoluciones</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StatCard
            icon={IconDevoluciones}
            label="Inspecciones de Devolución"
            value={data.dev_total}
            borderColor="border-yellow-500/30"
            valueColor="text-yellow-400"
          />
          <StatCard
            icon={IconFecha}
            label="Inspecciones Hoy"
            value={data.inspecciones_hoy}
            badge="Todas las categorías"
            badgeColor="text-cyan-400"
            borderColor="border-cyan-500/30"
            valueColor="text-cyan-400"
          />
        </div>
      </div>
    </div>
  );
}