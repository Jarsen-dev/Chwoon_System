'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'
import { TABS, ROL_ICON } from './helpers'
import { RolUsuario } from '@/types'
import Link from 'next/link'
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

  const headerRight = (
    <>
      <Link href="/"         className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">🏭 Producción</Link>
      <Link href="/compras"  className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">🛒 Compras</Link>
      <Link href="/ventas"   className="bg-violet-600 hover:bg-violet-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">💵 Ventas</Link>
      <Link href="/calidad"  className="bg-cyan-600 hover:bg-cyan-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">🔬 Calidad</Link>
      <Link href="/almacen"  className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">📦 Almacén</Link>
      <Link href="/logistica"className="bg-teal-600 hover:bg-teal-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">🚛 Logística</Link>
      <Link href="/maquinas" className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">⚙️ Máquinas</Link>
      <span className="text-sm font-medium text-yellow-400">{ROL_ICON[rol as RolUsuario]} {username}</span>
      <button onClick={logout} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">🚪 Salir</button>
    </>
  );

  return (
    <ModuleShell
      moduleKey="admin"
      title="Panel de Administración"
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      headerRight={headerRight}
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
