'use client'

import { useState, useEffect } from 'react'
import { LogEntry } from './helpers'
import { Button, LoadingSpinner } from '@/components/ui'
import {
  IconActualizar, IconFiltro, IconCerrar, IconFecha, IconInventario, IconUsuario,
  IconTiempo, IconCamara, IconSecado, IconEtiquetas, IconLogs, type LucideIcon,
} from '@/lib/icons'

function ModuloIcon({ modulo, size = 12 }: { modulo: string; size?: number }) {
  const Icon: LucideIcon = modulo === 'produccion' ? IconCamara : modulo === 'secado' ? IconSecado : IconEtiquetas
  return <Icon size={size} aria-hidden />
}

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
        <Button variant="secondary" size="sm" onClick={cargarLogs} disabled={loadingLogs} leftIcon={IconActualizar}>
          {loadingLogs ? 'Cargando...' : 'Actualizar'}
        </Button>
      </div>

      {/* ═══ FILTROS ═══ */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-gray-300 inline-flex items-center gap-2"><IconFiltro size={15} aria-hidden /> Filtros</span>
          {hayFiltros && (
            <button onClick={limpiarFiltros}
              className="inline-flex items-center gap-1 text-xs bg-red-900/40 hover:bg-red-800/60 text-red-300 px-2 py-0.5 rounded-lg transition-colors">
              <IconCerrar size={12} aria-hidden /> Limpiar filtros
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* 1. Fecha + Hora */}
          <div className="sm:col-span-2 lg:col-span-2">
            <label className="flex items-center gap-1 text-xs text-gray-300 mb-1"><IconFecha size={13} aria-hidden /> Fecha y Hora</label>
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
            <label className="flex items-center gap-1 text-xs text-gray-300 mb-1"><IconInventario size={13} aria-hidden /> Módulo</label>
            <select value={filtroModulo} onChange={e => setFiltroModulo(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 text-gray-200 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:border-blue-500 transition-colors">
              <option value="">Todos los módulos</option>
              <option value="produccion">Producción</option>
              <option value="secado">Secado</option>
              <option value="etiquetas">Etiquetas</option>
            </select>
          </div>

          {/* 3. Usuario */}
          <div>
            <label className="flex items-center gap-1 text-xs text-gray-300 mb-1"><IconUsuario size={13} aria-hidden /> Usuario</label>
            <select value={filtroUsuario} onChange={e => setFiltroUsuario(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 text-gray-200 rounded-lg px-3 py-2 text-sm
                         focus:outline-none focus:border-blue-500 transition-colors">
              <option value="">Todos los usuarios</option>
              {logUsuarios.map(u => (
                <option key={u} value={u}>{u}</option>
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
              <IconFecha size={12} aria-hidden /> {filtroFecha}
              <button onClick={() => setFiltroFecha('')} className="hover:text-white ml-0.5">×</button>
            </span>
          )}
          {filtroHoraDesde && (
            <span className="text-xs bg-blue-900/40 text-blue-300 px-2 py-0.5 rounded-full border border-blue-700/50 flex items-center gap-1">
              <IconTiempo size={12} aria-hidden /> Desde {filtroHoraDesde}
              <button onClick={() => setFiltroHoraDesde('')} className="hover:text-white ml-0.5">×</button>
            </span>
          )}
          {filtroHoraHasta && (
            <span className="text-xs bg-blue-900/40 text-blue-300 px-2 py-0.5 rounded-full border border-blue-700/50 flex items-center gap-1">
              <IconTiempo size={12} aria-hidden /> Hasta {filtroHoraHasta}
              <button onClick={() => setFiltroHoraHasta('')} className="hover:text-white ml-0.5">×</button>
            </span>
          )}
          {filtroModulo && (
            <span className="text-xs bg-purple-900/40 text-purple-300 px-2 py-0.5 rounded-full border border-purple-700/50 flex items-center gap-1">
              <IconInventario size={12} aria-hidden /> {filtroModulo}
              <button onClick={() => setFiltroModulo('')} className="hover:text-white ml-0.5">×</button>
            </span>
          )}
          {filtroUsuario && (
            <span className="text-xs bg-green-900/40 text-green-300 px-2 py-0.5 rounded-full border border-green-700/50 flex items-center gap-1">
              <IconUsuario size={12} aria-hidden /> {filtroUsuario}
              <button onClick={() => setFiltroUsuario('')} className="hover:text-white ml-0.5">×</button>
            </span>
          )}
        </div>
      </div>

      {/* ═══ TABLA ═══ */}
      {loadingLogs ? (
        <div className="flex justify-center py-20"><LoadingSpinner label="Cargando logs..." /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-20">
          <IconLogs size={40} className="mx-auto block mb-2 text-gray-600" aria-hidden />
          <span className="text-gray-300">
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
                    <td className="px-4 py-3"><span className="inline-flex items-center gap-1 text-blue-300 text-xs font-medium"><IconUsuario size={12} aria-hidden /> {log.usuario}</span></td>
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
                        <span className="inline-flex items-center gap-1"><ModuloIcon modulo={log.modulo} /> {log.modulo}</span>
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