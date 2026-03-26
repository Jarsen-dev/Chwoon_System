'use client'

import { useEffect, useState, useRef } from 'react'
import { getPartes, getCola, agregarACola, generarPDF, eliminarDeCola, limpiarCola } from '@/lib/api'
import { Parte, ColaItem } from '@/types'

export default function EtiquetasPage() {
  const [partes, setPartes]           = useState<Parte[]>([])
  const [cola, setCola]               = useState<ColaItem[]>([])
  const [loading, setLoading]         = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)

  // Formulario
  const [selectedParteId, setSelectedParteId] = useState<string>('')
  const [cantidad, setCantidad]               = useState<string>('1')
  const [turno, setTurno]                     = useState<'Día' | 'Noche'>('Día')

  // ✅ Buscador de partes
  const [searchParte, setSearchParte] = useState('')

  // Modales
  const [modalInfo, setModalInfo]           = useState<{
    title: string
    message: string
    type: 'success' | 'error' | 'info'
  } | null>(null)
  const [isClearModalOpen, setIsClearModalOpen] = useState(false)

  const okButtonRef = useRef<HTMLButtonElement>(null)

  // ==========================================
  // PARTES FILTRADAS (buscador reactivo)
  // ==========================================
  const partesFiltradas = partes.filter(p => {
    const term = searchParte.toLowerCase()
    return (
      p.numero_parte.toLowerCase().includes(term) ||
      p.descripcion.toLowerCase().includes(term)
    )
  })

  // ── Auto-focus botón OK del modal ──
  useEffect(() => {
    if (modalInfo && okButtonRef.current) {
      okButtonRef.current.focus()
    }
  }, [modalInfo])

  useEffect(() => {
    cargarDatos()
  }, [])

  // ==========================================
  // CARGA DE DATOS
  // ==========================================
  const cargarDatos = async () => {
    try {
      setLoading(true)
      const [partesData, colaData] = await Promise.all([getPartes(), getCola()])
      setPartes(partesData)
      setCola(colaData)
    } catch (error: any) {
      setModalInfo({
        title: 'Error de Conexión',
        message: error.message,
        type: 'error'
      })
    } finally {
      setLoading(false)
    }
  }

  // ==========================================
  // HANDLERS
  // ==========================================
  const ejecutarAgregarACola = async (parteId: string) => {
  if (!parteId) {
    setModalInfo({
      title: 'Atención',
      message: 'Por favor selecciona un número de parte.',
      type: 'info'
    })
    return
  }

  try {
    await agregarACola({
      parte_id: parseInt(parteId),
      numero_parte: '',
      descripcion: '',
      cantidad_etiquetas: parseInt(cantidad) || 1,
      turno: turno
    })

    // Limpiar formulario
    setCantidad('1')
    setSelectedParteId('')
    setSearchParte('')

    const colaActualizada = await getCola()
    setCola(colaActualizada)
  } catch (error: any) {
    setModalInfo({
      title: 'Error al Añadir',
      message: error.message,
      type: 'error'
    })
  }
}

