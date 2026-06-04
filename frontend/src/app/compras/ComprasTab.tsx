'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  getOrdenesCompra,
  crearOrdenCompra,
  eliminarOrdenCompra,
  getOrdenCompra,
  descargarPdfOrdenCompra,
  aprobarOrdenCompra,
  getProveedores,
  getProducto,
  firmarOrdenCompras,
  type ProveedorItem,
} from '@/lib/api'
import type { OrdenCompra } from '@/types'
import { DataTable, Badge } from '@/components/ui'

interface Props { token: string }

// ── tipos locales ────────────────────────────────────────────────────────────
type FormItem = {
  sku_producto:      string
  nombre_producto:   string
  cantidad_requerida: string
  precio_unitario:   string
}

// ── constantes ───────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  'Pendiente de Firma':   'bg-gray-500/20 text-gray-400 border-gray-500/30',
  'Pendiente Aprobación': 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  'Autorizada':           'bg-blue-500/20 text-blue-400 border-blue-500/30',
  'Parcial':              'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  'Completada':           'bg-green-500/20 text-green-400 border-green-500/30',
  'Rechazada':            'bg-red-500/20 text-red-400 border-red-500/30',
  'Cancelada':            'bg-red-900/20 text-red-600 border-red-900/30',
}
const STATUS_OPTIONS = ['Todos', 'Pendiente de Firma', 'Pendiente Aprobación', 'Autorizada', 'Parcial', 'Completada', 'Rechazada', 'Cancelada']

const ITEM_VACIO: FormItem = { sku_producto: '', nombre_producto: '', cantidad_requerida: '', precio_unitario: '' }

// ── selectCls helper ─────────────────────────────────────────────────────────
const selectCls = (accent: string) =>
  `w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:${accent} focus:outline-none`

