'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'
import { TABS, ROL_ICON } from './helpers'
import { RolUsuario } from '@/types'

import DashboardTab from './DashboardTab'
import UsuariosTab  from './UsuariosTab'
import LogsTab      from './LogsTab'
import DatabaseTab  from './DatabaseTab'
import SistemaTab   from './SistemaTab'

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
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl animate-pulse">⏳ Cargando...</div>
      </div>
    )
  }

  if (!token || rol !== 'admin') return null

  return (
    <div className="fixed inset-0 bg-gray-900 text-white flex flex-col overflow-hidden">

      {/* ═══ NAVBAR ═══ */}
      <nav className="bg-gray-800 border-b border-gray-700 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <img src="/Logo.png" alt="Logo" className="h-10 w-auto" />
          <h1 className="text-lg font-bold">Panel de Administración</h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/')}
            className="text-sm bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg transition-colors">
            🏭 Producción
          </button>
          <button onClick={() => router.push('/finanzas')}
            className="text-sm bg-emerald-700 hover:bg-emerald-600 text-emerald-100 px-3 py-1.5 rounded-lg transition-colors">
            💰 Finanzas
          </button>
          <span className="text-gray-400 text-sm">{ROL_ICON[rol as RolUsuario]} {username}</span>
          <button onClick={logout}
            className="text-sm bg-red-900/50 hover:bg-red-800 text-red-300 px-3 py-1.5 rounded-lg transition-colors">
            🚪 Salir
          </button>
        </div>
      </nav>

      {/* ═══ PESTAÑAS ═══ */}
      <div className="flex bg-gray-800/50 border-b border-gray-700 overflow-x-auto shrink-0">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-3 font-semibold whitespace-nowrap transition-colors text-sm ${
              activeTab === tab.id
                ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-700/30'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/20'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══ CONTENIDO ═══ */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          {activeTab === 'dashboard' && <DashboardTab  token={token} />}
          {activeTab === 'usuarios'  && <UsuariosTab   token={token} />}
          {activeTab === 'logs'      && <LogsTab       token={token} />}
          {activeTab === 'database'  && <DatabaseTab   token={token} />}
          {activeTab === 'sistema'   && <SistemaTab    token={token} />}
        </div>
      </div>

    </div>
  )
}