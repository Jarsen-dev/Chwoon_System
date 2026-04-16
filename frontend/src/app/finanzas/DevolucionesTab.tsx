'use client'

import { useState, useEffect, useCallback } from 'react'
import { getDevoluciones, crearDevolucion, procesarDisposicion } from '@/lib/api'
import type { Devolucion } from '@/types'

interface Props {
  token: string
}

const ESTADO_COLORS: Record<string, string> = {
  'Pendiente':       'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'En Inspección':   'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Finalizado':      'bg-green-500/20 text-green-400 border-green-500/30',
}

const ESTADO_OPTIONS = ['Todos', 'Pendiente', 'En Inspección', 'Finalizado']

export default function DevolucionesTab({ token }: Props) {
  const [devoluciones, setDevoluciones] = useState<Devolucion[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('Todos')
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showDisposicionModal, setShowDisposicionModal] = useState(false)
  const [selectedDev, setSelectedDev] = useState<Devolucion | null>(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form: Crear devolución
  const [formOvId, setFormOvId] = useState('')
  const [formSku, setFormSku] = useState('')
  const [formNombre, setFormNombre] = useState('')
  const [formCantidad, setFormCantidad] = useState('')
  const [formMotivo, setFormMotivo] = useState('')
  const [formLoteOrigen, setFormLoteOrigen] = useState('')

  // Form: Disposición
  const [dispScrap, setDispScrap] = useState('')
  const [dispRetrabajo, setDispRetrabajo] = useState('')

  const fetchDevoluciones = useCallback(async () => {
    try {
      setLoading(true)
      const estado = filtroEstado === 'Todos' ? undefined : filtroEstado
      const res = await getDevoluciones(token, estado)
      setDevoluciones(res)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token, filtroEstado])

  useEffect(() => {
    fetchDevoluciones()
  }, [fetchDevoluciones])

  const clearMessages = () => { setError(''); setSuccess('') }

  const resetFormCrear = () => {
    setFormOvId('')
    setFormSku('')
    setFormNombre('')
    setFormCantidad('')
    setFormMotivo('')
    setFormLoteOrigen('')
  }

  const handleCrear = async () => {
    clearMessages()
    try {
      const cantidad = parseFloat(formCantidad)
      if (!formOvId.trim() || !formSku.trim() || !cantidad || cantidad <= 0 || !formMotivo.trim()) {
        setError('Complete todos los campos obligatorios: OV, SKU, Cantidad y Motivo')
        return
      }

      await crearDevolucion(token, {
        ov_id: formOvId.trim(),
        sku_producto: formSku.trim().toUpperCase(),
        nombre_producto: formNombre.trim() || undefined,
        cantidad_devuelta: cantidad,
        motivo: formMotivo.trim(),
        lote_produccion_origen: formLoteOrigen.trim() || undefined,
      })

      setSuccess('Devolución registrada exitosamente')
      setShowCreateModal(false)
      resetFormCrear()
      fetchDevoluciones()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleDisposicion = async () => {
    clearMessages()
    if (!selectedDev) return
    try {
      const scrap = parseFloat(dispScrap) || 0
      const retrabajo = parseFloat(dispRetrabajo) || 0

      if (scrap + retrabajo <= 0) {
        setError('Debe asignar al menos una cantidad a Scrap o Retrabajo')
        return
      }

      if (scrap + retrabajo > selectedDev.cantidad_devuelta) {
        setError(`La suma (${scrap + retrabajo}) supera la cantidad devuelta (${selectedDev.cantidad_devuelta})`)
        return
      }

      await procesarDisposicion(token, selectedDev.devolucion_id, {
        cantidad_scrap: scrap,
        cantidad_retrabajo: retrabajo,
      })

      setSuccess(`Devolución ${selectedDev.devolucion_id} procesada`)
      setShowDisposicionModal(false)
      setSelectedDev(null)
      setDispScrap('')
      setDispRetrabajo('')
      fetchDevoluciones()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="space-y-4">
      {/* Messages */}
      {error && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-lg px-4 py-3 text-red-400 flex justify-between">
          <span>❌ {error}</span>
          <button onClick={() => setError('')} className="text-red-300 hover:text-white">✕</button>
        </div>
      )}
      {success && (
        <div className="bg-green-900/30 border border-green-500/50 rounded-lg px-4 py-3 text-green-400 flex justify-between">
          <span>✅ {success}</span>
          <button onClick={() => setSuccess('')} className="text-green-300 hover:text-white">✕</button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold">🔄 Devoluciones</h2>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm"
          >
            {ESTADO_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchDevoluciones} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors">
            🔄 Refrescar
          </button>
          <button
            onClick={() => { resetFormCrear(); setShowCreateModal(true) }}
            className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            ➕ Nueva Devolución
          </button>
        </div>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-400" />
        </div>
      ) : devoluciones.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
          <p className="text-4xl mb-3">🔄</p>
          <p className="text-gray-400">No hay devoluciones registradas</p>
        </div>
      ) : (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">ID</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">OV Origen</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">SKU</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">Producto</th>
                  <th className="px-4 py-3 text-right text-gray-400 font-medium">Cantidad</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">Motivo</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">Estado</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">Disposición</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">Fecha</th>
                  <th className="px-4 py-3 text-center text-gray-400 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {devoluciones.map((dev) => (
                  <tr key={dev.devolucion_id} className="hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3 font-mono font-medium text-orange-400 text-xs">{dev.devolucion_id}</td>
                    <td className="px-4 py-3 font-mono text-blue-400 text-xs">{dev.ov_id}</td>
                    <td className="px-4 py-3 font-mono text-emerald-400">{dev.sku_producto}</td>
                    <td className="px-4 py-3 text-gray-300">{dev.nombre_producto || '—'}</td>
                    <td className="px-4 py-3 text-right font-medium">{dev.cantidad_devuelta}</td>
                    <td className="px-4 py-3 text-gray-300 max-w-[200px] truncate" title={dev.motivo}>{dev.motivo}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium border ${ESTADO_COLORS[dev.estado_inspeccion] || 'bg-gray-500/20 text-gray-400'}`}>
                        {dev.estado_inspeccion}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {dev.disposicion_final || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(dev.fecha_devolucion)}</td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center gap-1">
                        {dev.estado_inspeccion === 'Pendiente' && (
                          <button
                            onClick={() => {
                              setSelectedDev(dev)
                              setDispScrap('')
                              setDispRetrabajo('')
                              setShowDisposicionModal(true)
                            }}
                            className="bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400 px-2 py-1 rounded text-xs transition-colors"
                            title="Procesar disposición"
                          >
                            ⚖️ Procesar
                          </button>
                        )}
                        {dev.estado_inspeccion === 'Finalizado' && (
                          <span className="text-green-400 text-xs">✅ Procesado</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* Modal: Crear Devolución                      */}
      {/* ============================================ */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-lg">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">➕ Registrar Devolución</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">OV Origen *</label>
                  <input
                    type="text"
                    value={formOvId}
                    onChange={(e) => setFormOvId(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    placeholder="OV-20260416..."
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">SKU Producto *</label>
                  <input
                    type="text"
                    value={formSku}
                    onChange={(e) => setFormSku(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    placeholder="SKU-001"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Nombre Producto</label>
                <input
                  type="text"
                  value={formNombre}
                  onChange={(e) => setFormNombre(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  placeholder="Nombre del producto (opcional)"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Cantidad Devuelta *</label>
                  <input
                    type="text"
                    value={formCantidad}
                    onChange={(e) => setFormCantidad(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Lote Producción Origen</label>
                  <input
                    type="text"
                    value={formLoteOrigen}
                    onChange={(e) => setFormLoteOrigen(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    placeholder="LOT-001 (opcional)"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Motivo *</label>
                <textarea
                  value={formMotivo}
                  onChange={(e) => setFormMotivo(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  rows={3}
                  placeholder="Describa el motivo de la devolución..."
                />
              </div>
            </div>

            <div className="p-6 border-t border-gray-800 flex justify-end gap-3">
              <button onClick={() => setShowCreateModal(false)} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors">
                Cancelar
              </button>
              <button onClick={handleCrear} className="bg-emerald-600 hover:bg-emerald-700 px-6 py-2 rounded-lg text-sm font-medium transition-colors">
                ✅ Registrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* Modal: Procesar Disposición                  */}
      {/* ============================================ */}
      {showDisposicionModal && selectedDev && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-lg">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">⚖️ Procesar Disposición</h3>
              <button onClick={() => setShowDisposicionModal(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              {/* Info de la devolución */}
              <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700 space-y-2">
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">Devolución</span>
                  <span className="text-sm font-mono text-orange-400">{selectedDev.devolucion_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">OV Origen</span>
                  <span className="text-sm font-mono text-blue-400">{selectedDev.ov_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">SKU</span>
                  <span className="text-sm font-mono text-emerald-400">{selectedDev.sku_producto}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">Cantidad Devuelta</span>
                  <span className="text-sm font-bold text-white">{selectedDev.cantidad_devuelta}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-gray-500">Motivo</span>
                  <span className="text-sm text-gray-300 text-right max-w-[250px]">{selectedDev.motivo}</span>
                </div>
              </div>

              <div className="bg-yellow-900/20 border border-yellow-700/30 rounded-lg p-3">
                <p className="text-xs text-yellow-400">
                  ⚠️ Distribuya la cantidad devuelta ({selectedDev.cantidad_devuelta}) entre Scrap y Retrabajo.
                  La suma no debe superar la cantidad devuelta.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">🗑️ Cantidad Scrap</label>
                  <input
                    type="text"
                    value={dispScrap}
                    onChange={(e) => setDispScrap(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">🔧 Cantidad Retrabajo</label>
                  <input
                    type="text"
                    value={dispRetrabajo}
                    onChange={(e) => setDispRetrabajo(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Preview */}
              {(dispScrap || dispRetrabajo) && (
                <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-700">
                  <p className="text-xs text-gray-500 mb-1">Resumen disposición:</p>
                  <p className="text-sm">
                    <span className="text-red-400">Scrap: {parseFloat(dispScrap) || 0}</span>
                    {' + '}
                    <span className="text-blue-400">Retrabajo: {parseFloat(dispRetrabajo) || 0}</span>
                    {' = '}
                    <span className={`font-bold ${
                      (parseFloat(dispScrap) || 0) + (parseFloat(dispRetrabajo) || 0) > selectedDev.cantidad_devuelta
                        ? 'text-red-400'
                        : 'text-green-400'
                    }`}>
                      {(parseFloat(dispScrap) || 0) + (parseFloat(dispRetrabajo) || 0)}
                    </span>
                    <span className="text-gray-500"> / {selectedDev.cantidad_devuelta}</span>
                  </p>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-800 flex justify-end gap-3">
              <button onClick={() => setShowDisposicionModal(false)} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors">
                Cancelar
              </button>
              <button onClick={handleDisposicion} className="bg-yellow-600 hover:bg-yellow-700 px-6 py-2 rounded-lg text-sm font-medium transition-colors">
                ⚖️ Confirmar Disposición
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}