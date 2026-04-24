'use client';

import { useState, useEffect } from 'react';
import { getLogisticaDashboard } from '@/lib/api';
import { LogisticaDashboard } from '@/types';

interface Props {
  token: string;
}

export default function DashboardTab({ token }: Props) {
  const [data, setData] = useState<LogisticaDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const cargar = async () => {
    try {
      setLoading(true);
      const d = await getLogisticaDashboard(token);
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-400" />
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
        <span className={`absolute top-3 right-3 text-xs px-2 py-0.5 rounded-full ${badgeColor || 'bg-teal-500/20 text-teal-400'}`}>
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
          <h2 className="text-2xl font-bold">Dashboard de Logística</h2>
          <p className="text-gray-400 text-sm">Resumen general — {fecha}</p>
        </div>
        <button
          onClick={cargar}
          className="bg-teal-600 hover:bg-teal-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
        >
          🔄 Actualizar
        </button>
      </div>

      {/* EMBARQUES */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">🚚 EMBARQUES</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card
            icon="📋"
            value={data.total_embarques}
            label="Total Embarques"
            badge={`${data.embarques_hoy} hoy`}
            badgeColor="bg-teal-500/20 text-teal-400"
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
        </div>
      </div>

      {/* ENTREGAS */}
      <div>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">📬 ENTREGAS</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card
            icon="📬"
            value={data.embarques_entregados}
            label="Total Entregados"
            valueColor="text-emerald-400"
          />
          <Card
            icon="📅"
            value={data.embarques_hoy}
            label="Embarques Hoy"
            valueColor="text-teal-400"
          />
          <Card
            icon="🎯"
            value={data.entregas_hoy}
            label="Entregas Hoy"
            valueColor="text-yellow-400"
          />
        </div>
      </div>
    </div>
  );
}