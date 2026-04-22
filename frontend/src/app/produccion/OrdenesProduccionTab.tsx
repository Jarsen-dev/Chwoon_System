'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { OrdenUnificada, OrdenProduccion as OrdenProduccionType } from '@/types'
import {
  getOrdenesUnificadas,
  getOrdenProduccion,
  surtirMaterialPendiente,
  iniciarParoOP,
  finalizarParoOP,
} from '@/lib/api'

const STATUS_BADGES: Record<string, { bg: string; text: string }> = {
  'En Proceso':         { bg: 'bg-blue-100',   text: 'text-blue-800' },
  'Pendiente Material': { bg: 'bg-yellow-100', text: 'text-yellow-800' },
  'Finalizado':         { bg: 'bg-green-100',  text: 'text-green-800' },
  'Error Consumo':      { bg: 'bg-red-100',    text: 'text-red-800' },
}

const TIPO_BADGES: Record<string, { icon: string; color: string }> = {
  'PRE-EXPANSION': { icon: '🔥', color: 'text-orange-600' },
  'INYECCION':     { icon: '💉', color: 'text-purple-600' },
  'ASSY':          { icon: '🔧', color: 'text-blue-600' },
}

export default function OrdenesProduccionTab() {
  const { token } = useAuth()
  const [ordenes, setOrdenes] = useState<OrdenUnificada[]>([])
  const [verActivas, setVerActivas] = useState(true)
  const [loading, setLoading] = useState(false)
  const [detalle, setDetalle] = useState<OrdenProduccionType | null>(null)
  const [showDetalle, setShowDetalle] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [filtroTipo, setFiltroTipo] = useState<string>('')

  const cargar = async () => {
    if (!token) return
    setLoading(true)
    try {
      const data = await getOrdenesUnificadas(token, verActivas)
      setOrdenes(data)
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [token, verActivas])

  useEffect(() => {
    if (mensaje) {
      const t = setTimeout(() => setMensaje(null), 8000)
      return () => clearTimeout(t)
    }
  }, [mensaje])

  const abrirDetalle = async (opId: string) => {
    if (!token) return
    try {
      const data = await getOrdenProduccion(token, opId)
      setDetalle(data)
      setShowDetalle(true)
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message })
    }
  }

  const handleSurtir = async (opId: string) => {
    if (!token) return
    try {
      const res = await surtirMaterialPendiente(token, opId)
      setMensaje({ tipo: 'ok', texto: res.message })
      cargar()
      setShowDetalle(false)
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message })
    }
  }

  const handleParo = async (opId: string, accion: 'iniciar' | 'finalizar') => {
    if (!token) return
    try {
      if (accion === 'iniciar') {
        const motivo = prompt('Motivo del paro:')
        if (!motivo) return
        await iniciarParoOP(token, opId, motivo)
        setMensaje({ tipo: 'ok', texto: 'Paro iniciado' })
      } else {
        await finalizarParoOP(token, opId)
        setMensaje({ tipo: 'ok', texto: 'Paro finalizado' })
      }
      if (showDetalle && detalle) abrirDetalle(detalle.op_id)
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message })
    }
  }

  const ordenesFiltradas = filtroTipo
    ? ordenes.filter(o => o.tipo === filtroTipo)
    : ordenes

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">📋 Órdenes de Producción</h2>
        <button onClick={cargar} disabled={loading}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50">
          {loading ? '⏳ Cargando...' : '🔄 Actualizar'}
        </button>
      </div>

      {/* Mensaje */}
      {mensaje && (
        <div className={`p-3 rounded-lg text-sm font-medium ${
          mensaje.tipo === 'ok' ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {mensaje.texto}
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="flex bg-gray-100 rounded-lg p-1">
          <button onClick={() => setVerActivas(true)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              verActivas ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}>
            🟢 Activas
          </button>
          <button onClick={() => setVerActivas(false)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              !verActivas ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}>
            ✅ Finalizadas
          </button>
        </div>

        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
          <option value="">Todas las clases</option>
          <option value="PRE-EXPANSION">🔥 Pre-Expansión</option>
          <option value="INYECCION">💉 Inyección</option>
          <option value="ASSY">🔧 Ensamble</option>
        </select>

        <span className="text-sm text-gray-500">
          {ordenesFiltradas.length} orden{ordenesFiltradas.length !== 1 ? 'es' : ''}
        </span>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">OP ID</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Tipo</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">SKU</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Nombre</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Progreso</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Línea</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Operador</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Fecha</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ordenesFiltradas.map(op => {
                const tipoBadge = TIPO_BADGES[op.tipo] || { icon: '📄', color: 'text-gray-600' }
                const statusBadge = STATUS_BADGES[op.status] || { bg: 'bg-gray-100', text: 'text-gray-800' }
                return (
                  <tr key={op.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-blue-600">{op.id}</td>
                    <td className="px-4 py-3">
                      <span className={`font-medium ${tipoBadge.color}`}>
                        {tipoBadge.icon} {op.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-700">{op.sku}</td>
                    <td className="px-4 py-3 text-gray-700 max-w-48 truncate">{op.nombre || '—'}</td>
                    <td className="px-4 py-3 font-medium">{op.progreso}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusBadge.bg} ${statusBadge.text}`}>
                        {op.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{op.linea || '—'}</td>
                    <td className="px-4 py-3 text-gray-600">{op.operador || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">
                      {op.fecha ? new Date(op.fecha).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => abrirDetalle(op.id)}
                        className="bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-700 transition-colors">
                        👁️ Ver
                      </button>
                    </td>
                  </tr>
                )
              })}
              {ordenesFiltradas.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-400">
                    {loading ? '⏳ Cargando órdenes...' : 'No hay órdenes para mostrar'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Detalle */}
      {showDetalle && detalle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowDetalle(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] overflow-y-auto m-4" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Orden: {detalle.op_id}</h3>
                <p className="text-sm text-gray-500">{detalle.clase_produccion} — {detalle.nombre_producto || detalle.sku_producto}</p>
              </div>
              <button onClick={() => setShowDetalle(false)} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
            </div>

            <div className="p-6 space-y-6">
              {/* Info general */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <InfoCard label="Status" value={detalle.status} />
                <InfoCard label="SKU" value={detalle.sku_producto} />
                <InfoCard label="Producido" value={`${detalle.cantidad_producida} / ${detalle.cantidad_a_producir}`} />
                <InfoCard label="Operador" value={detalle.operador || '—'} />
                <InfoCard label="Línea" value={detalle.linea_produccion || '—'} />
                <InfoCard label="Carrito" value={detalle.cantidad_carrito > 0 ? `${detalle.cantidad_carrito} pz` : 'N/A'} />
                {detalle.clase_produccion === 'PRE-EXPANSION' && (
                  <>
                    <InfoCard label="Materia Prima" value={detalle.sku_materia_prima || '—'} />
                    <InfoCard label="MP Requerida" value={`${detalle.cantidad_usada_requerida} kg`} />
                    <InfoCard label="MP Consumida" value={`${detalle.cantidad_total_consumida} kg`} />
                  </>
                )}
                {detalle.lote_inventario_generado && (
                  <InfoCard label="Lote Generado" value={detalle.lote_inventario_generado} />
                )}
              </div>

              {/* Material consumido */}
              {detalle.material_consumido.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">📦 Material Consumido</h4>
                  <div className="bg-gray-50 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-600">Lote</th>
                          <th className="px-3 py-2 text-left text-gray-600">SKU</th>
                          <th className="px-3 py-2 text-right text-gray-600">Cantidad</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {detalle.material_consumido.map((m: any, i: number) => (
                          <tr key={i}>
                            <td className="px-3 py-2 font-mono text-xs">{m.lote_id}</td>
                            <td className="px-3 py-2">{m.sku_producto}</td>
                            <td className="px-3 py-2 text-right font-medium">{m.cantidad_consumida}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Registros parciales (Pre-Exp) */}
              {detalle.registros_parciales.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">📝 Registros Parciales</h4>
                  <div className="space-y-2">
                    {detalle.registros_parciales.map((r: any, i: number) => (
                      <div key={i} className="bg-gray-50 rounded-lg p-3 text-sm flex justify-between">
                        <span>Producido: <strong>{r.cantidad_producida} kg</strong></span>
                        <span>Consumido: <strong>{r.cantidad_consumida} kg</strong></span>
                        <span className="text-gray-400 text-xs">
                          {r.fecha ? new Date(r.fecha).toLocaleString('es-MX') : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Paros */}
              {detalle.paros.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-700 mb-2">⏸️ Paros</h4>
                  <div className="space-y-2">
                    {detalle.paros.map((p: any, i: number) => (
                      <div key={i} className={`rounded-lg p-3 text-sm flex justify-between items-center ${
                        p.status === 'Activo' ? 'bg-red-50 border border-red-200' : 'bg-gray-50'
                      }`}>
                        <span className="font-medium">{p.motivo}</span>
                        <span className="text-gray-500">
                          {p.status === 'Activo' ? '🔴 Activo' :
                            `${Math.round(p.duracion_segundos / 60)} min`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Acciones */}
              {detalle.status !== 'Finalizado' && (
                <div className="flex gap-3 pt-4 border-t border-gray-200">
                  {detalle.status === 'Pendiente Material' && (
                    <button onClick={() => handleSurtir(detalle.op_id)}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                      ✅ Intentar Surtir Material
                    </button>
                  )}
                  {detalle.status === 'En Proceso' && (
                    <>
                      {detalle.paros.some((p: any) => p.status === 'Activo') ? (
                        <button onClick={() => handleParo(detalle.op_id, 'finalizar')}
                          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                          ▶️ Finalizar Paro
                        </button>
                      ) : (
                        <button onClick={() => handleParo(detalle.op_id, 'iniciar')}
                          className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm font-medium">
                          ⏸️ Registrar Paro
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className="font-medium text-gray-800 text-sm truncate">{value}</p>
    </div>
  )
}