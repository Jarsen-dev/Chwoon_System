'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { getAlmacenDashboard } from '@/lib/api';
import { AlmacenDashboard } from '@/types';
import { Button, LoadingSpinner } from '@/components/ui';
import {
  IconInventario, IconUbicaciones, IconBloqueado, IconPendiente, IconConfig,
  IconRecepciones, IconPicking, IconCompletado, IconTraslados, IconGrafico,
  IconTiempo, IconSinMovimiento, IconActualizar, IconAlertas,
  type LucideIcon,
} from '@/lib/icons';

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
        <LoadingSpinner />
      </div>
    );
  }

  if (!data) {
    return <p className="text-red-400">Error al cargar el dashboard</p>;
  }

  const Card = ({ icon: Icon, value, label, badge, badgeColor, valueColor }: {
    icon: LucideIcon; value: string | number; label: string;
    badge?: string; badgeColor?: string; valueColor?: string;
  }) => (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 relative">
      {badge && (
        <span className={`absolute top-3 right-3 text-xs px-2 py-0.5 rounded-full ${badgeColor || 'bg-orange-500/20 text-orange-400'}`}>
          {badge}
        </span>
      )}
      <div
        className="inline-flex items-center justify-center h-10 w-10 rounded-lg mb-3 text-[var(--accent)]"
        style={{ backgroundColor: 'var(--accent-soft)' }}
      >
        <Icon size={20} aria-hidden />
      </div>
      <div className={`text-3xl font-bold ${valueColor || 'text-white'}`}>{value}</div>
      <div className="text-sm text-gray-300 mt-1">{label}</div>
    </div>
  );

  const SectionTitle = ({ icon: Icon, children, danger }: { icon: LucideIcon; children: ReactNode; danger?: boolean }) => (
    <h3 className={`text-sm font-semibold uppercase tracking-wider mb-3 flex items-center gap-2 ${danger ? 'text-red-400' : 'text-gray-300'}`}>
      <Icon size={16} aria-hidden /> {children}
    </h3>
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold">Dashboard de Almacén</h2>
          <p className="text-gray-300 text-sm">Resumen general — {fecha}</p>
        </div>
        <Button onClick={cargar} leftIcon={IconActualizar}>Actualizar</Button>
      </div>

      {/* STOCK */}
      <div>
        <SectionTitle icon={IconInventario}>STOCK</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card icon={IconInventario} value={data.total_lotes_activos} label="Lotes Activos" />
          <Card icon={IconUbicaciones} value={data.lotes_sin_ubicacion} label="Sin Ubicar" badge="Aprobados" badgeColor="bg-yellow-500/20 text-yellow-400" />
          <Card icon={IconBloqueado} value={data.lotes_cuarentena} label="En Cuarentena" badgeColor="bg-red-500/20 text-red-400" />
          <Card icon={IconPendiente} value={data.lotes_pendiente_iqc} label="Pendiente IQC" badgeColor="bg-blue-500/20 text-blue-400" />
        </div>
      </div>

      {/* OPERACIONES */}
      <div>
        <SectionTitle icon={IconConfig}>OPERACIONES DEL DÍA</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card icon={IconRecepciones} value={data.recepciones_hoy} label="Recepciones Hoy" valueColor="text-orange-400" />
          <Card icon={IconPicking} value={data.picking_pendientes} label="Picking Pendientes" />
          <Card icon={IconCompletado} value={data.picking_completados_hoy} label="Picking Completados" valueColor="text-green-400" />
          <Card icon={IconTraslados} value={data.traslados_pendientes} label="Traslados Pendientes" valueColor="text-yellow-400" />
        </div>
      </div>

      {/* FIFO HEALTH */}
      <div>
        <SectionTitle icon={IconGrafico}>SALUD FIFO</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card icon={IconTiempo} value={`${data.lote_mas_antiguo_dias} d`} label="Lote Más Antiguo" valueColor="text-blue-400" />
          <Card icon={IconSinMovimiento} value={data.lotes_sin_movimiento_30d} label="Sin Movimiento 30d" valueColor="text-red-400" />
          <Card icon={IconActualizar} value={`${data.rotacion_promedio_dias.toFixed(1)} d`} label="Rotación Promedio" valueColor="text-emerald-400" />
        </div>
      </div>

      {/* STOCK POR ZONA */}
      {Object.keys(data.stock_por_zona).length > 0 && (
        <div>
          <SectionTitle icon={IconUbicaciones}>STOCK POR ZONA</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Object.entries(data.stock_por_zona).map(([zona, info]) => (
              <Card key={zona} icon={IconInventario} value={`${info.kg.toLocaleString('es-MX', {maximumFractionDigits:0})} kg`} label={`${zona} (${info.lotes} lotes)`} />
            ))}
          </div>
        </div>
      )}

      {/* ALERTAS */}
      {data.alertas_lotes_bloqueados.length > 0 && (
        <div>
          <SectionTitle icon={IconAlertas} danger>ALERTAS</SectionTitle>
          <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-4 space-y-2">
            {data.alertas_lotes_bloqueados.map((a: any, i: number) => (
              <div key={i} className="text-sm text-red-300">
                Lote <span className="font-mono text-white">{a.lote_id}</span> ({a.sku}) en IQC &gt; 3 días
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
