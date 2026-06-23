'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ModuleShell, LoadingSpinner } from '@/components/ui';
import type { TabDef } from '@/components/ui/ModuleShell';
import { getModuleTheme } from '@/lib/theme';
import {
  IconDashboard, IconBuscar, IconProduccion, IconOQC, IconDevoluciones,
  IconDocumento, IconEliminar,
} from '@/lib/icons';
import DashboardTab    from './DashboardTab';
import IQCTab          from './IQCTab';
import LQCTab          from './LQCTab';
import OQCTab          from './OQCTab';
import DevolucionesTab from './DevolucionesTab';
import HistorialTab    from './HistorialTab';
import ScrapTab        from './ScrapTab';

const ALL_TABS: TabDef[] = [
  { id: 'dashboard',    label: 'Dashboard',    icon: IconDashboard },
  { id: 'iqc',          label: 'IQC',          icon: IconBuscar },
  { id: 'lqc',          label: 'LQC',          icon: IconProduccion },
  { id: 'oqc',          label: 'OQC',          icon: IconOQC },
  { id: 'devoluciones', label: 'Devoluciones', icon: IconDevoluciones },
  { id: 'historial',    label: 'Historial',    icon: IconDocumento },
  { id: 'scrap',        label: 'Scrap',        icon: IconEliminar },
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

  return (
    <ModuleShell
      moduleKey="calidad"
      title="Panel de Calidad"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      rol={rol}
      username={username}
      onLogout={logout}
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
