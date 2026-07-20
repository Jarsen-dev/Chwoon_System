'use client'

import { ProductoItem, ProductoListItem, ProductoCreate, ProductoUpdate, BomItem, AyudaVisual } from '@/types'
import { useCallback, useEffect, useState, useRef } from 'react'
import {
  getProductosPage,
  getProductoById,
  getProducto,
  createProducto,
  updateProducto,
  deleteProducto,
  deleteProductosBatch,
  cambiarStatusProductos,
  actualizarPuntosInspeccion,
  actualizarBom,
  importarProductosExcel,
  importarBomExcel,
  getAyudasVisuales,
  reindexarAyudasVisuales,
  ayudaVisualThumbnailUrl,
  ayudaVisualPdfUrl,
} from '@/lib/api'
import { useAuth } from '@/context/AuthContext'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { Modal, Button, LoadingSpinner, Pagination } from '@/components/ui'
import {
  IconOk, IconAlertas, IconInfo, IconEliminar, IconLista, IconNuevo, IconGuardar,
  IconBuscar, IconInventario, IconEditar, IconDocumento, IconPendiente,
  IconSinMovimiento, IconInyeccion, IconCerrar, IconVer, IconDesplegar,
} from '@/lib/icons'

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

const PAGE_SIZE = 50

const TIPOS_PRODUCTO = ['COMPONENTE', 'RESINA', 'PRODUCTO FINAL']
const CLASES_PRODUCTO = ['PRE EXPANSIÓN', 'INYECCIÓN', 'ASSY']
const UNIDADES_MEDIDA = ['PZA', 'KG', 'LT', 'MT', 'ROLLO', 'CAJA']
const UNIDADES_BOM = [
  { value: 'pza', label: 'Pieza (pza)' },
  { value: 'm', label: 'Metro (m)' },
  { value: 'kg', label: 'Kilogramo (Kg)' },
]
// Unidad a mostrar: la guardada gana; BOMs legados sin unidad se infieren de la cantidad
const unidadBom = (item: BomItem) =>
  item.unidad || (Number.isInteger(item.cantidad) ? 'pza' : 'm')
const ID_PROCESOS = ['ASSY', 'PACKING', 'BLOCK', 'CUTTING', 'MOLDE']
const TIPOS_RESINA = ['EPS', 'EPP']

