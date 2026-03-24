'use client'

import { useEffect, useState } from 'react'
import { getPartes, getCola, agregarACola, generarPDF, eliminarDeCola, limpiarCola } from '@/lib/api'
import { Parte, ColaItem } from '@/types'

export default function EtiquetasPage() {
  const [partes, setPartes] = useState<Parte[]>([])
  const [cola, setCola] = useState<ColaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)

  // Estado del formulario
  const [selectedParteId, setSelectedParteId] = useState<string>('')
  const [cantidad, setCantidad] = useState<string>('1')
  const [turno, setTurno] = useState<'Día' | 'Noche'>('Día')

  useEffect(() => {
    cargarDatos()
  }, [])

  const cargarDatos = async () => {
    try {
      setLoading(true)
      const [partesData, colaData] = await Promise.all([getPartes(), getCola()])
      setPartes(partesData)
      setCola(colaData)
    } catch (error) {
      alert('Error cargando datos: ' + error)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedParteId) {
      alert('Por favor selecciona un número de parte')
      return
    }

    try {
      await agregarACola({
        parte_id: parseInt(selectedParteId),
        numero_parte: '', // El backend lo ignora, usa el parte_id
        descripcion: '',
        cantidad_etiquetas: parseInt(cantidad) || 1,
        turno: turno
      })
      
      // Limpiar formulario y recargar
      setCantidad('1')
      setSelectedParteId('')
      const colaActualizada = await getCola()
      setCola(colaActualizada)
    } catch (error) {
      alert('Error agregando a la cola: ' + error)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await eliminarDeCola(id)
      const colaActualizada = await getCola()
      setCola(colaActualizada)
    } catch (error) {
      alert('Error eliminando item: ' + error)
    }
  }

  const handleClear = async () => {
    if (!confirm('¿Estás seguro de que deseas limpiar TODA la cola de impresión?')) return
    try {
      await limpiarCola()
      setCola([])
    } catch (error) {
      alert('Error limpiando la cola: ' + error)
    }
  }

  const handleGeneratePDF = async () => {
    if (cola.length === 0) {
      alert('La cola de impresión está vacía.')
      return
    }

    try {
      setIsGenerating(true)
      const blob = await generarPDF()
      
      // Crear URL del Blob y forzar descarga
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `lote_etiquetas_${new Date().toISOString().split('T')[0]}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)

      // Opcional: limpiar la vista de la cola después de generar
      setCola([]) 
      alert('✅ PDF generado y descargado con éxito.')
    } catch (error) {
      alert('Error generando PDF: ' + error)
    } finally {
      setIsGenerating(false)
    }
  }

  if (loading) return <div className="p-4">Cargando...</div>

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">🖨️ Cola de Impresión de Etiquetas</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* PANEL IZQUIERDO: FORMULARIO */}
        <div className="md:col-span-1">
          <form onSubmit={handleAdd} className="bg-white p-4 rounded shadow">
            <h2 className="text-lg font-semibold mb-4 border-b pb-2">Añadir a la Cola</h2>
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">N° Parte / Descripción</label>
              <select
                value={selectedParteId}
                onChange={e => setSelectedParteId(e.target.value)}
                className="w-full border p-2 rounded bg-gray-50"
                required
              >
                <option value="">-- Seleccionar --</option>
                {partes.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.numero_parte} - {p.descripcion}
                  </option>
                ))}
              </select>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad de Etiquetas</label>
              <input
                type="number"
                min="1"
                value={cantidad}
                onChange={e => setCantidad(e.target.value)}
                className="w-full border p-2 rounded bg-gray-50"
                required
               />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Turno</label>
              <select
                value={turno}
                onChange={e => setTurno(e.target.value as 'Día' | 'Noche')}
                className="w-full border p-2 rounded bg-gray-50"
              >
                <option value="Día">Día</option>
                <option value="Noche">Noche</option>
              </select>
            </div>

            <button
              type="submit"
              className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
            >
              ➡️ Añadir a la Cola
            </button>
          </form>
        </div>

        {/* PANEL DERECHO: LISTA Y ACCIONES */}
        <div className="md:col-span-2">
          <div className="bg-white p-4 rounded shadow mb-4">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
              <h2 className="text-lg font-semibold">Etiquetas en Cola ({cola.length})</h2>
              <div className="space-x-2">
                <button
                  onClick={handleClear}
                  disabled={cola.length === 0}
                  className="bg-gray-200 text-gray-700 px-3 py-1 rounded hover:bg-gray-300 disabled:opacity-50"
                >
                  🧹 Limpiar Cola
                </button>
                <button
                  onClick={handleGeneratePDF}
                  disabled={cola.length === 0 || isGenerating}
                  className="bg-green-600 text-white px-4 py-1 rounded hover:bg-green-700 disabled:opacity-50 font-medium shadow-sm"
                >
                  {isGenerating ? '⏳ Generando...' : '📄 Generar PDF'}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="p-2 text-left">N° Parte</th>
                    <th className="p-2 text-left">Descripción</th>
                    <th className="p-2 text-center">Cant.</th>
                    <th className="p-2 text-center">Turno</th>
                    <th className="p-2 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {cola.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-gray-500">
                        La cola está vacía. Selecciona un número de parte y añádelo.
                      </td>
                    </tr>
                  ) : (
                    cola.map((item) => (
                      <tr key={item.id} className="border-t hover:bg-gray-50">
                        <td className="p-2 font-mono font-medium text-blue-800">{item.numero_parte}</td>
                        <td className="p-2 truncate max-w-xs">{item.descripcion}</td>
                        <td className="p-2 text-center font-bold">{item.cantidad_etiquetas}</td>
                        <td className="p-2 text-center">
                          <span className={`px-2 py-0.5 rounded text-xs ${item.turno === 'Día' ? 'bg-yellow-100 text-yellow-800' : 'bg-indigo-100 text-indigo-800'}`}>
                            {item.turno}
                          </span>
                        </td>
                        <td className="p-2 text-center">
                          <button
                            onClick={() => handleDelete(item.id!)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded-full w-6 h-6 inline-flex items-center justify-center"
                            title="Eliminar"
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