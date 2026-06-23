'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { ModuleShell, LoadingSpinner } from '@/components/ui';
import type { TabDef } from '@/components/ui/ModuleShell';
import { getModuleTheme } from '@/lib/theme';
import {
  IconDashboard,
  IconRecepciones,
  IconInventario,
  IconUbicaciones,
  IconTraslados,
  IconAlmacen,
  IconTrazabilidad,
  IconConteo,
  IconPicking,
  IconConfig,
} from '@/lib/icons';
import DashboardTab    from './DashboardTab';
import RecepcionesTab  from './RecepcionesTab';
import InventarioTab   from './InventarioTab';
import UbicacionesTab  from './UbicacionesTab';
import TrasladosTab    from './TrasladosTab';
import EPSTab          from './EPSTab';
import TrazabilidadTab from './TrazabilidadTab';
import ConteoFisicoTab from './ConteoFisicoTab';
import PickingTab from './PickingTab';
import ConfiguracionTab from './ConfiguracionTab';

const ALL_TABS: TabDef[] = [
  { id: 'dashboard',     label: 'Dashboard',     icon: IconDashboard },
  { id: 'recepciones',   label: 'Recepciones',   icon: IconRecepciones },
  { id: 'inventario',    label: 'Inventario',    icon: IconInventario },
  { id: 'ubicaciones',   label: 'Ubicaciones',   icon: IconUbicaciones },
  { id: 'traslados',     label: 'Traslados',     icon: IconTraslados },
  { id: 'eps',           label: 'Almacén EPS',   icon: IconAlmacen },
  { id: 'trazabilidad',  label: 'Trazabilidad',  icon: IconTrazabilidad },
  { id: 'conteo-fisico', label: 'Conteo Físico', icon: IconConteo },
  { id: 'picking',       label: 'Picking',       icon: IconPicking },
  { id: 'configuracion', label: 'Configuración', icon: IconConfig },
];

const THEME = getModuleTheme('almacen');

export default function AlmacenPage() {
  const [activeTab, setActiveTab] = useState('');
  const { token, rol, username, logout, loading, tieneAccesoTab } = useAuth();
  const router = useRouter();

  const tabs = ALL_TABS.filter(t => tieneAccesoTab('almacen', t.id));

  useEffect(() => {
    if (tabs.length > 0 && !activeTab) {
      setActiveTab(tabs[0].id);
    }
  }, [tabs.length]);

  useEffect(() => {
    if (loading) return;
    if (!token) { router.push('/login'); return; }
    if (rol && !['admin', 'almacen'].includes(rol)) router.push('/unauthorized');
  }, [token, rol, router, loading]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
        <LoadingSpinner colorClass={THEME.spinner} />
      </div>
    );
  }

  if (!token || (rol && !['admin', 'almacen'].includes(rol))) return null;

  return (
    <ModuleShell
      moduleKey="almacen"
      title="Panel de Almacén"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      rol={rol}
      username={username}
      onLogout={logout}
    >
      {activeTab === 'dashboard'    && <DashboardTab    token={token} />}
      {activeTab === 'recepciones'  && <RecepcionesTab  token={token} />}
      {activeTab === 'inventario'   && <InventarioTab   token={token} />}
      {activeTab === 'ubicaciones'  && <UbicacionesTab  token={token} />}
      {activeTab === 'traslados'    && <TrasladosTab    token={token} />}
      {activeTab === 'eps'          && <EPSTab          token={token} />}
      {activeTab === 'trazabilidad' && <TrazabilidadTab token={token} />}
      {activeTab === 'conteo-fisico' && <ConteoFisicoTab token={token} />}
      {activeTab === 'picking' && <PickingTab token={token} />}
      {activeTab === 'configuracion' && <ConfiguracionTab token={token} />}
    </ModuleShell>
  );
}
