'use client'

import { useState, useEffect, useCallback } from 'react'
import { getDevoluciones, crearDevolucion, procesarDisposicion } from '@/lib/api'
import type { Devolucion } from '@/types'
import { Button, Modal, LoadingSpinner } from '@/components/ui'
import {
  IconDevoluciones, IconPendiente, IconCompletado, IconEliminar, IconAlertas,
  IconCerrar, IconOk, IconActualizar, IconNuevo, IconValidacion, IconEnsamble,
} from '@/lib/icons'

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
  const [filtroSku, setFiltroSku] = useState('')
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

  const devolucionesFiltradas = devoluciones.filter(dev =>
    !filtroSku || dev.sku_producto.toLowerCase().includes(filtroSku.toLowerCase())
  )

  // KPIs
  const totalDev      = devoluciones.length
  const pendientes    = devoluciones.filter(d => d.estado_inspeccion === 'Pendiente').length
  const finalizadas   = devoluciones.filter(d => d.estado_inspeccion === 'Finalizado').length
  const totalScrap    = devoluciones.reduce((s, d) => s + d.cantidad_scrap, 0)

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
          <IconDevoluciones size={22} className="mb-1 text-[var(--accent)]" aria-hidden />
          <p className="text-2xl font-bold text-white">{totalDev}</p>
          <p className="text-xs text-gray-300 mt-1">Total devoluciones</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-yellow-500/30 p-4">
          <IconPendiente size={22} className="mb-1 text-yellow-400" aria-hidden />
          <p className="text-2xl font-bold text-yellow-400">{pendientes}</p>
          <p className="text-xs text-gray-300 mt-1">Pendientes inspección</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-green-500/30 p-4">
          <IconCompletado size={22} className="mb-1 text-green-400" aria-hidden />
          <p className="text-2xl font-bold text-green-400">{finalizadas}</p>
          <p className="text-xs text-gray-300 mt-1">Finalizadas</p>
        </div>
        <div className="bg-gray-900 rounded-xl border border-red-500/30 p-4">
          <IconEliminar size={22} className="mb-1 text-red-400" aria-hidden />
          <p className="text-2xl font-bold text-red-400">{totalScrap.toLocaleString()}</p>
          <p className="text-xs text-gray-300 mt-1">Pzas en scrap</p>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-lg px-4 py-3 text-red-400 flex justify-between items-center">
          <span className="flex items-center gap-2"><IconAlertas size={16} aria-hidden /> {error}</span>
          <button onClick={() => setError('')} className="text-red-300 hover:text-white" aria-label="Cerrar"><IconCerrar size={16} aria-hidden /></button>
        </div>
      )}
      {success && (
        <div className="bg-green-900/30 border border-green-500/50 rounded-lg px-4 py-3 text-green-400 flex justify-between items-center">
          <span className="flex items-center gap-2"><IconOk size={16} aria-hidden /> {success}</span>
          <button onClick={() => setSuccess('')} className="text-green-300 hover:text-white" aria-label="Cerrar"><IconCerrar size={16} aria-hidden /></button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-xl font-bold flex items-center gap-2"><IconDevoluciones size={22} className="text-[var(--accent)]" aria-hidden /> Devoluciones</h2>
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          >
            {ESTADO_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Filtrar por SKU..."
            value={filtroSku}
            onChange={e => setFiltroSku(e.target.value)}
            className="font-mono bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={fetchDevoluciones} leftIcon={IconActualizar}>Refrescar</Button>
          <Button onClick={() => { resetFormCrear(); setShowCreateModal(true) }} leftIcon={IconNuevo}>Nueva Devolución</Button>
        </div>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner sizeClass="h-10 w-10" />
        </div>
      ) : devoluciones.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
          <IconDevoluciones size={40} className="mx-auto mb-3 text-gray-600" aria-hidden />
          <p className="text-gray-300">No hay devoluciones registradas</p>
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
                {devolucionesFiltradas.map((dev) => (
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
                            className="inline-flex items-center gap-1 bg-yellow-600/20 hover:bg-yellow-600/40 text-yellow-400 px-2 py-1 rounded text-xs transition-colors"
                            title="Procesar disposición"
                          >
                            <IconValidacion size={13} aria-hidden /> Procesar
                          </button>
                        )}
                        {dev.estado_inspeccion === 'Finalizado' && (
                          <span className="inline-flex items-center gap-1 text-green-400 text-xs"><IconCompletado size={13} aria-hidden /> Procesado</span>
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

      {/* Modal: Crear Devolución */}
      <Modal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={<span className="flex items-center gap-2"><IconNuevo size={18} aria-hidden /> Registrar Devolución</span>}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowCreateModal(false)}>Cancelar</Button>
            <Button onClick={handleCrear} leftIcon={IconOk}>Registrar</Button>
          </>
        }
      >
            <div className="space-y-4">
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
      </Modal>

      {/* Modal: Procesar Disposición */}
      <Modal
        open={showDisposicionModal && !!selectedDev}
        onClose={() => setShowDisposicionModal(false)}
        title={<span className="flex items-center gap-2"><IconValidacion size={18} aria-hidden /> Procesar Disposición</span>}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShowDisposicionModal(false)}>Cancelar</Button>
            <Button onClick={handleDisposicion} leftIcon={IconValidacion}>Confirmar Disposición</Button>
          </>
        }
      >
        {selectedDev && (
            <div className="space-y-4">
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
                <p className="text-xs text-yellow-400 flex items-start gap-1">
                  <IconAlertas size={13} className="mt-0.5 shrink-0" aria-hidden />
                  <span>Distribuya la cantidad devuelta ({selectedDev.cantidad_devuelta}) entre Scrap y Retrabajo.
                  La suma no debe superar la cantidad devuelta.</span>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-1 text-sm text-gray-300 mb-1"><IconEliminar size={14} aria-hidden /> Cantidad Scrap</label>
                  <input
                    type="text"
                    value={dispScrap}
                    onChange={(e) => setDispScrap(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-red-500 focus:outline-none"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1 text-sm text-gray-300 mb-1"><IconEnsamble size={14} aria-hidden /> Cantidad Retrabajo</label>
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
        )}
      </Modal>
    </div>
  )
}