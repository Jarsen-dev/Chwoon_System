'use client'

import { useState, useEffect } from 'react'
import { SystemStatus, getTablaIcon } from './helpers'

interface Props {
  token: string
}

export default function SistemaTab({ token }: Props) {
  const [systemStatus, setSystemStatus]   = useState<SystemStatus | null>(null)
  const [loadingSystem, setLoadingSystem] = useState(false)

  const authHeaders = { Authorization: `Bearer ${token}` }

  const cargarSystemStatus = async () => {
    try {
      setLoadingSystem(true)
      const res = await fetch('/api/admin/system-status', { headers: authHeaders })
      if (res.ok) setSystemStatus(await res.json())
    } catch (e) { console.error('Error system:', e) }
    finally { setLoadingSystem(false) }
  }

  useEffect(() => { cargarSystemStatus() }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Estado del Sistema</h2>
          <p className="text-gray-400 text-sm mt-1">Información técnica y monitoreo</p>
        </div>
        <button onClick={cargarSystemStatus} disabled={loadingSystem}
          className="text-sm bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg transition-colors">
          {loadingSystem ? '⏳ Cargando...' : '🔄 Actualizar'}
        </button>
      </div>

      {loadingSystem && !systemStatus ? (
        <div className="text-center py-20 text-gray-400 animate-pulse">⏳ Cargando estado del sistema...</div>
      ) : systemStatus && (
        <>
          {/* Info cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
              <span className="text-2xl block mb-1">💾</span>
              <p className="text-2xl font-bold text-white">{systemStatus.db_size}</p>
              <p className="text-xs text-gray-400 mt-1">Tamaño de DB</p>
            </div>
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
              <span className="text-2xl block mb-1">📊</span>
              <p className="text-2xl font-bold text-white">{systemStatus.total_registros.toLocaleString()}</p>
              <p className="text-xs text-gray-400 mt-1">Registros Totales</p>
            </div>
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
              <span className="text-2xl block mb-1">🗃️</span>
              <p className="text-2xl font-bold text-white">{systemStatus.total_tablas}</p>
              <p className="text-xs text-gray-400 mt-1">Tablas</p>
            </div>
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
              <span className="text-2xl block mb-1">⏱️</span>
              <p className="text-lg font-bold text-white truncate" title={systemStatus.uptime}>
                {systemStatus.uptime}
              </p>
              <p className="text-xs text-gray-400 mt-1">Uptime DB</p>
            </div>
          </div>

          {/* Info técnica */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 p-5 space-y-3">
            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Información Técnica</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="flex justify-between py-2 border-b border-gray-700/50">
                <span className="text-gray-400">PostgreSQL</span>
                <span className="text-gray-200 font-mono text-xs">{systemStatus.pg_version}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-700/50">
                <span className="text-gray-400">Hora Servidor</span>
                <span className="text-gray-200 font-mono text-xs">{systemStatus.hora_servidor}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-700/50">
                <span className="text-gray-400">Backend</span>
                <span className="text-green-400 font-mono text-xs">🟢 FastAPI (8000)</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-700/50">
                <span className="text-gray-400">Frontend</span>
                <span className="text-green-400 font-mono text-xs">🟢 Next.js (3000)</span>
              </div>
            </div>
          </div>

          {/* Tabla de tablas */}
          <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-700">
              <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">Detalle por Tabla</h3>
            </div>
            <table className="w-full">
              <thead>
                <tr className="bg-gray-700/50 text-gray-300 text-xs">
                  <th className="px-5 py-3 text-left">Tabla</th>
                  <th className="px-5 py-3 text-right">Registros</th>
                  <th className="px-5 py-3 text-right">Tamaño</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {systemStatus.tablas.map(tabla => (
                  <tr key={tabla.nombre} className="hover:bg-gray-700/30 transition-colors">
                    <td className="px-5 py-3 text-sm">
                      <span className="mr-2">{getTablaIcon(tabla.nombre)}</span>
                      <span className="font-mono text-gray-300">{tabla.nombre}</span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <span className={`font-bold text-sm ${
                        tabla.registros > 1000 ? 'text-yellow-400'
                        : tabla.registros > 100 ? 'text-blue-400'
                        : 'text-gray-300'
                      }`}>
                        {tabla.registros.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right text-gray-400 font-mono text-xs">
                      {tabla.tamano}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}