// ════════════════════════════════════════════════════════════════════════════
export default function ComprasTab({ token }: Props) {

  // ── listas ─────────────────────────────────────────────────────────────
  const [ordenes, setOrdenes]   = useState<OrdenCompra[]>([])
  const [loading, setLoading]   = useState(true)

  // ── proveedores (cargados al abrir un modal) ────────────────────────────
  const [proveedores, setProveedores]         = useState<ProveedorItem[]>([])
  const [proveedoresLoading, setProveedoresLoading] = useState(false)
  const proveedoresCargados = useRef(false)

  // ── caché de productos (SKU → producto) para auto-fill descripción ───────
  const productoCache = useRef<Record<string, any>>({})

  // ── mensajes ────────────────────────────────────────────────────────────
  const [error,   setError]   = useState('')
  const [success, setSuccess] = useState('')
  const errorTimerRef   = useRef<NodeJS.Timeout | null>(null)
  const successTimerRef = useRef<NodeJS.Timeout | null>(null)

  // ── modales ─────────────────────────────────────────────────────────────
  const [showCreateModal,  setShowCreateModal]  = useState(false)
  const [showDetalleModal, setShowDetalleModal] = useState(false)
  const [showDeleteModal,  setShowDeleteModal]  = useState(false)
  const [showEditModal,    setShowEditModal]    = useState(false)

  const [ordenDetalle, setOrdenDetalle] = useState<any>(null)
  const [deleteTarget, setDeleteTarget] = useState<OrdenCompra | null>(null)
  const [editOC,       setEditOC]       = useState<OrdenCompra | null>(null)

  // ── filtros ─────────────────────────────────────────────────────────────
  const [showFiltros,       setShowFiltros]       = useState(false)
  const [filtroStatus,      setFiltroStatus]      = useState('Todos')
  const [filtroFechaDesde,  setFiltroFechaDesde]  = useState('')
  const [filtroFechaHasta,  setFiltroFechaHasta]  = useState('')
  const [filtroProveedor,   setFiltroProveedor]   = useState('')
  const [filtroValorMin,    setFiltroValorMin]    = useState('')
  const [filtroValorMax,    setFiltroValorMax]    = useState('')

  // ── formulario ───────────────────────────────────────────────────────────
  const [formProveedorUuid,   setFormProveedorUuid]   = useState('')  // uuid "PROV-XXXXXX"
  const [formProveedorNombre, setFormProveedorNombre] = useState('')  // razon_social
  const [formNotas,           setFormNotas]           = useState('')
  const [formIva,             setFormIva]             = useState(16)
  const [formItems,           setFormItems]           = useState<FormItem[]>([{ ...ITEM_VACIO }])

  // ── proveedor seleccionado (derivado) ────────────────────────────────────
  const selectedProveedor = useMemo(
    () => proveedores.find(p => p.uuid === formProveedorUuid) ?? null,
    [proveedores, formProveedorUuid],
  )

  // ════════════════════════════════════════════════════════════════════════
  // AUTO-DISMISS
  // ════════════════════════════════════════════════════════════════════════
  const setErrorMsg = (msg: string) => {
    setError(msg)
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    if (msg) errorTimerRef.current = setTimeout(() => setError(''), 15000)
  }
  const setSuccessMsg = (msg: string) => {
    setSuccess(msg)
    if (successTimerRef.current) clearTimeout(successTimerRef.current)
    if (msg) successTimerRef.current = setTimeout(() => setSuccess(''), 15000)
  }
  useEffect(() => () => {
    if (errorTimerRef.current)   clearTimeout(errorTimerRef.current)
    if (successTimerRef.current) clearTimeout(successTimerRef.current)
  }, [])
  const clearMessages = () => { setError(''); setSuccess('') }

  // ════════════════════════════════════════════════════════════════════════
  // FETCH ÓRDENES
  // ════════════════════════════════════════════════════════════════════════
  const fetchOrdenes = useCallback(async () => {
    try {
      setLoading(true)
      setOrdenes(await getOrdenesCompra(token))
    } catch (err: any) {
      setErrorMsg(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { fetchOrdenes() }, [fetchOrdenes])

  // ════════════════════════════════════════════════════════════════════════
  // FETCH PROVEEDORES (solo una vez, lazy)
  // ════════════════════════════════════════════════════════════════════════
  const loadProveedores = useCallback(async () => {
    if (proveedoresCargados.current) return
    setProveedoresLoading(true)
    try {
      const data = await getProveedores(token)
      setProveedores(data)
      proveedoresCargados.current = true
    } catch {
      // no bloquear el modal si falla — los campos quedan como texto
    } finally {
      setProveedoresLoading(false)
    }
  }, [token])

  // ════════════════════════════════════════════════════════════════════════
  // SELECCIÓN DE PROVEEDOR — bidireccional
  // ════════════════════════════════════════════════════════════════════════

  /** Seleccionar por UUID (dropdown ID Proveedor) */
  const handleSelectById = (uuid: string, resetItems = true) => {
    const prov = proveedores.find(p => p.uuid === uuid)
    setFormProveedorUuid(uuid)
    setFormProveedorNombre(prov?.razon_social ?? '')
    if (resetItems) {
      setFormItems([{ ...ITEM_VACIO }])
    }
  }

  /** Seleccionar por razón social (dropdown Nombre Proveedor) */
  const handleSelectByNombre = (razonSocial: string, resetItems = true) => {
    const prov = proveedores.find(p => p.razon_social === razonSocial)
    setFormProveedorNombre(razonSocial)
    setFormProveedorUuid(prov?.uuid ?? '')
    if (resetItems) {
      setFormItems([{ ...ITEM_VACIO }])
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // SELECCIÓN DE SKU — auto-rellena descripción desde Productos
  // ════════════════════════════════════════════════════════════════════════
  const handleSelectSku = async (idx: number, sku: string) => {
    // Actualizar SKU e iniciar descripción vacía mientras carga
    setFormItems(prev => {
      const next = [...prev]
      next[idx] = { ...next[idx], sku_producto: sku, nombre_producto: '' }
      return next
    })
    if (!sku) return

    try {
      let prod = productoCache.current[sku]
      if (!prod) {
        prod = await getProducto(sku)
        productoCache.current[sku] = prod
      }
      const desc = (prod.descripcion || prod.nombre || '').trim()
      // Solo aplicar si la fila sigue con el mismo SKU (evita race conditions)
      setFormItems(prev => {
        const next = [...prev]
        if (next[idx]?.sku_producto === sku) {
          next[idx] = { ...next[idx], nombre_producto: desc }
        }
        return next
      })
    } catch {
      // SKU no encontrado en catálogo → descripción queda editable
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // HELPERS DE ITEMS
  // ════════════════════════════════════════════════════════════════════════
  const addItem = () => setFormItems(prev => [...prev, { ...ITEM_VACIO }])
  const removeItem = (idx: number) => setFormItems(prev => prev.filter((_, i) => i !== idx))
  const updateItem = (idx: number, field: keyof FormItem, value: string) =>
    setFormItems(prev => {
      const next = [...prev]; next[idx] = { ...next[idx], [field]: value }; return next
    })

  // ════════════════════════════════════════════════════════════════════════
  // RESET FORMULARIO
  // ════════════════════════════════════════════════════════════════════════
  const resetForm = () => {
    setFormProveedorUuid(''); setFormProveedorNombre(''); setFormNotas('')
    setFormIva(16)
    setFormItems([{ ...ITEM_VACIO }])
  }

  // ════════════════════════════════════════════════════════════════════════
  // FILTRADO LOCAL
  // ════════════════════════════════════════════════════════════════════════
  const proveedoresUnicos = useMemo(() => {
    const s = new Set(ordenes.map(o => o.nombre_proveedor))
    return Array.from(s).sort()
  }, [ordenes])

  const ordenesFiltradas = useMemo(() => ordenes.filter(oc => {
    if (filtroStatus !== 'Todos' && oc.status !== filtroStatus) return false
    if (filtroProveedor && oc.nombre_proveedor !== filtroProveedor) return false
    if (filtroFechaDesde) {
      if (new Date(oc.fecha_creacion).toISOString().slice(0, 10) < filtroFechaDesde) return false
    }
    if (filtroFechaHasta) {
      if (new Date(oc.fecha_creacion).toISOString().slice(0, 10) > filtroFechaHasta) return false
    }
    const valor = oc.items.reduce((s, i) => s + i.cantidad_requerida * i.precio_unitario, 0)
    if (filtroValorMin && valor < parseFloat(filtroValorMin)) return false
    if (filtroValorMax && valor > parseFloat(filtroValorMax)) return false
    return true
  }), [ordenes, filtroStatus, filtroProveedor, filtroFechaDesde, filtroFechaHasta, filtroValorMin, filtroValorMax])

  const limpiarFiltros = () => {
    setFiltroStatus('Todos'); setFiltroFechaDesde(''); setFiltroFechaHasta('')
    setFiltroProveedor(''); setFiltroValorMin(''); setFiltroValorMax('')
  }
  const hayFiltrosActivos =
    filtroStatus !== 'Todos' || filtroFechaDesde || filtroFechaHasta ||
    filtroProveedor || filtroValorMin || filtroValorMax

  // ════════════════════════════════════════════════════════════════════════
  // HELPERS UI
  // ════════════════════════════════════════════════════════════════════════
  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val)
  const canDelete = (oc: OrdenCompra) =>
    oc.status === 'Creada' || oc.status === 'Pendiente Aprobación'
  const isPendienteAprobacion = (oc: OrdenCompra) => oc.status === 'Pendiente Aprobación'

  // ════════════════════════════════════════════════════════════════════════
  // ACCIONES — CREAR
  // ════════════════════════════════════════════════════════════════════════
  const handleCrear = async () => {
    clearMessages()
    const items = formItems
      .filter(i => i.sku_producto.trim())
      .map(i => ({
        sku_producto:       i.sku_producto.trim().toUpperCase(),
        nombre_producto:    i.nombre_producto.trim(),
        cantidad_requerida: parseFloat(i.cantidad_requerida) || 0,
        precio_unitario:    parseFloat(i.precio_unitario)    || 0,
      }))
    if (!formProveedorUuid.trim() || !formProveedorNombre.trim() || items.length === 0) {
      setErrorMsg('Complete todos los campos obligatorios'); return
    }
    try {
      await crearOrdenCompra(token, {
        id_proveedor:    formProveedorUuid.trim(),
        nombre_proveedor: formProveedorNombre.trim(),
        items,
        notas: formNotas || undefined,
        iva: formIva,
      })
      setSuccessMsg('Orden de compra creada exitosamente')
      setShowCreateModal(false); resetForm(); fetchOrdenes()
    } catch (err: any) { setErrorMsg(err.message) }
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACCIONES — ELIMINAR
  // ════════════════════════════════════════════════════════════════════════
  const handleEliminarConfirm = async () => {
    if (!deleteTarget) return; clearMessages()
    try {
      await eliminarOrdenCompra(token, deleteTarget.oc_id)
      setSuccessMsg(`Orden ${deleteTarget.oc_id} eliminada`)
      setShowDeleteModal(false); setDeleteTarget(null); fetchOrdenes()
    } catch (err: any) { setErrorMsg(err.message); setShowDeleteModal(false) }
  }

  const handleFirmar = async (oc: any) => {
    clearMessages()
    try {
      await firmarOrdenCompras(token, oc.oc_id)
      setSuccessMsg(`Firma estampada en la orden ${oc.oc_id}. Enviada a Finanzas.`)
      fetchOrdenes()
    } catch (err: any) { setErrorMsg(err.message) }
  }

  // ════════════════════════════════════════════════════════════════════════
  // ACCIONES — EDITAR / APROBAR
  // ════════════════════════════════════════════════════════════════════════
  const handleOpenEdit = async (oc: OrdenCompra) => {
    await loadProveedores()
    setEditOC(oc)
    setFormProveedorUuid(oc.id_proveedor)
    setFormProveedorNombre(oc.nombre_proveedor)
    setFormNotas(oc.notas || '')
    setFormItems(oc.items.map(i => ({
      sku_producto:       i.sku_producto,
      nombre_producto:    i.nombre_producto,
      cantidad_requerida: String(i.cantidad_requerida),
      precio_unitario:    String(i.precio_unitario),
    })))
    setShowEditModal(true)
  }

  const handleAprobar = async () => {
    clearMessages()
    if (!editOC) return
    const items = formItems
      .filter(i => i.sku_producto.trim())
      .map(i => ({
        sku_producto:       i.sku_producto.trim().toUpperCase(),
        nombre_producto:    i.nombre_producto.trim(),
        cantidad_requerida: parseFloat(i.cantidad_requerida) || 0,
        precio_unitario:    parseFloat(i.precio_unitario)    || 0,
      }))
    if (!formProveedorUuid.trim() || !formProveedorNombre.trim() || items.length === 0) {
      setErrorMsg('Complete proveedor y al menos un producto antes de aprobar'); return
    }
    try {
      await aprobarOrdenCompra(token, editOC.oc_id, {
        id_proveedor:    formProveedorUuid.trim(),
        nombre_proveedor: formProveedorNombre.trim(),
        items,
        notas: formNotas || undefined,
        iva: formIva,
      })
      setSuccessMsg(`Orden ${editOC.oc_id} aprobada exitosamente`)
      setShowEditModal(false); setEditOC(null); resetForm(); fetchOrdenes()
    } catch (err: any) { setErrorMsg(err.message) }
  }

  const handleVerDetalle = async (ocId: string) => {
    try {
      setOrdenDetalle(await getOrdenCompra(token, ocId)); setShowDetalleModal(true)
    } catch (err: any) { setErrorMsg(err.message) }
  }

  const handleDescargarPdf = async (ocId: string) => {
    try { await descargarPdfOrdenCompra(token, ocId) } catch (err: any) { setErrorMsg(err.message) }
  }

  // ════════════════════════════════════════════════════════════════════════
  // COMPONENTE — SECCIÓN PROVEEDOR (reutilizable en ambos modales)
  // ════════════════════════════════════════════════════════════════════════
  const renderProveedorFields = (accentFocus: string, isEdit = false) => {
    const sinProveedor  = !formProveedorUuid
    const borderId      = sinProveedor ? `border-gray-700` : `border-emerald-700/50`
    const borderNombre  = sinProveedor ? `border-gray-700` : `border-emerald-700/50`
    const accentClass   = `focus:border-${accentFocus}-500`

    return (
      <div className="grid grid-cols-2 gap-4">
        {/* ID Proveedor */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">
            ID Proveedor *
            {proveedoresLoading && <span className="ml-2 text-xs text-gray-500 animate-pulse">cargando…</span>}
          </label>
          {proveedores.length > 0 ? (
            <select
              value={formProveedorUuid}
              onChange={e => handleSelectById(e.target.value, !isEdit)}
              className={`w-full bg-gray-800 border ${borderId} rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-${accentFocus}-500`}
            >
              <option value="">— Seleccionar proveedor —</option>
              {proveedores
                .filter(p => p.estatus_calidad !== 'Suspendido')
                .map(p => (
                  <option key={p.uuid} value={p.uuid}>{p.uuid}</option>
                ))}
            </select>
          ) : (
            <input
              type="text"
              value={formProveedorUuid}
              onChange={e => { setFormProveedorUuid(e.target.value) }}
              className={`w-full bg-gray-800 border ${borderId} rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-${accentFocus}-500`}
              placeholder="PROV-001"
            />
          )}
        </div>

        {/* Nombre Proveedor */}
        <div>
          <label className="block text-sm text-gray-400 mb-1">Nombre Proveedor *</label>
          {proveedores.length > 0 ? (
            <select
              value={formProveedorNombre}
              onChange={e => handleSelectByNombre(e.target.value, !isEdit)}
              className={`w-full bg-gray-800 border ${borderNombre} rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-${accentFocus}-500`}
            >
              <option value="">— Seleccionar proveedor —</option>
              {proveedores
                .filter(p => p.estatus_calidad !== 'Suspendido')
                .map(p => (
                  <option key={p.uuid} value={p.razon_social}>{p.razon_social}</option>
                ))}
            </select>
          ) : (
            <input
              type="text"
              value={formProveedorNombre}
              onChange={e => setFormProveedorNombre(e.target.value)}
              className={`w-full bg-gray-800 border ${borderNombre} rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-${accentFocus}-500`}
              placeholder="Proveedor S.A. de C.V."
            />
          )}
        </div>

        {/* Info del proveedor seleccionado */}
        {selectedProveedor && (
          <div className="col-span-2 bg-emerald-900/10 border border-emerald-700/20 rounded-lg px-3 py-2 flex flex-wrap gap-4 text-xs text-gray-400">
            <span>RFC: <span className="text-gray-300 font-mono">{selectedProveedor.rfc}</span></span>
            <span>Lead time: <span className="text-gray-300">{selectedProveedor.lead_time_dias} días</span></span>
            <span>Pago: <span className="text-gray-300">{selectedProveedor.condiciones_pago}</span></span>
            <span>
              Score: <span className={`font-semibold ${
                (selectedProveedor.score_calidad ?? 100) >= 80 ? 'text-emerald-400' :
                (selectedProveedor.score_calidad ?? 100) >= 60 ? 'text-yellow-400' : 'text-red-400'
              }`}>{(selectedProveedor.score_calidad ?? 100).toFixed(1)}</span>
            </span>
            <span>
              Materiales registrados: <span className="text-gray-300">{selectedProveedor.materiales.length}</span>
            </span>
          </div>
        )}
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════
  // COMPONENTE — FILA DE ITEM
  // ════════════════════════════════════════════════════════════════════════
  const renderItemRow = (item: FormItem, idx: number, accentFocus: string) => {
    const hasMateriales = (selectedProveedor?.materiales?.length ?? 0) > 0
    // Si el SKU actual no está en la lista del proveedor, añadirlo como opción extra
    const materialesOpts = selectedProveedor?.materiales ?? []
    const skuEnLista = materialesOpts.some(m => m.sku_material === item.sku_producto)

    return (
      <div key={idx} className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
        <div className="grid grid-cols-12 gap-2 items-end">

          {/* No. de Parte */}
          <div className="col-span-3">
            <label className="block text-xs text-gray-500 mb-1">
              No. de Parte *
              {hasMateriales && <span className="ml-1 text-emerald-600">▾</span>}
            </label>
            {hasMateriales ? (
              <select
                value={item.sku_producto}
                onChange={e => handleSelectSku(idx, e.target.value)}
                className={`w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-${accentFocus}-500`}
              >
                <option value="">Seleccionar…</option>
                {/* Si el SKU actual existe pero no está en la lista del proveedor, mostrarlo */}
                {item.sku_producto && !skuEnLista && (
                  <option value={item.sku_producto}>{item.sku_producto} ⚠️</option>
                )}
                {materialesOpts.map(m => (
                  <option key={m.sku_material} value={m.sku_material}>{m.sku_material}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={item.sku_producto}
                onChange={e => handleSelectSku(idx, e.target.value.toUpperCase())}
                className={`w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-${accentFocus}-500`}
                placeholder={selectedProveedor ? 'Sin partes registradas' : 'SKU-001'}
              />
            )}
          </div>

          {/* Descripción — auto-rellena desde catálogo */}
          <div className="col-span-4">
            <label className="block text-xs text-gray-500 mb-1">
              Descripción *
              {item.nombre_producto && item.sku_producto && (
                <span className="ml-1 text-emerald-500 text-[10px]">✓ auto</span>
              )}
            </label>
            <input
              type="text"
              value={item.nombre_producto}
              onChange={e => updateItem(idx, 'nombre_producto', e.target.value)}
              className={`w-full bg-gray-800 border rounded px-2 py-1.5 text-sm focus:outline-none focus:border-${accentFocus}-500 ${
                item.nombre_producto ? 'border-gray-600' : 'border-gray-600'
              }`}
              placeholder={item.sku_producto ? 'Cargando…' : 'Auto-completado al elegir parte'}
            />
          </div>

          {/* Cantidad */}
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Cantidad *</label>
            <input
              type="text"
              value={item.cantidad_requerida}
              onChange={e => updateItem(idx, 'cantidad_requerida', e.target.value)}
              className={`w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-${accentFocus}-500`}
              placeholder="0"
            />
          </div>

          {/* Precio */}
          <div className="col-span-2">
            <label className="block text-xs text-gray-500 mb-1">Precio Unit.</label>
            <input
              type="text"
              value={item.precio_unitario}
              onChange={e => updateItem(idx, 'precio_unitario', e.target.value)}
              className={`w-full bg-gray-800 border border-gray-600 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-${accentFocus}-500`}
              placeholder="0.00"
            />
          </div>

          {/* Eliminar fila */}
          <div className="col-span-1 flex justify-center">
            {formItems.length > 1 && (
              <button onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-300 text-lg" title="Eliminar fila">🗑️</button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════
  // RENDER PRINCIPAL
  // ════════════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-4">
      {/* Mensajes */}
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

      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold">🛒 Órdenes de Compra</h2>
          <button onClick={() => setShowFiltros(!showFiltros)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors border ${
              showFiltros || hayFiltrosActivos
                ? 'bg-emerald-600/20 border-emerald-500/30 text-emerald-400'
                : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
            }`}>
            🔍 Filtros {hayFiltrosActivos && `(${ordenesFiltradas.length})`}
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchOrdenes}
            className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors">
            🔄 Refrescar
          </button>
          <button
            onClick={async () => {
              resetForm()
              await loadProveedores()
              setShowCreateModal(true)
            }}
            className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
            ➕ Nueva Orden
          </button>
        </div>
      </div>

      {/* ── Panel de Filtros ── */}
      {showFiltros && (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-400">🔍 Filtros</h3>
            {hayFiltrosActivos && (
              <button onClick={limpiarFiltros} className="text-xs text-red-400 hover:text-red-300">✕ Limpiar</button>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">📅 Fecha Desde</label>
              <input type="date" value={filtroFechaDesde} onChange={e => setFiltroFechaDesde(e.target.value)}
                className={selectCls('border-emerald')} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">📅 Fecha Hasta</label>
              <input type="date" value={filtroFechaHasta} onChange={e => setFiltroFechaHasta(e.target.value)}
                className={selectCls('border-emerald')} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">🏭 Proveedor</label>
              <select value={filtroProveedor} onChange={e => setFiltroProveedor(e.target.value)}
                className={selectCls('border-emerald')}>
                <option value="">Todos</option>
                {proveedoresUnicos.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">📋 Status</label>
              <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
                className={selectCls('border-emerald')}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">💰 Valor (rango)</label>
              <div className="flex gap-1">
                <input type="text" value={filtroValorMin} onChange={e => setFiltroValorMin(e.target.value)}
                  className="w-1/2 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm focus:border-emerald-500 focus:outline-none" placeholder="Min" />
                <input type="text" value={filtroValorMax} onChange={e => setFiltroValorMax(e.target.value)}
                  className="w-1/2 bg-gray-800 border border-gray-700 rounded-lg px-2 py-2 text-sm focus:border-emerald-500 focus:outline-none" placeholder="Max" />
              </div>
            </div>
          </div>
          <p className="text-xs text-gray-500">{ordenesFiltradas.length} de {ordenes.length} órdenes</p>
        </div>
      )}

      {/* ── Tabla ── */}
      {ordenesFiltradas.length === 0 && !loading ? (
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
          <p className="text-4xl mb-3">📦</p>
          <p className="text-gray-400">{hayFiltrosActivos ? 'No hay órdenes que coincidan' : 'No hay órdenes de compra'}</p>
        </div>
      ) : (
        <DataTable
          loading={loading}
          data={ordenesFiltradas}
          maxHeight="600px"
          columns={[
            { key: 'oc_id', header: 'OC ID', render: (oc) => <span className="font-mono font-medium text-emerald-400">{oc.oc_id}</span> },
            { key: 'proveedor', header: 'Proveedor', render: (oc) => (
              <div>
                {oc.nombre_proveedor}
                {isPendienteAprobacion(oc) && oc.origen === 'PRODUCCION' && (
                  <span className="ml-2 text-xs text-orange-400 italic">⚠️ Asignar proveedor</span>
                )}
              </div>
            )},
            { key: 'status', header: 'Status', render: (oc) => {
              const map: Record<string, any> = {
                'Pendiente de Firma': 'muted', 'Pendiente Aprobación': 'warning', 'Autorizada': 'info',
                'Parcial': 'warning', 'Completada': 'success', 'Rechazada': 'error', 'Cancelada': 'error',
              };
              return (
                <div className="flex flex-col gap-1 items-start">
                  <Badge variant={map[oc.status] || 'muted'}>{oc.status}</Badge>
                  {oc.status === 'Rechazada' && oc.motivo_rechazo && (
                    <span className="text-[10px] text-red-400 max-w-[150px] truncate" title={oc.motivo_rechazo}>
                      Motivo: {oc.motivo_rechazo}
                    </span>
                  )}
                </div>
              );
            }},
            { key: 'origen', header: 'Origen', render: (oc) =>
              oc.origen === 'PRODUCCION'
                ? <Badge variant="warning">🏭 Producción</Badge>
                : <Badge variant="success">💰 Compras</Badge>
            },
            { key: 'items', header: 'Items', render: (oc) => `${oc.items.length} items` },
            { key: 'valor', header: 'Valor Total', align: 'right', render: (oc) =>
              formatCurrency(oc.items.reduce((s: number, i: any) => s + i.cantidad_requerida * i.precio_unitario, 0))
            },
            { key: 'fecha', header: 'Fecha', render: (oc) => <span className="text-gray-400 text-xs">{formatDate(oc.fecha_creacion)}</span> },
            { key: 'creado_por', header: 'Creado por', render: (oc) => <span className="text-gray-400">{oc.creado_por || '—'}</span> },
            { key: 'acciones', header: 'Acciones', align: 'center', render: (oc) => (
              <div className="flex justify-center gap-1">
                <button onClick={() => handleVerDetalle(oc.oc_id)}
                  className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 px-2 py-1 rounded text-xs transition-colors" title="Ver detalle">👁️</button>
                
                {(oc.status === 'Pendiente de Firma' || oc.status === 'Rechazada') && !oc.firma_compras && (
                  <button onClick={() => handleFirmar(oc)}
                    className="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 px-2 py-1 rounded text-xs transition-colors" title="Firmar Orden (Enviar a Finanzas)">✍️</button>
                )}

                {isPendienteAprobacion(oc) && (
                  <button onClick={() => handleOpenEdit(oc)}
                    className="bg-orange-600/20 hover:bg-orange-600/40 text-orange-400 px-2 py-1 rounded text-xs transition-colors" title="Editar y Aprobar">✏️</button>
                )}
                
                {/* PDF solo visible si está Autorizada, Parcial o Completada */}
                {['Autorizada', 'Parcial', 'Completada'].includes(oc.status) && (
                  <button onClick={() => handleDescargarPdf(oc.oc_id)}
                    className="bg-purple-600/20 hover:bg-purple-600/40 text-purple-400 px-2 py-1 rounded text-xs transition-colors" title="Descargar PDF">📄</button>
                )}
                
                {canDelete(oc) && (
                  <button onClick={() => { setDeleteTarget(oc); setShowDeleteModal(true) }}
                    className="bg-red-600/20 hover:bg-red-600/40 text-red-400 px-2 py-1 rounded text-xs transition-colors" title="Eliminar">🗑️</button>
                )}
              </div>
            )},
          ]}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL: CREAR ORDEN
      ══════════════════════════════════════════════════════════════ */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">➕ Nueva Orden de Compra</h3>
              <button onClick={() => { setShowCreateModal(false); resetForm() }} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>

            <div className="p-6 space-y-4">
              {/* Dropdowns de proveedor */}
              {renderProveedorFields('emerald', false)}

              {/* Notas */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Notas (opcional)</label>
                <textarea value={formNotas} onChange={e => setFormNotas(e.target.value)} rows={2}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                  placeholder="Notas adicionales..." />
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-gray-300">Productos *</label>
                  <button onClick={addItem}
                    className="bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 px-3 py-1 rounded-lg text-xs transition-colors">
                    + Agregar producto
                  </button>
                </div>
                {!selectedProveedor && proveedores.length > 0 && (
                  <p className="text-xs text-yellow-500/80 mb-2">⚠️ Selecciona un proveedor para ver sus números de parte disponibles</p>
                )}
                <div className="space-y-3">
                  {formItems.map((item, idx) => renderItemRow(item, idx, 'emerald'))}
                </div>
              </div>

              {/* IVA */}
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-400">IVA (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={formIva}
                  onChange={e => setFormIva(Number(e.target.value))}
                  className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
              
            </div>

            <div className="p-6 border-t border-gray-800 flex justify-end gap-3">
              <button onClick={() => { setShowCreateModal(false); resetForm() }}
                className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors">
                Cancelar
              </button>
              <button onClick={handleCrear}
                className="bg-emerald-600 hover:bg-emerald-700 px-6 py-2 rounded-lg text-sm font-medium transition-colors">
                ✅ Crear Orden
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL: EDITAR Y APROBAR (Pendiente Aprobación)
      ══════════════════════════════════════════════════════════════ */}
      {showEditModal && editOC && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-orange-700/50 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-orange-400">✏️ Editar y Aprobar Orden</h3>
                <p className="text-xs text-gray-500 mt-1">
                  OC: <span className="text-emerald-400 font-mono">{editOC.oc_id}</span> — Generada desde 🏭 Producción
                </p>
              </div>
              <button onClick={() => { setShowEditModal(false); setEditOC(null); resetForm() }}
                className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>

            {/* Banner informativo */}
            <div className="mx-6 mt-4 bg-orange-900/20 border border-orange-700/30 rounded-lg p-3">
              <p className="text-xs text-orange-400">
                🏭 Esta orden fue generada automáticamente desde Pre-Expansión por stock insuficiente.
                Selecciona el proveedor real, ajusta cantidades/precios y aprueba para habilitar la recepción.
              </p>
              {editOC.notas && (
                <p className="text-xs text-gray-400 mt-2 border-t border-orange-700/20 pt-2">
                  <span className="text-gray-500">Notas del sistema:</span> {editOC.notas}
                </p>
              )}
            </div>

            <div className="p-6 space-y-4">
              {/* Dropdowns de proveedor — en edit NO reseteamos items al cambiar proveedor */}
              {renderProveedorFields('orange', true)}

              {/* Notas */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Notas</label>
                <textarea value={formNotas} onChange={e => setFormNotas(e.target.value)} rows={2}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-orange-500 focus:outline-none" />
              </div>

              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-semibold text-gray-300">Productos *</label>
                  <button onClick={addItem}
                    className="bg-orange-600/20 hover:bg-orange-600/40 text-orange-400 px-3 py-1 rounded-lg text-xs transition-colors">
                    + Agregar producto
                  </button>
                </div>
                {!selectedProveedor && proveedores.length > 0 && (
                  <p className="text-xs text-yellow-500/80 mb-2">⚠️ Selecciona un proveedor para ver sus números de parte disponibles</p>
                )}
                <div className="space-y-3">
                  {formItems.map((item, idx) => renderItemRow(item, idx, 'orange'))}
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-gray-800 flex justify-end gap-3">
              <button onClick={() => { setShowEditModal(false); setEditOC(null); resetForm() }}
                className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors">
                Cancelar
              </button>
              <button onClick={handleAprobar}
                className="bg-orange-600 hover:bg-orange-700 px-6 py-2 rounded-lg text-sm font-medium transition-colors">
                ✅ Aprobar Orden
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL: DETALLE
      ══════════════════════════════════════════════════════════════ */}
      {showDetalleModal && ordenDetalle && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-bold">📋 Detalle: <span className="text-emerald-400">{ordenDetalle.oc_id}</span></h3>
                {ordenDetalle.origen === 'PRODUCCION' && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-500/20 text-orange-400 border border-orange-500/30">🏭 Producción</span>
                )}
              </div>
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
              <div>
                <h4 className="text-sm font-semibold text-gray-400 mb-2">📦 Productos</h4>
                <div className="bg-gray-800/30 rounded-lg border border-gray-700 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-800">
                      <tr>
                        <th className="px-4 py-2 text-left text-gray-400 text-xs">SKU</th>
                        <th className="px-4 py-2 text-left text-gray-400 text-xs">Descripción</th>
                        <th className="px-4 py-2 text-right text-gray-400 text-xs">Requerida</th>
                        <th className="px-4 py-2 text-right text-gray-400 text-xs">Recibida</th>
                        <th className="px-4 py-2 text-right text-gray-400 text-xs">Precio Unit.</th>
                        <th className="px-4 py-2 text-right text-gray-400 text-xs">Progreso</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                      {ordenDetalle.items.map((item: any, idx: number) => {
                        const pct = item.cantidad_requerida > 0
                          ? Math.min(100, (item.cantidad_recibida / item.cantidad_requerida) * 100) : 0
                        const pctColor = pct >= 100 ? 'text-green-400' : pct > 0 ? 'text-yellow-400' : 'text-gray-500'
                        return (
                          <tr key={idx}>
                            <td className="px-4 py-2 font-mono text-emerald-400 whitespace-nowrap">{item.sku_producto}</td>
                            <td className="px-4 py-2">{item.nombre_producto}</td>
                            <td className="px-4 py-2 text-right">{item.cantidad_requerida}</td>
                            <td className="px-4 py-2 text-right">{item.cantidad_recibida}</td>
                            <td className="px-4 py-2 text-right whitespace-nowrap">{formatCurrency(item.precio_unitario)}</td>
                            <td className="px-4 py-2 text-right"><span className={`font-medium ${pctColor}`}>{pct.toFixed(0)}%</span></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              {ordenDetalle.recepciones?.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-400 mb-2">📥 Historial de Recepciones</h4>
                  <div className="space-y-2">
                    {ordenDetalle.recepciones.map((rec: any) => (
                      <div key={rec.recepcion_id} className="bg-gray-800/30 rounded-lg p-3 border border-gray-700 flex justify-between items-start">
                        <div>
                          <p className="text-sm font-mono text-blue-400">{rec.recepcion_id}</p>
                          <p className="text-xs text-gray-400">{rec.sku_producto} — Cantidad: {rec.cantidad_recibida} — {rec.recibido_por || 'N/A'}</p>
                          {rec.notas && <p className="text-xs text-gray-500 mt-1"><span className="text-gray-400">Nota:</span> {rec.notas}</p>}
                        </div>
                        <p className="text-xs text-gray-500 shrink-0 ml-4">{formatDate(rec.fecha_recepcion)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-800 flex justify-end">
              <button onClick={() => setShowDetalleModal(false)}
                className="bg-gray-700 hover:bg-gray-600 px-6 py-2 rounded-lg text-sm transition-colors">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL: CONFIRMAR ELIMINACIÓN
      ══════════════════════════════════════════════════════════════ */}
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
                {deleteTarget.origen === 'PRODUCCION' && (
                  <p className="text-xs text-orange-400 mt-1">🏭 Generada desde Producción</p>
                )}
              </div>
              <div className="bg-red-900/20 border border-red-700/30 rounded-lg p-3">
                <p className="text-xs text-red-400">⚠️ Esta acción no se puede deshacer.</p>
              </div>
            </div>
            <div className="p-6 border-t border-gray-800 flex justify-end gap-3">
              <button onClick={() => { setShowDeleteModal(false); setDeleteTarget(null) }}
                className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors">
                Cancelar
              </button>
              <button onClick={handleEliminarConfirm}
                className="bg-red-600 hover:bg-red-700 px-6 py-2 rounded-lg text-sm font-medium transition-colors">
                🗑️ Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}