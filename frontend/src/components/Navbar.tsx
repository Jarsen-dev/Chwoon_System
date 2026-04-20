'use client'

import { useAuth } from '@/context/AuthContext'
import { usePathname } from 'next/navigation'

export default function Navbar() {
  const { token, rol, username, logout } = useAuth()
  const pathname = usePathname()

  if (
    pathname === '/login' ||
    pathname === '/unauthorized' ||
    pathname.startsWith('/admin') ||
    pathname.startsWith('/finanzas') ||
    pathname.startsWith('/calidad')
  ) {
    return null
  }

  if (!token) return null

  return (
    <nav className="bg-slate-800 text-white p-4">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/Logo.png" alt="Logo" className="h-8 w-auto" />
          <h1 className="text-xl font-bold">Sistema de Producción</h1>
        </div>

        <div className="flex gap-4 items-center">
          <a href="/" className="hover:text-blue-300 transition">
            🏠 Dashboard
          </a>

          {['admin', 'supervisor', 'operador'].includes(rol ?? '') && (
            <>
              <a href="/partes" className="hover:text-blue-300 transition">⚙️ Partes</a>
              <a href="/etiquetas" className="hover:text-blue-300 transition">🖨️ Etiquetas</a>
              <a href="/produccion" className="hover:text-blue-300 transition">🔍 Producción</a>
            </>
          )}

          {['admin', 'supervisor'].includes(rol ?? '') && (
            <a href="/inventario" className="hover:text-blue-300 transition">📦 Inventario</a>
          )}

          {['admin', 'finanzas'].includes(rol ?? '') && (
            <a href="/finanzas" className="hover:text-emerald-300 transition font-semibold text-emerald-400">
              💰 Compras
            </a>
          )}

          {['admin', 'calidad'].includes(rol ?? '') && (
            <a href="/calidad" className="hover:text-cyan-300 transition font-semibold text-cyan-400">
              🔬 Calidad
            </a>
          )}

          {rol === 'admin' && (
            <a href="/admin" className="hover:text-yellow-300 transition font-semibold">
              👑 Admin
            </a>
          )}

          <span className="text-gray-500">|</span>

          <span className="text-gray-300 text-sm">
            {rol === 'admin'      && '👑'}
            {rol === 'supervisor' && '🔵'}
            {rol === 'operador'   && '🟢'}
            {rol === 'finanzas'   && '💰'}
            {rol === 'calidad'    && '🔬'}
            {' '}{username}
          </span>

          <button
            onClick={logout}
            className="text-sm bg-red-900/50 hover:bg-red-800 text-red-300 px-3 py-1 rounded-lg transition-colors"
          >
            🚪 Salir
          </button>
        </div>
      </div>
    </nav>
  )
}