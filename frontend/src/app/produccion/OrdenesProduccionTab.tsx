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
import { Modal, Button } from '@/components/ui'
import {
  IconLista, IconPendiente, IconActualizar, IconOk, IconVer, IconInventario,
  IconDocumento, IconSinMovimiento, IconEjecutar, IconPreExpansion,
  IconInyeccion, IconEnsamble, IconCompletado, type LucideIcon,
} from '@/lib/icons'

const STATUS_BADGES: Record<string, { bg: string; text: string }> = {
  'En Proceso':         { bg: 'bg-blue-500/20',   text: 'text-blue-300' },
  'Pendiente Material': { bg: 'bg-yellow-500/20', text: 'text-yellow-300' },
  'Finalizado':         { bg: 'bg-green-500/20',  text: 'text-green-400' },
  'Error Consumo':      { bg: 'bg-red-500/20',    text: 'text-red-300' },
}

const TIPO_BADGES: Record<string, { icon: LucideIcon; color: string }> = {
  'PRE-EXPANSION': { icon: IconPreExpansion, color: 'text-orange-400' },
  'INYECCION':     { icon: IconInyeccion,    color: 'text-purple-400' },
  'ASSY':          { icon: IconEnsamble,     color: 'text-blue-400' },
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
        <h2 className="text-2xl font-bold text-white flex items-center gap-2"><IconLista size={24} className="text-[var(--accent)]" aria-hidden /> Órdenes de Producción</h2>
        <Button onClick={cargar} disabled={loading} leftIcon={loading ? IconPendiente : IconActualizar}>
          {loading ? 'Cargando...' : 'Actualizar'}
        </Button>
      </div>

      {/* Mensaje */}
      {mensaje && (
        <div className={`p-3 rounded-lg text-sm font-medium ${
          mensaje.tipo === 'ok' ? 'bg-green-500/10 text-green-400 border border-green-500/30'
            : 'bg-red-500/100/10 text-red-400 border border-red-500/30'
        }`}>
          {mensaje.texto}
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="flex bg-gray-800 rounded-xl p-1">
          <button onClick={() => setVerActivas(true)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              verActivas ? 'bg-gray-900 shadow text-[var(--accent)]' : 'text-gray-300 hover:text-white'
            }`}>
            <span className="w-2 h-2 rounded-full bg-green-400" aria-hidden /> Activas
          </button>
          <button onClick={() => setVerActivas(false)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              !verActivas ? 'bg-gray-900 shadow text-[var(--accent)]' : 'text-gray-300 hover:text-white'
            }`}>
            <IconCompletado size={15} aria-hidden /> Finalizadas
          </button>
        </div>

        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
          className="bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-[var(--accent)]">
          <option value="">Todas las clases</option>
          <option value="PRE-EXPANSION">Pre-Expansión</option>
          <option value="INYECCION">Inyección</option>
          <option value="ASSY">Ensamble</option>
        </select>

        <span className="text-sm text-gray-300">
          {ordenesFiltradas.length} orden{ordenesFiltradas.length !== 1 ? 'es' : ''}
        </span>
      </div>

      {/* Tabla */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-800 border-b border-gray-800">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-400">OP ID</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-400">Tipo</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-400">SKU</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-400">Nombre</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-400">Progreso</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-400">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-400">Línea</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-400">Operador</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-400">Fecha</th>
                <th className="px-4 py-3 text-center font-semibold text-gray-400">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {ordenesFiltradas.map(op => {
                const tipoBadge = TIPO_BADGES[op.tipo] || { icon: IconDocumento, color: 'text-gray-300' }
                const TipoIcon = tipoBadge.icon
                const statusBadge = STATUS_BADGES[op.status] || { bg: 'bg-gray-800', text: 'text-gray-800' }
                return (
                  <tr key={op.id} className="hover:bg-gray-800 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-blue-400">{op.id}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 font-medium ${tipoBadge.color}`}>
                        <TipoIcon size={15} aria-hidden /> {op.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-300">{op.sku}</td>
                    <td className="px-4 py-3 text-gray-300 max-w-48 truncate">{op.nombre || '—'}</td>
                    <td className="px-4 py-3 font-medium">{op.progreso}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusBadge.bg} ${statusBadge.text}`}>
                        {op.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{op.linea || '—'}</td>
                    <td className="px-4 py-3 text-gray-400">{op.operador || '—'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {op.fecha ? new Date(op.fecha).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => abrirDetalle(op.id)}
                        className="inline-flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-300 transition-colors">
                        <IconVer size={14} aria-hidden /> Ver
                      </button>
                    </td>
                  </tr>
                )
              })}
              {ordenesFiltradas.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-gray-300">
                    {loading ? 'Cargando órdenes...' : 'No hay órdenes para mostrar'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Detalle */}
      <Modal
        open={showDetalle && !!detalle}
        onClose={() => setShowDetalle(false)}
        size="3xl"
        title={detalle ? (
          <span className="flex flex-col">
            <span>Orden: {detalle.op_id}</span>
            <span className="text-xs text-gray-400 font-normal">{detalle.clase_produccion} — {detalle.nombre_producto || detalle.sku_producto}</span>
          </span>
        ) : ''}
      >
        {detalle && (
          <div className="space-y-6">
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
                  <h4 className="font-semibold text-gray-300 mb-2 flex items-center gap-2"><IconInventario size={16} aria-hidden /> Material Consumido</h4>
                  <div className="bg-gray-800 rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-800">
                        <tr>
                          <th className="px-3 py-2 text-left text-gray-400">Lote</th>
                          <th className="px-3 py-2 text-left text-gray-400">SKU</th>
                          <th className="px-3 py-2 text-right text-gray-400">Cantidad</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
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
                  <h4 className="font-semibold text-gray-300 mb-2 flex items-center gap-2"><IconDocumento size={16} aria-hidden /> Registros Parciales</h4>
                  <div className="space-y-2">
                    {detalle.registros_parciales.map((r: any, i: number) => (
                      <div key={i} className="bg-gray-800 rounded-lg p-3 text-sm flex justify-between">
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
                  <h4 className="font-semibold text-gray-300 mb-2 flex items-center gap-2"><IconSinMovimiento size={16} aria-hidden /> Paros</h4>
                  <div className="space-y-2">
                    {detalle.paros.map((p: any, i: number) => (
                      <div key={i} className={`rounded-lg p-3 text-sm flex justify-between items-center ${
                        p.status === 'Activo' ? 'bg-red-500/10 border border-red-500/30' : 'bg-gray-800'
                      }`}>
                        <span className="font-medium">{p.motivo}</span>
                        <span className="text-gray-300">
                          {p.status === 'Activo'
                            ? <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" aria-hidden /> Activo</span>
                            : `${Math.round(p.duracion_segundos / 60)} min`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Acciones */}
              {detalle.status !== 'Finalizado' && (
                <div className="flex gap-3 pt-4 border-t border-gray-800">
                  {detalle.status === 'Pendiente Material' && (
                    <Button onClick={() => handleSurtir(detalle.op_id)} leftIcon={IconOk} className="bg-green-600 hover:bg-green-700 text-white">
                      Intentar Surtir Material
                    </Button>
                  )}
                  {detalle.status === 'En Proceso' && (
                    <>
                      {detalle.paros.some((p: any) => p.status === 'Activo') ? (
                        <Button onClick={() => handleParo(detalle.op_id, 'finalizar')} leftIcon={IconEjecutar} className="bg-green-600 hover:bg-green-700 text-white">
                          Finalizar Paro
                        </Button>
                      ) : (
                        <Button onClick={() => handleParo(detalle.op_id, 'iniciar')} leftIcon={IconSinMovimiento} className="bg-yellow-600 hover:bg-yellow-700 text-white">
                          Registrar Paro
                        </Button>
                      )}
                    </>
                  )}
                </div>
              )}
          </div>
        )}
      </Modal>
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-800 rounded-lg p-3">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className="font-medium text-gray-200 text-sm truncate">{value}</p>
    </div>
  )
}