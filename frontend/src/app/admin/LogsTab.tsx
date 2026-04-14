'use client'

import { useState, useEffect } from 'react'
import { LogEntry } from './helpers'

interface Props {
  token: string
}

export default function LogsTab({ token }: Props) {
  const [logs, setLogs]                         = useState<LogEntry[]>([])
  const [loadingLogs, setLoadingLogs]           = useState(false)
  const [filtroFecha, setFiltroFecha]           = useState('')
  const [filtroHoraDesde, setFiltroHoraDesde]   = useState('')
  const [filtroHoraHasta, setFiltroHoraHasta]   = useState('')
  const [filtroModulo, setFiltroModulo]         = useState('')
  const [filtroUsuario, setFiltroUsuario]       = useState('')
  const [logUsuarios, setLogUsuarios]           = useState<string[]>([])

  const authHeaders = { Authorization: `Bearer ${token}` }

  const cargarLogs = async () => {
    try {
      setLoadingLogs(true)
      const params = new URLSearchParams({ limite: '200' })
      if (filtroFecha)      params.set('fecha',      filtroFecha)
      if (filtroHoraDesde)  params.set('hora_desde',  filtroHoraDesde)
      if (filtroHoraHasta)  params.set('hora_hasta',  filtroHoraHasta)
      if (filtroModulo)     params.set('modulo',      filtroModulo)
      if (filtroUsuario)    params.set('usuario',     filtroUsuario)

      const res = await fetch(`/api/admin/logs?${params.toString()}`, { headers: authHeaders })
      if (res.ok) setLogs(await res.json())
    } catch (e) { console.error('Error logs:', e) }
    finally { setLoadingLogs(false) }
  }

  const cargarLogUsuarios = async () => {
    try {
      const res = await fetch('/api/admin/logs/usuarios', { headers: authHeaders })
      if (res.ok) setLogUsuarios(await res.json())
    } catch (e) { console.error('Error log usuarios:', e) }
  }

  useEffect(() => { cargarLogs(); cargarLogUsuarios() }, [])

  // Recargar cuando cambian filtros
  useEffect(() => {
    cargarLogs()
  }, [filtroFecha, filtroHoraDesde, filtroHoraHasta, filtroModulo, filtroUsuario])

  const hayFiltros = filtroFecha || filtroHoraDesde || filtroHoraHasta || filtroModulo || filtroUsuario

  const limpiarFiltros = () => {
    setFiltroFecha('')
    setFiltroHoraDesde('')
    setFiltroHoraHasta('')
    setFiltroModulo('')
    setFiltroUsuario('')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Logs de Actividad</h2>
          <p className="text-gray-400 text-sm mt-1">Últimas acciones del sistema</p>
        </div>
        <button onClick={cargarLogs} disabled={loadingLogs}
          className="text-sm bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg transition-colors">
          {loadingLogs ? '⏳ Cargando...' : '🔄 Actualizar'}
        </button>
      </div>

      {/* ═══ FILTROS ═══ */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-gray-300">🔍 Filtros</span>
          {hayFiltros && (
            <button onClick={limpiarFiltros}
              className="text-xs bg-red-900/40 hover:bg-red-800/60 text-red-300 px-2 py-0.5 rounded-lg transition-colors">
              ✖ Limpiar filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Fecha + Hora */}
          <div className="sm:col-span-2 lg:col-span-2">
            <label className="block text-xs text-gray-400 mb-1">📅 Fecha y Hora</label>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="date"
                value={filtroFecha}
                onChange={e => setFiltroFecha(e.target.value)}
                className="w-full bg-gray-700 border border-gray-600 text-gray-200 rounded-lg px-3 py-2 text-sm
                           focus:outline-none focus:border-blue-500 transition-colors
                           [&::-webkit-calendar-picker-indicator]:invert
                           [&::-webkit-calendar-picker-indicator]:opacity-50
                           [&::-webkit-calendar-picker-indicator]:hover:opacity-100"
                title="Fecha"
              />
              <div className="relative">
                <input
                  type="time"
                  value={filtroHoraDesde}
                  onChange={e => setFiltroHoraDesde(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 text-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:border-blue-500 transition-colors
                             [&::-webkit-calendar-picker-indicator]:invert
                             [&::-webkit-calendar-picker-indicator]:opacity-50
                             [&::-webkit-calendar-picker-indicator]:hover:opacity-100"
                  title="Hora desde"
                />
                <span className="absolute -top-1.5 left-2 text-[10px] text-gray-500 bg-gray-700 px-1">Desde</span>
              </div>
              <div className="relative">
                <input
                  type="time"
                  value={filtroHoraHasta}
                  onChange={e => setFiltroHoraHasta(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 text-gray-200 rounded-lg px-3 py-2 text-sm
                             focus:outline-none focus:border-blue-500 transition-colors
                             [&::-webkit-calendar-picker-indicator]:invert
                             [&::-webkit-calendar-picker-indicator]:opacity-50
                             [&::-webkit-calendar-picker-indicator]:hover:opacity-100"
                  title="Hora hasta"
                />
                <span className="absolute -top-1.5 left-2 text-[10px] text-gray-500 bg-gray-700 px-1">Hasta</span>
              </div>
            </div>
          </div>

          {/* 2. Módulo */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">📦 Módulo</label>
            <select value={filtroModulo} onChange={e => setFiltroModulo(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 text-gray-200 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:border-blue-500 transition-colors">
              <option value="">Todos los módulos</option>
              <option value="produccion">📷 Producción</option>
              <option value="secado">🌡️ Secado</option>
              <option value="etiquetas">🖨️ Etiquetas</option>
            </select>
          </div>

          {/* 3. Usuario */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">👤 Usuario</label>
            <select value={filtroUsuario} onChange={e => setFiltroUsuario(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 text-gray-200 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:border-blue-500 transition-colors">
              <option value="">Todos los usuarios</option>
              {logUsuarios.map(u => (
                <option key={u} value={u}>👤 {u}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Resumen de filtros activos */}
        <div className="flex items-center flex-wrap gap-2 mt-3 pt-3 border-t border-gray-700/50">
          <span className="text-xs text-gray-500">
            {logs.length} registro{logs.length !== 1 ? 's' : ''} encontrado{logs.length !== 1 ? 's' : ''}
          </span>
          {filtroFecha && (
            <span className="text-xs bg-blue-900/40 text-blue-300 px-2 py-0.5 rounded-full border border-blue-700/50 flex items-center gap-1">
              📅 {filtroFecha}
              <button onClick={() => setFiltroFecha('')} className="hover:text-white ml-0.5">×</button>
            </span>
          )}
          {filtroHoraDesde && (
            <span className="text-xs bg-blue-900/40 text-blue-300 px-2 py-0.5 rounded-full border border-blue-700/50 flex items-center gap-1">
              🕐 Desde {filtroHoraDesde}
              <button onClick={() => setFiltroHoraDesde('')} className="hover:text-white ml-0.5">×</button>
            </span>
          )}
          {filtroHoraHasta && (
            <span className="text-xs bg-blue-900/40 text-blue-300 px-2 py-0.5 rounded-full border border-blue-700/50 flex items-center gap-1">
              🕐 Hasta {filtroHoraHasta}
              <button onClick={() => setFiltroHoraHasta('')} className="hover:text-white ml-0.5">×</button>
            </span>
          )}
          {filtroModulo && (
            <span className="text-xs bg-purple-900/40 text-purple-300 px-2 py-0.5 rounded-full border border-purple-700/50 flex items-center gap-1">
              📦 {filtroModulo}
              <button onClick={() => setFiltroModulo('')} className="hover:text-white ml-0.5">×</button>
            </span>
          )}
          {filtroUsuario && (
            <span className="text-xs bg-green-900/40 text-green-300 px-2 py-0.5 rounded-full border border-green-700/50 flex items-center gap-1">
              👤 {filtroUsuario}
              <button onClick={() => setFiltroUsuario('')} className="hover:text-white ml-0.5">×</button>
            </span>
          )}
        </div>
      </div>

      {/* ═══ TABLA ═══ */}
      {loadingLogs ? (
        <div className="text-center py-20 text-gray-400 animate-pulse">⏳ Cargando logs...</div>
      ) : logs.length === 0 ? (
        <div className="text-center py-20">
          <span className="text-4xl block mb-2">📋</span>
          <span className="text-gray-400">
            {hayFiltros
              ? 'No se encontraron registros con los filtros aplicados.'
              : 'No hay actividad registrada.'}
          </span>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="max-h-[600px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-700/80 text-gray-300 text-sm backdrop-blur">
                  <th className="px-4 py-3 text-left">Fecha</th>
                  <th className="px-4 py-3 text-left">Hora</th>
                  <th className="px-4 py-3 text-left">Usuario</th>
                  <th className="px-4 py-3 text-left">Acción</th>
                  <th className="px-4 py-3 text-left">Detalle</th>
                  <th className="px-4 py-3 text-center">Módulo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700/50">
                {logs.map((log, idx) => (
                  <tr key={idx} className="hover:bg-gray-700/30 transition-colors text-sm">
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs whitespace-nowrap">{log.fecha}</td>
                    <td className="px-4 py-3 text-gray-300 font-mono text-xs whitespace-nowrap">{log.hora}</td>
                    <td className="px-4 py-3"><span className="text-blue-300 text-xs font-medium">👤 {log.usuario}</span></td>
                    <td className="px-4 py-3 text-gray-200 text-xs font-medium">{log.accion}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs max-w-[250px]">
                      <span className="block truncate" title={log.detalle}>{log.detalle}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        log.modulo === 'produccion' ? 'bg-blue-900/50 text-blue-300 border border-blue-700'
                        : log.modulo === 'secado'   ? 'bg-orange-900/50 text-orange-300 border border-orange-700'
                        : 'bg-purple-900/50 text-purple-300 border border-purple-700'
                      }`}>
                        {log.modulo === 'produccion' ? '📷' : log.modulo === 'secado' ? '🌡️' : '🖨️'} {log.modulo}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}