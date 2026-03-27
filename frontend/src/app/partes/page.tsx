'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { getPartes, createParte, updateParte, deleteParte, importarExcelPartes, agregarACola } from '@/lib/api'

interface Parte {
  id: number
  numero_parte: string
  descripcion: string
  linea: string
  id_interno: string
  cantidad_por_etiqueta: string
  cliente_lg: string
  ayuda_visual?: string
}

// ==========================================
// TIPOS DE MODALES
// ==========================================
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

export default function PartesPage() {
  const router = useRouter()
  const [partes, setPartes] = useState<Parte[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [formData, setFormData] = useState({
    numero_parte: '',
    descripcion: '',
    linea: '',
    id_interno: 'assy',
    cantidad_por_etiqueta: '45',
    cliente_lg: 'R1',
    ayuda_visual: ''
  })
  const [editing, setEditing] = useState<string | null>(null)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isImporting, setIsImporting] = useState(false)

  // ==========================================
  // ESTADOS DE MODALES
  // ==========================================
  const [modalInfo, setModalInfo]       = useState<ModalInfo>(null)
  const [confirmModal, setConfirmModal] = useState<ConfirmModal>(null)
  const okButtonRef                     = useRef<HTMLButtonElement>(null)
  const confirmButtonRef                = useRef<HTMLButtonElement>(null)

  // Modal cola
  const [isQueueModalOpen, setIsQueueModalOpen] = useState(false)
  const [parteForQueue, setParteForQueue]       = useState<Parte | null>(null)
  const [queueQty, setQueueQty]                 = useState('1')
  const qtyInputRef                             = useRef<HTMLInputElement>(null)

  // Auto-focus modales
  useEffect(() => {
    if (modalInfo && okButtonRef.current) {
      okButtonRef.current.focus()
    }
  }, [modalInfo])

  useEffect(() => {
    if (confirmModal && confirmButtonRef.current) {
      confirmButtonRef.current.focus()
    }
  }, [confirmModal])

  useEffect(() => {
    if (isQueueModalOpen && qtyInputRef.current) {
      qtyInputRef.current.focus()
      qtyInputRef.current.select()
    }
  }, [isQueueModalOpen])

  useEffect(() => {
    loadPartes()
  }, [])

  const loadPartes = async () => {
    try {
      const data = await getPartes()
      setPartes(data)
    } catch (error) {
      setModalInfo({
        title: 'Error de Conexión',
        message: 'No se pudieron cargar las partes. Verifica que el servidor esté activo.',
        type: 'error'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editing) {
        const { numero_parte, ...updateData } = formData
        await updateParte(editing, updateData)
        setModalInfo({
          title: '¡Actualizado!',
          message: `La parte ${editing} fue actualizada correctamente.`,
          type: 'success'
        })
        setEditing(null)
      } else {
        await createParte(formData)
        setModalInfo({
          title: '¡Parte Agregada!',
          message: `La parte ${formData.numero_parte} fue agregada correctamente.`,
          type: 'success'
        })
      }
      resetForm()
      loadPartes()
    } catch (error: any) {
      setModalInfo({
        title: 'Error al Guardar',
        message: error.message || 'Ocurrió un error inesperado.',
        type: 'error'
      })
    }
  }

  const handleEdit = (parte: Parte) => {
    setFormData({
      numero_parte: parte.numero_parte,
      descripcion: parte.descripcion,
      linea: parte.linea,
      id_interno: parte.id_interno,
      cantidad_por_etiqueta: parte.cantidad_por_etiqueta,
      cliente_lg: parte.cliente_lg,
      ayuda_visual: parte.ayuda_visual || ''
    })
    setEditing(parte.numero_parte)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ✅ Reemplaza confirm() nativo
  const handleDelete = (numero_parte: string) => {
    setConfirmModal({
      title: 'Confirmar Eliminación',
      message: `¿Estás seguro de que deseas eliminar la pieza "${numero_parte}"? Esta acción no se puede deshacer.`,
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          await deleteParte(numero_parte)
          loadPartes()
          setModalInfo({
            title: '¡Eliminado!',
            message: `La parte "${numero_parte}" fue eliminada correctamente.`,
            type: 'success'
          })
        } catch (error: any) {
          setModalInfo({
            title: 'Error al Eliminar',
            message: error.message || 'No se pudo eliminar la parte.',
            type: 'error'
          })
        }
      }
    })
  }

  const resetForm = () => {
    setEditing(null)
    setFormData({
      numero_parte: '',
      descripcion: '',
      linea: '',
      id_interno: 'assy',
      cantidad_por_etiqueta: '45',
      cliente_lg: 'R1',
      ayuda_visual: ''
    })
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setIsImporting(true)
    try {
      const result = await importarExcelPartes(file)
      setModalInfo({
        title: '¡Importación Exitosa!',
        message: `Se importaron/actualizaron ${result.count} partes correctamente.`,
        type: 'success'
      })
      loadPartes()
    } catch (error: any) {
      setModalInfo({
        title: 'Error al Importar',
        message: error.message || 'No se pudo procesar el archivo Excel.',
        type: 'error'
      })
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const openQueueModal = (parte: Parte) => {
    setParteForQueue(parte)
    setQueueQty('1')
    setIsQueueModalOpen(true)
  }

  const confirmAddToQueue = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!parteForQueue) return
    const cantidad = parseInt(queueQty) || 1
    try {
      await agregarACola({
        parte_id: parteForQueue.id,
        numero_parte: parteForQueue.numero_parte,
        descripcion: parteForQueue.descripcion,
        cantidad_etiquetas: cantidad,
        turno: 'Día'
      })
      setIsQueueModalOpen(false)
      router.push('/etiquetas')
    } catch (error: any) {
      setModalInfo({
        title: 'Error',
        message: 'No se pudo añadir a la cola: ' + error.message,
        type: 'error'
      })
    }
  }

  const partesFiltradas = partes.filter(p =>
    p.numero_parte.toLowerCase().includes(search.toLowerCase()) ||
    p.descripcion.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return (
    <div className="p-8 text-center text-xl font-semibold text-gray-600">
      Cargando datos...
    </div>
  )

  return (
    <div className="p-4 max-w-6xl mx-auto relative">

      {/* ========================================================= */}
      {/* MODAL: NOTIFICACIÓN (Éxito, Error, Info)                  */}
      {/* ========================================================= */}
      {modalInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className={`px-6 py-4 ${
              modalInfo.type === 'success' ? 'bg-green-600' :
              modalInfo.type === 'error'   ? 'bg-red-600'   : 'bg-blue-600'
            }`}>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                {modalInfo.type === 'success' && '✅ '}
                {modalInfo.type === 'error'   && '❌ '}
                {modalInfo.type === 'info'    && 'ℹ️ '}
                {modalInfo.title}
              </h3>
            </div>
            <div className="p-6">
              <p className="text-gray-700 text-base mb-6">{modalInfo.message}</p>
              <div className="flex justify-end">
                <button
                  ref={okButtonRef}
                  onClick={() => setModalInfo(null)}
                  className={`px-6 py-2.5 rounded-lg font-bold text-white shadow-md transition ${
                    modalInfo.type === 'success' ? 'bg-green-600 hover:bg-green-700' :
                    modalInfo.type === 'error'   ? 'bg-red-600   hover:bg-red-700'   :
                                                   'bg-blue-600  hover:bg-blue-700'
                  }`}
                >
                  Aceptar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: CONFIRMAR ELIMINACIÓN                              */}
      {/* ========================================================= */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-red-600 px-6 py-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                🗑️ {confirmModal.title}
              </h3>
            </div>
            <div className="p-6">
              <p className="text-gray-700 text-base mb-6">{confirmModal.message}</p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="px-5 py-2.5 rounded-lg font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition"
                >
                  Cancelar
                </button>
                <button
                  ref={confirmButtonRef}
                  onClick={confirmModal.onConfirm}
                  className="px-5 py-2.5 rounded-lg font-bold text-white bg-red-600 hover:bg-red-700 shadow-md transition"
                >
                  Sí, Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: AÑADIR A COLA                                      */}
      {/* ========================================================= */}
      {isQueueModalOpen && parteForQueue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-blue-600 px-6 py-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                🖨️ Añadir a Cola
              </h3>
            </div>
            <form onSubmit={confirmAddToQueue} className="p-6">
              <p className="text-gray-600 mb-4">
                ¿Cuántas etiquetas para{' '}
                <strong className="text-blue-700 font-mono bg-blue-50 px-1 rounded">
                  {parteForQueue.numero_parte}
                </strong>{' '}
                deseas añadir?
              </p>
              <input
                ref={qtyInputRef}
                type="number"
                min="1"
                value={queueQty}
                onChange={e => setQueueQty(e.target.value)}
                className="w-full border-2 border-gray-300 p-3 rounded-lg focus:border-blue-500 focus:ring-4 focus:ring-blue-100 outline-none text-2xl text-center font-bold mb-6 transition-all"
                required
              />
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsQueueModalOpen(false)}
                  className="px-5 py-2.5 rounded-lg font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-lg font-medium text-white bg-blue-600 hover:bg-blue-700 shadow-md transition"
                >
                  Añadir e Imprimir
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* CONTENIDO PRINCIPAL                                       */}
      {/* ========================================================= */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-2xl">⚙️</span>
        <h1 className="text-2xl font-bold text-slate-800">Gestión de Partes</h1>
      </div>

      {/* FORMULARIO */}
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-6">
        <h2 className="text-lg font-bold text-gray-700 mb-4 pb-2 border-b">
          {editing ? `✏️ Editar Parte: ${editing}` : '➕ Nueva Parte'}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">N° Parte</label>
            <input
              type="text"
              value={formData.numero_parte}
              onChange={e => setFormData({...formData, numero_parte: e.target.value})}
              className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-200 focus:outline-none"
              required
              disabled={!!editing}
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Descripción</label>
            <input
              type="text"
              value={formData.descripcion}
              onChange={e => setFormData({...formData, descripcion: e.target.value})}
              className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-200 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Línea (máquina)</label>
            <input
              type="text"
              value={formData.linea}
              onChange={e => setFormData({...formData, linea: e.target.value})}
              className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-200 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">ID</label>
            <select
              value={formData.id_interno}
              onChange={e => setFormData({...formData, id_interno: e.target.value})}
              className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-200 focus:outline-none"
            >
              <option value="assy">assy</option>
              <option value="Packing">Packing</option>
              <option value="Assy">Assy</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">QTY por etiqueta</label>
            <input
              type="number"
              value={formData.cantidad_por_etiqueta}
              onChange={e => setFormData({...formData, cantidad_por_etiqueta: e.target.value})}
              className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-200 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Cliente (LG)</label>
            <select
              value={formData.cliente_lg}
              onChange={e => setFormData({...formData, cliente_lg: e.target.value})}
              className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-200 focus:outline-none"
            >
              <option value="R1">R1</option>
              <option value="R2">R2</option>
              <option value="BOSCH">BOSCH</option>
              <option value="EPS">EPS</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <label className="block text-sm font-semibold text-gray-700 mb-1">Ayuda Visual (link)</label>
            <input
              type="text"
              placeholder="https://..."
              value={formData.ayuda_visual}
              onChange={e => setFormData({...formData, ayuda_visual: e.target.value})}
              className="w-full border border-gray-300 p-2 rounded focus:ring-2 focus:ring-blue-200 focus:outline-none"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-3 border-t pt-4">
          <button
            type="submit"
            className="bg-blue-600 text-white px-5 py-2.5 rounded font-medium hover:bg-blue-700 transition shadow-sm flex items-center gap-2"
          >
            {editing ? '💾 Actualizar Parte' : '➕ Agregar Parte'}
          </button>

          {!editing && (
            <>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".xlsx, .xls"
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className={`px-5 py-2.5 rounded font-medium text-white shadow-sm transition flex items-center gap-2 ${
                  isImporting ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'
                }`}
              >
                {isImporting ? '⏳ Importando...' : '📥 Importar Excel'}
              </button>
            </>
          )}

          {editing && (
            <button
              type="button"
              onClick={() => openQueueModal(partes.find(p => p.numero_parte === editing)!)}
              className="bg-purple-600 text-white px-5 py-2.5 rounded font-medium hover:bg-purple-700 transition shadow-sm flex items-center gap-2"
            >
              🖨️ Añadir a la Cola e Imprimir
            </button>
          )}

          {editing && (
            <button
              type="button"
              onClick={resetForm}
              className="bg-gray-500 text-white px-5 py-2.5 rounded font-medium hover:bg-gray-600 transition shadow-sm flex items-center gap-2 ml-auto"
            >
              ❌ Cancelar Edición
            </button>
          )}
        </div>
      </form>

      {/* BUSCADOR */}
      <div className="relative mb-4">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <span className="text-gray-400">🔍</span>
        </div>
        <input
          type="text"
          placeholder="Buscar por número de parte o descripción..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border border-gray-300 pl-10 p-3 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-200 focus:outline-none"
        />
      </div>

      {/* TABLA */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-gray-200">
            <tr>
              <th className="p-3 text-left font-semibold text-slate-700">N° Parte</th>
              <th className="p-3 text-left font-semibold text-slate-700">Descripción</th>
              <th className="p-3 text-left font-semibold text-slate-700">Línea</th>
              <th className="p-3 text-left font-semibold text-slate-700">ID</th>
              <th className="p-3 text-center font-semibold text-slate-700">QTY</th>
              <th className="p-3 text-center font-semibold text-slate-700">Cliente</th>
              <th className="p-3 text-center font-semibold text-slate-700">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {partesFiltradas.map(parte => (
              <tr key={parte.id} className="border-b last:border-b-0 hover:bg-blue-50/30 transition">
                <td className="p-3 font-mono font-medium text-slate-800">{parte.numero_parte}</td>
                <td className="p-3 text-slate-600">{parte.descripcion}</td>
                <td className="p-3 text-slate-600">{parte.linea}</td>
                <td className="p-3 text-slate-600">{parte.id_interno}</td>
                <td className="p-3 text-center font-semibold">{parte.cantidad_por_etiqueta}</td>
                <td className="p-3 text-center">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold tracking-wide ${
                    parte.cliente_lg === 'BOSCH' ? 'bg-blue-100 text-blue-800'     :
                    parte.cliente_lg === 'EPS'   ? 'bg-purple-100 text-purple-800' :
                    parte.cliente_lg === 'R2'    ? 'bg-green-100 text-green-800'   :
                                                   'bg-gray-100 text-gray-800'
                  }`}>
                    {parte.cliente_lg}
                  </span>
                </td>
                <td className="p-3 text-center space-x-2">
                  <button
                    onClick={() => openQueueModal(parte)}
                    className="text-purple-600 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 p-1.5 rounded transition"
                    title="Añadir a la Cola e Imprimir"
                  >🖨️</button>
                  <button
                    onClick={() => handleEdit(parte)}
                    className="text-blue-600 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 p-1.5 rounded transition"
                    title="Editar"
                  >✏️</button>
                  <button
                    onClick={() => handleDelete(parte.numero_parte)}
                    className="text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 p-1.5 rounded transition"
                    title="Eliminar"
                  >🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {partesFiltradas.length === 0 && (
          <div className="p-10 text-center text-gray-500">
            <span className="text-4xl block mb-2">📦</span>
            No se encontraron partes que coincidan con la búsqueda.
          </div>
        )}
      </div>

      <div className="mt-4 text-sm font-medium text-slate-500 text-right">
        Mostrando {partesFiltradas.length} de {partes.length} partes registradas
      </div>
    </div>
  )
}