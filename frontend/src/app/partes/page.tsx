'use client'

import { useEffect, useState, useRef } from 'react' // Agregar useRef
import { getPartes, createParte, updateParte, deleteParte, importarExcelPartes } from '@/lib/api' // Agregar importarExcelPartes

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

export default function PartesPage() {
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

  // ---> NUEVO CÓDIGO AQUÍ <---
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isImporting, setIsImporting] = useState(false)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    try {
      const result = await importarExcelPartes(file)
      alert(`✅ Se importaron/actualizaron ${result.count} partes con éxito.`)
      loadPartes() // Recargar la tabla
    } catch (error: any) {
      alert(`❌ Error: ${error.message}`)
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = '' // limpiar input
    }
  }
  // ---> FIN NUEVO CÓDIGO <---

  useEffect(() => {
    loadPartes()
  }, [])

  const loadPartes = async () => {
    try {
      const data = await getPartes()
      setPartes(data)
    } catch (error) {
      alert('Error cargando partes: ' + error)
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
        setEditing(null)
      } else {
        await createParte(formData)
      }
      setFormData({
        numero_parte: '',
        descripcion: '',
        linea: '',
        id_interno: 'assy',
        cantidad_por_etiqueta: '45',
        cliente_lg: 'R1',
        ayuda_visual: ''
      })
      loadPartes()
    } catch (error) {
      alert('Error guardando: ' + error)
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
  }

  const handleDelete = async (numero_parte: string) => {
    if (!confirm(`¿Eliminar ${numero_parte}?`)) return
    try {
      await deleteParte(numero_parte)
      loadPartes()
    } catch (error) {
      alert('Error eliminando: ' + error)
    }
  }

  const partesFiltradas = partes.filter(p => 
    p.numero_parte.toLowerCase().includes(search.toLowerCase()) ||
    p.descripcion.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) return <div className="p-4">Cargando...</div>

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">⚙️ Gestión de Partes</h1>
      
      <form onSubmit={handleSubmit} className="bg-white p-4 rounded shadow mb-6">
        <h2 className="text-lg font-semibold mb-3">
          {editing ? 'Editar Parte' : 'Nueva Parte'}
        </h2>
        
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="N° Parte"
            value={formData.numero_parte}
            onChange={e => setFormData({...formData, numero_parte: e.target.value})}
            className="border p-2 rounded"
            required
            disabled={!!editing}
          />
          <input
            type="text"
            placeholder="Descripción"
            value={formData.descripcion}
            onChange={e => setFormData({...formData, descripcion: e.target.value})}
            className="border p-2 rounded"
            required
          />
          <input
            type="text"
            placeholder="Línea (máquina)"
            value={formData.linea}
            onChange={e => setFormData({...formData, linea: e.target.value})}
            className="border p-2 rounded"
          />
          <select
            value={formData.id_interno}
            onChange={e => setFormData({...formData, id_interno: e.target.value})}
            className="border p-2 rounded"
          >
            <option value="assy">assy</option>
            <option value="Packing">Packing</option>
            <option value="Assy">Assy</option>
          </select>
          <input
            type="text"
            placeholder="QTY por etiqueta"
            value={formData.cantidad_por_etiqueta}
            onChange={e => setFormData({...formData, cantidad_por_etiqueta: e.target.value})}
            className="border p-2 rounded"
          />
          <select
            value={formData.cliente_lg}
            onChange={e => setFormData({...formData, cliente_lg: e.target.value})}
            className="border p-2 rounded"
          >
            <option value="R1">R1</option>
            <option value="R2">R2</option>
            <option value="BOSCH">BOSCH</option>
          </select>
        </div>
        
        <div className="mt-3 flex gap-2">
          <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
            {editing ? '💾 Actualizar' : '➕ Agregar'}
          </button>
          
          {/* ---> NUEVO BOTÓN EXCEL <--- */}
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
            className={`px-4 py-2 rounded text-white ${isImporting ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
          >
            {isImporting ? '⏳ Importando...' : '📥 Importar Excel'}
          </button>
          {/* ---> FIN NUEVO BOTÓN <--- */}

          {editing && (
            <button 
              type="button" 
              onClick={() => { /* ... código de cancelar ... */ }}
            >
              Cancelar
            </button>
          )}
        </div>
      </form>

      <input
        type="text"
        placeholder="🔍 Buscar parte..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full border p-2 rounded mb-4"
      />

      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 text-left">N° Parte</th>
              <th className="p-3 text-left">Descripción</th>
              <th className="p-3 text-left">Línea</th>
              <th className="p-3 text-left">ID</th>
              <th className="p-3 text-left">QTY</th>
              <th className="p-3 text-left">Cliente</th>
              <th className="p-3 text-left">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {partesFiltradas.map(parte => (
              <tr key={parte.id} className="border-t hover:bg-gray-50">
                <td className="p-3 font-mono">{parte.numero_parte}</td>
                <td className="p-3">{parte.descripcion}</td>
                <td className="p-3">{parte.linea}</td>
                <td className="p-3">{parte.id_interno}</td>
                <td className="p-3">{parte.cantidad_por_etiqueta}</td>
                <td className="p-3">
                  <span className={`px-2 py-1 rounded text-sm ${
                    parte.cliente_lg === 'BOSCH' ? 'bg-blue-100 text-blue-800' :
                    parte.cliente_lg === 'R2' ? 'bg-green-100 text-green-800' :
                    'bg-gray-100'
                  }`}>
                    {parte.cliente_lg}
                  </span>
                </td>
                <td className="p-3">
                  <button 
                    onClick={() => handleEdit(parte)}
                    className="text-blue-600 hover:text-blue-800 mr-3"
                  >
                    ✏️
                  </button>
                  <button 
                    onClick={() => handleDelete(parte.numero_parte)}
                    className="text-red-600 hover:text-red-800"
                  >
                    🗑️
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {partesFiltradas.length === 0 && (
          <div className="p-8 text-center text-gray-500">
            No se encontraron partes
          </div>
        )}
      </div>
      
      <div className="mt-4 text-gray-600">
        Total: {partes.length} partes | Mostrando: {partesFiltradas.length}
      </div>
    </div>
  )
}