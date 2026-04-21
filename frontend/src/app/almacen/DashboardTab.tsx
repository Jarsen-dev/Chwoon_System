'use client';

import { useState, useEffect } from 'react';
import { getAlmacenDashboard } from '@/lib/api';
import { AlmacenDashboard } from '@/types';

interface Props {
  token: string;
}

export default function DashboardTab({ token }: Props) {
  const [data, setData] = useState<AlmacenDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const cargar = async () => {
    try {
      setLoading(true);
      const d = await getAlmacenDashboard(token);
      setData(d);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const fecha = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-400" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-red-400">Error al cargar el dashboard</p>;
  }

  const Card = ({ icon, value, label, badge, badgeColor, valueColor }: {
    icon: string; value: string | number; label: string;
    badge?: string; badgeColor?: string; valueColor?: string;
  }) => (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 relative">
      {badge && (
        <span className={`absolute top-3 right-3 text-xs px-2 py-0.5 rounded-full ${badgeColor || 'bg-orange-500/20 text-orange-400'}`}>
          {badge}
        </span>
      )}
      <div className="text-2xl mb-2">{icon}</div>
      <div className={`text-3xl font-bold ${valueColor || 'text-white'}`}>{value}</div>
      <div className="text-sm text-gray-400 mt-1">{label}</div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold">Dashboard de Almacén</h2>
          <p className="text-gray-400 text-sm">Resumen general — {fecha}</p>
        </div>
        <button
          onClick={cargar}
          className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          🔄 Actualizar
        </button>
      </div>

      {/* INVENTARIO */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">📦 INVENTARIO</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card
            icon="📦"
            value={data.total_lotes}
            label="Total Lotes"
            badge={`${data.lotes_sin_ubicacion} sin ubicar`}
            badgeColor="bg-yellow-500/20 text-yellow-400"
          />
          <Card
            icon="📍"
            value={data.total_ubicaciones}
            label="Ubicaciones"
          />
          <Card
            icon="📊"
            value={data.stock_total_items.toLocaleString('es-MX', { maximumFractionDigits: 0 })}
            label="Stock Total (items)"
            valueColor="text-orange-400"
          />
          <Card
            icon="🏭"
            value={data.lotes_eps}
            label="Lotes EPS"
            badge="Acumulado"
            badgeColor="bg-blue-500/20 text-blue-400"
          />
        </div>
      </div>

      {/* EMBARQUES */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">🚚 EMBARQUES</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card
            icon="📋"
            value={data.total_embarques}
            label="Total Embarques"
            badge={`${data.embarques_surtidos} surtidos`}
            badgeColor="bg-green-500/20 text-green-400"
          />
          <Card
            icon="✅"
            value={data.embarques_surtidos}
            label="Surtidos"
            valueColor="text-green-400"
          />
          <Card
            icon="🚛"
            value={data.embarques_en_transito}
            label="En Tránsito"
            valueColor="text-blue-400"
          />
          <Card
            icon="📬"
            value={data.embarques_entregados}
            label="Entregados"
            valueColor="text-emerald-400"
          />
        </div>
      </div>

      {/* TRASLADOS */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">🔄 TRASLADOS A PRODUCCIÓN</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card
            icon="⏳"
            value={data.traslados_pendientes}
            label="Pendientes"
            valueColor="text-yellow-400"
          />
          <Card
            icon="🔄"
            value={data.traslados_en_proceso}
            label="En Proceso"
            valueColor="text-blue-400"
          />
          <Card
            icon="✅"
            value={data.traslados_completados}
            label="Completados"
            valueColor="text-green-400"
          />
        </div>
      </div>
    </div>
  );
}