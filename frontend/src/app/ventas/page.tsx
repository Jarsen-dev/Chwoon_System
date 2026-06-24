'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ModuleShell, LoadingSpinner } from '@/components/ui';
import type { TabDef } from '@/components/ui/ModuleShell';
import { getModuleTheme } from '@/lib/theme';
import {
  IconDashboard, IconDemanda, IconVentas, IconDocumento, IconLogistica,
  IconDevoluciones, IconUsuarios,
} from '@/lib/icons';
import DashboardTab    from './DashboardTab';
import VentasTab       from './VentasTab';
import PlanVentasTab   from './PlanVentasTab';
import DevolucionesTab from './DevolucionesTab';
import ControlDespachosTab from './ControlDespachosTab';
import DemandaTab from './DemandaTab';
import ReportesTab from './ReportesTab';
import ClientesTab from './ClientesTab';

const ALL_TABS: TabDef[] = [
  { id: 'dashboard',         label: 'Dashboard',           icon: IconDashboard },
  { id: 'demanda',           label: 'Demanda',             icon: IconDemanda },
  { id: 'ventas',            label: 'Ventas',              icon: IconVentas },
  { id: 'plan-ventas',       label: 'Plan Ventas',         icon: IconDocumento },
  { id: 'control-despachos', label: 'Control de Despachos', icon: IconLogistica },
  { id: 'devoluciones',      label: 'Devoluciones',        icon: IconDevoluciones },
  { id: 'reportes',          label: 'Reportes',            icon: IconDocumento },
  { id: 'clientes',          label: 'Clientes',            icon: IconUsuarios },
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

  return (
    <ModuleShell
      moduleKey="ventas"
      title="Panel de Ventas"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      rol={rol}
      username={username}
      onLogout={logout}
    >
      {activeTab === 'dashboard'    && <DashboardTab    token={token} />}
      {activeTab === 'demanda'      && <DemandaTab      token={token} />}
      {activeTab === 'ventas'       && <VentasTab       token={token} />}
      {activeTab === 'plan-ventas'  && <PlanVentasTab   token={token} />}
      {activeTab === 'control-despachos' && <ControlDespachosTab token={token} />}
      {activeTab === 'devoluciones' && <DevolucionesTab token={token} />}
      {activeTab === 'reportes'     && <ReportesTab     token={token} />}
      {activeTab === 'clientes'    && <ClientesTab    token={token} />}
    </ModuleShell>
  );
}
