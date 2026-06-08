'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { ModuleShell, LoadingSpinner } from '@/components/ui';
import { getModuleTheme, ROLE_BADGE } from '@/lib/theme';
import DashboardTab    from './DashboardTab';
import VentasTab       from './VentasTab';
import PlanVentasTab   from './PlanVentasTab';
import DevolucionesTab from './DevolucionesTab';
import ControlDespachosTab from './ControlDespachosTab';
import DemandaTab from './DemandaTab';
import ReportesTab from './ReportesTab';

const ALL_TABS = [
  { id: 'dashboard',    label: '📊 Dashboard'   },
  { id: 'demanda',      label: '📈 Demanda'      },
  { id: 'ventas',       label: '💵 Ventas'       },
  { id: 'plan-ventas',  label: '📋 Plan Ventas'  },
  { id: 'control-despachos', label: '🚛 Control de Despachos' },
  { id: 'devoluciones', label: '🔄 Devoluciones' },
  { id: 'reportes',     label: '📑 Reportes'     },
];

const THEME = getModuleTheme('ventas');

export default function VentasPage() {
  const [activeTab, setActiveTab] = useState('');
  const { token, rol, username, logout, loading, tieneAccesoTab } = useAuth();
  const router = useRouter();

  const tabs = ALL_TABS.filter(t => tieneAccesoTab('ventas', t.id));

  useEffect(() => {
    if (tabs.length > 0 && !activeTab) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs.length]);

  useEffect(() => {
    if (loading) return;
    if (!token) { router.push('/login'); return; }
    if (rol && !['admin', 'finanzas', 'ventas'].includes(rol)) router.push('/unauthorized');
  }, [token, rol, router, loading]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
        <LoadingSpinner colorClass={THEME.spinner} />
      </div>
    );
  }

  if (!token || (rol && !['admin', 'finanzas', 'ventas'].includes(rol))) return null;

  const badge = ROLE_BADGE[rol || ''] || { icon: '👤', color: 'text-gray-400' };

  const headerRight = (
    <>
      {['admin'].includes(rol || '') && (
        <Link href="/" className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          🏭 Producción
        </Link>
      )}
      {['admin', 'finanzas'].includes(rol || '') && (
        <Link href="/compras" className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          🛒 Compras
        </Link>
      )}
      {rol === 'admin' && (
        <>
          <Link href="/calidad"   className="bg-cyan-600 hover:bg-cyan-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">🔬 Calidad</Link>
          <Link href="/almacen"   className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">📦 Almacén</Link>
          <Link href="/logistica" className="bg-teal-600 hover:bg-teal-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">🚛 Logística</Link>
          <Link href="/admin"     className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">👑 Admin</Link>
        </>
      )}
      <span className={`text-sm font-medium ${badge.color}`}>{badge.icon} {username}</span>
      <button onClick={logout} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
        🚪 Salir
      </button>
    </>
  );

  return (
    <ModuleShell
      moduleKey="ventas"
      title="Panel de Ventas"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      headerRight={headerRight}
    >
      {activeTab === 'dashboard'    && <DashboardTab    token={token} />}
      {activeTab === 'demanda'      && <DemandaTab      token={token} />}
      {activeTab === 'ventas'       && <VentasTab       token={token} />}
      {activeTab === 'plan-ventas'  && <PlanVentasTab   token={token} />}
      {activeTab === 'control-despachos' && <ControlDespachosTab token={token} />}
      {activeTab === 'devoluciones' && <DevolucionesTab token={token} />}
      {activeTab === 'reportes'     && <ReportesTab     token={token} />}
    </ModuleShell>
  );
}
