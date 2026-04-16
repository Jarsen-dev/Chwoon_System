'use client'

import { useAuth } from '@/context/AuthContext'
import { usePathname } from 'next/navigation'

export default function Navbar() {
  const { token, rol, username, logout } = useAuth()
  const pathname = usePathname()

  // No mostrar navbar en login, unauthorized, admin ni finanzas (fullscreen)
  if (
    pathname === '/login' ||
    pathname === '/unauthorized' ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/finanzas')
  ) {
    return null
  }

  // No mostrar si no hay sesión
  if (!token) return null

  return (
    <nav className="bg-slate-800 text-white p-4">
      <div className="container mx-auto flex items-center justify-between">

        {/* Logo */}
        <div className="flex items-center gap-2">
          <img src="/Logo.png" alt="Logo" className="h-8 w-auto" />
          <h1 className="text-xl font-bold">Sistema de Producción</h1>
        </div>

        {/* Links según rol */}
        <div className="flex gap-4 items-center">
          <a href="/"
            className="hover:text-blue-300 transition">
            🏠 Dashboard
          </a>

          {/* Todos los roles de producción */}
          {['admin', 'supervisor', 'operador'].includes(rol ?? '') && (
            <>
              <a href="/partes"
                className="hover:text-blue-300 transition">
                ⚙️ Partes
              </a>
              <a href="/etiquetas"
                className="hover:text-blue-300 transition">
                🖨️ Etiquetas
              </a>
              <a href="/produccion"
                className="hover:text-blue-300 transition">
                🔍 Producción
              </a>
            </>
          )}

          {/* Solo admin y supervisor */}
          {['admin', 'supervisor'].includes(rol ?? '') && (
            <a href="/inventario"
              className="hover:text-blue-300 transition">
              📦 Inventario
            </a>
          )}

          {/* Finanzas — admin y finanzas */}
          {['admin', 'finanzas'].includes(rol ?? '') && (
            <a href="/finanzas"
              className="hover:text-emerald-300 transition font-semibold text-emerald-400">
              💰 Finanzas
            </a>
          )}

          {/* Solo admin */}
          {rol === 'admin' && (
            <a href="/admin"
              className="hover:text-yellow-300 transition font-semibold">
              👑 Admin
            </a>
          )}

          {/* Divider */}
          <span className="text-gray-500">|</span>

          {/* Usuario y logout */}
          <span className="text-gray-300 text-sm">
            {rol === 'admin'      && '👑'}
            {rol === 'supervisor' && '🔵'}
            {rol === 'operador'   && '🟢'}
            {rol === 'finanzas'   && '💰'}
            {' '}{username}
          </span>

          <button
            onClick={logout}
            className="text-sm bg-red-900/50 hover:bg-red-800 text-red-300
                       px-3 py-1 rounded-lg transition-colors"
          >
            🚪 Salir
          </button>
        </div>

      </div>
    </nav>
  )
}