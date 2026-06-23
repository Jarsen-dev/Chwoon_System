'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'
import { TABS } from './helpers'
import { ModuleShell, LoadingSpinner } from '@/components/ui'
import { getModuleTheme } from '@/lib/theme'

import DashboardTab from './DashboardTab'
import UsuariosTab  from './UsuariosTab'
import LogsTab      from './LogsTab'
import DatabaseTab  from './DatabaseTab'
import SistemaTab   from './SistemaTab'
import EmpresaTab   from './EmpresaTab'

const THEME = getModuleTheme('admin');

export default function AdminPage() {
  const { token, rol, username, logout, loading } = useAuth()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState('dashboard')

  useEffect(() => {
    if (loading) return
    if (!token || rol !== 'admin') router.push('/login')
  }, [token, rol, loading])

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
        <LoadingSpinner colorClass={THEME.spinner} />
      </div>
    )
  }

  if (!token || rol !== 'admin') return null

  return (
    <ModuleShell
      moduleKey="admin"
      title="Panel de Administración"
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      rol={rol}
      username={username}
      onLogout={logout}
    >
      {activeTab === 'dashboard' && <DashboardTab token={token} />}
      {activeTab === 'usuarios'  && <UsuariosTab  token={token} />}
      {activeTab === 'logs'      && <LogsTab      token={token} />}
      {activeTab === 'database'  && <DatabaseTab  token={token} />}
      {activeTab === 'sistema'   && <SistemaTab   token={token} />}
      {activeTab === 'empresa'   && <EmpresaTab   token={token} />}
    </ModuleShell>
  )
}