// Form submit llama a la función separada
const handleAdd = async (e: React.FormEvent) => {
  e.preventDefault()
  await ejecutarAgregarACola(selectedParteId)
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
      setModalInfo({
        title: 'Cola Limpia',
        message: 'Se han eliminado todas las etiquetas de la cola.',
        type: 'success'
      })
    } catch (error: any) {
      setModalInfo({ title: 'Error', message: error.message, type: 'error' })
    }
  }

  const handleGeneratePDF = async () => {
    if (cola.length === 0) {
      setModalInfo({
        title: 'Cola Vacía',
        message: 'No hay etiquetas para generar. Añade algunas primero.',
        type: 'info'
      })
      return
    }

    try {
      setIsGenerating(true)
      const blob = await generarPDF()

      const url = window.URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href    = url
      a.download = `lote_etiquetas_${new Date().toISOString().split('T')[0]}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      setCola([])
      setModalInfo({
        title: '¡Éxito!',
        message: 'El PDF ha sido generado y descargado correctamente.',
        type: 'success'
      })
    } catch (error: any) {
      setModalInfo({
        title: 'Error al Generar PDF',
        message: error.message,
        type: 'error'
      })
    } finally {
      setIsGenerating(false)
    }
  }

  // ==========================================
  // LOADING
  // ==========================================
  if (loading) return (
    <div className="p-8 text-center text-xl font-semibold text-gray-600">
      Cargando datos...
    </div>
  )

  // ==========================================
  // RENDER
  // ==========================================
  return (
    <div className="p-4 max-w-5xl mx-auto relative">

      {/* ======================================================= */}
      {/* MODAL: NOTIFICACIÓN                                      */}
      {/* ======================================================= */}
      {modalInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">

            {/* Header */}
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

            {/* Body */}
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

      {/* ======================================================= */}
      {/* MODAL: CONFIRMAR LIMPIEZA                               */}
      {/* ======================================================= */}
      {isClearModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">

            {/* Header */}
            <div className="bg-orange-500 px-6 py-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                ⚠️ Confirmar Acción
              </h3>
            </div>

            {/* Body */}
            <div className="p-6">
              <p className="text-gray-700 text-base mb-6">
                ¿Estás seguro de que deseas limpiar <strong>TODA</strong> la cola
                de impresión? Se perderán las etiquetas no generadas.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setIsClearModalOpen(false)}
                  className="px-5 py-2.5 rounded-lg font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition"
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

      {/* ======================================================= */}
      {/* TÍTULO                                                   */}
      {/* ======================================================= */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-2xl">🖨️</span>
        <h1 className="text-2xl font-bold text-slate-800">Cola de Impresión de Etiquetas</h1>
      </div>

      {/* ======================================================= */}
      {/* GRID PRINCIPAL                                           */}
      {/* ======================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* ─────────────────────────────────────────────────────── */}
        {/* PANEL IZQUIERDO: FORMULARIO                            */}
        {/* ─────────────────────────────────────────────────────── */}
        <div className="md:col-span-1">
          <form
            onSubmit={handleAdd}
            className="bg-white p-5 rounded-lg shadow-sm border border-gray-200"
          >
            <h2 className="text-lg font-bold text-gray-700 mb-4 border-b pb-2">
              Añadir a la Cola
            </h2>

            {/* N° Parte / Descripción */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                N° Parte / Descripción
              </label>

              {/* ✅ Buscador */}
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-gray-400 pointer-events-none">
                  🔍
                </span>
                <input
                  type="text"
                  placeholder="Buscar por N° parte o descripción..."
                  value={searchParte}
                  onChange={e => setSearchParte(e.target.value)}
                  className="w-full border border-gray-300 border-b-0 pl-8 pr-8 py-2 rounded-t-md focus:ring-2 focus:ring-blue-200 focus:outline-none bg-gray-50 text-sm"
                />
                {/* Botón limpiar */}
                {searchParte && (
                  <button
                    type="button"
                    onClick={() => setSearchParte('')}
                    className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-gray-400 hover:text-gray-600 transition"
                  >
                    ✖
                  </button>
                )}
              </div>

              {/* ✅ Select filtrado como lista */}
              <select
                value={selectedParteId}
                onChange={e => setSelectedParteId(e.target.value)}
                onDoubleClick={e => {
                  // Leer el valor del option clickeado directamente del DOM
                  const value = (e.target as HTMLSelectElement).value
                  if (value) ejecutarAgregarACola(value)
                }}
                className="w-full border border-gray-300 p-2.5 rounded-b-md focus:ring-2 focus:ring-blue-200 focus:outline-none bg-gray-50 text-sm cursor-pointer"
                required
                size={5}
              >
                <option value="">-- Seleccionar --</option>
                {partesFiltradas.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.numero_parte} — {p.descripcion}
                  </option>
                ))}
              </select>

              {/* Hint de doble clic */}
              <p className="text-xs text-gray-400 mt-1 flex justify-between">
                <span className="italic">💡 Doble clic o Enter para añadir directo</span>
              </p>

              {/* Contador */}
              <p className="text-xs text-gray-400 mt-1 text-right">
                {partesFiltradas.length} de {partes.length} partes
              </p>
            </div>

            {/* Cantidad */}
            <div className="mb-4">
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Cantidad de Etiquetas
              </label>
              <input
                type="number"
                min="1"
                value={cantidad}
                onChange={e => setCantidad(e.target.value)}
                className="w-full border border-gray-300 p-2.5 rounded focus:ring-2 focus:ring-blue-200 focus:outline-none bg-gray-50"
                required
              />
            </div>

            {/* Turno */}
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Turno
              </label>
              <select
                value={turno}
                onChange={e => setTurno(e.target.value as 'Día' | 'Noche')}
                className="w-full border border-gray-300 p-2.5 rounded focus:ring-2 focus:ring-blue-200 focus:outline-none bg-gray-50"
              >
                <option value="Día">Día</option>
                <option value="Noche">Noche</option>
              </select>
            </div>

            {/* Botón añadir */}
            <button
              type="submit"
              className="w-full bg-blue-600 text-white font-medium px-4 py-2.5 rounded hover:bg-blue-700 transition shadow-sm"
            >
              ➡️ Añadir a la Cola
            </button>
          </form>
        </div>

        {/* ─────────────────────────────────────────────────────── */}
        {/* PANEL DERECHO: LISTA Y ACCIONES                        */}
        {/* ─────────────────────────────────────────────────────── */}
        <div className="md:col-span-2">
          <div className="bg-white p-5 rounded-lg shadow-sm border border-gray-200 h-full">

            {/* Header del panel */}
            <div className="flex justify-between items-center mb-4 border-b pb-3">
              <h2 className="text-lg font-bold text-gray-700">
                Etiquetas en Cola ({cola.length})
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setIsClearModalOpen(true)}
                  disabled={cola.length === 0}
                  className="bg-gray-100 border border-gray-300 text-gray-700 px-4 py-1.5 rounded font-medium hover:bg-gray-200 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
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

            {/* Tabla */}
            <div className="overflow-x-auto rounded border border-gray-100">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-gray-100">
                  <tr>
                    <th className="p-3 text-left   font-semibold text-gray-700">N° Parte</th>
                    <th className="p-3 text-left   font-semibold text-gray-700">Descripción</th>
                    <th className="p-3 text-center font-semibold text-gray-700">Cant.</th>
                    <th className="p-3 text-center font-semibold text-gray-700">Turno</th>
                    <th className="p-3 text-center font-semibold text-gray-700">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {cola.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-10 text-center text-gray-500">
                        <span className="text-3xl block mb-2">📥</span>
                        La cola está vacía. Selecciona un número de parte y añádelo.
                      </td>
                    </tr>
                  ) : (
                    cola.map(item => (
                      <tr
                        key={item.id}
                        className="border-t border-gray-100 hover:bg-blue-50/50 transition"
                      >
                        {/* N° Parte */}
                        <td className="p-3 font-mono font-bold text-blue-800">
                          {item.numero_parte}
                        </td>

                        {/* Descripción */}
                        <td className="p-3 text-gray-600 truncate max-w-xs">
                          {item.descripcion}
                        </td>

                        {/* Cantidad */}
                        <td className="p-3 text-center text-lg font-bold text-slate-700">
                          {item.cantidad_etiquetas}
                        </td>

                        {/* Turno */}
                        <td className="p-3 text-center">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                            item.turno === 'Día'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-indigo-100 text-indigo-800'
                          }`}>
                            {item.turno}
                          </span>
                        </td>

                        {/* Acción */}
                        <td className="p-3 text-center">
                          <button
                            onClick={() => handleDelete(item.id!)}
                            className="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-full w-8 h-8 inline-flex items-center justify-center transition"
                            title="Eliminar de la cola"
                          >
                            ✖
                          </button>
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