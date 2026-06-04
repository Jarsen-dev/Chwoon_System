'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { OrdenProduccion as OrdenProduccionType, ProductoItem } from '@/types'
import {
  getOrdenesProduccion,
  iniciarAssy,
  registrarPiezaAssy,
  finalizarAssy,
  getProductos,
  surtirMaterialPendiente,
} from '@/lib/api'

export default function EnsambleTab() {
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
  const [formUPH, setFormUPH] = useState('')
  const [formMetodo, setFormMetodo] = useState('')

  // Detalle de faltantes al crear
  const [faltantes, setFaltantes] = useState<any[] | null>(null)

  const cargar = async () => {
    if (!token) return
    setLoading(true)
    try {
      const data = await getOrdenesProduccion(token, { clase: 'ASSY', limite: 100 })
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
      setProductos(prods.filter(p =>
        (p.clase_producto || '').toUpperCase() === 'ASSY' &&
        (p.tipo || '').toUpperCase() === 'PRODUCTO FINAL'
      ))
    } catch { }
  }

  useEffect(() => { cargar(); cargarProductos() }, [token])

  useEffect(() => {
    if (mensaje) {
      const t = setTimeout(() => setMensaje(null), 10000)
      return () => clearTimeout(t)
    }
  }, [mensaje])

  const handleIniciar = async () => {
    if (!token || !formSku || !formCantidad) {
      setMensaje({ tipo: 'error', texto: 'Selecciona producto y cantidad' })
      return
    }
    setFaltantes(null)
    try {
      const res = await iniciarAssy(token, {
        sku_producto: formSku,
        cantidad_a_producir: parseFloat(formCantidad),
        cantidad_carrito: formCarrito ? parseFloat(formCarrito) : 0,
        operador: username || 'N/A',
        linea_produccion: formLinea || undefined,
        uph_esperado: formUPH ? parseFloat(formUPH) : 0,
        metodo_conteo: formMetodo || undefined,
      })
      setMensaje({ tipo: 'ok', texto: res.message })

      if (res.componentes_faltantes && res.componentes_faltantes.length > 0) {
        setFaltantes(res.componentes_faltantes)
      } else {
        setShowForm(false)
        setFormSku(''); setFormCantidad(''); setFormCarrito(''); setFormLinea('')
        setFormUPH(''); setFormMetodo('')
      }
      cargar()
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message })
    }
  }

  const handlePieza = async (opId: string) => {
    if (!token) return
    try {
      const res = await registrarPiezaAssy(token, opId)
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
      const res = await finalizarAssy(token, opId)
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

  const productoSeleccionado = productos.find(p => p.sku === formSku)
  const activas = ordenes.filter(o => o.status !== 'Finalizado')
  const finalizadas = ordenes.filter(o => o.status === 'Finalizado')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-100">🔧 Ensamble (ASSY)</h2>
        <div className="flex gap-2">
          <button onClick={() => { setShowForm(!showForm); setFaltantes(null) }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            {showForm ? '✕ Cancelar' : '➕ Nueva Orden'}
          </button>
          <button onClick={cargar} disabled={loading}
            className="bg-gray-800 hover:bg-gray-700 px-4 py-2 rounded-lg text-sm font-medium text-gray-300">
            🔄
          </button>
        </div>
      </div>

      {mensaje && (
        <div className={`p-3 rounded-lg text-sm font-medium ${
          mensaje.tipo === 'ok' ? 'bg-green-500/10 text-green-400 border border-green-500/30'
            : 'bg-red-500/10 text-red-400 border border-red-500/30'
        }`}>{mensaje.texto}</div>
      )}

      {/* Formulario */}
      {showForm && (
        <div className="bg-gray-900 rounded-xl border border-gray-700 p-6 space-y-4">
          <h3 className="font-semibold text-gray-300">Nueva Orden de Ensamble</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Producto Final</label>
              <select value={formSku} onChange={e => setFormSku(e.target.value)}
                className="w-full bg-gray-800 text-white border border-gray-600 rounded-lg px-3 py-2 text-sm">
                <option value="">Seleccionar...</option>
                {productos.map(p => (
                  <option key={p.sku} value={p.sku}>{p.sku} — {p.modelo}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Cantidad a Producir</label>
              <input type="number" value={formCantidad} onChange={e => setFormCantidad(e.target.value)}
                className="w-full bg-gray-800 text-white border border-gray-600 rounded-lg px-3 py-2 text-sm" min="1" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Cantidad por Carrito</label>
              <input type="number" value={formCarrito} onChange={e => setFormCarrito(e.target.value)}
                className="w-full bg-gray-800 text-white border border-gray-600 rounded-lg px-3 py-2 text-sm" min="0"
                placeholder="0 = sin carritos" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Línea Producción</label>
              <input value={formLinea} onChange={e => setFormLinea(e.target.value)}
                className="w-full bg-gray-800 text-white border border-gray-600 rounded-lg px-3 py-2 text-sm"
                placeholder="Ej: LINEA-A1" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">UPH Esperado</label>
              <input type="number" value={formUPH} onChange={e => setFormUPH(e.target.value)}
                className="w-full bg-gray-800 text-white border border-gray-600 rounded-lg px-3 py-2 text-sm" min="0"
                placeholder="Unidades/hora" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-400 mb-1">Método de Conteo</label>
              <select value={formMetodo} onChange={e => setFormMetodo(e.target.value)}
                className="w-full bg-gray-800 text-white border border-gray-600 rounded-lg px-3 py-2 text-sm">
                <option value="">Seleccionar...</option>
                <option value="Scanner">Scanner</option>
                <option value="Manual">Manual</option>
                <option value="Sensor">Sensor</option>
              </select>
            </div>
          </div>

          {/* BOM Preview */}
          {productoSeleccionado && productoSeleccionado.bom && productoSeleccionado.bom.length > 0 && (
            <div className="bg-gray-800 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-400 mb-2">📋 BOM — Lista de Materiales</h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 text-xs">
                    <th className="text-left pb-1">SKU Componente</th>
                    <th className="text-right pb-1">Cantidad/Unidad</th>
                    {formCantidad && <th className="text-right pb-1">Total Requerido</th>}
                  </tr>
                </thead>
                <tbody>
                  {productoSeleccionado.bom.map((b, i) => (
                    <tr key={i} className="border-t border-gray-700">
                      <td className="py-1 font-mono">{b.sku_componente}</td>
                      <td className="py-1 text-right">{b.cantidad}</td>
                      {formCantidad && (
                        <td className="py-1 text-right font-medium">
                          {Math.ceil(parseFloat(formCantidad) * b.cantidad)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Faltantes */}
          {faltantes && faltantes.length > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-yellow-300 mb-2">⚠️ Componentes Faltantes</h4>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-yellow-400 text-xs">
                    <th className="text-left pb-1">SKU</th>
                    <th className="text-right pb-1">Requerido</th>
                    <th className="text-right pb-1">Disponible</th>
                    <th className="text-right pb-1">Faltante</th>
                  </tr>
                </thead>
                <tbody>
                  {faltantes.map((f: any, i: number) => (
                    <tr key={i} className="border-t border-yellow-500/30">
                      <td className="py-1 font-mono">{f.sku}</td>
                      <td className="py-1 text-right">{f.requerido}</td>
                      <td className="py-1 text-right">{f.disponible}</td>
                      <td className="py-1 text-right font-bold text-red-400">{f.faltante}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-yellow-400 mt-2">La orden fue creada como "Pendiente Material".</p>
            </div>
          )}

          <button onClick={handleIniciar}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg text-sm font-medium">
            🚀 Iniciar Orden
          </button>
        </div>
      )}

      {/* Órdenes Activas */}
      <div>
        <h3 className="font-semibold text-gray-300 mb-3">🟢 Activas ({activas.length})</h3>
        {activas.length === 0 ? (
          <p className="text-gray-400 text-sm py-4">No hay órdenes activas</p>
        ) : (
          <div className="space-y-3">
            {activas.map(op => {
              const pct = op.cantidad_a_producir > 0
                ? Math.min(100, Math.round((op.cantidad_producida / op.cantidad_a_producir) * 100))
                : 0
              const isPendiente = op.status === 'Pendiente Material'
              const tieneParo = (op.paros || []).some((p: any) => p.status === 'Activo')

              return (
                <div key={op.op_id} className={`bg-gray-900 rounded-xl border p-4 ${
                  isPendiente ? 'border-yellow-500/40 bg-yellow-500/10'
                    : tieneParo ? 'border-red-500/40 bg-red-500/10'
                    : 'border-gray-700'
                }`}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="font-mono font-bold text-blue-400">{op.op_id}</span>
                      <span className="ml-3 text-sm text-gray-400">{op.nombre_producto || op.sku_producto}</span>
                      {isPendiente && (
                        <span className="ml-2 px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full text-xs font-semibold">
                          ⏳ Pendiente Material
                        </span>
                      )}
                      {tieneParo && (
                        <span className="ml-2 px-2 py-0.5 bg-red-500/20 text-red-400 rounded-full text-xs font-semibold">
                          ⏸️ En Paro
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {isPendiente ? (
                        <button onClick={() => handleSurtir(op.op_id)}
                          className="bg-green-500/20 hover:bg-green-500/30 text-green-400 px-3 py-1.5 rounded-lg text-xs font-medium">
                          ✅ Surtir Material
                        </button>
                      ) : (
                        <>
                          <button onClick={() => handlePieza(op.op_id)}
                            className="bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 px-3 py-1.5 rounded-lg text-xs font-medium"
                            disabled={tieneParo}>
                            ➕ Pieza
                          </button>
                          <button onClick={() => handleFinalizar(op.op_id)}
                            className="bg-green-500/20 hover:bg-green-500/30 text-green-400 px-3 py-1.5 rounded-lg text-xs font-medium">
                            ✅ Finalizar
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Barra progreso */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gray-800 rounded-full h-3">
                      <div className={`h-3 rounded-full transition-all ${
                        pct >= 100 ? 'bg-green-500' : 'bg-blue-500'
                      }`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm font-medium text-gray-300 w-36 text-right">
                      {Math.round(op.cantidad_producida)} / {Math.round(op.cantidad_a_producir)} ({pct}%)
                    </span>
                  </div>

                  <div className="mt-2 text-xs text-gray-400 flex gap-4 flex-wrap">
                    <span>Línea: {op.linea_produccion || '—'}</span>
                    <span>Operador: {op.operador || '—'}</span>
                    {op.cantidad_carrito > 0 && (
                      <span>Carrito: {Math.round(op.cantidad_carrito)} pz</span>
                    )}
                    {op.uph_esperado > 0 && (
                      <span>UPH: {op.uph_esperado}</span>
                    )}
                    {(op.material_consumido || []).length > 0 && (
                      <span>Componentes: {(op.material_consumido || []).length} lotes</span>
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
          <h3 className="font-semibold text-gray-300 mb-3">✅ Finalizadas ({finalizadas.length})</h3>
          <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-800 border-b">
                <tr>
                  <th className="px-4 py-2 text-left text-gray-400">OP ID</th>
                  <th className="px-4 py-2 text-left text-gray-400">Producto</th>
                  <th className="px-4 py-2 text-left text-gray-400">Línea</th>
                  <th className="px-4 py-2 text-right text-gray-400">Producido</th>
                  <th className="px-4 py-2 text-left text-gray-400">Lote Inventario</th>
                  <th className="px-4 py-2 text-left text-gray-400">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {finalizadas.slice(0, 20).map(op => (
                  <tr key={op.op_id} className="hover:bg-gray-800">
                    <td className="px-4 py-2 font-mono text-blue-400">{op.op_id}</td>
                    <td className="px-4 py-2">{op.nombre_producto || op.sku_producto}</td>
                    <td className="px-4 py-2 text-gray-400">{op.linea_produccion || '—'}</td>
                    <td className="px-4 py-2 text-right font-medium">{Math.round(op.cantidad_producida)} pz</td>
                    <td className="px-4 py-2 font-mono text-xs">{op.lote_inventario_generado || '—'}</td>
                    <td className="px-4 py-2 text-xs text-gray-400">
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