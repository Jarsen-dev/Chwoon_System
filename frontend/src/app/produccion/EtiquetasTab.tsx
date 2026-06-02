'use client'

import { useEffect, useState, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import { getInventario, getCola, agregarACola, generarPDF, eliminarDeCola, limpiarCola } from '@/lib/api'
import { InventarioItem, ColaItem } from '@/types'

const normalizarTurno = (turno: string): 'Día' | 'Noche' => {
  const t = (turno || '').trim().toUpperCase()
  if (t === 'D' || t === 'DIA' || t === 'DÍA' || t === 'DIURNO' || t === 'DAY') return 'Día'
  if (t === 'N' || t === 'NOCHE' || t === 'NOCTURNO' || t === 'NIGHT') return 'Noche'
  return 'Día'
}

export default function EtiquetasTab() {
  const { token, username } = useAuth()

  const [inventario, setInventario] = useState<InventarioItem[]>([])
  const [cola, setCola] = useState<ColaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)

  const [selectedCodigo, setSelectedCodigo] = useState<string>('')
  const [cantidad, setCantidad] = useState<string>('1')
  const [turno, setTurno] = useState<'Día' | 'Noche'>('Día')
  const [searchParte, setSearchParte] = useState('')

  const [modalInfo, setModalInfo] = useState<{
    title: string
    message: string
    type: 'success' | 'error' | 'info'
  } | null>(null)
  const [isClearModalOpen, setIsClearModalOpen] = useState(false)

  const okButtonRef = useRef<HTMLButtonElement>(null)

  const inventarioFiltrado = inventario.filter(item => {
    const term = searchParte.toLowerCase()
    return (
      item.codigo.toLowerCase().includes(term) ||
      item.descripcion.toLowerCase().includes(term) ||
      item.linea_lg.toLowerCase().includes(term) ||
      item.linea.toLowerCase().includes(term)
    )
  })

  useEffect(() => {
    if (modalInfo && okButtonRef.current) okButtonRef.current.focus()
  }, [modalInfo])

  useEffect(() => {
    cargarDatos()
  }, [])

  const cargarDatos = async () => {
    try {
      setLoading(true)
      const [inventarioData, colaData] = await Promise.all([
        getInventario(),
        getCola()
      ])
      setInventario(inventarioData)
      setCola(colaData)
    } catch (error: any) {
      setModalInfo({ title: 'Error de Conexión', message: error.message, type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const ejecutarAgregarACola = async (codigo: string) => {
    if (!codigo) {
      setModalInfo({ title: 'Atención', message: 'Por favor selecciona un número de parte.', type: 'info' })
      return
    }
    if (!token) {
      setModalInfo({ title: 'Error', message: 'No hay sesión activa.', type: 'error' })
      return
    }

    try {
      await agregarACola({
        codigo_inventario:  codigo,
        cantidad_etiquetas: parseInt(cantidad) || 1,
        turno:              turno
      }, token)

      setCantidad('1')
      setSelectedCodigo('')
      setSearchParte('')

      const colaActualizada = await getCola()
      setCola(colaActualizada)
    } catch (error: any) {
      setModalInfo({ title: 'Error al Añadir', message: error.message, type: 'error' })
    }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    await ejecutarAgregarACola(selectedCodigo)
  }

  const handleDelete = async (id: number) => {
    try {
      await eliminarDeCola(id)
      const colaActualizada = await getCola()
      setCola(colaActualizada)
    } catch (error: any) {
      setModalInfo({ title: 'Error', message: error.message, type: 'error' })
    }
  }

  const executeClearQueue = async () => {
    try {
      await limpiarCola()
      setCola([])
      setIsClearModalOpen(false)
      setModalInfo({ title: 'Cola Limpia', message: 'Se han eliminado todas las etiquetas de la cola.', type: 'success' })
    } catch (error: any) {
      setModalInfo({ title: 'Error', message: error.message, type: 'error' })
    }
  }

  const handleGeneratePDF = async () => {
    if (cola.length === 0) {
      setModalInfo({ title: 'Cola Vacía', message: 'No hay etiquetas para generar. Añade algunas primero.', type: 'info' })
      return
    }
    if (!token) {
      setModalInfo({ title: 'Error', message: 'No hay sesión activa.', type: 'error' })
      return
    }

    try {
      setIsGenerating(true)
      const blob = await generarPDF(token)

      const url  = window.URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href     = url
      a.download = `lote_etiquetas_${username}_${new Date().toISOString().split('T')[0]}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      setCola([])
      setModalInfo({ title: '¡Éxito!', message: 'El PDF ha sido generado y descargado correctamente.', type: 'success' })
    } catch (error: any) {
      setModalInfo({ title: 'Error al Generar PDF', message: error.message, type: 'error' })
    } finally {
      setIsGenerating(false)
    }
  }

  if (loading) return (
    <div className="p-8 text-center text-xl font-semibold text-gray-400">
      Cargando datos...
    </div>
  )

  return (
    <div className="relative">

      {/* MODAL NOTIFICACIÓN */}
      {modalInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
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
              <p className="text-gray-300 text-base mb-6">{modalInfo.message}</p>
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

      {/* MODAL CONFIRMAR LIMPIEZA */}
      {isClearModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-orange-500 px-6 py-4">
              <h3 className="text-lg font-bold text-white">⚠️ Confirmar Acción</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-300 text-base mb-6">
                ¿Estás seguro de que deseas limpiar <strong>TODA</strong> la cola de impresión?
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setIsClearModalOpen(false)}
                  className="px-5 py-2.5 rounded-lg font-medium text-gray-300 bg-gray-800 hover:bg-gray-700 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={executeClearQueue}
                  className="px-5 py-2.5 rounded-lg font-bold text-white bg-red-600 hover:bg-red-700 shadow-md transition"
                >
                  Sí, Limpiar Cola
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TÍTULO */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-2xl">🖨️</span>
        <h1 className="text-2xl font-bold text-white">Impresión de Etiquetas</h1>
      </div>

      {/* GRID PRINCIPAL */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">

        {/* FORMULARIO */}
        <div className="md:col-span-1">
          <form onSubmit={handleAdd} className="bg-gray-900 p-5 rounded-lg shadow-sm border border-gray-700">
            <h2 className="text-lg font-bold text-gray-300 mb-4 border-b pb-2">Añadir a la Cola</h2>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-300 mb-1">
                No. de Parte / Descripción
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-gray-400 pointer-events-none">🔍</span>
                <input
                  type="text"
                  placeholder="Buscar por código, descripción, línea..."
                  value={searchParte}
                  onChange={e => setSearchParte(e.target.value)}
                  className="w-full border border-gray-600 border-b-0 pl-8 pr-8 py-2 rounded-t-md focus:ring-2 focus:ring-blue-500/40 focus:outline-none bg-gray-800 text-sm"
                />
                {searchParte && (
                  <button
                    type="button"
                    onClick={() => setSearchParte('')}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400 hover:text-gray-400"
                  >✖</button>
                )}
              </div>
              <select
                value={selectedCodigo}
                onChange={e => setSelectedCodigo(e.target.value)}
                onDoubleClick={e => {
                  const value = (e.target as HTMLSelectElement).value
                  if (value) ejecutarAgregarACola(value)
                }}
                className="w-full border border-gray-600 p-2.5 rounded-b-md focus:ring-2 focus:ring-blue-500/40 focus:outline-none bg-gray-800 text-sm cursor-pointer"
                required
                size={5}
              >
                <option value="">-- Seleccionar --</option>
                {inventarioFiltrado.map(item => (
                  <option key={item.codigo} value={item.codigo}>
                    {item.codigo} — {item.descripcion}
                  </option>
                ))}
              </select>

              {selectedCodigo && (() => {
                const item = inventario.find(i => i.codigo === selectedCodigo)
                return item ? (
                  <div className="mt-2 p-2 bg-blue-500/10 rounded text-xs text-blue-400 border border-blue-500/30">
                    <span className="font-semibold">Línea:</span> {item.linea} &nbsp;|&nbsp;
                    <span className="font-semibold">QTY:</span> {item.qtu} &nbsp;|&nbsp;
                    <span className="font-semibold">Cliente:</span> {item.linea_lg}
                  </div>
                ) : null
              })()}

              <p className="text-xs text-gray-400 mt-1 italic">💡 Doble clic o Enter para añadir directo</p>
              <p className="text-xs text-gray-400 mt-1 text-right">{inventarioFiltrado.length} de {inventario.length} partes</p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-300 mb-1">Cantidad de Etiquetas</label>
              <input
                type="number"
                min="1"
                value={cantidad}
                onChange={e => setCantidad(e.target.value)}
                className="w-full border border-gray-600 p-2.5 rounded focus:ring-2 focus:ring-blue-500/40 focus:outline-none bg-gray-800"
                required
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-300 mb-1">Turno</label>
              <select
                value={turno}
                onChange={e => setTurno(e.target.value as 'Día' | 'Noche')}
                className="w-full border border-gray-600 p-2.5 rounded focus:ring-2 focus:ring-blue-500/40 focus:outline-none bg-gray-800"
              >
                <option value="Día">Día</option>
                <option value="Noche">Noche</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 text-white font-medium px-4 py-2.5 rounded hover:bg-blue-700 transition shadow-sm"
            >
              ➡️ Añadir a la Cola
            </button>
          </form>
        </div>

        {/* TABLA */}
        <div className="md:col-span-3">
          <div className="bg-gray-900 p-5 rounded-lg shadow-sm border border-gray-700 h-full">
            <div className="flex justify-between items-center mb-4 border-b pb-3">
              <h2 className="text-lg font-bold text-gray-300">
                Etiquetas en Cola ({cola.length})
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsClearModalOpen(true)}
                  disabled={cola.length === 0}
                  className="bg-gray-800 border border-gray-600 text-gray-300 px-4 py-1.5 rounded font-medium hover:bg-gray-700 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                >
                  🧹 Limpiar Cola
                </button>
                <button
                  onClick={handleGeneratePDF}
                  disabled={cola.length === 0 || isGenerating}
                  className="bg-green-600 text-white px-4 py-1.5 rounded font-bold hover:bg-green-700 transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm flex items-center gap-1"
                >
                  {isGenerating ? '⏳ Generando...' : '📄 Generar PDF'}
                </button>
              </div>
            </div>

            <div className="rounded border border-gray-800">
              <table className="w-full text-sm table-fixed">
                <thead className="bg-gray-800 border-b border-gray-800">
                  <tr>
                    <th className="p-3 text-left   font-semibold text-gray-300 w-36">No. de Parte</th>
                    <th className="p-3 text-left   font-semibold text-gray-300">Descripción</th>
                    <th className="p-3 text-center font-semibold text-gray-300 w-16">Cant.</th>
                    <th className="p-3 text-center font-semibold text-gray-300 w-24">Turno</th>
                    <th className="p-3 text-center font-semibold text-gray-300 w-28">Usuario</th>
                    <th className="p-3 text-center font-semibold text-gray-300 w-16">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {cola.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-10 text-center text-gray-400">
                        <span className="text-3xl block mb-2">📥</span>
                        La cola está vacía. Selecciona un número de parte y añádelo.
                      </td>
                    </tr>
                  ) : (
                    cola.map(item => (
                      <tr key={item.id} className="border-t border-gray-800 hover:bg-blue-500/10 transition">
                        <td className="p-3 font-mono font-bold text-blue-300 break-all">{item.numero_parte}</td>
                        <td className="p-3 text-gray-400 break-words">{item.descripcion}</td>
                        <td className="p-3 text-center text-lg font-bold text-gray-200">{item.cantidad_etiquetas}</td>
                        <td className="p-3 text-center">
                          {(() => {
                            const turnoNorm = normalizarTurno(item.turno)
                            return (
                              <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                                turnoNorm === 'Día'
                                  ? 'bg-yellow-500/20 text-yellow-300'
                                  : 'bg-indigo-100 text-indigo-800'
                              }`}>
                                {turnoNorm === 'Día' ? '☀️' : '🌙'} {turnoNorm}
                              </span>
                            )
                          })()}
                        </td>
                        <td className="p-3 text-center">
                          {item.user ? (
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300">
                              {item.user}
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-800 text-gray-400 italic">
                              Sin asignar
                            </span>
                          )}
                        </td>
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleDelete(item.id!)}
                            className="text-red-500 hover:text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-full w-8 h-8 inline-flex items-center justify-center transition"
                          >✖</button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}