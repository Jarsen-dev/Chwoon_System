// frontend/src/app/finanzas/ComprasTab.tsx

'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  getOrdenesCompra,
  crearOrdenCompra,
  eliminarOrdenCompra,
  registrarRecepcionLote,
  getOrdenCompra,
  descargarPdfOrdenCompra,
  descargarPdfDetalleOC,
  descargarEtiquetaLote,
} from '@/lib/api'
import type { OrdenCompra } from '@/types'

interface Props {
  token: string
}

const STATUS_COLORS: Record<string, string> = {
  Creada:     'bg-blue-500/20 text-blue-400 border-blue-500/30',
  Parcial:    'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  Completada: 'bg-green-500/20 text-green-400 border-green-500/30',
  Cancelada:  'bg-red-500/20 text-red-400 border-red-500/30',
}

const STATUS_OPTIONS = ['Todos', 'Creada', 'Parcial', 'Completada', 'Cancelada']

// Helper: construir lote ID — fecha sin guiones
function buildLoteId(fechaRecepcion: string, sku: string, recCount: number): string {
  const fecha = fechaRecepcion.slice(0, 10).replace(/-/g, '') // YYYYMMDD
  const skuSuffix = sku.slice(-4).toUpperCase()
  return `${fecha}-${skuSuffix}-${recCount}`
}