export default function ProductosTab() {
  const [productos, setProductos] = useState<ProductoListItem[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [initialLoading, setInitialLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [detalleLoadingId, setDetalleLoadingId] = useState<number | null>(null)

  // Filtros
  const [busqueda, setBusqueda] = useState('')
  const [filtroTipo, setFiltroTipo] = useState('')
  const [filtroStatus, setFiltroStatus] = useState('')
  const [filtroClase, setFiltroClase] = useState('')
  const busquedaDebounced = useDebouncedValue(busqueda, 300)

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
  const [editing, setEditing] = useState<number | null>(null)
  const [showInyeccion, setShowInyeccion] = useState(false)
  const [inyeccionData, setInyeccionData] = useState({
    id_proceso: '',
    tipo_resina: '',
    resina: '',
    densidad: '',
    peso_spec: '',
    peso_seco: '',
    cav: '',
    ciclo: '',
  })
  const [showResina, setShowResina] = useState(false)
  const [resinaData, setResinaData] = useState({
    tipo_resina: '',
    grado: '',
    marca: '',
    cantidad: '',
  })

  // Selección múltiple
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // Modales
  const [modalInfo, setModalInfo] = useState<ModalInfo>(null)
  const [confirmModal, setConfirmModal] = useState<ConfirmModal>(null)

  // Importar
  const fileInputRef = useRef<HTMLInputElement>(null)
  const bomFileInputRef = useRef<HTMLInputElement>(null)
  const [isImporting, setIsImporting] = useState(false)

  // BOM Modal
  const [bomModal, setBomModal] = useState<{
    id: number
    sku: string
    bom: BomItem[]
  } | null>(null)
  const [newBomItem, setNewBomItem] = useState<BomItem>({
    sku_componente: '',
    descripcion: '',
    cantidad: 1,
    unidad: 'pza',
  })
  const [descripcionEditada, setDescripcionEditada] = useState(false)
  const [bomEditIdx, setBomEditIdx] = useState<number | null>(null)
  const [bomEditDraft, setBomEditDraft] = useState<BomItem | null>(null)

  // Inspección Modal
  const [inspeccionModal, setInspeccionModal] = useState<{
    id: number
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
  const [bomDetalleAbierto, setBomDetalleAbierto] = useState(false)

  const abrirDetalleModal = (p: ProductoItem) => {
    setBomDetalleAbierto(false)
    setDetalleModal(p)
  }

  // Ayudas Visuales Modal
  const { rol, token } = useAuth()
  const [avModal, setAvModal] = useState<ProductoListItem | null>(null)
  const [ayudas, setAyudas] = useState<AyudaVisual[] | null>(null) // null = cargando
  const [isReindexing, setIsReindexing] = useState(false)

  useEffect(() => {
    setShowInyeccion(formData.clase_producto === 'INYECCIÓN')
    setShowResina(formData.clase_producto === 'PRE EXPANSIÓN')
  }, [formData.clase_producto])

  // ── Carga paginada (búsqueda y filtros server-side) ──
  const loadProductos = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true)
      try {
        const data = await getProductosPage(
          {
            search: busquedaDebounced,
            tipo: filtroTipo,
            clase: filtroClase,
            status: filtroStatus,
            limit: PAGE_SIZE,
            offset,
          },
          signal
        )
        setProductos(data.items)
        setTotal(data.total)
        setLoading(false)
        setInitialLoading(false)
        // Si la página quedó fuera de rango (p.ej. tras borrar), regresar a la última válida
        if (data.total > 0 && offset >= data.total) {
          setOffset(Math.floor((data.total - 1) / PAGE_SIZE) * PAGE_SIZE)
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        setLoading(false)
        setInitialLoading(false)
        setModalInfo({
          title: 'Error de Conexión',
          message: 'No se pudieron cargar los productos.',
          type: 'error',
        })
      }
    },
    [busquedaDebounced, filtroTipo, filtroClase, filtroStatus, offset]
  )

  // Cambiar búsqueda o filtros regresa a la primera página
  useEffect(() => {
    setOffset(0)
  }, [busquedaDebounced, filtroTipo, filtroClase, filtroStatus])

  useEffect(() => {
    const controller = new AbortController()
    loadProductos(controller.signal)
    return () => controller.abort()
  }, [loadProductos])

  const hayFiltros = busqueda || filtroTipo || filtroStatus || filtroClase

  const limpiarFiltros = () => {
    setBusqueda('')
    setFiltroTipo('')
    setFiltroStatus('')
    setFiltroClase('')
  }

  // ── Detalle bajo demanda ──
  // El listado es ligero (sin BOM, puntos de inspección ni características);
  // las acciones que los necesitan cargan el producto completo por id.
  const abrirConDetalle = async (id: number, abrir: (p: ProductoItem) => void) => {
    setDetalleLoadingId(id)
    try {
      const producto = await getProductoById(id)
      abrir(producto)
    } catch (error) {
      setModalInfo({
        title: 'Error',
        message: error instanceof Error ? error.message : 'No se pudo cargar el producto.',
        type: 'error',
      })
    } finally {
      setDetalleLoadingId(null)
    }
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
            densidad: inyeccionData.densidad,
            peso_spec: parseFloat(inyeccionData.peso_spec) || 0,
            peso_seco: parseFloat(inyeccionData.peso_seco) || 0,
            cav: parseInt(inyeccionData.cav) || 0,
            ciclo: parseFloat(inyeccionData.ciclo) || 0,
            }
        }
        if (showResina) {
            updatePayload.caracteristicas_resina = {
            tipo_resina: resinaData.tipo_resina,
            grado: resinaData.grado,
            marca: resinaData.marca,
            cantidad: parseFloat(resinaData.cantidad) || 0,
            }
        }
        await updateProducto(editing, updatePayload)
        setModalInfo({
            title: '¡Actualizado!',
            message: `El producto ${formData.sku} fue actualizado.`,
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
            densidad: inyeccionData.densidad,
            peso_spec: parseFloat(inyeccionData.peso_spec) || 0,
            peso_seco: parseFloat(inyeccionData.peso_seco) || 0,
            cav: parseInt(inyeccionData.cav) || 0,
            ciclo: parseFloat(inyeccionData.ciclo) || 0,
            }
        }
        if (showResina) {
            createPayload.caracteristicas_resina = {
            tipo_resina: resinaData.tipo_resina,
            grado: resinaData.grado,
            marca: resinaData.marca,
            cantidad: parseFloat(resinaData.cantidad) || 0,
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
        peso_spec: String(item.caracteristicas_inyeccion.peso_spec ?? ''),
        peso_seco: String(item.caracteristicas_inyeccion.peso_seco ?? ''),
        cav: String(item.caracteristicas_inyeccion.cav ?? ''),
        ciclo: String(item.caracteristicas_inyeccion.ciclo ?? ''),
      })
    }
    if (item.caracteristicas_resina && Object.keys(item.caracteristicas_resina).length > 0) {
      setResinaData({
        tipo_resina: item.caracteristicas_resina.tipo_resina || '',
        grado: item.caracteristicas_resina.grado || '',
        marca: item.caracteristicas_resina.marca || '',
        cantidad: String(item.caracteristicas_resina.cantidad ?? ''),
      })
    }
    setEditing(item.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = (id: number, sku: string) => {
    setConfirmModal({
      title: 'Confirmar Eliminación',
      message: `¿Estás seguro de eliminar el producto "${sku}"?`,
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          await deleteProducto(id)
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
      peso_spec: '',
      peso_seco: '',
      cav: '',
      ciclo: '',
    })
    setResinaData({
      tipo_resina: '',
      grado: '',
      marca: '',
      cantidad: '',
    })
  }

  // ── Selección múltiple ──
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Selecciona/deselecciona la página visible; la selección persiste entre páginas
  const todaLaPaginaSeleccionada =
    productos.length > 0 && productos.every((p) => selectedIds.has(p.id))

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (todaLaPaginaSeleccionada) {
        productos.forEach((p) => next.delete(p.id))
      } else {
        productos.forEach((p) => next.add(p.id))
      }
      return next
    })
  }

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return
    setConfirmModal({
      title: 'Eliminar Seleccionados',
      message: `¿Eliminar ${selectedIds.size} producto(s)? Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          await deleteProductosBatch(Array.from(selectedIds))
          setSelectedIds(new Set())
          loadProductos()
          setModalInfo({
            title: '¡Eliminados!',
            message: `${selectedIds.size} producto(s) eliminado(s).`,
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
    if (selectedIds.size === 0) return
    try {
      await cambiarStatusProductos(Array.from(selectedIds), status)
      setSelectedIds(new Set())
      loadProductos()
      setModalInfo({
        title: '¡Actualizado!',
        message: `${selectedIds.size} producto(s) cambiado(s) a "${status}".`,
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
        message: `Se importaron ${result.count} producto(s) nuevo(s). ${result.omitidos} ya existían y no se modificaron.${result.sin_sku > 0 ? ` ${result.sin_sku} fila(s) sin SKU fueron ignoradas.` : ''}`,
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
  const resetNewBomItem = () => {
    setNewBomItem({ sku_componente: '', descripcion: '', cantidad: 1, unidad: 'pza' })
    setDescripcionEditada(false)
  }

  const openBomModal = (item: ProductoItem) => {
    setBomModal({
      id: item.id,
      sku: item.sku,
      bom: (item.bom || []).map((b) => ({ ...b })),
    })
    resetNewBomItem()
    setBomEditIdx(null)
    setBomEditDraft(null)
  }

  // Auto-llenar la descripción con la del catálogo al salir del input de No. de Parte
  const autollenarDescripcion = async () => {
    const sku = newBomItem.sku_componente.trim().toUpperCase()
    if (!sku || descripcionEditada) return
    try {
      const prod = await getProducto(sku)
      // No pisar una descripción que el usuario ya haya escrito mientras cargaba
      setNewBomItem((prev) =>
        prev.descripcion ? prev : { ...prev, descripcion: prod.descripcion || '' }
      )
    } catch {
      // No existe en el catálogo: se deja capturar manualmente
    }
  }

  const addBomItem = () => {
    if (!bomModal || !newBomItem.sku_componente.trim()) return
    const exists = bomModal.bom.some(
      (b) => b.sku_componente === newBomItem.sku_componente.trim().toUpperCase()
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
          descripcion: (newBomItem.descripcion || '').trim(),
          cantidad: newBomItem.cantidad,
          unidad: newBomItem.unidad,
        },
      ],
    })
    resetNewBomItem()
  }

  const removeBomItem = (index: number) => {
    if (!bomModal) return
    const updated = bomModal.bom.filter((_, i) => i !== index)
    setBomModal({ ...bomModal, bom: updated })
    if (bomEditIdx === index) {
      setBomEditIdx(null)
      setBomEditDraft(null)
    }
  }

  // ── Edición en línea de componentes del BOM ──
  const startEditBom = (index: number) => {
    if (!bomModal) return
    setBomEditIdx(index)
    setBomEditDraft({ ...bomModal.bom[index], unidad: unidadBom(bomModal.bom[index]) })
  }

  const cancelEditBom = () => {
    setBomEditIdx(null)
    setBomEditDraft(null)
  }

  const confirmEditBom = () => {
    if (!bomModal || bomEditIdx === null || !bomEditDraft) return
    const sku = bomEditDraft.sku_componente.trim().toUpperCase()
    if (!sku) return
    const duplicado = bomModal.bom.some(
      (b, i) => i !== bomEditIdx && b.sku_componente === sku
    )
    if (duplicado) {
      setModalInfo({
        title: 'Duplicado',
        message: 'Ese componente ya está en el BOM.',
        type: 'error',
      })
      return
    }
    const updated = [...bomModal.bom]
    updated[bomEditIdx] = {
      ...bomEditDraft,
      sku_componente: sku,
      descripcion: (bomEditDraft.descripcion || '').trim(),
    }
    setBomModal({ ...bomModal, bom: updated })
    cancelEditBom()
  }

  const saveBom = async () => {
    if (!bomModal) return
    try {
      await actualizarBom(bomModal.id, bomModal.bom)
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
      id: item.id,
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
        inspeccionModal.id,
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

  // ── Ayudas Visuales ──
  const openAvModal = async (item: ProductoListItem) => {
    setAvModal(item)
    setAyudas(null)
    try {
      setAyudas(await getAyudasVisuales(item.sku))
    } catch {
      setAyudas([])
      setModalInfo({
        title: 'Error de Conexión',
        message: 'No se pudieron cargar las ayudas visuales.',
        type: 'error',
      })
    }
  }

  const handleReindexAyudas = async () => {
    if (!token) return
    setIsReindexing(true)
    try {
      const r = await reindexarAyudasVisuales(token)
      const detalles = [
        `Archivos PDF encontrados: ${r.total_archivos}`,
        `Indexados: ${r.indexados} (${r.nuevos} nuevos, ${r.actualizados} actualizados)`,
        `Eliminados: ${r.eliminados}`,
        `Miniaturas generadas: ${r.thumbnails_generados}`,
        r.sin_producto.length
          ? `Sin producto asociado (${r.sin_producto.length}): ${r.sin_producto.slice(0, 10).join(', ')}${r.sin_producto.length > 10 ? '…' : ''}`
          : '',
        r.errores.length ? `Errores (${r.errores.length}): ${r.errores.slice(0, 5).join(' | ')}` : '',
      ]
        .filter(Boolean)
        .join('\n')
      setModalInfo({
        title: 'Reindexado Completado',
        message: detalles,
        type: r.errores.length ? 'info' : 'success',
      })
    } catch (e) {
      setModalInfo({
        title: 'Error al Reindexar',
        message: e instanceof Error ? e.message : 'Error al reindexar ayudas visuales.',
        type: 'error',
      })
    } finally {
      setIsReindexing(false)
    }
  }

  // ── Badges de controles ──
  const controlBadge = (control: string) => {
    const colors: Record<string, string> = {
      IQC: 'bg-orange-500/20 text-orange-400',
      LQC: 'bg-blue-500/20 text-blue-300',
      OQC: 'bg-green-500/20 text-green-400',
    }
    return (
      <span
        key={control}
        className={`px-2 py-0.5 rounded-full text-xs font-bold ${colors[control] || 'bg-gray-800 text-gray-400'}`}
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

  if (initialLoading)
    return (
      <div className="p-8 flex justify-center">
        <LoadingSpinner label="Cargando productos..." />
      </div>
    )

  const ModalIcon = modalInfo
    ? (modalInfo.type === 'success' ? IconOk : modalInfo.type === 'error' ? IconAlertas : IconInfo)
    : IconInfo
  const modalTitleColor = modalInfo
    ? (modalInfo.type === 'success' ? 'text-emerald-400' : modalInfo.type === 'error' ? 'text-red-400' : 'text-blue-400')
    : ''

  return (
    <div className="relative">
      {/* MODAL NOTIFICACIÓN */}
      <Modal
        open={!!modalInfo}
        onClose={() => setModalInfo(null)}
        size="sm"
        title={<span className={`flex items-center gap-2 ${modalTitleColor}`}><ModalIcon size={18} aria-hidden /> {modalInfo?.title}</span>}
        footer={<Button variant="secondary" onClick={() => setModalInfo(null)}>Aceptar</Button>}
      >
        <p className="text-gray-300 text-sm whitespace-pre-line">{modalInfo?.message}</p>
      </Modal>

      {/* MODAL CONFIRMAR */}
      <Modal
        open={!!confirmModal}
        onClose={() => setConfirmModal(null)}
        size="sm"
        title={<span className="flex items-center gap-2 text-red-400"><IconAlertas size={18} aria-hidden /> {confirmModal?.title}</span>}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmModal(null)}>Cancelar</Button>
            <Button variant="danger" onClick={() => confirmModal?.onConfirm()} leftIcon={IconEliminar}>Confirmar</Button>
          </>
        }
      >
        <p className="text-gray-300 text-sm">{confirmModal?.message}</p>
      </Modal>

      {/* MODAL BOM */}
      <Modal
        open={!!bomModal}
        onClose={() => setBomModal(null)}
        size="lg"
        title={<span className="flex items-center gap-2 text-[var(--accent)]"><IconLista size={18} aria-hidden /> BOM - {bomModal?.sku}</span>}
        footer={
          <>
            <Button variant="secondary" onClick={() => setBomModal(null)}>Cancelar</Button>
            <Button onClick={saveBom} leftIcon={IconGuardar}>Guardar BOM</Button>
          </>
        }
      >
        {bomModal && (
          <>
            {/* Lista actual */}
            {bomModal.bom.length > 0 ? (
              <table className="w-full text-sm mb-4">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="p-2 text-left text-gray-300">No. de Parte</th>
                    <th className="p-2 text-left text-gray-300">Descripción</th>
                    <th className="p-2 text-center text-gray-300">Cantidad</th>
                    <th className="p-2 text-center text-gray-300">Unidad</th>
                    <th className="p-2 text-center text-gray-300">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {bomModal.bom.map((item, idx) =>
                    bomEditIdx === idx && bomEditDraft ? (
                      <tr key={idx} className="border-b border-gray-800 bg-blue-500/10">
                        <td className="p-2">
                          <input
                            type="text"
                            value={bomEditDraft.sku_componente}
                            onChange={(e) =>
                              setBomEditDraft({ ...bomEditDraft, sku_componente: e.target.value })
                            }
                            className="w-full bg-gray-950 border border-gray-800 rounded-md px-2 py-1.5 text-xs text-white font-mono outline-none focus:ring-2 focus:ring-[var(--accent)]"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={bomEditDraft.descripcion || ''}
                            onChange={(e) =>
                              setBomEditDraft({ ...bomEditDraft, descripcion: e.target.value })
                            }
                            className="w-full bg-gray-950 border border-gray-800 rounded-md px-2 py-1.5 text-xs text-white outline-none focus:ring-2 focus:ring-[var(--accent)]"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={bomEditDraft.cantidad}
                            onChange={(e) =>
                              setBomEditDraft({
                                ...bomEditDraft,
                                cantidad: parseFloat(e.target.value) || 0,
                              })
                            }
                            className="w-20 bg-gray-950 border border-gray-800 rounded-md px-2 py-1.5 text-xs text-white text-center outline-none focus:ring-2 focus:ring-[var(--accent)]"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={bomEditDraft.unidad}
                            onChange={(e) =>
                              setBomEditDraft({ ...bomEditDraft, unidad: e.target.value })
                            }
                            className="bg-gray-950 border border-gray-800 rounded-md px-2 py-1.5 text-xs text-white outline-none focus:ring-2 focus:ring-[var(--accent)]"
                          >
                            {UNIDADES_BOM.map((u) => (
                              <option key={u.value} value={u.value}>{u.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-2 text-center whitespace-nowrap">
                          <button
                            onClick={confirmEditBom}
                            className="text-green-400 hover:text-green-300 inline-flex mr-2"
                            title="Confirmar"
                            aria-label="Confirmar"
                          >
                            <IconOk size={15} />
                          </button>
                          <button
                            onClick={cancelEditBom}
                            className="text-gray-400 hover:text-gray-300 inline-flex"
                            title="Cancelar"
                            aria-label="Cancelar"
                          >
                            <IconCerrar size={15} />
                          </button>
                        </td>
                      </tr>
                    ) : (
                      <tr key={idx} className="border-b border-gray-800">
                        <td className="p-2 font-mono">{item.sku_componente}</td>
                        <td className="p-2 text-gray-300">{item.descripcion || '—'}</td>
                        <td className="p-2 text-center">{item.cantidad}</td>
                        <td className="p-2 text-center text-gray-300">{unidadBom(item)}</td>
                        <td className="p-2 text-center whitespace-nowrap">
                          <button
                            onClick={() => startEditBom(idx)}
                            className="text-blue-400 hover:text-blue-300 inline-flex mr-2"
                            title="Editar"
                            aria-label="Editar"
                          >
                            <IconEditar size={15} />
                          </button>
                          <button
                            onClick={() => removeBomItem(idx)}
                            className="text-red-400 hover:text-red-300 inline-flex"
                            title="Eliminar"
                            aria-label="Eliminar"
                          >
                            <IconEliminar size={15} />
                          </button>
                        </td>
                      </tr>
                    )
                  )}
                </tbody>
              </table>
            ) : (
              <p className="text-gray-300 text-center mb-4">No hay componentes en el BOM.</p>
            )}

            {/* Agregar nuevo */}
            <div className="flex gap-2 items-end flex-wrap">
              <div className="flex-1 min-w-[140px]">
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  No. de Parte
                </label>
                <input
                  type="text"
                  value={newBomItem.sku_componente}
                  onChange={(e) =>
                    setNewBomItem({ ...newBomItem, sku_componente: e.target.value })
                  }
                  onBlur={autollenarDescripcion}
                  className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  placeholder="Ej: COMP-001"
                />
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Descripción
                </label>
                <input
                  type="text"
                  value={newBomItem.descripcion || ''}
                  onChange={(e) => {
                    setDescripcionEditada(true)
                    setNewBomItem({ ...newBomItem, descripcion: e.target.value })
                  }}
                  className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  placeholder="Se llena al capturar el No. de Parte"
                />
              </div>
              <div className="w-24">
                <label className="block text-xs font-semibold text-gray-300 mb-1">
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
                  className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-[var(--accent)]"
                />
              </div>
              <div className="w-32">
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Unidad
                </label>
                <select
                  value={newBomItem.unidad}
                  onChange={(e) => setNewBomItem({ ...newBomItem, unidad: e.target.value })}
                  className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-[var(--accent)]"
                >
                  {UNIDADES_BOM.map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
              </div>
              <Button onClick={addBomItem} aria-label="Agregar"><IconNuevo size={16} /></Button>
            </div>
          </>
        )}
      </Modal>

      {/* MODAL INSPECCIÓN */}
      <Modal
        open={!!inspeccionModal}
        onClose={() => setInspeccionModal(null)}
        size="lg"
        title={
          <span className="flex items-center gap-2 text-[var(--accent)]">
            <IconBuscar size={18} aria-hidden /> Puntos de Inspección {inspeccionModal?.tipo_control.toUpperCase()} - {inspeccionModal?.sku}
          </span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setInspeccionModal(null)}>Cancelar</Button>
            <Button onClick={saveInspeccion} leftIcon={IconGuardar}>Guardar Puntos</Button>
          </>
        }
      >
        {inspeccionModal && (
          <>
            {inspeccionModal.puntos.length > 0 ? (
              <table className="w-full text-sm mb-4">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="p-2 text-left text-gray-300">Nombre</th>
                    <th className="p-2 text-left text-gray-300">Especificación</th>
                    <th className="p-2 text-left text-gray-300">Método</th>
                    <th className="p-2 text-center text-gray-300">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {inspeccionModal.puntos.map((punto, idx) => (
                    <tr key={idx} className="border-b border-gray-800">
                      <td className="p-2">{punto.nombre}</td>
                      <td className="p-2 text-gray-300">{punto.especificacion}</td>
                      <td className="p-2 text-gray-300">{punto.metodo}</td>
                      <td className="p-2 text-center">
                        <button
                          onClick={() => removePuntoInspeccion(idx)}
                          className="text-red-400 hover:text-red-300 inline-flex"
                          aria-label="Eliminar"
                        >
                          <IconEliminar size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-gray-300 text-center mb-4">
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
                    className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
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
                    className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
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
                      className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                      placeholder="Calibrador"
                    />
                  </div>
                  <Button onClick={addPuntoInspeccion} aria-label="Agregar"><IconNuevo size={16} /></Button>
                </div>
              </div>
          </>
        )}
      </Modal>

      {/* MODAL DETALLE */}
      <Modal
        open={!!detalleModal}
        onClose={() => setDetalleModal(null)}
        size="2xl"
        title={<span className="flex items-center gap-2 text-[var(--accent)]"><IconInventario size={18} aria-hidden /> Detalle: {detalleModal?.sku}</span>}
      >
        {detalleModal && (
          <>
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
                    <h4 className="font-semibold text-blue-300 text-sm mb-2 flex items-center gap-2">
                      <IconInyeccion size={15} aria-hidden /> Características de Inyección
                    </h4>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {Object.entries(detalleModal.caracteristicas_inyeccion).map(([k, v]) => (
                        <div key={k}>
                          <span className="font-semibold text-gray-400">
                            {k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}:
                          </span>{' '}
                          {String(v)}
                          {(k === 'peso_spec' || k === 'peso_seco') && ' Kg'}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Características de resina */}
              {detalleModal.caracteristicas_resina &&
                Object.keys(detalleModal.caracteristicas_resina).length > 0 && (
                  <div className="mt-4 p-3 bg-blue-500/10 rounded-lg">
                    <h4 className="font-semibold text-blue-300 text-sm mb-2 flex items-center gap-2">
                      <IconInyeccion size={15} aria-hidden /> Características de Resina
                    </h4>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {Object.entries(detalleModal.caracteristicas_resina).map(([k, v]) => (
                        <div key={k}>
                          <span className="font-semibold text-gray-400">
                            {k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}:
                          </span>{' '}
                          {String(v)}
                          {k === 'cantidad' && ' Kg'}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* BOM — desplegable, cerrado por defecto */}
              {detalleModal.bom && detalleModal.bom.length > 0 && (
                <div className="mt-4 p-3 bg-indigo-500/10 rounded-lg">
                  <button
                    onClick={() => setBomDetalleAbierto((v) => !v)}
                    aria-expanded={bomDetalleAbierto}
                    className="w-full flex items-center justify-between gap-2 font-semibold text-indigo-300 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <IconLista size={15} aria-hidden /> BOM ({detalleModal.bom.length} componentes)
                    </span>
                    <IconDesplegar
                      size={16}
                      aria-hidden
                      className={`transition-transform ${bomDetalleAbierto ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {bomDetalleAbierto && (
                    <ul className="list-disc pl-5 mt-2 space-y-1 text-xs text-gray-200">
                      {detalleModal.bom.map((item: BomItem, idx: number) => (
                        <li key={idx}>
                          <span className="font-mono">{item.sku_componente}</span>
                          {' — '}
                          <span className="text-gray-300">{item.descripcion || '—'}</span>
                          {' — '}
                          <span className="font-medium">{item.cantidad} {unidadBom(item)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
          </>
        )}
      </Modal>

      {/* MODAL AYUDAS VISUALES */}
      <Modal
        open={!!avModal}
        onClose={() => { setAvModal(null); setAyudas(null) }}
        size="3xl"
        title={<span className="flex items-center gap-2 text-amber-400"><IconDocumento size={18} aria-hidden /> Ayudas Visuales — {avModal?.sku}</span>}
        footer={<Button variant="secondary" onClick={() => { setAvModal(null); setAyudas(null) }}>Cerrar</Button>}
      >
        {ayudas === null ? (
          <div className="py-10 text-center">
            <LoadingSpinner />
            <p className="text-gray-400 text-sm mt-2">Cargando ayudas visuales...</p>
          </div>
        ) : ayudas.length === 0 ? (
          <div className="py-10 text-center text-gray-400">
            <IconDocumento size={36} className="mx-auto mb-2 text-gray-600" aria-hidden />
            <p className="text-sm">Este producto no tiene ayudas visuales indexadas.</p>
            <p className="text-xs text-gray-500 mt-1">
              Verifica que el PDF incluya el No. de Parte en el nombre y ejecuta &quot;Reindexar AV&quot;.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {ayudas.map((av) => (
              <button
                key={av.id}
                type="button"
                onClick={() => window.open(ayudaVisualPdfUrl(av.id), '_blank', 'noopener')}
                className="group text-left bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-amber-500/50 rounded-lg overflow-hidden transition"
                title={`${av.nombre_archivo}\n${av.ruta}`}
              >
                <div className="w-full aspect-[3/4] bg-white flex items-center justify-center overflow-hidden">
                  {av.tiene_thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ayudaVisualThumbnailUrl(av.id)}
                      alt={av.nombre_archivo}
                      loading="lazy"
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <IconDocumento size={40} className="text-gray-400" aria-hidden />
                  )}
                </div>
                <div className="p-2">
                  {av.codigo_av && (
                    <p className="text-xs font-bold text-amber-400 truncate">{av.codigo_av}</p>
                  )}
                  <p className="text-xs text-gray-300 truncate">{av.nombre_archivo}</p>
                  <p className="text-[10px] text-gray-500 truncate">
                    {av.ruta.split('/').slice(0, -1).join(' / ') || '—'}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </Modal>

      {/* ════════════════ FORMULARIO ════════════════ */}
      <form
        onSubmit={handleSubmit}
        className="bg-gray-900 p-6 rounded-xl border border-gray-800 mb-6"
      >
        <h2 className="text-lg font-bold text-gray-300 mb-4 pb-2 border-b border-gray-800 flex items-center gap-2">
          {editing ? <><IconEditar size={18} className="text-[var(--accent)]" aria-hidden /> Editar Producto: {formData.sku}</> : <><IconNuevo size={18} className="text-[var(--accent)]" aria-hidden /> Nuevo Producto</>}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">No. de Parte *</label>
            <input
              type="text"
              value={formData.sku}
              onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
              className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
              required
              disabled={!!editing}
              placeholder="Ej: PROD-001"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">Modelo</label>
            <input
              type="text"
              value={formData.modelo}
              onChange={(e) => setFormData({ ...formData, modelo: e.target.value })}
              className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
              placeholder="Modelo del producto"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">Tipo *</label>
            <select
              value={formData.tipo}
              onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
              className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
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
                if (t === 'COMPONENTE' && c === 'INYECCIÓN' && (p === 'ASSY' || p === 'BLOCK')) {
                  return '→ Se asignará control LQC'
                }
                if (t === 'COMPONENTE' && c === 'INYECCIÓN' && p === 'PACKING') {
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
              className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
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
              className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
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
                className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                placeholder="0"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">Proveedor</label>
            <input
                type="text"
                value={formData.proveedor}
                onChange={(e) => setFormData({ ...formData, proveedor: e.target.value })}
                className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                placeholder="Nombre del proveedor"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">Cliente</label>
            <input
              type="text"
              value={formData.cliente}
              onChange={(e) => setFormData({ ...formData, cliente: e.target.value })}
              className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">Cliente ID</label>
            <input
              type="text"
              value={formData.cliente_id}
              onChange={(e) => setFormData({ ...formData, cliente_id: e.target.value })}
              className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
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
              className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">Ubicación</label>
            <input
              type="text"
              value={formData.ubicacion}
              onChange={(e) => setFormData({ ...formData, ubicacion: e.target.value })}
              className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-sm font-semibold text-gray-300 mb-1">Descripción</label>
            <input
              type="text"
              value={formData.descripcion}
              onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
              className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
              placeholder="Descripción del producto..."
            />
          </div>
        </div>

        {/* Características de Inyección */}
        {showInyeccion && (
          <div className="mt-4 p-4 bg-blue-500/10 rounded-lg border border-blue-500/30">
            <h3 className="text-sm font-bold text-blue-300 mb-3 flex items-center gap-2">
              <IconInyeccion size={15} aria-hidden /> Características de Inyección
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">ID Proceso</label>
                <select
                    value={inyeccionData.id_proceso}
                    onChange={(e) => setInyeccionData({ ...inyeccionData, id_proceso: e.target.value })}
                    className="w-full bg-gray-950 border border-gray-800 rounded-md px-2 py-1.5 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
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
                    className="w-full bg-gray-950 border border-gray-800 rounded-md px-2 py-1.5 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                >
                    <option value="">-- Seleccionar --</option>
                    {TIPOS_RESINA.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Grado</label>
                <input
                  type="text"
                  value={inyeccionData.resina}
                  onChange={(e) =>
                    setInyeccionData({ ...inyeccionData, resina: e.target.value })
                  }
                  className="w-full bg-gray-800 text-white border border-gray-600 p-1.5 rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Densidad</label>
                <input
                    type="text"
                    value={inyeccionData.densidad}
                    onChange={(e) => setInyeccionData({ ...inyeccionData, densidad: e.target.value })}
                    className="w-full bg-gray-800 text-white border border-gray-600 p-1.5 rounded text-sm"
                    placeholder="0.062(15x)"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Peso Spec</label>
                <input
                    type="text"
                    inputMode="decimal"
                    value={inyeccionData.peso_spec}
                    onChange={(e) => setInyeccionData({ ...inyeccionData, peso_spec: e.target.value })}
                    className="w-full bg-gray-800 text-white border border-gray-600 p-1.5 rounded text-sm"
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
                    className="w-full bg-gray-800 text-white border border-gray-600 p-1.5 rounded text-sm"
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
                    className="w-full bg-gray-800 text-white border border-gray-600 p-1.5 rounded text-sm"
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
                    className="w-full bg-gray-800 text-white border border-gray-600 p-1.5 rounded text-sm"
                    placeholder="0.00"
                />
              </div>
            </div>
          </div>
        )}

        {/* Características de Resina */}
        {showResina && (
          <div className="mt-4 p-4 bg-blue-500/10 rounded-lg border border-blue-500/30">
            <h3 className="text-sm font-bold text-blue-300 mb-3 flex items-center gap-2">
              <IconInyeccion size={15} aria-hidden /> Características de Resina
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Tipo Resina</label>
                <select
                    value={resinaData.tipo_resina}
                    onChange={(e) => setResinaData({ ...resinaData, tipo_resina: e.target.value })}
                    className="w-full bg-gray-950 border border-gray-800 rounded-md px-2 py-1.5 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
                >
                    <option value="">-- Seleccionar --</option>
                    {TIPOS_RESINA.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Grado</label>
                <input
                  type="text"
                  value={resinaData.grado}
                  onChange={(e) =>
                    setResinaData({ ...resinaData, grado: e.target.value })
                  }
                  className="w-full bg-gray-800 text-white border border-gray-600 p-1.5 rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Marca</label>
                <input
                  type="text"
                  value={resinaData.marca}
                  onChange={(e) =>
                    setResinaData({ ...resinaData, marca: e.target.value })
                  }
                  className="w-full bg-gray-800 text-white border border-gray-600 p-1.5 rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1">Cantidad (Kg)</label>
                <input
                    type="text"
                    inputMode="decimal"
                    value={resinaData.cantidad}
                    onChange={(e) => setResinaData({ ...resinaData, cantidad: e.target.value })}
                    className="w-full bg-gray-800 text-white border border-gray-600 p-1.5 rounded text-sm"
                    placeholder="0.00"
                />
              </div>
            </div>
          </div>
        )}

        {/* Botones */}
        <div className="mt-5 flex flex-wrap gap-3 border-t border-gray-800 pt-4">
          <Button type="submit" leftIcon={editing ? IconGuardar : IconNuevo}>
            {editing ? 'Actualizar Producto' : 'Crear Producto'}
          </Button>
          {!editing && (
            <>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImportProductos}
                accept=".xlsx,.xls"
                className="hidden"
              />
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                leftIcon={isImporting ? IconPendiente : IconDocumento}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {isImporting ? 'Importando...' : 'Importar Productos'}
              </Button>
              <input
                type="file"
                ref={bomFileInputRef}
                onChange={handleImportBom}
                accept=".xlsx,.xls"
                className="hidden"
              />
              <Button
                type="button"
                onClick={() => bomFileInputRef.current?.click()}
                disabled={isImporting}
                leftIcon={IconDocumento}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                Importar BOM
              </Button>
              {(rol === 'admin' || rol === 'supervisor') && (
                <Button
                  type="button"
                  onClick={handleReindexAyudas}
                  disabled={isReindexing}
                  leftIcon={isReindexing ? IconPendiente : IconDocumento}
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {isReindexing ? 'Reindexando...' : 'Reindexar AV'}
                </Button>
              )}
            </>
          )}
          {editing && (
            <Button type="button" variant="secondary" onClick={resetForm} leftIcon={IconCerrar} className="ml-auto">
              Cancelar Edición
            </Button>
          )}
        </div>
      </form>

      {/* ════════════════ BARRA DE FILTROS ════════════════ */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar SKU, nombre, descripción, cliente..."
            className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 placeholder:text-gray-400"
          />
          {loading && (
            <span
              className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 rounded-full border-2 border-gray-600 border-t-blue-400 animate-spin"
              aria-label="Buscando..."
            />
          )}
        </div>
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          className="bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
        >
          <option value="">Todos los Tipos</option>
          {TIPOS_PRODUCTO.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          value={filtroClase}
          onChange={(e) => setFiltroClase(e.target.value)}
          className="bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
        >
          <option value="">Todas las Clases</option>
          {CLASES_PRODUCTO.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={filtroStatus}
          onChange={(e) => setFiltroStatus(e.target.value)}
          className="bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
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
          <span className="bg-gray-800 text-gray-400 text-xs font-semibold px-3 py-2 rounded-lg whitespace-nowrap border border-gray-800">
            {total} producto{total !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* ════════════════ ACCIONES BATCH ════════════════ */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-blue-500/10 rounded-lg border border-blue-500/30">
          <span className="text-sm font-semibold text-blue-300">
            {selectedIds.size} seleccionado(s)
          </span>
          <button
            onClick={() => handleBatchStatus('Activo')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-white bg-green-600 hover:bg-green-700 transition"
          >
            <IconOk size={14} aria-hidden /> Activar
          </button>
          <button
            onClick={() => handleBatchStatus('Inactivo')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-white bg-yellow-600 hover:bg-yellow-700 transition"
          >
            <IconSinMovimiento size={14} aria-hidden /> Desactivar
          </button>
          <button
            onClick={handleBatchDelete}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium text-white bg-red-600 hover:bg-red-700 transition"
          >
            <IconEliminar size={14} aria-hidden /> Eliminar
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="px-3 py-1.5 rounded text-xs font-medium text-gray-300 bg-gray-700 hover:bg-gray-600 transition ml-auto"
          >
            Deseleccionar
          </button>
        </div>
      )}

      {/* ════════════════ TABLA ════════════════ */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 border-b border-gray-800">
            <tr>
              <th className="p-3 text-center w-10">
                <input
                  type="checkbox"
                  checked={todaLaPaginaSeleccionada}
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
            {productos.map((item) => (
              <tr
                key={item.id}
                className={`border-b last:border-b-0 hover:bg-blue-500/10/30 transition ${
                  selectedIds.has(item.id) ? 'bg-blue-500/10' : ''
                }`}
              >
                <td className="p-3 text-center">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(item.id)}
                    onChange={() => toggleSelect(item.id)}
                    className="rounded"
                  />
                </td>
                <td className="p-3 font-mono font-medium text-white">{item.sku}</td>
                <td className="p-3 text-gray-300">{item.modelo}</td>
                <td className="p-3 text-center">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                      item.tipo === 'PRODUCTO FINAL'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : item.tipo === 'COMPONENTE'
                        ? 'bg-sky-500/20 text-sky-300'
                        : item.tipo === 'RESINA'
                        ? 'bg-amber-500/20 text-amber-300'
                        : 'bg-gray-800 text-gray-400'
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
                        onClick={() => abrirConDetalle(item.id, (p) => openInspeccionModal(p, ctrl))}
                        disabled={detalleLoadingId === item.id}
                        className="cursor-pointer hover:scale-110 transition-transform disabled:opacity-50"
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
                    onClick={() => abrirConDetalle(item.id, openBomModal)}
                    disabled={detalleLoadingId === item.id}
                    className={`px-2 py-1 rounded text-xs font-medium transition disabled:opacity-50 ${
                      item.bom_count > 0
                        ? 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                    title="Editar BOM"
                  >
                    <span className="inline-flex items-center gap-1"><IconLista size={13} aria-hidden /> {item.bom_count}</span>
                  </button>
                </td>
                <td className="p-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() => abrirConDetalle(item.id, abrirDetalleModal)}
                      disabled={detalleLoadingId === item.id}
                      className="text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 p-1.5 rounded transition disabled:opacity-50"
                      title="Ver detalle"
                      aria-label="Ver detalle"
                    >
                      <IconVer size={15} />
                    </button>
                    <button
                      onClick={() => openAvModal(item)}
                      className="text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 p-1.5 rounded transition"
                      title="Ayudas visuales"
                      aria-label="Ayudas visuales"
                    >
                      <IconDocumento size={15} />
                    </button>
                    <button
                      onClick={() => abrirConDetalle(item.id, handleEdit)}
                      disabled={detalleLoadingId === item.id}
                      className="text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 p-1.5 rounded transition disabled:opacity-50"
                      title="Editar"
                      aria-label="Editar"
                    >
                      <IconEditar size={15} />
                    </button>
                    <button
                      onClick={() => handleDelete(item.id, item.sku)}
                      className="text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 p-1.5 rounded transition"
                      title="Eliminar"
                      aria-label="Eliminar"
                    >
                      <IconEliminar size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {productos.length === 0 && !loading && (
          <div className="p-10 text-center text-gray-300">
            <IconInventario size={36} className="mx-auto mb-2 text-gray-500" aria-hidden />

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

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Pagination total={total} limit={PAGE_SIZE} offset={offset} onChange={setOffset} />
        <div className="ml-auto text-sm font-medium text-gray-400">
          Mostrando {productos.length} de {total} productos
        </div>
      </div>
    </div>
  )
}