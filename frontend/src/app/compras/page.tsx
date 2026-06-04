'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { ModuleShell, LoadingSpinner } from '@/components/ui';
import { getModuleTheme, ROLE_BADGE } from '@/lib/theme';
import DashboardTab from './DashboardTab';
import ComprasTab from './ComprasTab';
import ProveedoresTab from './ProveedoresTab';
import ValidacionTab from './ValidacionTab';

const ALL_TABS = [
  { id: 'dashboard',   label: '📊 Dashboard' },
  { id: 'compras',     label: '🛒 Compras'   },
  { id: 'proveedores', label: '🤝 Proveedores' },
  { id: 'validacion',  label: '⚖️ Validación'  },
];

const THEME = getModuleTheme('compras');

export default function ComprasPage() {
  const [activeTab, setActiveTab] = useState('');
  const { token, rol, username, logout, loading, tieneAccesoTab } = useAuth();
  const router = useRouter();

  const tabs = ALL_TABS.filter(t => tieneAccesoTab('compras', t.id));

  useEffect(() => {
    if (tabs.length > 0 && !activeTab) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs.length]);

  useEffect(() => {
    if (loading) return;
    if (!token) { router.push('/login'); return; }
    if (rol && !['admin', 'finanzas', 'compras'].includes(rol)) router.push('/unauthorized');
  }, [token, rol, router, loading]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
        <LoadingSpinner colorClass={THEME.spinner} />
      </div>
    );
  }

  if (!token || (rol && !['admin', 'finanzas', 'compras'].includes(rol))) return null;

  const badge = ROLE_BADGE[rol || ''] || { icon: '👤', color: 'text-gray-400' };

  const headerRight = (
    <>
      {['admin'].includes(rol || '') && (
        <Link href="/" className={`${THEME.navBg} ${THEME.navHover} px-4 py-2 rounded-lg text-sm font-medium transition-colors`}>
          🏭 Producción
        </Link>
      )}
      {['admin', 'finanzas'].includes(rol || '') && (
        <Link href="/ventas" className="bg-violet-600 hover:bg-violet-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
          💵 Ventas
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
      moduleKey="compras"
      title="Panel de Compras"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      headerRight={headerRight}
    >
      {activeTab === 'dashboard'   && <DashboardTab token={token} />}
      {activeTab === 'compras'   && <ComprasTab   token={token} />}
      {activeTab === 'proveedores' && <ProveedoresTab token={token} />}
      {activeTab === 'validacion'  && <ValidacionTab  token={token} />}
    </ModuleShell>
  );
}
