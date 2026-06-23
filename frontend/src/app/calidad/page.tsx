'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { ModuleShell, LoadingSpinner } from '@/components/ui';
import { getModuleTheme } from '@/lib/theme';
import UserBadge from '@/components/UserBadge';
import DashboardTab    from './DashboardTab';
import IQCTab          from './IQCTab';
import LQCTab          from './LQCTab';
import OQCTab          from './OQCTab';
import DevolucionesTab from './DevolucionesTab';
import HistorialTab    from './HistorialTab';
import ScrapTab        from './ScrapTab';

const ALL_TABS = [
  { id: 'dashboard',    label: '📊 Dashboard'   },
  { id: 'iqc',          label: '🔍 IQC'         },
  { id: 'lqc',          label: '🏭 LQC'         },
  { id: 'oqc',          label: '📦 OQC'         },
  { id: 'devoluciones', label: '🔄 Devoluciones' },
  { id: 'historial',    label: '📋 Historial'   },
  { id: 'scrap',        label: '🗑️ Scrap'        },
];

const THEME = getModuleTheme('calidad');

export default function CalidadPage() {
  const [activeTab, setActiveTab] = useState('');
  const { token, rol, username, logout, loading, tieneAccesoTab } = useAuth();
  const router = useRouter();

  const tabs = ALL_TABS.filter(t => tieneAccesoTab('calidad', t.id));

  useEffect(() => {
    if (tabs.length > 0 && !activeTab) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs.length]);

  useEffect(() => {
    if (loading) return;
    if (!token) { router.push('/login'); return; }
    if (rol && !['admin', 'calidad'].includes(rol)) router.push('/unauthorized');
  }, [token, rol, router, loading]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
        <LoadingSpinner colorClass={THEME.spinner} />
      </div>
    );
  }

  if (!token || (rol && !['admin', 'calidad'].includes(rol))) return null;


  const headerRight = (
    <>
      {['admin'].includes(rol || '') && (
        <Link href="/" className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          🏭 Producción
        </Link>
      )}
      {['admin', 'finanzas'].includes(rol || '') && (
        <>
          <Link href="/compras" className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">🛒 Compras</Link>
          <Link href="/ventas" className="bg-violet-600 hover:bg-violet-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">💵 Ventas</Link>
        </>
      )}
      {rol === 'admin' && (
        <>
          <Link href="/almacen"   className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">📦 Almacén</Link>
          <Link href="/logistica" className="bg-teal-600 hover:bg-teal-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">🚛 Logística</Link>
          <Link href="/maquinas"  className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">⚙️ Máquinas</Link>
          <Link href="/admin"     className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">👑 Admin</Link>
        </>
      )}
      <UserBadge rol={rol} username={username} />
      <button onClick={logout} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
        🚪 Salir
      </button>
    </>
  );

  return (
    <ModuleShell
      moduleKey="calidad"
      title="Panel de Calidad"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      headerRight={headerRight}
    >
      {activeTab === 'dashboard'    && <DashboardTab    token={token} />}
      {activeTab === 'iqc'          && <IQCTab          token={token} />}
      {activeTab === 'lqc'          && <LQCTab          token={token} />}
      {activeTab === 'oqc'          && <OQCTab          token={token} />}
      {activeTab === 'devoluciones' && <DevolucionesTab token={token} />}
      {activeTab === 'historial'    && <HistorialTab    token={token} />}
      {activeTab === 'scrap'        && <ScrapTab        token={token} />}
    </ModuleShell>
  );
}
