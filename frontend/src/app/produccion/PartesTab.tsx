'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import {
  getInventario,
  createInventario,
  updateInventario,
  deleteInventario,
  importarExcelInventario,
  agregarACola,
} from '@/lib/api'
import { InventarioItem } from '@/types'
import { Modal, Button, LoadingSpinner } from '@/components/ui'
import {
  IconOk, IconAlertas, IconInfo, IconEliminar, IconEtiquetas, IconEditar,
  IconNuevo, IconGuardar, IconCerrar, IconInventario, IconDocumento, IconPendiente,
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

export default function PartesTab() {
  const router = useRouter()
  const { token } = useAuth()

  const [inventario, setInventario] = useState<InventarioItem[]>([])
  const [loading, setLoading] = useState(true)

  const [busqueda, setBusqueda] = useState('')
  const [filtroMaquina, setFiltroMaquina] = useState('')
  const [filtroParte, setFiltroParte] = useState('')
  const [filtroDesc, setFiltroDesc] = useState('')

  const [formData, setFormData] = useState({
    codigo: '',
    descripcion: '',
    linea: '',
    tipo: 'assy',
    qtu: 45,
    linea_lg: 'R1',
    ayuda_visual: '',
  })
  const [editing, setEditing] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isImporting, setIsImporting] = useState(false)

  const [modalInfo, setModalInfo] = useState<ModalInfo>(null)
  const [confirmModal, setConfirmModal] = useState<ConfirmModal>(null)

  const [isQueueModalOpen, setIsQueueModalOpen] = useState(false)
  const [itemForQueue, setItemForQueue] = useState<InventarioItem | null>(null)
  const [queueQty, setQueueQty] = useState('1')
  const qtyInputRef = useRef<HTMLInputElement>(null)
  const [turnoQueue, setTurnoQueue] = useState<'Día' | 'Noche'>('Día')

  useEffect(() => {
    if (isQueueModalOpen && qtyInputRef.current) {
      qtyInputRef.current.focus()
      qtyInputRef.current.select()
    }
  }, [isQueueModalOpen])

  useEffect(() => {
    loadInventario()
  }, [])

  const loadInventario = async () => {
    try {
      const data = await getInventario()
      setInventario(data)
    } catch {
      setModalInfo({
        title: 'Error de Conexión',
        message: 'No se pudieron cargar las partes.',
        type: 'error',
      })
    } finally {
      setLoading(false)
    }
  }

  const maquinasUnicas = useMemo(
    () => [...new Set(inventario.map((i) => i.linea).filter(Boolean))].sort(),
    [inventario]
  )
  const partesUnicas = useMemo(
    () => [...new Set(inventario.map((i) => i.codigo).filter(Boolean))].sort(),
    [inventario]
  )
  const descsUnicas = useMemo(
    () => [...new Set(inventario.map((i) => i.descripcion).filter(Boolean))].sort(),
    [inventario]
  )

  const inventarioFiltrado = useMemo(() => {
    const q = busqueda.toLowerCase().trim()
    return inventario.filter((item) => {
      const pasaBusqueda =
        !q ||
        (item.codigo || '').toLowerCase().includes(q) ||
        (item.descripcion || '').toLowerCase().includes(q) ||
        (item.linea || '').toLowerCase().includes(q)
      const pasaMaquina = !filtroMaquina || item.linea === filtroMaquina
      const pasaParte = !filtroParte || item.codigo === filtroParte
      const pasaDesc = !filtroDesc || item.descripcion === filtroDesc
      return pasaBusqueda && pasaMaquina && pasaParte && pasaDesc
    })
  }, [inventario, busqueda, filtroMaquina, filtroParte, filtroDesc])

  const hayFiltros = busqueda || filtroMaquina || filtroParte || filtroDesc

  const limpiarFiltros = () => {
    setBusqueda('')
    setFiltroMaquina('')
    setFiltroParte('')
    setFiltroDesc('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editing) {
        const { codigo, ...updateData } = formData
        await updateInventario(editing, updateData)
        setModalInfo({
          title: '¡Actualizado!',
          message: `La parte ${editing} fue actualizada correctamente.`,
          type: 'success',
        })
        setEditing(null)
      } else {
        await createInventario(formData)
        setModalInfo({
          title: '¡Parte Agregada!',
          message: `La parte ${formData.codigo} fue agregada correctamente.`,
          type: 'success',
        })
      }
      resetForm()
      loadInventario()
    } catch (error: any) {
      setModalInfo({
        title: 'Error al Guardar',
        message: error.message || 'Ocurrió un error inesperado.',
        type: 'error',
      })
    }
  }

  const handleEdit = (item: InventarioItem) => {
    setFormData({
      codigo: item.codigo,
      descripcion: item.descripcion,
      linea: item.linea,
      tipo: item.tipo,
      qtu: item.qtu,
      linea_lg: item.linea_lg,
      ayuda_visual: item.ayuda_visual || '',
    })
    setEditing(item.codigo)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = (codigo: string) => {
    setConfirmModal({
      title: 'Confirmar Eliminación',
      message: `¿Estás seguro de que deseas eliminar la pieza "${codigo}"?`,
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          await deleteInventario(codigo)
          loadInventario()
          setModalInfo({
            title: '¡Eliminado!',
            message: `La parte "${codigo}" fue eliminada correctamente.`,
            type: 'success',
          })
        } catch (error: any) {
          setModalInfo({
            title: 'Error al Eliminar',
            message: error.message || 'No se pudo eliminar la parte.',
            type: 'error',
          })
        }
      },
    })
  }

  const resetForm = () => {
    setEditing(null)
    setFormData({
      codigo: '',
      descripcion: '',
      linea: '',
      tipo: 'assy',
      qtu: 45,
      linea_lg: 'R1',
      ayuda_visual: '',
    })
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsImporting(true)
    try {
      const result = await importarExcelInventario(file)
      const total = (result.creados || 0) + (result.actualizados || 0)
      setModalInfo({
        title: '¡Importación Exitosa!',
        message: `Se importaron ${result.creados || 0} y actualizaron ${result.actualizados || 0} partes (${total} total).`,
        type: 'success',
      })
      loadInventario()
    } catch (error: any) {
      setModalInfo({
        title: 'Error al Importar',
        message: error.message || 'No se pudo procesar el archivo Excel.',
        type: 'error',
      })
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const openQueueModal = (item: InventarioItem) => {
    setItemForQueue(item)
    setQueueQty('1')
    setIsQueueModalOpen(true)
  }

  const confirmAddToQueue = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!itemForQueue) return
    if (!token) {
      setModalInfo({ title: 'Error', message: 'No hay sesión activa.', type: 'error' })
      return
    }
    const cantidad = parseInt(queueQty) || 1
    try {
      await agregarACola(
        {
          codigo_inventario: itemForQueue.codigo,
          cantidad_etiquetas: cantidad,
          turno: turnoQueue,
        },
        token
      )
      setIsQueueModalOpen(false)
      router.push('/etiquetas')
    } catch (error: any) {
      setModalInfo({
        title: 'Error',
        message: 'No se pudo añadir a la cola: ' + error.message,
        type: 'error',
      })
    }
  }

  if (loading)
    return (
      <div className="p-8 flex justify-center">
        <LoadingSpinner label="Cargando datos..." />
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
        <p className="text-gray-300 text-sm">{modalInfo?.message}</p>
      </Modal>

      {/* MODAL CONFIRMAR ELIMINACIÓN */}
      <Modal
        open={!!confirmModal}
        onClose={() => setConfirmModal(null)}
        size="sm"
        title={<span className="flex items-center gap-2 text-red-400"><IconEliminar size={18} aria-hidden /> {confirmModal?.title}</span>}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmModal(null)}>Cancelar</Button>
            <Button variant="danger" onClick={() => confirmModal?.onConfirm()} leftIcon={IconEliminar}>Sí, Eliminar</Button>
          </>
        }
      >
        <p className="text-gray-300 text-sm">{confirmModal?.message}</p>
      </Modal>

      {/* MODAL AÑADIR A COLA */}
      <Modal
        open={isQueueModalOpen && !!itemForQueue}
        onClose={() => setIsQueueModalOpen(false)}
        size="sm"
        title={<span className="flex items-center gap-2 text-[var(--accent)]"><IconEtiquetas size={18} aria-hidden /> Añadir a Cola</span>}
      >
        {itemForQueue && (
          <form onSubmit={confirmAddToQueue}>
            <p className="text-gray-300 text-sm mb-4">
              Parte:{' '}
              <strong className="text-[var(--accent)] font-mono bg-[var(--accent-soft)] px-1 rounded">
                {itemForQueue.codigo}
              </strong>
            </p>
            <label className="block text-xs font-semibold text-gray-300 mb-1">
              Cantidad de Etiquetas
            </label>
            <input
              ref={qtyInputRef}
              type="number"
              min="1"
              value={queueQty}
              onChange={(e) => setQueueQty(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-white outline-none focus:ring-2 focus:ring-[var(--accent)] text-2xl text-center font-bold mb-4"
              required
            />
            <label className="block text-xs font-semibold text-gray-300 mb-1">Turno</label>
            <select
              value={turnoQueue}
              onChange={(e) => setTurnoQueue(e.target.value as 'Día' | 'Noche')}
              className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:ring-2 focus:ring-[var(--accent)] mb-5"
            >
              <option value="Día">Día</option>
              <option value="Noche">Noche</option>
            </select>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setIsQueueModalOpen(false)}>Cancelar</Button>
              <Button type="submit" leftIcon={IconEtiquetas}>Añadir e Imprimir</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* FORMULARIO */}
      <form
        onSubmit={handleSubmit}
        className="bg-gray-900 p-6 rounded-xl border border-gray-800 mb-6"
      >
        <h2 className="text-lg font-bold text-gray-300 mb-4 pb-2 border-b border-gray-800 flex items-center gap-2">
          {editing ? <><IconEditar size={18} className="text-[var(--accent)]" aria-hidden /> Editar Parte: {editing}</> : <><IconNuevo size={18} className="text-[var(--accent)]" aria-hidden /> Nueva Parte</>}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">No. de Parte</label>
            <input
              type="text"
              value={formData.codigo}
              onChange={(e) => setFormData({ ...formData, codigo: e.target.value })}
              className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
              required
              disabled={!!editing}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">Descripción</label>
            <input
              type="text"
              value={formData.descripcion}
              onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
              className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">
              Línea (máquina)
            </label>
            <input
              type="text"
              value={formData.linea}
              onChange={(e) => setFormData({ ...formData, linea: e.target.value })}
              className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">Tipo</label>
            <select
              value={formData.tipo}
              onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
              className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
            >
              <option value="assy">assy</option>
              <option value="Packing">Packing</option>
              <option value="Assy">Assy</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">
              QTY (piezas por carrito)
            </label>
            <input
              type="number"
              value={formData.qtu}
              onChange={(e) =>
                setFormData({ ...formData, qtu: parseInt(e.target.value) || 1 })
              }
              className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-1">Línea LG</label>
            <select
              value={formData.linea_lg}
              onChange={(e) => setFormData({ ...formData, linea_lg: e.target.value })}
              className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
            >
              <option value="R1">R1</option>
              <option value="R2">R2</option>
              <option value="BOSCH">BOSCH</option>
              <option value="EPS">EPS</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="block text-sm font-semibold text-gray-300 mb-1">
              Ayuda Visual (link)
            </label>
            <input
              type="text"
              placeholder="https://..."
              value={formData.ayuda_visual}
              onChange={(e) => setFormData({ ...formData, ayuda_visual: e.target.value })}
              className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
            />
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3 border-t border-gray-800 pt-4">
          <Button type="submit" leftIcon={editing ? IconGuardar : IconNuevo}>
            {editing ? 'Actualizar Parte' : 'Agregar Parte'}
          </Button>
          {!editing && (
            <>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
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
                {isImporting ? 'Importando...' : 'Importar Excel'}
              </Button>
            </>
          )}
          {editing && (
            <Button
              type="button"
              onClick={() => openQueueModal(inventario.find((i) => i.codigo === editing)!)}
              leftIcon={IconEtiquetas}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              Añadir a la Cola e Imprimir
            </Button>
          )}
          {editing && (
            <Button type="button" variant="secondary" onClick={resetForm} leftIcon={IconCerrar} className="ml-auto">
              Cancelar Edición
            </Button>
          )}
        </div>
      </form>

      {/* BARRA DE FILTROS */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="text"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar máquina, parte o descripción..."
          className="flex-1 min-w-[200px] bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 placeholder:text-gray-400"
        />
        <select
          value={filtroMaquina}
          onChange={(e) => setFiltroMaquina(e.target.value)}
          className="bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
        >
          <option value="">Todas las Máquinas</option>
          {maquinasUnicas.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={filtroParte}
          onChange={(e) => setFiltroParte(e.target.value)}
          className="bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
        >
          <option value="">Todos los No. de Parte</option>
          {partesUnicas.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={filtroDesc}
          onChange={(e) => setFiltroDesc(e.target.value)}
          className="bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15"
        >
          <option value="">Todas las Descripciones</option>
          {descsUnicas.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
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
            {inventarioFiltrado.length === inventario.length
              ? `${inventario.length} registro${inventario.length !== 1 ? 's' : ''}`
              : `${inventarioFiltrado.length} de ${inventario.length} registros`}
          </span>
        </div>
      </div>

      {/* TABLA */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 border-b border-gray-800">
            <tr>
              <th className="p-3 text-left font-semibold text-gray-200">No. de Parte</th>
              <th className="p-3 text-left font-semibold text-gray-200">Descripción</th>
              <th className="p-3 text-left font-semibold text-gray-200">Línea</th>
              <th className="p-3 text-left font-semibold text-gray-200">Tipo</th>
              <th className="p-3 text-center font-semibold text-gray-200">QTY</th>
              <th className="p-3 text-center font-semibold text-gray-200">Línea LG</th>
              <th className="p-3 text-center font-semibold text-gray-200">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {inventarioFiltrado.map((item) => (
              <tr
                key={item.codigo}
                className="border-b last:border-b-0 hover:bg-blue-500/10/30 transition"
              >
                <td className="p-3 font-mono font-medium text-white">{item.codigo}</td>
                <td className="p-3 text-gray-300">{item.descripcion}</td>
                <td className="p-3 text-gray-300">{item.linea}</td>
                <td className="p-3 text-gray-300">{item.tipo}</td>
                <td className="p-3 text-center font-semibold">{item.qtu}</td>
                <td className="p-3 text-center">
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold tracking-wide ${
                      item.linea_lg === 'BOSCH'
                        ? 'bg-blue-500/20 text-blue-300'
                        : item.linea_lg === 'EPS'
                        ? 'bg-purple-500/20 text-purple-300'
                        : item.linea_lg === 'R2'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-gray-700 text-gray-300'
                    }`}
                  >
                    {item.linea_lg}
                  </span>
                </td>
                <td className="p-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => openQueueModal(item)}
                      className="text-purple-400 hover:text-purple-300 bg-purple-500/10 hover:bg-purple-500/20 p-1.5 rounded transition"
                      title="Añadir a la Cola e Imprimir"
                      aria-label="Añadir a la Cola e Imprimir"
                    >
                      <IconEtiquetas size={16} />
                    </button>
                    <button
                      onClick={() => handleEdit(item)}
                      className="text-blue-400 hover:text-blue-300 bg-blue-500/10 hover:bg-blue-500/20 p-1.5 rounded transition"
                      title="Editar"
                      aria-label="Editar"
                    >
                      <IconEditar size={16} />
                    </button>
                    <button
                      onClick={() => handleDelete(item.codigo)}
                      className="text-red-400 hover:text-red-300 bg-red-500/10 hover:bg-red-500/20 p-1.5 rounded transition"
                      title="Eliminar"
                      aria-label="Eliminar"
                    >
                      <IconEliminar size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {inventarioFiltrado.length === 0 && (
          <div className="p-10 text-center text-gray-300">
            <IconInventario size={36} className="mx-auto mb-2 text-gray-500" aria-hidden />

            {hayFiltros ? (
              <>
                No se encontraron partes con los filtros aplicados.
                <button
                  onClick={limpiarFiltros}
                  className="block mx-auto mt-2 text-blue-400 hover:underline text-sm"
                >
                  Limpiar filtros
                </button>
              </>
            ) : (
              'No se encontraron partes que coincidan con la búsqueda.'
            )}
          </div>
        )}
      </div>

      <div className="mt-4 text-sm font-medium text-gray-400 text-right">
        Mostrando {inventarioFiltrado.length} de {inventario.length} partes registradas
      </div>
    </div>
  )
}