'use client'

import { useState, useEffect } from 'react'
import { DashboardStats, StatCard } from './helpers'

interface Props {
  token: string
}

export default function DashboardTab({ token }: Props) {
  const [stats, setStats]               = useState<DashboardStats | null>(null)
  const [loadingStats, setLoadingStats] = useState(false)

  const authHeaders = { Authorization: `Bearer ${token}` }

  const cargarDashboard = async () => {
    try {
      setLoadingStats(true)
      const res = await fetch('/api/admin/dashboard', { headers: authHeaders })
      if (res.ok) setStats(await res.json())
    } catch (e) { console.error('Error dashboard:', e) }
    finally { setLoadingStats(false) }
  }

  useEffect(() => { cargarDashboard() }, [])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          {stats && (
            <p className="text-gray-400 text-sm mt-1">
              Turno: <span className="text-white font-semibold">{stats.turno_actual}</span>
              <span className="ml-2 text-gray-500">{stats.fecha_turno}</span>
            </p>
          )}
        </div>
        <button onClick={cargarDashboard} disabled={loadingStats}
          className="text-sm bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg transition-colors">
          {loadingStats ? '⏳ Cargando...' : '🔄 Actualizar'}
        </button>
      </div>

      {loadingStats && !stats ? (
        <div className="text-center py-20 text-gray-400 animate-pulse">⏳ Cargando estadísticas...</div>
      ) : stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon="👥" value={stats.usuarios.total} label="Usuarios"
            badge={`${stats.usuarios.activos} activos`} badgeColor="gray" />
          <StatCard icon="📦" value={stats.partes.total} label="Partes en Inventario" />
          <StatCard icon="📋" value={stats.plan.total} label="Plan de Producción"
            badge={`${stats.plan.pendiente} pendientes`} badgeColor="yellow" />
          <StatCard icon="🖨️" value={stats.cola.pendiente} label="Etiquetas Pendientes"
            badge={`${stats.cola.generado} generados`} badgeColor="purple" />
          <StatCard icon="📷" value={stats.produccion.escaneos_turno} label="Escaneos"
            badge="Turno actual" badgeColor="blue" borderColor="border-blue-800" valueColor="text-blue-400" />
          <StatCard icon="🏭" value={stats.produccion.piezas_turno.toLocaleString()} label="Piezas Producidas"
            badge="Turno actual" badgeColor="emerald" borderColor="border-emerald-800" valueColor="text-emerald-400" />
          <StatCard icon="🌡️" value={stats.secado.dentro} label="En Cámara de Secado"
            badge={`${stats.secado.salidos} salidos`} badgeColor="orange" borderColor="border-orange-800" valueColor="text-orange-400" />
          <StatCard icon="⚠️" value={stats.anomalias.recientes_7d} label="Anomalías"
            badge="Últimos 7 días" badgeColor="red" borderColor="border-red-800" valueColor="text-red-400" />
        </div>
      )}
    </div>
  )
}