'use client'

import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '@/context/AuthContext'
import { OrdenProduccion as OrdenProduccionType, UbicacionAlmacen } from '@/types'
import {
  getOrdenesProduccion,
  iniciarPreExpansion,
  registrarProduccionParcial,
  finalizarPreExpansion,
  getProductos,
  getUbicaciones,
} from '@/lib/api'
import { ProductoItem } from '@/types'

// Tipo para componentes del BOM
interface BomComponente {
  sku_componente: string
  nombre_componente?: string
  cantidad: number
}

export default function PreExpansionTab() {
  const { token, username } = useAuth()
  const [ordenes, setOrdenes] = useState<OrdenProduccionType[]>([])
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [productos, setProductos] = useState<ProductoItem[]>([])
  const [ubicacionesSilos, setUbicacionesSilos] = useState<UbicacionAlmacen[]>([])

  // Form state
  const [formSkuResina, setFormSkuResina] = useState('')
  const [formSkuMP, setFormSkuMP] = useState('')
  const [formCantProducir, setFormCantProducir] = useState('')
  const [formCantUsada, setFormCantUsada] = useState('')
  const [formUbicacion, setFormUbicacion] = useState('')

  // Parcial
  const [parcialOpId, setParcialOpId] = useState<string | null>(null)
  const [parcialCantidad, setParcialCantidad] = useState('')

  const cargar = async () => {
    if (!token) return
    setLoading(true)
    try {
      const data = await getOrdenesProduccion(token, { clase: 'PRE-EXPANSION', limite: 100 })
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
      setProductos(prods.filter(p => (p.tipo || '').toUpperCase() === 'RESINA'))
    } catch { }
  }

  const cargarUbicacionesSilos = async () => {
    if (!token) return
    try {
      const todas = await getUbicaciones(token)
      // Encontrar la ubicación padre "SILOS"
      const silosPadre = todas.find(u => u.nombre.toUpperCase() === 'SILOS')
      if (silosPadre) {
        // Filtrar hijas directas de SILOS
        const hijas = todas.filter(u => u.parent_id === silosPadre.id)
        setUbicacionesSilos(hijas)
        // Pre-seleccionar la primera si hay opciones
        if (hijas.length > 0 && !formUbicacion) {
          setFormUbicacion(hijas[0].nombre)
        }
      }
    } catch { }
  }

  useEffect(() => {
    cargar()
    cargarProductos()
    cargarUbicacionesSilos()
  }, [token])

  useEffect(() => {
    if (mensaje) {
      const t = setTimeout(() => setMensaje(null), 8000)
      return () => clearTimeout(t)
    }
  }, [mensaje])

  // ── Obtener componentes BOM del producto seleccionado ──
  const bomComponentes: BomComponente[] = useMemo(() => {
    if (!formSkuResina) return []
    const prod = productos.find(p => p.sku === formSkuResina)
    if (!prod || !prod.bom || prod.bom.length === 0) return []
    return prod.bom.map((comp: any) => ({
      sku_componente: comp.sku_componente || '',
      nombre_componente: comp.nombre_componente || comp.sku_componente || '',
      cantidad: comp.cantidad || 0,
    }))
  }, [formSkuResina, productos])

  // ── Cuando cambia el producto, resetear MP ──
  useEffect(() => {
    setFormSkuMP('')
    setFormCantUsada('')
  }, [formSkuResina])

  // ── Cuando cambia el componente seleccionado, auto-seleccionar si solo hay 1 ──
  useEffect(() => {
    if (bomComponentes.length === 1) {
      setFormSkuMP(bomComponentes[0].sku_componente)
    }
  }, [bomComponentes])

  // ── Auto-calcular cantidad de MP a usar ──
  useEffect(() => {
    if (!formSkuMP || !formCantProducir) {
      setFormCantUsada('')
      return
    }
    const comp = bomComponentes.find(c => c.sku_componente === formSkuMP)
    if (comp && comp.cantidad > 0) {
      const cantProducir = parseFloat(formCantProducir)
      if (!isNaN(cantProducir) && cantProducir > 0) {
        const cantUsada = (cantProducir * comp.cantidad).toFixed(2)
        setFormCantUsada(cantUsada)
      }
    }
  }, [formSkuMP, formCantProducir, bomComponentes])

  const handleIniciar = async () => {
    if (!token) return
    if (!formSkuResina || !formSkuMP || !formCantProducir || !formCantUsada) {
      setMensaje({ tipo: 'error', texto: 'Completa todos los campos' })
      return
    }
    if (!formUbicacion) {
      setMensaje({ tipo: 'error', texto: 'Selecciona una ubicación destino (silo)' })
      return
    }
    try {
      const res = await iniciarPreExpansion(token, {
        sku_producto_resina: formSkuResina,
        sku_materia_prima: formSkuMP,
        cantidad_a_producir: parseFloat(formCantProducir),
        cantidad_usada: parseFloat(formCantUsada),
        operador: username || 'N/A',
        ubicacion_destino: formUbicacion,
      })

      // Si se generó una OC, mostrar alerta especial
      if (res.oc_generada) {
        setMensaje({
          tipo: 'ok',
          texto: `Lote iniciado. ⚠️ Stock insuficiente: se generó la orden de compra ${res.oc_generada} para ${formSkuMP}. Espere aprobación del área de Compras.`,
        })
      } else {
        setMensaje({ tipo: 'ok', texto: res.message })
      }

      setShowForm(false)
      setFormSkuResina(''); setFormSkuMP(''); setFormCantProducir(''); setFormCantUsada('')
      // Resetear ubicación a la primera opción disponible
      if (ubicacionesSilos.length > 0) {
        setFormUbicacion(ubicacionesSilos[0].nombre)
      } else {
        setFormUbicacion('')
      }
      cargar()
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message })
    }
  }

  const handleParcial = async () => {
    if (!token || !parcialOpId || !parcialCantidad) return
    try {
      const res = await registrarProduccionParcial(token, parcialOpId, {
        cantidad_parcial_producida: parseFloat(parcialCantidad),
      })
      setMensaje({ tipo: 'ok', texto: res.message })
      setParcialOpId(null); setParcialCantidad('')
      cargar()
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message })
    }
  }

  const handleFinalizar = async (opId: string) => {
    if (!token) return
    if (!confirm(`¿Finalizar lote ${opId}?`)) return
    try {
      const res = await finalizarPreExpansion(token, opId)
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
        <h2 className="text-2xl font-bold text-gray-800">🔥 Pre-Expansión</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowForm(!showForm)}
            className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            {showForm ? '✕ Cancelar' : '➕ Nuevo Lote'}
          </button>
          <button onClick={cargar} disabled={loading}
            className="bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg text-sm font-medium text-gray-700">
            🔄
          </button>
        </div>
      </div>

      {mensaje && (
        <div className={`p-3 rounded-lg text-sm font-medium ${
          mensaje.tipo === 'ok'
            ? mensaje.texto.includes('orden de compra')
              ? 'bg-orange-50 text-orange-700 border border-orange-300'
              : 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {mensaje.texto}
        </div>
      )}

      {/* ══════════ Formulario Nuevo Lote ══════════ */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h3 className="font-semibold text-gray-700">Iniciar Lote de Pre-Expansión</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* 1. Producto Resina */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Producto Resina (SKU)</label>
              <select value={formSkuResina} onChange={e => setFormSkuResina(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">Seleccionar...</option>
                {productos.map(p => (
                  <option key={p.sku} value={p.sku}>{p.sku} — {p.nombre}</option>
                ))}
              </select>
            </div>

            {/* 2. Materia Prima — SELECT con todos los componentes del BOM */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Materia Prima (SKU)
                {bomComponentes.length > 0 && (
                  <span className="ml-2 text-xs text-gray-400">
                    {bomComponentes.length} componente{bomComponentes.length > 1 ? 's' : ''} en BOM
                  </span>
                )}
              </label>
              {bomComponentes.length > 0 ? (
                <select value={formSkuMP} onChange={e => setFormSkuMP(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Seleccionar componente...</option>
                  {bomComponentes.map(comp => (
                    <option key={comp.sku_componente} value={comp.sku_componente}>
                      {comp.sku_componente}
                      {comp.nombre_componente && comp.nombre_componente !== comp.sku_componente
                        ? ` — ${comp.nombre_componente}` : ''}
                      {` (${comp.cantidad} kg/kg)`}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={formSkuMP} onChange={e => setFormSkuMP(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  placeholder={formSkuResina ? 'Sin BOM — ingresa manualmente' : 'Selecciona un producto primero'} />
              )}
            </div>

            {/* 3. Cantidad a Producir */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Cantidad a Producir (kg)</label>
              <input type="number" value={formCantProducir} onChange={e => setFormCantProducir(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" min="0" step="0.01" />
            </div>

            {/* 4. Materia Prima a Usar — auto-calculado */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Materia Prima a Usar (kg)
                {formSkuMP && bomComponentes.find(c => c.sku_componente === formSkuMP) && (
                  <span className="ml-2 text-xs text-orange-500 font-normal">
                    ✨ auto-calculado ({bomComponentes.find(c => c.sku_componente === formSkuMP)?.cantidad} kg/kg)
                  </span>
                )}
              </label>
              <input type="number" value={formCantUsada} onChange={e => setFormCantUsada(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" min="0" step="0.01" />
            </div>

            {/* 5. Ubicación Destino — SELECT con ubicaciones SILOS */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Ubicación Destino
                {ubicacionesSilos.length > 0 && (
                  <span className="ml-2 text-xs text-gray-400">
                    {ubicacionesSilos.length} silo{ubicacionesSilos.length > 1 ? 's' : ''} disponible{ubicacionesSilos.length > 1 ? 's' : ''}
                  </span>
                )}
              </label>
              {ubicacionesSilos.length > 0 ? (
                <select value={formUbicacion} onChange={e => setFormUbicacion(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Seleccionar silo...</option>
                  {ubicacionesSilos.map(ub => (
                    <option key={ub.id} value={ub.nombre}>{ub.nombre}</option>
                  ))}
                </select>
              ) : (
                <div className="w-full border border-red-300 bg-red-50 rounded-lg px-3 py-2 text-sm text-red-600">
                  ⚠️ No se encontraron ubicaciones bajo &quot;SILOS&quot;. Crea sub-ubicaciones en Almacén → Ubicaciones.
                </div>
              )}
            </div>
          </div>

          {/* Preview BOM completo si hay más de 1 componente */}
          {bomComponentes.length > 1 && (
            <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-orange-700 mb-2">
                📋 BOM completo del producto ({bomComponentes.length} componentes)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {bomComponentes.map(comp => (
                  <div key={comp.sku_componente}
                    className={`text-xs px-2 py-1 rounded ${
                      comp.sku_componente === formSkuMP
                        ? 'bg-orange-200 text-orange-800 font-semibold'
                        : 'text-orange-600'
                    }`}>
                    {comp.sku_componente === formSkuMP ? '✔ ' : '• '}
                    {comp.sku_componente} — {comp.cantidad} kg/kg
                    {comp.nombre_componente && comp.nombre_componente !== comp.sku_componente
                      ? ` (${comp.nombre_componente})` : ''}
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={handleIniciar}
            disabled={ubicacionesSilos.length === 0}
            className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg text-sm font-medium">
            🚀 Iniciar Lote
          </button>
        </div>
      )}

      {/* ══════════ Lotes Activos ══════════ */}
      <div>
        <h3 className="font-semibold text-gray-700 mb-3">🟢 Lotes Activos ({activas.length})</h3>
        {activas.length === 0 ? (
          <p className="text-gray-400 text-sm py-4">No hay lotes activos</p>
        ) : (
          <div className="space-y-3">
            {activas.map(op => {
              const pct = op.cantidad_a_producir > 0
                ? Math.min(100, Math.round((op.cantidad_producida / op.cantidad_a_producir) * 100))
                : 0
              return (
                <div key={op.op_id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="font-mono font-bold text-blue-600">{op.op_id}</span>
                      <span className="ml-3 text-sm text-gray-500">{op.sku_producto}</span>
                      <span className="ml-2 text-xs text-gray-400">→ MP: {op.sku_materia_prima}</span>
                      {op.ubicacion_destino && (
                        <span className="ml-2 text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                          📍 {op.ubicacion_destino}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setParcialOpId(op.op_id); setParcialCantidad('') }}
                        className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-medium">
                        📝 Parcial
                      </button>
                      <button onClick={() => handleFinalizar(op.op_id)}
                        className="bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1.5 rounded-lg text-xs font-medium">
                        ✅ Finalizar
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gray-100 rounded-full h-3">
                      <div className="bg-orange-500 h-3 rounded-full transition-all"
                        style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm font-medium text-gray-700 w-40 text-right">
                      {op.cantidad_producida.toFixed(2)} / {op.cantidad_a_producir.toFixed(2)} kg ({pct}%)
                    </span>
                  </div>

                  <div className="mt-2 text-xs text-gray-500 flex gap-4 flex-wrap">
                    <span>MP Consumida: {op.cantidad_total_consumida.toFixed(2)} / {op.cantidad_usada_requerida.toFixed(2)} kg</span>
                    <span>Operador: {op.operador || '—'}</span>
                    <span>Parciales: {(op.registros_parciales || []).length}</span>
                  </div>

                  {parcialOpId === op.op_id && (
                    <div className="mt-3 bg-blue-50 rounded-lg p-3 flex items-end gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-blue-700 mb-1">Cantidad Producida (kg)</label>
                        <input type="number" value={parcialCantidad} onChange={e => setParcialCantidad(e.target.value)}
                          className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm" min="0" step="0.01"
                          autoFocus />
                      </div>
                      <button onClick={handleParcial}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
                        Registrar
                      </button>
                      <button onClick={() => setParcialOpId(null)}
                        className="text-gray-400 hover:text-gray-600 px-2 py-2 text-sm">✕</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ══════════ Lotes Finalizados ══════════ */}
      {finalizadas.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-700 mb-3">✅ Finalizados ({finalizadas.length})</h3>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left text-gray-600">OP ID</th>
                  <th className="px-4 py-2 text-left text-gray-600">SKU Resina</th>
                  <th className="px-4 py-2 text-right text-gray-600">Producido</th>
                  <th className="px-4 py-2 text-right text-gray-600">MP Consumida</th>
                  <th className="px-4 py-2 text-left text-gray-600">Ubicación</th>
                  <th className="px-4 py-2 text-left text-gray-600">Lote Inventario</th>
                  <th className="px-4 py-2 text-left text-gray-600">Fecha</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {finalizadas.slice(0, 20).map(op => (
                  <tr key={op.op_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-blue-600">{op.op_id}</td>
                    <td className="px-4 py-2">{op.sku_producto}</td>
                    <td className="px-4 py-2 text-right font-medium">{op.cantidad_producida.toFixed(2)} kg</td>
                    <td className="px-4 py-2 text-right">{op.cantidad_total_consumida.toFixed(2)} kg</td>
                    <td className="px-4 py-2 text-xs">
                      {op.ubicacion_destino ? (
                        <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{op.ubicacion_destino}</span>
                      ) : '—'}
                    </td>
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