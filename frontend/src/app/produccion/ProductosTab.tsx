'use client'

import { ProductoItem, ProductoCreate, ProductoUpdate, BomItem } from '@/types'
import { useEffect, useState, useMemo, useRef } from 'react'
import {
  getProductos,
  createProducto,
  updateProducto,
  deleteProducto,
  deleteProductosBatch,
  cambiarStatusProductos,
  actualizarPuntosInspeccion,
  actualizarBom,
  importarProductosExcel,
  importarBomExcel,
} from '@/lib/api'

type ModalInfo = {
  title: string
  message: string
  type: 'success' | 'error' | 'info'
} | null

type ConfirmModal = {
  title: string
  message: string
  onConfirm: () => void
} | null

const TIPOS_PRODUCTO = ['COMPONENTE', 'RESINA', 'PRODUCTO FINAL']
const CLASES_PRODUCTO = ['PRE EXPANSIÓN', 'INYECCIÓN', 'ASSY']
const UNIDADES_MEDIDA = ['PZA', 'KG', 'LT', 'MT', 'ROLLO', 'CAJA']
const PROVEEDORES = ['SOLARPOL (HYUNDAI)', 'LG', 'CHEONG WOON', 'PLASTIC MANAGEMENT', 'HAENG SUNG']
const ID_PROCESOS = ['ASSY', 'VENTA', 'CORTE']
const TIPOS_RESINA = ['EPS', 'EPP']