export default function ComprasTab({ token }: Props) {
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const errorTimerRef = useRef<NodeJS.Timeout | null>(null)
  const successTimerRef = useRef<NodeJS.Timeout | null>(null)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showRecepcionModal, setShowRecepcionModal] = useState(false)
  const [showDetalleModal, setShowDetalleModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const [ordenDetalle, setOrdenDetalle] = useState<any>(null)
  const [selectedOC, setSelectedOC] = useState<OrdenCompra | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OrdenCompra | null>(null)

  // ── FILTROS ────────────────────────────────────────────────────────
  const [showFiltros, setShowFiltros] = useState(false)
  const [filtroStatus, setFiltroStatus] = useState('Todos')
  const [filtroFechaDesde, setFiltroFechaDesde] = useState('')
  const [filtroFechaHasta, setFiltroFechaHasta] = useState('')
  const [filtroProveedor, setFiltroProveedor] = useState('')
  const [filtroValorMin, setFiltroValorMin] = useState('')
  const [filtroValorMax, setFiltroValorMax] = useState('')

  // Form: Crear OC
  const [formProveedor, setFormProveedor] = useState('')
  const [formIdProveedor, setFormIdProveedor] = useState('')
  const [formNotas, setFormNotas] = useState('')
  const [formItems, setFormItems] = useState<
    { sku_producto: string; nombre_producto: string; cantidad_requerida: string; precio_unitario: string }[]
  >([{ sku_producto: '', nombre_producto: '', cantidad_requerida: '', precio_unitario: '' }])

  // Form: Recepción en lote
  const [recCantidades, setRecCantidades] = useState<Record<string, string>>({})
  const [recNotas, setRecNotas] = useState('')

  // ── AUTO-DISMISS NOTIFICATIONS (15s) ───────────────────────────────
  const setErrorMsg = (msg: string) => {
    setError(msg)
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    if (msg) {
      errorTimerRef.current = setTimeout(() => setError(''), 15000)
    }
  }

  const setSuccessMsg = (msg: string) => {
    setSuccess(msg)
    if (successTimerRef.current) clearTimeout(successTimerRef.current)
    if (msg) {
      successTimerRef.current = setTimeout(() => setSuccess(''), 15000)
    }
  }

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
      if (successTimerRef.current) clearTimeout(successTimerRef.current)
    }
  }, [])

  // ── FETCH ──────────────────────────────────────────────────────────
  const fetchOrdenes = useCallback(async () => {
    try {
      setLoading(true)
      const res = await getOrdenesCompra(token)
      setOrdenes(res)
    } catch (err: any) {
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchOrdenes()
  }, [fetchOrdenes])

  // ── FILTRADO LOCAL ─────────────────────────────────────────────────
  const proveedoresUnicos = useMemo(() => {
    const set = new Set(ordenes.map((o) => o.nombre_proveedor))
    return Array.from(set).sort()
  }, [ordenes])

  const ordenesFiltradas = useMemo(() => {
    return ordenes.filter((oc) => {
      if (filtroStatus !== 'Todos' && oc.status !== filtroStatus) return false
      if (filtroProveedor && oc.nombre_proveedor !== filtroProveedor) return false
      if (filtroFechaDesde) {
        const fechaOC = new Date(oc.fecha_creacion).toISOString().slice(0, 10)
        if (fechaOC < filtroFechaDesde) return false
      }
      if (filtroFechaHasta) {
        const fechaOC = new Date(oc.fecha_creacion).toISOString().slice(0, 10)
        if (fechaOC > filtroFechaHasta) return false
      }
      const valorTotal = oc.items.reduce((s, i) => s + i.cantidad_requerida * i.precio_unitario, 0)
      if (filtroValorMin && valorTotal < parseFloat(filtroValorMin)) return false
      if (filtroValorMax && valorTotal > parseFloat(filtroValorMax)) return false
      return true
    })
  }, [ordenes, filtroStatus, filtroProveedor, filtroFechaDesde, filtroFechaHasta, filtroValorMin, filtroValorMax])

  const limpiarFiltros = () => {
    setFiltroStatus('Todos')
    setFiltroFechaDesde('')
    setFiltroFechaHasta('')
    setFiltroProveedor('')
    setFiltroValorMin('')
    setFiltroValorMax('')
  }

  const hayFiltrosActivos = filtroStatus !== 'Todos' || filtroFechaDesde || filtroFechaHasta || filtroProveedor || filtroValorMin || filtroValorMax

  // ── HELPERS ────────────────────────────────────────────────────────
  const clearMessages = () => { setError(''); setSuccess('') }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val)

  const canDelete = (oc: OrdenCompra) => oc.status === 'Creada'

  // Calcular lote ID para un SKU dado el historial de recepciones del detalle
  const getLoteInfo = (recepciones: any[], sku: string): string | null => {
    const recsForSku = (recepciones || []).filter((r: any) => r.sku_producto === sku)
    if (recsForSku.length === 0) return null
    const sorted = [...recsForSku].sort((a: any, b: any) =>
      new Date(b.fecha_recepcion).getTime() - new Date(a.fecha_recepcion).getTime()
    )
    return buildLoteId(sorted[0].fecha_recepcion, sku, recsForSku.length)
  }

  // ── CREAR OC ───────────────────────────────────────────────────────
  const resetFormCrear = () => {
    setFormProveedor('')
    setFormIdProveedor('')
    setFormNotas('')
    setFormItems([{ sku_producto: '', nombre_producto: '', cantidad_requerida: '', precio_unitario: '' }])
  }

  const handleCrear = async () => {
    clearMessages()
    try {
      const items = formItems
        .filter((i) => i.sku_producto.trim())
        .map((i) => ({
          sku_producto: i.sku_producto.trim().toUpperCase(),
          nombre_producto: i.nombre_producto.trim(),
          cantidad_requerida: parseFloat(i.cantidad_requerida) || 0,
          precio_unitario: parseFloat(i.precio_unitario) || 0,
        }))

      if (!formIdProveedor.trim() || !formProveedor.trim() || items.length === 0) {
        setErrorMsg('Complete todos los campos obligatorios')
        return
      }

      await crearOrdenCompra(token, {
        id_proveedor: formIdProveedor.trim(),
        nombre_proveedor: formProveedor.trim(),
        items,
        notas: formNotas || undefined,
      })

      setSuccessMsg('Orden de compra creada exitosamente')
      setShowCreateModal(false)
      resetFormCrear()
      fetchOrdenes()
    } catch (err: any) {
      setErrorMsg(err.message)
    }
  }

  const addItem = () =>
    setFormItems([...formItems, { sku_producto: '', nombre_producto: '', cantidad_requerida: '', precio_unitario: '' }])
  const removeItem = (idx: number) => setFormItems(formItems.filter((_, i) => i !== idx))
  const updateItem = (idx: number, field: string, value: string) => {
    const updated = [...formItems]
    ;(updated[idx] as any)[field] = value
    setFormItems(updated)
  }

  // ── ELIMINAR OC ────────────────────────────────────────────────────
  const handleEliminarConfirm = async () => {
    if (!deleteTarget) return
    clearMessages()
    try {
      await eliminarOrdenCompra(token, deleteTarget.oc_id)
      setSuccessMsg(`Orden ${deleteTarget.oc_id} eliminada`)
      setShowDeleteModal(false)
      setDeleteTarget(null)
      fetchOrdenes()
    } catch (err: any) {
      setErrorMsg(err.message)
      setShowDeleteModal(false)
    }
  }

  // ── RECEPCIÓN EN LOTE ──────────────────────────────────────────────
  const handleOpenRecepcion = (oc: OrdenCompra) => {
    setSelectedOC(oc)
    const cantidades: Record<string, string> = {}
    oc.items.forEach((item) => { cantidades[item.sku_producto] = '' })
    setRecCantidades(cantidades)
    setRecNotas('')
    setShowRecepcionModal(true)
  }

  const handleRecepcionLote = async () => {
    clearMessages()
    if (!selectedOC) return
    try {
      const recepciones = Object.entries(recCantidades)
        .filter(([_, cant]) => parseFloat(cant) > 0)
        .map(([sku, cant]) => ({
          oc_id: selectedOC.oc_id,
          sku_producto: sku,
          cantidad_recibida: parseFloat(cant),
          notas: recNotas || undefined,
        }))

      if (recepciones.length === 0) {
        setErrorMsg('Ingrese al menos una cantidad mayor a 0')
        return
      }

      const res = await registrarRecepcionLote(token, recepciones)
      setSuccessMsg(`${res.message} — Status: ${res.nuevo_status_oc}`)
      setShowRecepcionModal(false)
      fetchOrdenes()
    } catch (err: any) {
      setErrorMsg(err.message)
    }
  }

  // ── VER DETALLE ────────────────────────────────────────────────────
  const handleVerDetalle = async (ocId: string) => {
    try {
      const res = await getOrdenCompra(token, ocId)
      setOrdenDetalle(res)
      setShowDetalleModal(true)
    } catch (err: any) {
      setErrorMsg(err.message)
    }
  }

  // ── DESCARGAR PDF ORIGINAL (Logo+QR, sin notas) ────────────────────
  const handleDescargarPdf = async (ocId: string) => {
    try {
      await descargarPdfOrdenCompra(token, ocId)
    } catch (err: any) {
      setErrorMsg(err.message)
    }
  }

  // ── DESCARGAR PDF DETALLE (toda la info del modal) ─────────────────
  const handleDescargarPdfDetalle = async (ocId: string) => {
    try {
      await descargarPdfDetalleOC(token, ocId)
    } catch (err: any) {
      setErrorMsg(err.message)
    }
  }

  // ── DESCARGAR ETIQUETA LOTE IQC ───────────────────────────────────
  const handleDescargarEtiqueta = async (ocId: string, sku: string) => {
    try {
      await descargarEtiquetaLote(token, ocId, sku)
    } catch (err: any) {
      setErrorMsg(err.message)
    }
  }

  // ── RENDER ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Messages con auto-dismiss */}
      {error && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-lg px-4 py-3 text-red-400 flex justify-between animate-in fade-in">
          <span>❌ {error}</span>
          <button onClick={() => setError('')} className="text-red-300 hover:text-white">✕</button>
        </div>
      )}
      {success && (
        <div className="bg-green-900/30 border border-green-500/50 rounded-lg px-4 py-3 text-green-400 flex justify-between animate-in fade-in">
          <span>✅ {success}</span>
          <button onClick={() => setSuccess('')} className="text-green-300 hover:text-white">✕</button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold">🛒 Órdenes de Compra</h2>
          <button
            onClick={() => setShowFiltros(!showFiltros)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors border ${
              showFiltros || hayFiltrosActivos
                ? 'bg-emerald-600/20 border-emerald-500/30 text-emerald-400'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
            }`}
          >
            🔍 Filtros {hayFiltrosActivos && `(${ordenesFiltradas.length})`}
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchOrdenes} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors">
            🔄 Refrescar
          </button>
          <button
            onClick={() => { resetFormCrear(); setShowCreateModal(true) }}
            className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            ➕ Nueva Orden
          </button>
        </div>
      </div>

      {/* ══════ Panel de Filtros ══════ */}
      {showFiltros && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-400">🔍 Filtros</h3>
            {hayFiltrosActivos && (
              <button onClick={limpiarFiltros} className="text-xs text-red-400 hover:text-red-300 transition-colors">
                ✕ Limpiar filtros
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">📅 Fecha Desde</label>
              <input type="date" value={filtroFechaDesde} onChange={(e) => setFiltroFechaDesde(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">📅 Fecha Hasta</label>
              <input type="date" value={filtroFechaHasta} onChange={(e) => setFiltroFechaHasta(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">🏭 Proveedor</label>
              <select value={filtroProveedor} onChange={(e) => setFiltroProveedor(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none">
                <option value="">Todos los proveedores</option>
                {proveedoresUnicos.map((p) => (<option key={p} value={p}>{p}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">📋 Status</label>
              <select value={filtroStatus} onChange={(e) => setFiltroStatus(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none">
                {STATUS_OPTIONS.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">💰 Valor (rango)</label>
              <div className="flex gap-1">
                <input type="text" value={filtroValorMin} onChange={(e) => setFiltroValorMin(e.target.value)}
                  className="w-1/2 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm focus:border-emerald-500 focus:outline-none" placeholder="Min" />
                <input type="text" value={filtroValorMax} onChange={(e) => setFiltroValorMax(e.target.value)}
                  className="w-1/2 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm focus:border-emerald-500 focus:outline-none" placeholder="Max" />
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-500">{ordenesFiltradas.length} de {ordenes.length} órdenes encontradas</p>
        </div>
      )}

      {/* ══════ Tabla ══════ */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-400" />
        </div>
      ) : ordenesFiltradas.length === 0 ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
          <p className="text-4xl mb-3">📦</p>
          <p className="text-gray-400">{hayFiltrosActivos ? 'No hay órdenes que coincidan con los filtros' : 'No hay órdenes de compra'}</p>
        </div>
      ) : (
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 sticky top-0">
                <tr>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">OC ID</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">Proveedor</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">Status</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">Items</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">Valor Total</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">Fecha</th>
                  <th className="px-4 py-3 text-left text-gray-400 font-medium">Creado por</th>
                  <th className="px-4 py-3 text-center text-gray-400 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {ordenesFiltradas.map((oc) => {
                  const valorTotal = oc.items.reduce((sum, i) => sum + i.cantidad_requerida * i.precio_unitario, 0)
                  return (
                    <tr key={oc.oc_id} className="hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-emerald-400">{oc.oc_id}</td>
                      <td className="px-4 py-3">{oc.nombre_proveedor}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium border ${STATUS_COLORS[oc.status] || 'bg-gray-500/20 text-gray-400'}`}>
                          {oc.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-300">{oc.items.length} items</td>
                      <td className="px-4 py-3 text-gray-300">{formatCurrency(valorTotal)}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(oc.fecha_creacion)}</td>
                      <td className="px-4 py-3 text-gray-400">{oc.creado_por || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center gap-1">
                          {/* Ver detalle */}
                          <button
                            onClick={() => handleVerDetalle(oc.oc_id)}
                            className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 px-2 py-1 rounded text-xs transition-colors"
                            title="Ver detalle"
                          >
                            👁️
                          </button>

                          {/* Recepción: solo si no está completada ni cancelada */}
                          {oc.status !== 'Completada' && oc.status !== 'Cancelada' && (
                            <button
                              onClick={() => handleOpenRecepcion(oc)}
                              className="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 px-2 py-1 rounded text-xs transition-colors"
                              title="Registrar recepción"
                            >
                              📥
                            </button>
                          )}

                          {/* PDF original (Logo+QR, sin notas): solo si completada */}
                          {oc.status === 'Completada' && (
                            <button
                              onClick={() => handleDescargarPdf(oc.oc_id)}
                              className="bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 px-2 py-1 rounded text-xs transition-colors"
                              title="Descargar PDF"
                            >
                              📄
                            </button>
                          )}

                          {/* Eliminar: SOLO si status es "Creada" */}
                          {canDelete(oc) && (
                            <button
                              onClick={() => { setDeleteTarget(oc); setShowDeleteModal(true) }}
                              className="bg-red-600/20 hover:bg-red-600/40 text-red-400 px-2 py-1 rounded text-xs transition-colors"
                              title="Eliminar"
                            >
                              🗑️
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ══════ Modal: Crear Orden ══════ */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">➕ Nueva Orden de Compra</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">ID Proveedor *</label>
                  <input type="text" value={formIdProveedor} onChange={(e) => setFormIdProveedor(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" placeholder="PROV-001" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Nombre Proveedor *</label>
                  <input type="text" value={formProveedor} onChange={(e) => setFormProveedor(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" placeholder="Proveedor S.A. de C.V." />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Notas (opcional)</label>
                <textarea value={formNotas} onChange={(e) => setFormNotas(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" rows={2} placeholder="Notas adicionales..." />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-gray-300">Productos *</label>
                  <button onClick={addItem} className="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 px-3 py-1 rounded-lg text-xs transition-colors">
                    + Agregar producto
                  </button>
                </div>
                <div className="space-y-3">
                  {formItems.map((item, idx) => (
                    <div key={idx} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                      <div className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-3">
                          <label className="block text-xs text-gray-500 mb-1">SKU *</label>
                          <input type="text" value={item.sku_producto} onChange={(e) => updateItem(idx, 'sku_producto', e.target.value)}
                            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none" placeholder="SKU-001" />
                        </div>
                        <div className="col-span-4">
                          <label className="block text-xs text-gray-500 mb-1">Nombre *</label>
                          <input type="text" value={item.nombre_producto} onChange={(e) => updateItem(idx, 'nombre_producto', e.target.value)}
                            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none" placeholder="Nombre del producto" />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-500 mb-1">Cantidad *</label>
                          <input type="text" value={item.cantidad_requerida} onChange={(e) => updateItem(idx, 'cantidad_requerida', e.target.value)}
                            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none" placeholder="0" />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-xs text-gray-500 mb-1">Precio Unit.</label>
                          <input type="text" value={item.precio_unitario} onChange={(e) => updateItem(idx, 'precio_unitario', e.target.value)}
                            className="w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm focus:border-emerald-500 focus:outline-none" placeholder="0.00" />
                        </div>
                        <div className="col-span-1 flex justify-center">
                          {formItems.length > 1 && (
                            <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-300 text-lg">🗑️</button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-800 flex justify-end gap-3">
              <button onClick={() => setShowCreateModal(false)} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors">Cancelar</button>
              <button onClick={handleCrear} className="bg-emerald-600 hover:bg-emerald-700 px-6 py-2 rounded-lg text-sm font-medium transition-colors">✅ Crear Orden</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ Modal: Recepción en Lote ══════ */}
      {showRecepcionModal && selectedOC && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">📥 Registrar Recepción</h3>
              <button onClick={() => setShowRecepcionModal(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                <p className="text-sm text-gray-400">Orden: <span className="text-emerald-400 font-mono font-medium">{selectedOC.oc_id}</span></p>
                <p className="text-sm text-gray-400">Proveedor: <span className="text-white">{selectedOC.nombre_proveedor}</span></p>
              </div>

              <p className="text-xs text-gray-500">Ingrese la cantidad recibida para cada producto. Deje en 0 o vacío los que no apliquen.</p>

              <div className="space-y-3">
                {selectedOC.items.map((item) => {
                  const pendiente = item.cantidad_requerida - item.cantidad_recibida
                  const completado = item.cantidad_recibida >= item.cantidad_requerida
                  return (
                    <div key={item.sku_producto} className={`rounded-lg p-3 border ${completado ? 'bg-green-900/10 border-green-700/30' : 'bg-gray-800/50 border-gray-700'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-sm font-mono text-emerald-400">{item.sku_producto}</p>
                          <p className="text-xs text-gray-400">{item.nombre_producto}</p>
                        </div>
                        {completado && <span className="text-xs bg-green-900/30 text-green-400 px-2 py-0.5 rounded-full">✅ Completo</span>}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs mb-2">
                        <div><span className="text-gray-500">Requerida:</span><span className="text-white ml-1 font-medium">{item.cantidad_requerida}</span></div>
                        <div><span className="text-gray-500">Recibida:</span><span className="text-yellow-400 ml-1 font-medium">{item.cantidad_recibida}</span></div>
                        <div><span className="text-gray-500">Pendiente:</span><span className={`ml-1 font-medium ${pendiente > 0 ? 'text-red-400' : 'text-green-400'}`}>{Math.max(0, pendiente)}</span></div>
                      </div>
                      {!completado && (
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Cantidad a recibir ahora:</label>
                          <input type="text" value={recCantidades[item.sku_producto] || ''}
                            onChange={(e) => setRecCantidades((prev) => ({ ...prev, [item.sku_producto]: e.target.value }))}
                            className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" placeholder="0" />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Notas (opcional)</label>
                <textarea value={recNotas} onChange={(e) => setRecNotas(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none" rows={2} placeholder="Notas de la recepción..." />
              </div>
            </div>
            <div className="p-6 border-t border-gray-800 flex justify-end gap-3">
              <button onClick={() => setShowRecepcionModal(false)} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors">Cancelar</button>
              <button onClick={handleRecepcionLote} className="bg-emerald-600 hover:bg-emerald-700 px-6 py-2 rounded-lg text-sm font-medium transition-colors">📥 Registrar Todo</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ Modal: Detalle con LOTE y Etiqueta IQC ══════ */}
      {showDetalleModal && ordenDetalle && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">📋 Detalle: <span className="text-emerald-400">{ordenDetalle.oc_id}</span></h3>
              <button onClick={() => setShowDetalleModal(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                  <p className="text-xs text-gray-500">Proveedor</p>
                  <p className="text-sm font-medium">{ordenDetalle.nombre_proveedor}</p>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                  <p className="text-xs text-gray-500">Status</p>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium border ${STATUS_COLORS[ordenDetalle.status] || ''}`}>{ordenDetalle.status}</span>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                  <p className="text-xs text-gray-500">Fecha</p>
                  <p className="text-sm">{formatDate(ordenDetalle.fecha_creacion)}</p>
                </div>
              </div>

              {ordenDetalle.notas && (
                <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-700">
                  <p className="text-xs text-gray-500 mb-1">Notas</p>
                  <p className="text-sm text-gray-300">{ordenDetalle.notas}</p>
                </div>
              )}

              {/* Productos con columna LOTE y botón Etiqueta */}
              <div>
                <h4 className="text-sm font-semibold text-gray-400 mb-2">📦 Productos</h4>
                <div className="bg-gray-800/30 rounded-lg border border-gray-700 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-800">
                      <tr>
                        <th className="px-4 py-2 text-left text-gray-400 text-xs">SKU</th>
                        <th className="px-4 py-2 text-left text-gray-400 text-xs">Nombre</th>
                        <th className="px-4 py-2 text-right text-gray-400 text-xs">Requerida</th>
                        <th className="px-4 py-2 text-right text-gray-400 text-xs">Recibida</th>
                        <th className="px-4 py-2 text-right text-gray-400 text-xs">Precio Unit.</th>
                        <th className="px-4 py-2 text-right text-gray-400 text-xs">Progreso</th>
                        <th className="px-4 py-2 text-left text-gray-400 text-xs">Lote</th>
                        <th className="px-4 py-2 text-center text-gray-400 text-xs">Etiqueta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {ordenDetalle.items.map((item: any, idx: number) => {
                        const pct = item.cantidad_requerida > 0 ? Math.min(100, (item.cantidad_recibida / item.cantidad_requerida) * 100) : 0
                        const pctColor = pct >= 100 ? 'text-green-400' : pct > 0 ? 'text-yellow-400' : 'text-gray-500'
                        const loteId = getLoteInfo(ordenDetalle.recepciones, item.sku_producto)
                        return (
                          <tr key={idx}>
                            <td className="px-4 py-2 font-mono text-emerald-400">{item.sku_producto}</td>
                            <td className="px-4 py-2">{item.nombre_producto}</td>
                            <td className="px-4 py-2 text-right">{item.cantidad_requerida}</td>
                            <td className="px-4 py-2 text-right">{item.cantidad_recibida}</td>
                            <td className="px-4 py-2 text-right">{formatCurrency(item.precio_unitario)}</td>
                            <td className="px-4 py-2 text-right"><span className={`font-medium ${pctColor}`}>{pct.toFixed(0)}%</span></td>
                            <td className="px-4 py-2 font-mono text-xs text-orange-400">{loteId || '—'}</td>
                            <td className="px-4 py-2 text-center">
                              {loteId ? (
                                <button
                                  onClick={() => handleDescargarEtiqueta(ordenDetalle.oc_id, item.sku_producto)}
                                  className="bg-orange-600/20 hover:bg-orange-600/40 text-orange-400 px-2 py-1 rounded text-xs transition-colors"
                                  title="Descargar Etiqueta Lote IQC"
                                >
                                  🏷️ IQC
                                </button>
                              ) : (
                                <span className="text-gray-600 text-xs">—</span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Historial de Recepciones con notas */}
              {ordenDetalle.recepciones && ordenDetalle.recepciones.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-400 mb-2">📥 Historial de Recepciones</h4>
                  <div className="space-y-2">
                    {ordenDetalle.recepciones.map((rec: any) => (
                      <div key={rec.recepcion_id} className="bg-gray-800/30 rounded-lg p-3 border border-gray-700 flex justify-between items-start">
                        <div>
                          <p className="text-sm font-mono text-blue-400">{rec.recepcion_id}</p>
                          <p className="text-xs text-gray-400">
                            {rec.sku_producto} — Cantidad: {rec.cantidad_recibida} — {rec.recibido_por || 'N/A'}
                          </p>
                          {rec.notas && (
                            <p className="text-xs text-gray-500 mt-1">
                              <span className="text-gray-400">Nota:</span> {rec.notas}
                            </p>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 shrink-0 ml-4">{formatDate(rec.fecha_recepcion)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Botón PDF Detalle — siempre disponible */}
              <div className="flex justify-center">
                <button
                  onClick={() => handleDescargarPdfDetalle(ordenDetalle.oc_id)}
                  className="bg-purple-600 hover:bg-purple-700 px-6 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  📄 Descargar PDF Detalle
                </button>
              </div>
            </div>

            <div className="p-6 border-t border-gray-800 flex justify-end">
              <button onClick={() => setShowDetalleModal(false)} className="bg-gray-700 hover:bg-gray-600 px-6 py-2 rounded-lg text-sm transition-colors">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ Modal: Confirmar Eliminación ══════ */}
      {showDeleteModal && deleteTarget && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-red-700/50 w-full max-w-md">
            <div className="p-6 border-b border-gray-800">
              <h3 className="text-lg font-bold text-red-400">⚠️ Confirmar Eliminación</h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-gray-300">¿Está seguro de que desea eliminar esta orden de compra?</p>
              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700 space-y-1">
                <p className="text-sm"><span className="text-gray-500">Orden:</span> <span className="text-emerald-400 font-mono font-medium">{deleteTarget.oc_id}</span></p>
                <p className="text-sm"><span className="text-gray-500">Proveedor:</span> <span className="text-white">{deleteTarget.nombre_proveedor}</span></p>
                <p className="text-sm"><span className="text-gray-500">Items:</span> <span className="text-white">{deleteTarget.items.length}</span></p>
              </div>
              <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3">
                <p className="text-xs text-red-400">⚠️ Esta acción no se puede deshacer. Se eliminarán la orden y todos sus items asociados.</p>
              </div>
            </div>
            <div className="p-6 border-t border-gray-800 flex justify-end gap-3">
              <button onClick={() => { setShowDeleteModal(false); setDeleteTarget(null) }} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors">Cancelar</button>
              <button onClick={handleEliminarConfirm} className="bg-red-600 hover:bg-red-700 px-6 py-2 rounded-lg text-sm font-medium transition-colors">🗑️ Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}