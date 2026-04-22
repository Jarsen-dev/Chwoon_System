'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { OrdenProduccion as OrdenProduccionType, ProductoItem } from '@/types'
import {
  getOrdenesProduccion,
  iniciarInyeccion,
  registrarPiezaInyeccion,
  finalizarInyeccion,
  getProductos,
  surtirMaterialPendiente,
} from '@/lib/api'

export default function InyeccionTab() {
  const { token, username } = useAuth()
  const [ordenes, setOrdenes] = useState<OrdenProduccionType[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [productos, setProductos] = useState<ProductoItem[]>([])

  // Form
  const [formSku, setFormSku] = useState('')
  const [formCantidad, setFormCantidad] = useState('')
  const [formCarrito, setFormCarrito] = useState('')
  const [formLinea, setFormLinea] = useState('')

  const cargar = async () => {
    if (!token) return
    setLoading(true)
    try {
      const data = await getOrdenesProduccion(token, { clase: 'INYECCION', limite: 100 })
      setOrdenes(data)
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message })
    } finally {
      setLoading(false)
    }
  }

  const cargarProductos = async () => {
    try {
      const prods = await getProductos()
      // Productos que tienen componente RESINA en BOM (candidatos inyección)
      setProductos(prods.filter(p =>
        (p.clase_producto || '').toUpperCase() === 'INYECCIÓN' ||
        (p.clase_producto || '').toUpperCase() === 'INYECCION'
      ))
    } catch { }
  }

  useEffect(() => { cargar(); cargarProductos() }, [token])

  useEffect(() => {
    if (mensaje) {
      const t = setTimeout(() => setMensaje(null), 8000)
      return () => clearTimeout(t)
    }
  }, [mensaje])

  const handleIniciar = async () => {
    if (!token || !formSku || !formCantidad) {
      setMensaje({ tipo: 'error', texto: 'Selecciona producto y cantidad' })
      return
    }
    try {
      const res = await iniciarInyeccion(token, {
        sku_producto: formSku,
        cantidad_a_producir: parseFloat(formCantidad),
        cantidad_carrito: formCarrito ? parseFloat(formCarrito) : 0,
        operador: username || 'N/A',
        linea_produccion: formLinea || undefined,
      })
      setMensaje({ tipo: 'ok', texto: res.message })
      setShowForm(false)
      setFormSku(''); setFormCantidad(''); setFormCarrito(''); setFormLinea('')
      cargar()
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message })
    }
  }

  const handlePieza = async (opId: string) => {
    if (!token) return
    try {
      const res = await registrarPiezaInyeccion(token, opId)
      if (res.carrito_completado) {
        setMensaje({ tipo: 'ok', texto: `🎉 Carrito #${res.numero_carrito} completado! Total: ${res.cantidad_producida}` })
      }
      cargar()
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message })
    }
  }

  const handleFinalizar = async (opId: string) => {
    if (!token) return
    if (!confirm(`¿Finalizar orden ${opId}?`)) return
    try {
      const res = await finalizarInyeccion(token, opId)
      setMensaje({ tipo: 'ok', texto: res.message })
      cargar()
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message })
    }
  }

  const handleSurtir = async (opId: string) => {
    if (!token) return
    try {
      const res = await surtirMaterialPendiente(token, opId)
      setMensaje({ tipo: 'ok', texto: res.message })
      cargar()
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message })
    }
  }

  const activas = ordenes.filter(o => o.status !== 'Finalizado')
  const finalizadas = ordenes.filter(o => o.status === 'Finalizado')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">💉 Inyección</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowForm(!showForm)}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            {showForm ? '✕ Cancelar' : '➕ Nueva Orden'}
          </button>
          <button onClick={cargar} disabled={loading}
            className="bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg text-sm font-medium text-gray-700">
            🔄
          </button>
        </div>
      </div>

      {mensaje && (
        <div className={`p-3 rounded-lg text-sm font-medium ${
          mensaje.tipo === 'ok' ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>{mensaje.texto}</div>
      )}

      {/* Formulario */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h3 className="font-semibold text-gray-700">Nueva Orden de Inyección</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Producto</label>
              <select value={formSku} onChange={e => setFormSku(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">Seleccionar...</option>
                {productos.map(p => (
                  <option key={p.sku} value={p.sku}>{p.sku} — {p.nombre}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Cantidad a Producir</label>
              <input type="number" value={formCantidad} onChange={e => setFormCantidad(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" min="1" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Cantidad por Carrito</label>
              <input type="number" value={formCarrito} onChange={e => setFormCarrito(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" min="0"
                placeholder="0 = sin carritos" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Línea Producción</label>
              <input value={formLinea} onChange={e => setFormLinea(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Ej: LINEA-1" />
            </div>
          </div>
          <button onClick={handleIniciar}
            className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg text-sm font-medium">
            🚀 Iniciar Orden
          </button>
        </div>
      )}

      {/* Órdenes Activas */}
      <div>
        <h3 className="font-semibold text-gray-700 mb-3">🟢 Activas ({activas.length})</h3>
        {activas.length === 0 ? (
          <p className="text-gray-400 text-sm py-4">No hay órdenes activas</p>
        ) : (
          <div className="space-y-3">
            {activas.map(op => {
              const pct = op.cantidad_a_producir > 0
                ? Math.min(100, Math.round((op.cantidad_producida / op.cantidad_a_producir) * 100))
                : 0
              const isPendiente = op.status === 'Pendiente Material'
              return (
                <div key={op.op_id} className={`bg-white rounded-xl border p-4 ${
                  isPendiente ? 'border-yellow-300 bg-yellow-50/50' : 'border-gray-200'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="font-mono font-bold text-purple-600">{op.op_id}</span>
                      <span className="ml-3 text-sm text-gray-600">{op.nombre_producto || op.sku_producto}</span>
                      {isPendiente && (
                        <span className="ml-2 px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-semibold">
                          ⏳ Pendiente Material
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {isPendiente ? (
                        <button onClick={() => handleSurtir(op.op_id)}
                          className="bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1.5 rounded-lg text-xs font-medium">
                          ✅ Surtir Material
                        </button>
                      ) : (
                        <>
                          <button onClick={() => handlePieza(op.op_id)}
                            className="bg-purple-100 hover:bg-purple-200 text-purple-700 px-3 py-1.5 rounded-lg text-xs font-medium">
                            ➕ Pieza
                          </button>
                          <button onClick={() => handleFinalizar(op.op_id)}
                            className="bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1.5 rounded-lg text-xs font-medium">
                            ✅ Finalizar
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gray-100 rounded-full h-3">
                      <div className="bg-purple-500 h-3 rounded-full transition-all"
                        style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm font-medium text-gray-700 w-36 text-right">
                      {Math.round(op.cantidad_producida)} / {Math.round(op.cantidad_a_producir)} ({pct}%)
                    </span>
                  </div>

                  <div className="mt-2 text-xs text-gray-500 flex gap-4">
                    <span>Línea: {op.linea_produccion || '—'}</span>
                    <span>Operador: {op.operador || '—'}</span>
                    {op.cantidad_carrito > 0 && (
                      <span>Carrito: {Math.round(op.cantidad_carrito)} pz</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Finalizadas */}
      {finalizadas.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-700 mb-3">✅ Finalizadas ({finalizadas.length})</h3>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left text-gray-600">OP ID</th>
                  <th className="px-4 py-2 text-left text-gray-600">Producto</th>
                  <th className="px-4 py-2 text-right text-gray-600">Producido</th>
                  <th className="px-4 py-2 text-left text-gray-600">Lote Inventario</th>
                  <th className="px-4 py-2 text-left text-gray-600">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {finalizadas.slice(0, 20).map(op => (
                  <tr key={op.op_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-purple-600">{op.op_id}</td>
                    <td className="px-4 py-2">{op.nombre_producto || op.sku_producto}</td>
                    <td className="px-4 py-2 text-right font-medium">{Math.round(op.cantidad_producida)} pz</td>
                    <td className="px-4 py-2 font-mono text-xs">{op.lote_inventario_generado || '—'}</td>
                    <td className="px-4 py-2 text-xs text-gray-500">
                      {op.fecha_fin ? new Date(op.fecha_fin).toLocaleString('es-MX') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}