export default function ProductosTab() {
  const [productos, setProductos] = useState<ProductoItem[]>([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroClase, setFiltroClase] = useState('')

  // Formulario principal
  const [formData, setFormData] = useState({
    sku: '',
    modelo: '',
    tipo: '',
    clase_producto: '',
    unidad_de_medida: '',
    descripcion: '',
    cantidad_carrito: '',
    proveedor: '',
    cliente: '',
    cliente_id: '',
    linea_produccion: '',
    ubicacion: '',
  })
  const [editing, setEditing] = useState<string | null>(null)
  const [showInyeccion, setShowInyeccion] = useState(false)
  const [inyeccionData, setInyeccionData] = useState({
    id_proceso: '',
    tipo_resina: '',
    resina: '',
    densidad: '',
    peso: '',
    peso_seco: '',
    cav: '',
    ciclo: '',
  })

  // Selección múltiple
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set())

  // Modales
  const [modalInfo, setModalInfo] = useState<ModalInfo>(null)
  const [confirmModal, setConfirmModal] = useState<ConfirmModal>(null)
  const okButtonRef = useRef<HTMLButtonElement>(null)
  const confirmButtonRef = useRef<HTMLButtonElement>(null)

  // Importar
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bomFileInputRef = useRef<HTMLInputElement>(null)
  const [isImporting, setIsImporting] = useState(false)

  // BOM Modal
  const [bomModal, setBomModal] = useState<{
    sku: string
    bom: { sku_componente: string; cantidad: number }[]
  } | null>(null)
  const [newBomItem, setNewBomItem] = useState({ sku_componente: '', cantidad: 1 })

  // Inspección Modal
  const [inspeccionModal, setInspeccionModal] = useState<{
    sku: string
    tipo_control: string
    puntos: Record<string, any>[]
  } | null>(null)
  const [newPuntoInspeccion, setNewPuntoInspeccion] = useState({
    nombre: '',
    especificacion: '',
    metodo: '',
  })

  // Detalle Modal
  const [detalleModal, setDetalleModal] = useState<ProductoItem | null>(null)

  useEffect(() => {
    if (modalInfo && okButtonRef.current) okButtonRef.current.focus()
  }, [modalInfo])

  useEffect(() => {
    if (confirmModal && confirmButtonRef.current) confirmButtonRef.current.focus()
  }, [confirmModal])

  useEffect(() => {
    loadProductos()
  }, [])

  useEffect(() => {
    setShowInyeccion(formData.clase_producto === 'INYECCIÓN')
  }, [formData.clase_producto])

  const loadProductos = async () => {
    try {
      const data = await getProductos()
      setProductos(data)
    } catch {
      setModalInfo({
        title: 'Error de Conexión',
        message: 'No se pudieron cargar los productos.',
        type: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  // ── Opciones únicas para filtros ──
  const tiposUnicos = useMemo(
    () => [...new Set(productos.map((p) => p.tipo).filter(Boolean))].sort(),
    [productos]
  )
  const clasesUnicas = useMemo(
    () => [...new Set(productos.map((p) => p.clase_producto).filter(Boolean))].sort(),
    [productos]
  )

  // ── Filtrado ──
  const productosFiltrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    return productos.filter((item) => {
      const pasaBusqueda =
        !q ||
        (item.sku || '').toLowerCase().includes(q) ||
        (item.modelo || '').toLowerCase().includes(q) ||
        (item.descripcion || '').toLowerCase().includes(q) ||
        (item.cliente || '').toLowerCase().includes(q) ||
        (item.cliente_id || '').toLowerCase().includes(q)
      const pasaTipo = !filtroTipo || item.tipo === filtroTipo
      const pasaStatus = !filtroStatus || item.status === filtroStatus
      const pasaClase = !filtroClase || item.clase_producto === filtroClase
      return pasaBusqueda && pasaTipo && pasaStatus && pasaClase
    })
  }, [productos, busqueda, filtroTipo, filtroStatus, filtroClase])

  const hayFiltros = busqueda || filtroTipo || filtroStatus || filtroClase

  const limpiarFiltros = () => {
    setBusqueda('')
    setFiltroTipo('')
    setFiltroStatus('')
    setFiltroClase('')
  }

  // ── CRUD ──
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
        if (editing) {
            const updatePayload: ProductoUpdate = {
                modelo: formData.modelo,
                tipo: formData.tipo,
                clase_producto: formData.clase_producto,
                unidad_de_medida: formData.unidad_de_medida,
                descripcion: formData.descripcion,
                cantidad_carrito: parseInt(formData.cantidad_carrito) || 0,
                proveedor: formData.proveedor,
                cliente: formData.cliente,
                cliente_id: formData.cliente_id,
                linea_produccion: formData.linea_produccion,
                ubicacion: formData.ubicacion,
            }
        if (showInyeccion) {
            updatePayload.caracteristicas_inyeccion = {
            id_proceso: inyeccionData.id_proceso,
            tipo_resina: inyeccionData.tipo_resina,
            resina: inyeccionData.resina,
            densidad: parseFloat(inyeccionData.densidad) || 0,
            peso: parseFloat(inyeccionData.peso) || 0,
            peso_seco: parseFloat(inyeccionData.peso_seco) || 0,
            cav: parseInt(inyeccionData.cav) || 0,
            ciclo: parseFloat(inyeccionData.ciclo) || 0,
            }
        }
        await updateProducto(editing, updatePayload)
        setModalInfo({
            title: '¡Actualizado!',
            message: `El producto ${editing} fue actualizado.`,
            type: 'success',
        })
        setEditing(null)
        } else {
            const createPayload: ProductoCreate = {
                sku: formData.sku,
                modelo: formData.modelo,
                tipo: formData.tipo,
                clase_producto: formData.clase_producto,
                unidad_de_medida: formData.unidad_de_medida,
                descripcion: formData.descripcion,
                cantidad_carrito: parseInt(formData.cantidad_carrito) || 0,
                proveedor: formData.proveedor,
                cliente: formData.cliente,
                cliente_id: formData.cliente_id,
                linea_produccion: formData.linea_produccion,
                ubicacion: formData.ubicacion,
            }
        if (showInyeccion) {
            createPayload.caracteristicas_inyeccion = {
            id_proceso: inyeccionData.id_proceso,
            tipo_resina: inyeccionData.tipo_resina,
            resina: inyeccionData.resina,
            densidad: parseFloat(inyeccionData.densidad) || 0,
            peso: parseFloat(inyeccionData.peso) || 0,
            peso_seco: parseFloat(inyeccionData.peso_seco) || 0,
            cav: parseInt(inyeccionData.cav) || 0,
            ciclo: parseFloat(inyeccionData.ciclo) || 0,
            }
        }
        await createProducto(createPayload)
        setModalInfo({
            title: '¡Producto Creado!',
            message: `El producto ${formData.sku} fue creado. Controles de calidad asignados automáticamente según tipo.`,
            type: 'success',
        })
        }
        resetForm()
        loadProductos()
    } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : 'Ocurrió un error inesperado.'
        setModalInfo({ title: 'Error al Guardar', message: msg, type: 'error' })
    }
    }

  const handleEdit = (item: ProductoItem) => {
    setFormData({
      sku: item.sku,
      modelo: item.modelo || '',
      tipo: item.tipo,
      clase_producto: item.clase_producto,
      unidad_de_medida: item.unidad_de_medida,
      descripcion: item.descripcion,
      cantidad_carrito: String(item.cantidad_carrito || ''),
      proveedor: item.proveedor,
      cliente: item.cliente,
      cliente_id: item.cliente_id,
      linea_produccion: item.linea_produccion,
      ubicacion: item.ubicacion,
    })
    if (item.caracteristicas_inyeccion && Object.keys(item.caracteristicas_inyeccion).length > 0) {
      setInyeccionData({
        id_proceso: item.caracteristicas_inyeccion.id_proceso || '',
        tipo_resina: item.caracteristicas_inyeccion.tipo_resina || '',
        resina: item.caracteristicas_inyeccion.resina || '',
        densidad: String(item.caracteristicas_inyeccion.densidad ?? ''),
        peso: String(item.caracteristicas_inyeccion.peso ?? ''),
        peso_seco: String(item.caracteristicas_inyeccion.peso_seco ?? ''),
        cav: String(item.caracteristicas_inyeccion.cav ?? ''),
        ciclo: String(item.caracteristicas_inyeccion.ciclo ?? ''),
      })
    }
    setEditing(item.sku)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = (sku: string) => {
    setConfirmModal({
      title: 'Confirmar Eliminación',
      message: `¿Estás seguro de eliminar el producto "${sku}"?`,
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          await deleteProducto(sku)
          loadProductos()
          setModalInfo({
            title: '¡Eliminado!',
            message: `El producto "${sku}" fue eliminado.`,
            type: 'success',
          })
        } catch (error: any) {
          setModalInfo({
            title: 'Error al Eliminar',
            message: error.message || 'No se pudo eliminar.',
            type: 'error',
          })
        }
      },
    })
  }

  const resetForm = () => {
    setEditing(null)
    setFormData({
      sku: '',
      modelo: '',
      tipo: '',
      clase_producto: '',
      unidad_de_medida: '',
      descripcion: '',
      cantidad_carrito: '',
      proveedor: '',
      cliente: '',
      cliente_id: '',
      linea_produccion: '',
      ubicacion: '',
    })
    setInyeccionData({
      id_proceso: '',
      tipo_resina: '',
      resina: '',
      densidad: '',
      peso: '',
      peso_seco: '',
      cav: '',
      ciclo: '',
    })
  }

  // ── Selección múltiple ──
  const toggleSelect = (sku: string) => {
    setSelectedSkus((prev) => {
      const next = new Set(prev)
      if (next.has(sku)) next.delete(sku)
      else next.add(sku)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedSkus.size === productosFiltrados.length) {
      setSelectedSkus(new Set())
    } else {
      setSelectedSkus(new Set(productosFiltrados.map((p) => p.sku)))
    }
  }

  const handleBatchDelete = () => {
    if (selectedSkus.size === 0) return
    setConfirmModal({
      title: 'Eliminar Seleccionados',
      message: `¿Eliminar ${selectedSkus.size} producto(s)? Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          await deleteProductosBatch(Array.from(selectedSkus))
          setSelectedSkus(new Set())
          loadProductos()
          setModalInfo({
            title: '¡Eliminados!',
            message: `${selectedSkus.size} producto(s) eliminado(s).`,
            type: 'success',
          })
        } catch (error: any) {
          setModalInfo({
            title: 'Error',
            message: error.message,
            type: 'error',
          })
        }
      },
    })
  }

  const handleBatchStatus = async (status: string) => {
    if (selectedSkus.size === 0) return
    try {
      await cambiarStatusProductos(Array.from(selectedSkus), status)
      setSelectedSkus(new Set())
      loadProductos()
      setModalInfo({
        title: '¡Actualizado!',
        message: `${selectedSkus.size} producto(s) cambiado(s) a "${status}".`,
        type: 'success',
      })
    } catch (error: any) {
      setModalInfo({ title: 'Error', message: error.message, type: 'error' })
    }
  }

  // ── Importar ──
  const handleImportProductos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsImporting(true)
    try {
      const result = await importarProductosExcel(file)
      setModalInfo({
        title: '¡Importación Exitosa!',
        message: `Se importaron/actualizaron ${result.count} productos.`,
        type: 'success',
      })
      loadProductos()
    } catch (error: any) {
      setModalInfo({
        title: 'Error al Importar',
        message: error.message,
        type: 'error',
      })
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleImportBom = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsImporting(true)
    try {
      const result = await importarBomExcel(file)
      setModalInfo({
        title: '¡BOM Importado!',
        message: `BOM actualizado para ${result.count} producto(s).`,
        type: 'success',
      })
      loadProductos()
    } catch (error: any) {
      setModalInfo({
        title: 'Error al Importar BOM',
        message: error.message,
        type: 'error',
      })
    } finally {
      setIsImporting(false)
      if (bomFileInputRef.current) bomFileInputRef.current.value = ''
    }
  }

  // ── BOM Modal ──
  const openBomModal = (item: ProductoItem) => {
    setBomModal({
      sku: item.sku,
      bom: [...(item.bom || [])],
    })
    setNewBomItem({ sku_componente: '', cantidad: 1 })
  }

  const addBomItem = () => {
    if (!bomModal || !newBomItem.sku_componente.trim()) return
    const exists = bomModal.bom.some(
      (b) => b.sku_componente === newBomItem.sku_componente.toUpperCase()
    )
    if (exists) {
      setModalInfo({
        title: 'Duplicado',
        message: 'Ese componente ya está en el BOM.',
        type: 'error',
      })
      return
    }
    setBomModal({
      ...bomModal,
      bom: [
        ...bomModal.bom,
        {
          sku_componente: newBomItem.sku_componente.trim().toUpperCase(),
          cantidad: newBomItem.cantidad,
        },
      ],
    })
    setNewBomItem({ sku_componente: '', cantidad: 1 })
  }

  const removeBomItem = (index: number) => {
    if (!bomModal) return
    const updated = bomModal.bom.filter((_, i) => i !== index)
    setBomModal({ ...bomModal, bom: updated })
  }

  const saveBom = async () => {
    if (!bomModal) return
    try {
      await actualizarBom(bomModal.sku, bomModal.bom)
      setBomModal(null)
      loadProductos()
      setModalInfo({
        title: '¡BOM Guardado!',
        message: `BOM actualizado para ${bomModal.sku}.`,
        type: 'success',
      })
    } catch (error: any) {
      setModalInfo({ title: 'Error', message: error.message, type: 'error' })
    }
  }

  // ── Inspección Modal ──
  const openInspeccionModal = (item: ProductoItem, tipo: string) => {
    const campo = `puntos_inspeccion_${tipo.toLowerCase()}` as keyof ProductoItem
    const puntos = (item[campo] as Record<string, any>[]) || []
    setInspeccionModal({
      sku: item.sku,
      tipo_control: tipo,
      puntos: [...puntos],
    })
    setNewPuntoInspeccion({ nombre: '', especificacion: '', metodo: '' })
  }

  const addPuntoInspeccion = () => {
    if (!inspeccionModal || !newPuntoInspeccion.nombre.trim()) return
    setInspeccionModal({
      ...inspeccionModal,
      puntos: [...inspeccionModal.puntos, { ...newPuntoInspeccion }],
    })
    setNewPuntoInspeccion({ nombre: '', especificacion: '', metodo: '' })
  }

  const removePuntoInspeccion = (index: number) => {
    if (!inspeccionModal) return
    const updated = inspeccionModal.puntos.filter((_, i) => i !== index)
    setInspeccionModal({ ...inspeccionModal, puntos: updated })
  }

  const saveInspeccion = async () => {
    if (!inspeccionModal) return
    try {
      await actualizarPuntosInspeccion(
        inspeccionModal.sku,
        inspeccionModal.tipo_control,
        inspeccionModal.puntos
      )
      setInspeccionModal(null)
      loadProductos()
      setModalInfo({
        title: '¡Puntos Guardados!',
        message: `Puntos de ${inspeccionModal.tipo_control.toUpperCase()} actualizados para ${inspeccionModal.sku}.`,
        type: 'success',
      })
    } catch (error: any) {
      setModalInfo({ title: 'Error', message: error.message, type: 'error' })
    }
  }

  // ── Badges de controles ──
  const controlBadge = (control: string) => {
    const colors: Record<string, string> = {
      IQC: 'bg-orange-500/20 text-orange-800',
      LQC: 'bg-blue-500/20 text-blue-300',
      OQC: 'bg-green-500/20 text-green-400',
    }
    return (
      <span
        key={control}
        className={`px-2 py-0.5 rounded-full text-xs font-bold ${colors[control] || 'bg-gray-800 text-gray-800'}`}
      >
        {control}
      </span>
    )
  }

  const statusBadge = (status: string) => {
    const isActive = status === 'Activo'
    return (
      <span
        className={`px-2.5 py-1 rounded-full text-xs font-bold ${
          isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-300'
        }`}
      >
        {status}
      </span>
    )
  }

  if (loading)
    return (
      <div className="p-8 text-center text-xl font-semibold text-gray-400">
        Cargando productos...
      </div>
    )

  return (
    <div className="relative">
      {/* ════════════════ MODAL NOTIFICACIÓN ════════════════ */}
      {modalInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div
              className={`px-6 py-4 ${
                modalInfo.type === 'success'
                  ? 'bg-green-600'
                  : modalInfo.type === 'error'
                  ? 'bg-red-600'
                  : 'bg-blue-600'
              }`}
            >
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                {modalInfo.type === 'success' && '✅ '}
                {modalInfo.type === 'error' && '❌ '}
                {modalInfo.type === 'info' && 'ℹ️ '}
                {modalInfo.title}
              </h3>
            </div>
            <div className="p-6">
              <p className="text-gray-300 text-base mb-6">{modalInfo.message}</p>
              <div className="flex justify-end">
                <button
                  ref={okButtonRef}
                  onClick={() => setModalInfo(null)}
                  className={`px-6 py-2.5 rounded-lg font-bold text-white shadow-md transition ${
                    modalInfo.type === 'success'
                      ? 'bg-green-600 hover:bg-green-700'
                      : modalInfo.type === 'error'
                      ? 'bg-red-600 hover:bg-red-700'
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  Aceptar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════ MODAL CONFIRMAR ════════════════ */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-red-600 px-6 py-4">
              <h3 className="text-lg font-bold text-white">⚠️ {confirmModal.title}</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-300 text-base mb-6">{confirmModal.message}</p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="px-5 py-2.5 rounded-lg font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 transition"
                >
                  Cancelar
                </button>
                <button
                  ref={confirmButtonRef}
                  onClick={confirmModal.onConfirm}
                  className="px-5 py-2.5 rounded-lg font-bold text-white bg-red-600 hover:bg-red-700 shadow-md transition"
                >
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════ MODAL BOM ════════════════ */}
      {bomModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-indigo-600 px-6 py-4">
              <h3 className="text-lg font-bold text-white">
                📋 BOM - {bomModal.sku}
              </h3>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {/* Lista actual */}
              {bomModal.bom.length > 0 ? (
                <table className="w-full text-sm mb-4">
                  <thead className="bg-gray-800">
                    <tr>
                      <th className="p-2 text-left">No. de Parte Componente</th>
                      <th className="p-2 text-center">Cantidad</th>
                      <th className="p-2 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bomModal.bom.map((item, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-2 font-mono">{item.sku_componente}</td>
                        <td className="p-2 text-center">{item.cantidad}</td>
                        <td className="p-2 text-center">
                          <button
                            onClick={() => removeBomItem(idx)}
                            className="text-red-400 hover:text-red-300"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-gray-400 text-center mb-4">No hay componentes en el BOM.</p>
              )}

              {/* Agregar nuevo */}
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-gray-400 mb-1">
                    No. de Parte Componente
                  </label>
                  <input
                    type="text"
                    value={newBomItem.sku_componente}
                    onChange={(e) =>
                      setNewBomItem({ ...newBomItem, sku_componente: e.target.value })
                    }
                    className="w-full border border-gray-600 p-2 rounded text-sm focus:ring-2 focus:ring-indigo-200 focus:outline-none"
                    placeholder="Ej: COMP-001"
                  />
                </div>
                <div className="w-24">
                  <label className="block text-xs font-semibold text-gray-400 mb-1">
                    Cantidad
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={newBomItem.cantidad}
                    onChange={(e) =>
                      setNewBomItem({
                        ...newBomItem,
                        cantidad: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full border border-gray-600 p-2 rounded text-sm focus:ring-2 focus:ring-indigo-200 focus:outline-none"
                  />
                </div>
                <button
                  onClick={addBomItem}
                  className="bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700 transition text-sm font-medium"
                >
                  ➕
                </button>
              </div>
            </div>
            <div className="border-t px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => setBomModal(null)}
                className="px-5 py-2.5 rounded-lg font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 transition"
              >
                Cancelar
              </button>
              <button
                onClick={saveBom}
                className="px-5 py-2.5 rounded-lg font-medium text-white bg-indigo-600 hover:bg-indigo-700 shadow-md transition"
              >
                💾 Guardar BOM
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════ MODAL INSPECCIÓN ════════════════ */}
      {inspeccionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-teal-600 px-6 py-4">
              <h3 className="text-lg font-bold text-white">
                🔍 Puntos de Inspección {inspeccionModal.tipo_control.toUpperCase()} -{' '}
                {inspeccionModal.sku}
              </h3>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {inspeccionModal.puntos.length > 0 ? (
                <table className="w-full text-sm mb-4">
                  <thead className="bg-gray-800">
                    <tr>
                      <th className="p-2 text-left">Nombre</th>
                      <th className="p-2 text-left">Especificación</th>
                      <th className="p-2 text-left">Método</th>
                      <th className="p-2 text-center">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inspeccionModal.puntos.map((punto, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="p-2">{punto.nombre}</td>
                        <td className="p-2 text-gray-400">{punto.especificacion}</td>
                        <td className="p-2 text-gray-400">{punto.metodo}</td>
                        <td className="p-2 text-center">
                          <button
                            onClick={() => removePuntoInspeccion(idx)}
                            className="text-red-400 hover:text-red-300"
                          >
                            🗑️
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-gray-400 text-center mb-4">
                  No hay puntos de inspección configurados.
                </p>
              )}

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-sm font-semibold text-gray-300 mb-1">Punto *</label>
                  <input
                    type="text"
                    value={newPuntoInspeccion.nombre}
                    onChange={(e) => setNewPuntoInspeccion({ ...newPuntoInspeccion, nombre: e.target.value })}
                    className="w-full border border-gray-600 p-2 rounded focus:ring-2 focus:ring-blue-500/40 focus:outline-none"
                    required
                    placeholder="Ej: Dimensional"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-400 mb-1">
                    Especificación
                  </label>
                  <input
                    type="text"
                    value={newPuntoInspeccion.especificacion}
                    onChange={(e) =>
                      setNewPuntoInspeccion({
                        ...newPuntoInspeccion,
                        especificacion: e.target.value,
                      })
                    }
                    className="w-full border border-gray-600 p-2 rounded text-sm focus:ring-2 focus:ring-teal-200 focus:outline-none"
                    placeholder="10mm ± 0.5"
                  />
                </div>
                <div className="flex items-end gap-1">
                  <div className="flex-1">
                    <label className="block text-xs font-semibold text-gray-400 mb-1">
                      Método
                    </label>
                    <input
                      type="text"
                      value={newPuntoInspeccion.metodo}
                      onChange={(e) =>
                        setNewPuntoInspeccion({ ...newPuntoInspeccion, metodo: e.target.value })
                      }
                      className="w-full border border-gray-600 p-2 rounded text-sm focus:ring-2 focus:ring-teal-200 focus:outline-none"
                      placeholder="Calibrador"
                    />
                  </div>
                  <button
                    onClick={addPuntoInspeccion}
                    className="bg-teal-600 text-white px-3 py-2 rounded hover:bg-teal-700 transition text-sm font-medium"
                  >
                    ➕
                  </button>
                </div>
              </div>
            </div>
            <div className="border-t px-6 py-4 flex justify-end gap-3">
              <button
                onClick={() => setInspeccionModal(null)}
                className="px-5 py-2.5 rounded-lg font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 transition"
              >
                Cancelar
              </button>
              <button
                onClick={saveInspeccion}
                className="px-5 py-2.5 rounded-lg font-medium text-white bg-teal-600 hover:bg-teal-700 shadow-md transition"
              >
                💾 Guardar Puntos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════ MODAL DETALLE ════════════════ */}
      {detalleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col">
            <div className="bg-slate-700 px-6 py-4 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white">
                📦 Detalle: {detalleModal.sku}
              </h3>
              <button
                onClick={() => setDetalleModal(null)}
                className="text-white hover:text-gray-300 text-xl"
              >
                ✕
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-semibold text-gray-400">No. de Parte:</span>
                  <p className="font-mono">{detalleModal.sku}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-400">Modelo:</span>
                  <p>{detalleModal.modelo || '—'}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-400">Descripción:</span>
                  <p>{detalleModal.descripcion}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-400">Tipo:</span>
                  <p>{detalleModal.tipo}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-400">Clase:</span>
                  <p>{detalleModal.clase_producto}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-400">Status:</span>
                  <p>{statusBadge(detalleModal.status)}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-400">Unidad:</span>
                  <p>{detalleModal.unidad_de_medida || '—'}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-400">Cliente:</span>
                  <p>{detalleModal.cliente || '—'}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-400">Cliente ID:</span>
                  <p>{detalleModal.cliente_id || '—'}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-400">Proveedor:</span>
                  <p>{detalleModal.proveedor || '—'}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-400">Línea Producción:</span>
                  <p>{detalleModal.linea_produccion || '—'}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-400">Ubicación:</span>
                  <p>{detalleModal.ubicacion || '—'}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-400">Cantidad/Carrito:</span>
                  <p>{detalleModal.cantidad_carrito}</p>
                </div>
                <div>
                  <span className="font-semibold text-gray-400">Controles:</span>
                  <div className="flex gap-1 mt-1">
                    {(detalleModal.controles_calidad || []).map(controlBadge)}
                    {(!detalleModal.controles_calidad ||
                      detalleModal.controles_calidad.length === 0) && (
                      <span className="text-gray-400">Ninguno</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Características de inyección */}
              {detalleModal.caracteristicas_inyeccion &&
                Object.keys(detalleModal.caracteristicas_inyeccion).length > 0 && (
                  <div className="mt-4 p-3 bg-blue-500/10 rounded-lg">
                    <h4 className="font-semibold text-blue-300 text-sm mb-2">
                      🏭 Características de Inyección
                    </h4>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {Object.entries(detalleModal.caracteristicas_inyeccion).map(([k, v]) => (
                        <div key={k}>
                          <span className="font-semibold text-gray-400">
                            {k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}:
                          </span>{' '}
                          {String(v)}
                          {(k === 'peso' || k === 'peso_seco') && ' Kg'}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* BOM */}
              {detalleModal.bom && detalleModal.bom.length > 0 && (
                <div className="mt-4 p-3 bg-indigo-50 rounded-lg">
                  <h4 className="font-semibold text-indigo-800 text-sm mb-2">
                    📋 BOM ({detalleModal.bom.length} componentes)
                  </h4>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    {detalleModal.bom.map((item: BomItem, idx: number) => (
                    <div key={idx}>
                        <span className="font-mono">{item.sku_componente}</span> × {item.cantidad}
                    </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════════════ FORMULARIO ════════════════ */}
      <form
        onSubmit={handleSubmit}
        className="bg-gray-900 p-6 rounded-lg shadow-sm border border-gray-700 mb-6"
      >
        <h2 className="text-lg font-bold text-gray-300 mb-4 pb-2 border-b">
          {editing ? `✏️ Editar Producto: ${editing}` : '➕ Nuevo Producto'}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">No. de Parte *</label>
            <input
              type="text"
              value={formData.sku}
              onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
              className="w-full border border-gray-600 p-2 rounded focus:ring-2 focus:ring-blue-500/40 focus:outline-none"
              required
              disabled={!!editing}
              placeholder="Ej: PROD-001"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">Modelo *</label>
            <input
              type="text"
              value={formData.modelo}
              onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
              className="w-full border border-gray-600 p-2 rounded focus:ring-2 focus:ring-blue-500/40 focus:outline-none"
              required
              placeholder="Modelo del producto"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">Tipo *</label>
            <select
              value={formData.tipo}
              onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
              className="w-full border border-gray-600 p-2 rounded focus:ring-2 focus:ring-blue-500/40 focus:outline-none"
              required
            >
              <option value="">-- Seleccionar --</option>
              {TIPOS_PRODUCTO.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-1">
              {(() => {
                const t = formData.tipo
                const c = formData.clase_producto
                const p = inyeccionData.id_proceso
                if (t === 'COMPONENTE' && c === 'INYECCIÓN' && (p === 'ASSY' || p === 'CORTE')) {
                  return '→ Se asignará control LQC'
                }
                if (t === 'COMPONENTE' && c === 'INYECCIÓN' && p === 'VENTA') {
                  return '→ Se asignará control OQC'
                }
                if (t === 'PRODUCTO FINAL') {
                  return '→ Se asignará control OQC'
                }
                if (t === 'COMPONENTE' || t === 'RESINA') {
                  return '→ Se asignará control IQC'
                }
                return ''
              })()}
            </p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">Clase</label>
            <select
              value={formData.clase_producto}
              onChange={(e) => setFormData({ ...formData, clase_producto: e.target.value })}
              className="w-full border border-gray-600 p-2 rounded focus:ring-2 focus:ring-blue-500/40 focus:outline-none"
            >
              <option value="">-- Seleccionar --</option>
              {CLASES_PRODUCTO.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">
              Unidad de Medida
            </label>
            <select
              value={formData.unidad_de_medida}
              onChange={(e) => setFormData({ ...formData, unidad_de_medida: e.target.value })}
              className="w-full border border-gray-600 p-2 rounded focus:ring-2 focus:ring-blue-500/40 focus:outline-none"
            >
              <option value="">-- Seleccionar --</option>
              {UNIDADES_MEDIDA.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">Cantidad por Carrito</label>
            <input
                type="text"
                inputMode="numeric"
                value={formData.cantidad_carrito}
                onChange={(e) => setFormData({ ...formData, cantidad_carrito: e.target.value })}
                className="w-full border border-gray-600 p-2 rounded focus:ring-2 focus:ring-blue-500/40 focus:outline-none"
                placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">Proveedor</label>
            <select
                value={formData.proveedor}
                onChange={(e) => setFormData({ ...formData, proveedor: e.target.value })}
                className="w-full border border-gray-600 p-2 rounded focus:ring-2 focus:ring-blue-500/40 focus:outline-none"
            >
                <option value="">-- Seleccionar --</option>
                {PROVEEDORES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">Cliente</label>
            <input
              type="text"
              value={formData.cliente}
              onChange={(e) => setFormData({ ...formData, cliente: e.target.value })}
              className="w-full border border-gray-600 p-2 rounded focus:ring-2 focus:ring-blue-500/40 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">Cliente ID</label>
            <input
              type="text"
              value={formData.cliente_id}
              onChange={(e) => setFormData({ ...formData, cliente_id: e.target.value })}
              className="w-full border border-gray-600 p-2 rounded focus:ring-2 focus:ring-blue-500/40 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">
              Línea Producción
            </label>
            <input
              type="text"
              value={formData.linea_produccion}
              onChange={(e) => setFormData({ ...formData, linea_produccion: e.target.value })}
              className="w-full border border-gray-600 p-2 rounded focus:ring-2 focus:ring-blue-500/40 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">Ubicación</label>
            <input
              type="text"
              value={formData.ubicacion}
              onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })}
              className="w-full border border-gray-600 p-2 rounded focus:ring-2 focus:ring-blue-500/40 focus:outline-none"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-sm font-semibold text-gray-300 mb-1">Descripción</label>
            <input
              type="text"
              value={formData.descripcion}
              onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
              className="w-full border border-gray-600 p-2 rounded focus:ring-2 focus:ring-blue-500/40 focus:outline-none"
              placeholder="Descripción del producto..."
            />
          </div>
        </div>

        {/* Características de Inyección */}
        {showInyeccion && (
          <div className="mt-4 p-4 bg-blue-500/10 rounded-lg border border-blue-200">
            <h3 className="text-sm font-bold text-blue-300 mb-3">
              🏭 Características de Inyección
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">ID Proceso</label>
                <select
                    value={inyeccionData.id_proceso}
                    onChange={(e) => setInyeccionData({ ...inyeccionData, id_proceso: e.target.value })}
                    className="w-full border border-gray-600 p-1.5 rounded text-sm focus:ring-2 focus:ring-blue-500/40 focus:outline-none"
                >
                    <option value="">-- Seleccionar --</option>
                    {ID_PROCESOS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Tipo Resina</label>
                <select
                    value={inyeccionData.tipo_resina}
                    onChange={(e) => setInyeccionData({ ...inyeccionData, tipo_resina: e.target.value })}
                    className="w-full border border-gray-600 p-1.5 rounded text-sm focus:ring-2 focus:ring-blue-500/40 focus:outline-none"
                >
                    <option value="">-- Seleccionar --</option>
                    {TIPOS_RESINA.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Resina</label>
                <input
                  type="text"
                  value={inyeccionData.resina}
                  onChange={(e) =>
                    setInyeccionData({ ...inyeccionData, resina: e.target.value })
                  }
                  className="w-full border border-gray-600 p-1.5 rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Densidad</label>
                <input
                    type="text"
                    inputMode="decimal"
                    value={inyeccionData.densidad}
                    onChange={(e) => setInyeccionData({ ...inyeccionData, densidad: e.target.value })}
                    className="w-full border border-gray-600 p-1.5 rounded text-sm"
                    placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Peso</label>
                <input
                    type="text"
                    inputMode="decimal"
                    value={inyeccionData.peso}
                    onChange={(e) => setInyeccionData({ ...inyeccionData, peso: e.target.value })}
                    className="w-full border border-gray-600 p-1.5 rounded text-sm"
                    placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Peso Seco</label>
                <input
                    type="text"
                    inputMode="decimal"
                    value={inyeccionData.peso_seco}
                    onChange={(e) => setInyeccionData({ ...inyeccionData, peso_seco: e.target.value })}
                    className="w-full border border-gray-600 p-1.5 rounded text-sm"
                    placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Cavidades</label>
                <input
                    type="text"
                    inputMode="numeric"
                    value={inyeccionData.cav}
                    onChange={(e) => setInyeccionData({ ...inyeccionData, cav: e.target.value })}
                    className="w-full border border-gray-600 p-1.5 rounded text-sm"
                    placeholder="0"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Ciclo (seg)</label>
                <input
                    type="text"
                    inputMode="decimal"
                    value={inyeccionData.ciclo}
                    onChange={(e) => setInyeccionData({ ...inyeccionData, ciclo: e.target.value })}
                    className="w-full border border-gray-600 p-1.5 rounded text-sm"
                    placeholder="0.00"
                />
              </div>
            </div>
          </div>
        )}

        {/* Botones */}
        <div className="mt-5 flex flex-wrap gap-3 border-t pt-4">
          <button
            type="submit"
            className="bg-blue-600 text-white px-5 py-2.5 rounded font-medium hover:bg-blue-700 transition shadow-sm"
          >
            {editing ? '💾 Actualizar Producto' : '➕ Crear Producto'}
          </button>
          {!editing && (
            <>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImportProductos}
                accept=".xlsx,.xls"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-400 ${
                  isImporting ? 'bg-gray-400 cursor-not-allowed text-white' : 'bg-green-600 hover:bg-green-700 active:scale-95 text-white'
                }`}
              >
                {isImporting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    Importando...
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6M4 20h16a1 1 0 001-1V5 a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"/>
                    </svg>
                    Importar Productos
                  </>
                )}
              </button>
              <input
                type="file"
                ref={bomFileInputRef}
                onChange={handleImportBom}
                accept=".xlsx,.xls"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => bomFileInputRef.current?.click()}
                disabled={isImporting}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-400 ${
                  isImporting ? 'bg-gray-400 cursor-not-allowed text-white' : 'bg-green-600 hover:bg-green-700 active:scale-95 text-white'
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6M4 20h16a1 1 0 001-1V5 a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"/>
                </svg>
                Importar BOM
              </button>
            </>
          )}
          {editing && (
            <button
              type="button"
              onClick={resetForm}
              className="bg-gray-500 text-white px-5 py-2.5 rounded font-medium hover:bg-gray-600 transition shadow-sm ml-auto"
            >
              ❌ Cancelar Edición
            </button>
          )}
        </div>
      </form>

      {/* ════════════════ BARRA DE FILTROS ════════════════ */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar SKU, nombre, descripción, cliente..."
          className="flex-1 min-w-[200px] border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 placeholder:text-gray-400"
        />
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          className="border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 bg-gray-900 text-gray-300"
        >
          <option value="">Todos los Tipos</option>
          {tiposUnicos.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={filtroClase}
          onChange={(e) => setFiltroClase(e.target.value)}
          className="border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 bg-gray-900 text-gray-300"
        >
          <option value="">Todas las Clases</option>
          {clasesUnicas.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="border border-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 bg-gray-900 text-gray-300"
        >
          <option value="">Todos los Status</option>
          <option value="Activo">Activo</option>
          <option value="Inactivo">Inactivo</option>
        </select>
        <div className="flex items-center gap-2 ml-auto">
          {hayFiltros && (
            <button
              onClick={limpiarFiltros}
              className="text-xs text-gray-400 hover:text-red-400 underline underline-offset-2 transition-colors"
            >
              Limpiar filtros
            </button>
          )}
          <span className="bg-gray-800 text-gray-400 text-xs font-semibold px-3 py-2 rounded-lg whitespace-nowrap border border-gray-700">
            {productosFiltrados.length === productos.length
              ? `${productos.length} producto${productos.length !== 1 ? 's' : ''}`
              : `${productosFiltrados.length} de ${productos.length} productos`}
          </span>
        </div>
      </div>

      {/* ════════════════ ACCIONES BATCH ════════════════ */}
      {selectedSkus.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-blue-500/10 rounded-lg border border-blue-200">
          <span className="text-sm font-semibold text-blue-300">
            {selectedSkus.size} seleccionado(s)
          </span>
          <button
            onClick={() => handleBatchStatus('Activo')}
            className="px-3 py-1.5 rounded text-xs font-medium text-white bg-green-600 hover:bg-green-700 transition"
          >
            ✅ Activar
          </button>
          <button
            onClick={() => handleBatchStatus('Inactivo')}
            className="px-3 py-1.5 rounded text-xs font-medium text-white bg-yellow-600 hover:bg-yellow-700 transition"
          >
            ⏸️ Desactivar
          </button>
          <button
            onClick={handleBatchDelete}
            className="px-3 py-1.5 rounded text-xs font-medium text-white bg-red-600 hover:bg-red-700 transition"
          >
            🗑️ Eliminar
          </button>
          <button
            onClick={() => setSelectedSkus(new Set())}
            className="px-3 py-1.5 rounded text-xs font-medium text-gray-300 bg-gray-700 hover:bg-gray-300 transition ml-auto"
          >
            Deseleccionar
          </button>
        </div>
      )}

      {/* ════════════════ TABLA ════════════════ */}
      <div className="bg-gray-900 rounded-lg shadow-sm border border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 border-b border-gray-700">
            <tr>
              <th className="p-3 text-center w-10">
                <input
                  type="checkbox"
                  checked={
                    productosFiltrados.length > 0 &&
                    selectedSkus.size === productosFiltrados.length
                  }
                  onChange={toggleSelectAll}
                  className="rounded"
                />
              </th>
              <th className="p-3 text-left font-semibold text-gray-200">No. de Parte</th>
              <th className="p-3 text-left font-semibold text-gray-200">Modelo</th>
              <th className="p-3 text-center font-semibold text-gray-200">Tipo</th>
              <th className="p-3 text-center font-semibold text-gray-200">Clase</th>
              <th className="p-3 text-center font-semibold text-gray-200">Línea Producción</th>
              <th className="p-3 text-center font-semibold text-gray-200">Status</th>
              <th className="p-3 text-center font-semibold text-gray-200">Controles</th>
              <th className="p-3 text-center font-semibold text-gray-200">BOM</th>
              <th className="p-3 text-center font-semibold text-gray-200">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {productosFiltrados.map((item) => (
              <tr
                key={item.sku}
                className={`border-b last:border-b-0 hover:bg-blue-500/10/30 transition ${
                  selectedSkus.has(item.sku) ? 'bg-blue-500/10' : ''
                }`}
              >
                <td className="p-3 text-center">
                  <input
                    type="checkbox"
                    checked={selectedSkus.has(item.sku)}
                    onChange={() => toggleSelect(item.sku)}
                    className="rounded"
                  />
                </td>
                <td className="p-3 font-mono font-medium text-white">{item.sku}</td>
                <td className="p-3 text-gray-300">{item.modelo}</td>
                <td className="p-3 text-center">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      item.tipo === 'PRODUCTO FINAL'
                        ? 'bg-emerald-500/20 text-emerald-800'
                        : item.tipo === 'COMPONENTE'
                        ? 'bg-sky-100 text-sky-800'
                        : item.tipo === 'RESINA'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-gray-800 text-gray-800'
                    }`}
                  >
                    {item.tipo}
                  </span>
                </td>
                <td className="p-3 text-center text-xs text-gray-400">
                  {item.clase_producto || '—'}
                </td>
                <td className="p-3 text-center text-xs text-gray-400">
                  {item.linea_produccion || '—'}
                </td>
                <td className="p-3 text-center">{statusBadge(item.status)}</td>
                <td className="p-3 text-center">
                  <div className="flex justify-center gap-1 flex-wrap">
                    {(item.controles_calidad || []).map((ctrl: string) => (
                    <button
                        key={ctrl}
                        onClick={() => openInspeccionModal(item, ctrl)}
                        className="cursor-pointer hover:scale-110 transition-transform"
                        title={`Editar puntos ${ctrl}`}
                    >
                        {controlBadge(ctrl)}
                    </button>
                    ))}
                    {(!item.controles_calidad || item.controles_calidad.length === 0) && (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
                  </div>
                </td>
                <td className="p-3 text-center">
                  <button
                    onClick={() => openBomModal(item)}
                    className={`px-2 py-1 rounded text-xs font-medium transition ${
                      item.bom && item.bom.length > 0
                        ? 'bg-indigo-100 text-indigo-800 hover:bg-indigo-200'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                    title="Editar BOM"
                  >
                    📋 {item.bom?.length || 0}
                  </button>
                </td>
                <td className="p-3 text-center space-x-1">
                  <button
                    onClick={() => setDetalleModal(item)}
                    className="text-gray-300 hover:text-slate-900 bg-gray-800 hover:bg-slate-100 p-1.5 rounded transition"
                    title="Ver detalle"
                  >
                    👁️
                  </button>
                  <button
                    onClick={() => handleEdit(item)}
                    className="text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 p-1.5 rounded transition"
                    title="Editar"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDelete(item.sku)}
                    className="text-red-400 hover:text-red-900 bg-red-500/100/10 hover:bg-red-500/20 p-1.5 rounded transition"
                    title="Eliminar"
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {productosFiltrados.length === 0 && (
          <div className="p-10 text-center text-gray-400">
            <span className="text-4xl block mb-2">📦</span>
            {hayFiltros ? (
              <>
                No se encontraron productos con los filtros aplicados.
                <button
                  onClick={limpiarFiltros}
                  className="block mx-auto mt-2 text-blue-400 hover:underline text-sm"
                >
                  Limpiar filtros
                </button>
              </>
            ) : (
              'No hay productos registrados.'
            )}
          </div>
        )}
      </div>

      <div className="mt-4 text-sm font-medium text-gray-400 text-right">
        Mostrando {productosFiltrados.length} de {productos.length} productos
      </div>
    </div>
  )
}