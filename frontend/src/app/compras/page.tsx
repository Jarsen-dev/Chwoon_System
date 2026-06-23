'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ModuleShell, LoadingSpinner } from '@/components/ui';
import type { TabDef } from '@/components/ui/ModuleShell';
import { getModuleTheme } from '@/lib/theme';
import { IconDashboard, IconCompras, IconProveedores, IconValidacion } from '@/lib/icons';
import DashboardTab from './DashboardTab';
import ComprasTab from './ComprasTab';
import ProveedoresTab from './ProveedoresTab';
import ValidacionTab from './ValidacionTab';

const ALL_TABS: TabDef[] = [
  { id: 'dashboard',   label: 'Dashboard',   icon: IconDashboard },
  { id: 'compras',     label: 'Compras',     icon: IconCompras },
  { id: 'proveedores', label: 'Proveedores', icon: IconProveedores },
  { id: 'validacion',  label: 'Validación',  icon: IconValidacion },
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

  return (
    <ModuleShell
      moduleKey="compras"
      title="Panel de Compras"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      rol={rol}
      username={username}
      onLogout={logout}
    >
      {activeTab === 'dashboard'   && <DashboardTab token={token} />}
      {activeTab === 'compras'   && <ComprasTab   token={token} />}
      {activeTab === 'proveedores' && <ProveedoresTab token={token} />}
      {activeTab === 'validacion'  && <ValidacionTab  token={token} />}
    </ModuleShell>
  );
}
