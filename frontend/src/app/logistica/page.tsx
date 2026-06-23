'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ModuleShell, LoadingSpinner } from '@/components/ui';
import type { TabDef } from '@/components/ui/ModuleShell';
import { getModuleTheme } from '@/lib/theme';
import { IconDashboard, IconLogistica, IconDocumento } from '@/lib/icons';
import DashboardTab       from './DashboardTab';
import EmbarquesTab       from './EmbarquesTab';
import ReporteEmbarquesTab from './ReporteEmbarquesTab';

const ALL_TABS: TabDef[] = [
  { id: 'dashboard', label: 'Dashboard', icon: IconDashboard },
  { id: 'embarques', label: 'Embarques', icon: IconLogistica },
  { id: 'reporte',   label: 'Reporte',   icon: IconDocumento },
];

const THEME = getModuleTheme('logistica');

export default function LogisticaPage() {
  const [activeTab, setActiveTab] = useState('');
  const { token, rol, username, logout, loading, tieneAccesoTab } = useAuth();
  const router = useRouter();

  const tabs = ALL_TABS.filter(t => tieneAccesoTab('logistica', t.id));

  useEffect(() => {
    if (tabs.length > 0 && !activeTab) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs.length]);

  useEffect(() => {
    if (loading) return;
    if (!token) { router.push('/login'); return; }
    if (rol && !['admin', 'logistica'].includes(rol)) router.push('/unauthorized');
  }, [token, rol, router, loading]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
        <LoadingSpinner colorClass={THEME.spinner} />
      </div>
    );
  }

  if (!token || (rol && !['admin', 'logistica'].includes(rol))) return null;

  return (
    <ModuleShell
      moduleKey="logistica"
      title="Panel de Logística"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      rol={rol}
      username={username}
      onLogout={logout}
    >
      {activeTab === 'dashboard' && <DashboardTab        token={token} />}
      {activeTab === 'embarques' && <EmbarquesTab        token={token} />}
      {activeTab === 'reporte'   && <ReporteEmbarquesTab token={token} />}
    </ModuleShell>
  );
}
