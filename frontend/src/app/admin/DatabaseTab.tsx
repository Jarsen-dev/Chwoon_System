'use client'

import { useState, useEffect } from 'react'
import { SystemStatus, DbActionCard } from './helpers'

interface Props {
  token: string
}

const PGADMIN_LINKS = [
  {
    label:      'pgAdmin Local',
    icon:       '🖥️',
    url:        'http://localhost:5050',
    desc:       'Desarrollo',
    badge:      'LOCAL',
    badgeColor: 'bg-emerald-900/50 text-emerald-300 border-emerald-700',
  },
  {
    label:      'pgAdmin Producción',
    icon:       '🌐',
    url:        'http://100.111.35.87:5050',
    desc:       'Servidor',
    badge:      'PRODUCCIÓN',
    badgeColor: 'bg-red-900/50 text-red-300 border-red-700',
  },
]

export default function DatabaseTab({ token }: Props) {
  const [systemStatus, setSystemStatus]       = useState<SystemStatus | null>(null)
  const [loadingSystem, setLoadingSystem]     = useState(false)
  const [dbActionLoading, setDbActionLoading] = useState<string | null>(null)
  const [dbResult, setDbResult]               = useState<{ msg: string; type: 'success' | 'error' } | null>(null)
  const [confirmAction, setConfirmAction]     = useState<{
    title: string; message: string; onConfirm: () => void
  } | null>(null)

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

  const ejecutarAccionDB = async (endpoint: string) => {
    setDbActionLoading(endpoint)
    setDbResult(null)
    try {
      const res = await fetch(`/api/admin/db/${endpoint}`, {
        method: 'POST', headers: authHeaders,
      })
      const data = await res.json()
      if (res.ok) {
        setDbResult({ msg: `✅ ${data.message} (${data.eliminados} registros)`, type: 'success' })
        cargarSystemStatus()
      } else {
        setDbResult({ msg: `❌ ${data.detail || 'Error desconocido'}`, type: 'error' })
      }
    } catch {
      setDbResult({ msg: '❌ Error de conexión', type: 'error' })
    } finally {
      setDbActionLoading(null)
    }
  }

  const confirmarAccionDB = (endpoint: string, title: string, message: string) => {
    setConfirmAction({
      title, message,
      onConfirm: () => { setConfirmAction(null); ejecutarAccionDB(endpoint) }
    })
  }

  const getCount = (nombre: string) => systemStatus?.tablas.find(t => t.nombre === nombre)?.registros

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Gestión de Base de Datos</h2>
          <p className="text-gray-400 text-sm mt-1">Acceso directo, mantenimiento y limpieza</p>
        </div>
        <button onClick={cargarSystemStatus} disabled={loadingSystem}
          className="text-sm bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg transition-colors">
          {loadingSystem ? '⏳ Cargando...' : '🔄 Actualizar'}
        </button>
      </div>

            {/* ═══ ACCESO DIRECTO A pgAdmin ═══ */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
          🐘 Acceso Directo a pgAdmin
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PGADMIN_LINKS.map(pg => (
            <div key={pg.label}
              className="bg-gray-900/50 rounded-xl border border-gray-700 p-4 flex items-center gap-4">
              <span className="text-3xl">{pg.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <h4 className="font-bold text-white text-sm">{pg.label}</h4>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${pg.badgeColor}`}>
                    {pg.badge}
                  </span>
                </div>
                <p className="text-gray-500 text-xs">{pg.desc}</p>
              </div>
              <a
                href={pg.url}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold py-2.5 px-5 rounded-lg
                           transition-colors flex items-center gap-2 whitespace-nowrap flex-shrink-0"
              >
                🐘 Abrir
              </a>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-600 mt-3 flex items-center gap-1.5">
          <span className="text-green-500">●</span>
          Acceso directo configurado — conecta a <code className="text-gray-400">planta_db</code> sin login
        </p>
      </div>

      {/* Resultado de acción */}
      {dbResult && (
        <div className={`rounded-lg px-4 py-3 text-sm border ${
          dbResult.type === 'success'
            ? 'bg-green-900/30 border-green-700 text-green-300'
            : 'bg-red-900/30 border-red-700 text-red-300'
        }`}>
          {dbResult.msg}
          <button onClick={() => setDbResult(null)} className="float-right opacity-50 hover:opacity-100">✖</button>
        </div>
      )}

      {/* ═══ ACCIONES DE LIMPIEZA ═══ */}
      <div>
        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-4 flex items-center gap-2">
          🧹 Acciones de Mantenimiento
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DbActionCard
            icon="🖨️" title="Limpiar Cola de Impresión"
            description="Elimina etiquetas ya generadas (estado 'generado')"
            count={getCount('cola_impresion')}
            buttonLabel="Limpiar Generados" buttonColor="bg-purple-600 hover:bg-purple-700"
            loading={dbActionLoading === 'limpiar-cola'}
            onClick={() => confirmarAccionDB('limpiar-cola', 'Limpiar Cola', '¿Eliminar todas las etiquetas con estado "generado"?')}
          />
          <DbActionCard
            icon="⚠️" title="Limpiar Anomalías Antiguas"
            description="Elimina anomalías con más de 30 días"
            count={getCount('anomalias')}
            buttonLabel="Limpiar +30 días" buttonColor="bg-yellow-600 hover:bg-yellow-700"
            loading={dbActionLoading === 'limpiar-anomalias'}
            onClick={() => confirmarAccionDB('limpiar-anomalias', 'Limpiar Anomalías', '¿Eliminar anomalías con más de 30 días de antigüedad?')}
          />
          <DbActionCard
            icon="📊" title="Limpiar Historial de Turnos"
            description="Elimina snapshots de turnos con más de 30 días"
            count={getCount('historial_turnos')}
            buttonLabel="Limpiar +30 días" buttonColor="bg-blue-600 hover:bg-blue-700"
            loading={dbActionLoading === 'limpiar-historial'}
            onClick={() => confirmarAccionDB('limpiar-historial', 'Limpiar Historial', '¿Eliminar historial de turnos con más de 30 días?')}
          />
          <DbActionCard
            icon="🔢" title="Resetear Contadores de Carrito"
            description="Resetea todos los contadores a cero"
            count={getCount('contador_carritos')}
            buttonLabel="Resetear Contadores" buttonColor="bg-orange-600 hover:bg-orange-700"
            loading={dbActionLoading === 'resetear-contadores'}
            onClick={() => confirmarAccionDB('resetear-contadores', 'Resetear Contadores', '¿Resetear todos los contadores de carritos? Esto reiniciará la numeración.')}
          />
          <DbActionCard
            icon="📷" title="Vaciar Registros de Producción"
            description="⚠️ PELIGROSO: Elimina TODOS los escaneos de producción"
            count={getCount('registros_produccion')}
            buttonLabel="Vaciar Producción" buttonColor="bg-red-600 hover:bg-red-700"
            loading={dbActionLoading === 'vaciar-produccion'}
            onClick={() => confirmarAccionDB('vaciar-produccion', '⚠️ Vaciar Producción', '¿ELIMINAR TODOS los registros de producción? Esta acción NO se puede deshacer.')}
            danger
          />
          <DbActionCard
            icon="🌡️" title="Vaciar Registros de Secado"
            description="⚠️ PELIGROSO: Elimina TODOS los registros de secado"
            count={getCount('registros_secado')}
            buttonLabel="Vaciar Secado" buttonColor="bg-red-600 hover:bg-red-700"
            loading={dbActionLoading === 'vaciar-secado'}
            onClick={() => confirmarAccionDB('vaciar-secado', '⚠️ Vaciar Secado', '¿ELIMINAR TODOS los registros de secado? Esta acción NO se puede deshacer.')}
            danger
          />
        </div>
      </div>
      {/* ═══ ACCIONES PRE-EXPANSIÓN ═══ */}
      <div>
        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-1 flex items-center gap-2">
          🔥 Pre-Expansión — Limpieza de Datos
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Estas acciones eliminan registros de las sub-tabs del módulo de Pre-Expansión.
          Son irreversibles.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DbActionCard
            icon="🔥"
            title="Vaciar Órdenes de Producción"
            description="⚠️ Elimina TODAS las OPs (Pre-Expansión, Inyección, Ensamble) y suministros asociados"
            count={getCount('ordenes_produccion')}
            buttonLabel="Vaciar OPs"
            buttonColor="bg-red-600 hover:bg-red-700"
            loading={dbActionLoading === 'vaciar-ordenes-produccion'}
            onClick={() => confirmarAccionDB(
              'vaciar-ordenes-produccion',
              '⚠️ Vaciar Órdenes de Producción',
              '¿ELIMINAR TODAS las órdenes de producción y suministros de silo? Esto afecta Pre-Expansión, Inyección y Ensamble. Acción NO reversible.'
            )}
            danger
          />
          <DbActionCard
            icon="🚚"
            title="Vaciar Suministros de Silo"
            description="⚠️ Elimina TODOS los registros de suministros SILO → AUX"
            count={getCount('suministros_silo')}
            buttonLabel="Vaciar Suministros"
            buttonColor="bg-red-600 hover:bg-red-700"
            loading={dbActionLoading === 'vaciar-suministros-silo'}
            onClick={() => confirmarAccionDB(
              'vaciar-suministros-silo',
              '⚠️ Vaciar Suministros de Silo',
              '¿ELIMINAR TODOS los suministros de silo registrados? El historial de la sub-tab Suministro quedará vacío. Acción NO reversible.'
            )}
            danger
          />
          <DbActionCard
            icon="📦"
            title="Vaciar Lotes de Inventario (Producción)"
            description="⚠️ Elimina lotes de inventario generados por OPs y sus movimientos"
            count={getCount('lotes_inventario')}
            buttonLabel="Vaciar Lotes Prod."
            buttonColor="bg-red-600 hover:bg-red-700"
            loading={dbActionLoading === 'vaciar-lotes-inventario-produccion'}
            onClick={() => confirmarAccionDB(
              'vaciar-lotes-inventario-produccion',
              '⚠️ Vaciar Lotes de Inventario de Producción',
              '¿ELIMINAR todos los lotes de inventario generados por producción y sus movimientos? Solo afecta lotes con origen en OPs. Acción NO reversible.'
            )}
            danger
          />
        </div>
      </div>

      {/* ═══ ACCIONES INYECCIÓN ═══ */}
      <div>
        <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-1 flex items-center gap-2">
          🏭 Inyección — Limpieza de Datos
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Estas acciones eliminan registros del plan de inyección.
          Son irreversibles.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <DbActionCard
            icon="🗑️"
            title="Vaciar Plan de Inyección"
            description="⚠️ Elimina TODOS los registros del plan de inyección (Pendientes, En Proceso y Finalizados)"
            count={getCount('plan_inyeccion')}
            buttonLabel="Vaciar Todo"
            buttonColor="bg-red-600 hover:bg-red-700"
            loading={dbActionLoading === 'vaciar-plan-inyeccion'}
            onClick={() => confirmarAccionDB(
              'vaciar-plan-inyeccion',
              '⚠️ Vaciar Plan de Inyección',
              '¿ELIMINAR TODOS los registros del plan de inyección? Esto borra órdenes pendientes, en proceso y finalizadas. Acción NO reversible.'
            )}
            danger
          />
          <DbActionCard
            icon="✅"
            title="Vaciar Finalizados"
            description="Elimina solo las órdenes con status 'Finalizado'"
            count={undefined}
            buttonLabel="Vaciar Finalizados"
            buttonColor="bg-emerald-600 hover:bg-emerald-700"
            loading={dbActionLoading === 'vaciar-plan-inyeccion-finalizados'}
            onClick={() => confirmarAccionDB(
              'vaciar-plan-inyeccion-finalizados',
              '✅ Vaciar Finalizados',
              '¿Eliminar solo las órdenes de inyección FINALIZADAS? Las órdenes en proceso y pendientes NO se verán afectadas.'
            )}
          />
          <DbActionCard
            icon="📋"
            title="Vaciar Pendientes"
            description="Elimina solo las órdenes con status 'Pendiente'"
            count={undefined}
            buttonLabel="Vaciar Pendientes"
            buttonColor="bg-purple-600 hover:bg-purple-700"
            loading={dbActionLoading === 'vaciar-plan-inyeccion-pendientes'}
            onClick={() => confirmarAccionDB(
              'vaciar-plan-inyeccion-pendientes',
              '📋 Vaciar Pendientes',
              '¿Eliminar solo las órdenes de inyección PENDIENTES? Las órdenes en proceso y finalizadas NO se verán afectadas.'
            )}
          />
        </div>
      </div>

      {/* ═══ MODAL CONFIRMAR ═══ */}
      {confirmAction && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-gray-700">
            <div className="flex justify-center mb-4">
              <div className="bg-yellow-900/50 rounded-full p-4"><span className="text-4xl">⚠️</span></div>
            </div>
            <h3 className="text-lg font-bold text-center text-white mb-2">{confirmAction.title}</h3>
            <p className="text-gray-400 text-center text-sm mb-6">{confirmAction.message}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmAction(null)}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 transition-colors font-medium">Cancelar</button>
              <button onClick={confirmAction.onConfirm}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg py-2.5 transition-colors">Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}