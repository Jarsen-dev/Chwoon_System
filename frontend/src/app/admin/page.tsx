'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'
import { TABS, ROL_ICON } from './helpers'
import { RolUsuario } from '@/types'
import Link from 'next/link'

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
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400" />
      </div>
    )
  }

  if (!token || rol !== 'admin') return null

  return (
    <div className="fixed inset-0 bg-gray-950 text-white flex flex-col">

      {/* ═══ HEADER ═══ */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <img src="/Logo.png" alt="Logo" className="h-10 w-auto" />
          <h1 className="text-xl font-bold">Panel de Administración</h1>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            🏭 Producción
          </Link>
          <Link
            href="/compras"
            className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            🛒 Compras
          </Link>
          <Link
            href="/ventas"
            className="bg-violet-600 hover:bg-violet-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            💵 Ventas
          </Link>
          <Link
            href="/calidad"
            className="bg-cyan-600 hover:bg-cyan-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            🔬 Calidad
          </Link>
          <Link
            href="/almacen"
            className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            📦 Almacén
          </Link>
          <Link
            href="/logistica"
            className="bg-teal-600 hover:bg-teal-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            🚛 Logística
          </Link>

          <span className="text-sm font-medium text-yellow-400">
            {ROL_ICON[rol as RolUsuario]} {username}
          </span>

          <button
            onClick={logout}
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            🚪 Salir
          </button>
        </div>
      </header>

      {/* ═══ TABS ═══ */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 shrink-0">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-gray-950 text-blue-400 border-b-2 border-blue-400'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ═══ CONTENT ═══ */}
      <main className="flex-1 overflow-y-auto p-6">
        {activeTab === 'dashboard' && <DashboardTab token={token} />}
        {activeTab === 'usuarios'  && <UsuariosTab  token={token} />}
        {activeTab === 'logs'      && <LogsTab      token={token} />}
        {activeTab === 'database'  && <DatabaseTab  token={token} />}
        {activeTab === 'sistema'   && <SistemaTab   token={token} />}
      </main>
    </div>
  )
}