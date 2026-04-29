'use client'

import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '@/context/AuthContext'
import { OrdenProduccion as OrdenProduccionType, UbicacionAlmacen, EstadoSilo, SuministroSilo } from '@/types'
import {
  getOrdenesProduccion, iniciarPreExpansion, registrarProduccionParcial,
  registrarDatosProceso, finalizarPreExpansion, getProductos, getUbicaciones,
  getEstadoSilos, descargarEstadoSilosExcel, getSuministros, crearSuministro,
  descargarReportePreexpansionExcel,
} from '@/lib/api'
import { ProductoItem } from '@/types'

type SubTab = 'lotes' | 'silos' | 'suministro' | 'reporte'

interface BomComponente {
  sku_componente: string
  nombre_componente?: string
  cantidad: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatTiempoReposo(segundos: number): string {
  if (segundos <= 0) return '0h 0m'
  const horas   = Math.floor(segundos / 3600)
  const minutos = Math.floor((segundos % 3600) / 60)
  if (horas >= 24) {
    const dias = Math.floor(horas / 24)
    return `${dias}d ${horas % 24}h ${minutos}m`
  }
  return `${horas}h ${minutos}m`
}

const parseUTC = (iso?: string): Date | null => {
  if (!iso) return null
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
  return isNaN(d.getTime()) ? null : d
}

const toLocalDate = (iso?: string): Date | null => {
  const d = parseUTC(iso)
  if (!d) return null
  return new Date(d.getTime() - 6 * 60 * 60 * 1000)
}

/** "YYYY-MM-DD, HH:MM" */
const formatFechaHora = (iso?: string): string => {
  const d = toLocalDate(iso)
  if (!d) return '—'
  const fecha = d.toISOString().slice(0, 10)
  const hora  = d.toISOString().slice(11, 16)
  return `${fecha}, ${hora}`
}

const formatHoraLocal = (iso?: string): string => {
  const d = toLocalDate(iso)
  if (!d) return '—'
  return d.toISOString().slice(11, 16)
}

const formatFechaLocal = (iso?: string): string => {
  const d = toLocalDate(iso)
  if (!d) return '—'
  return d.toISOString().slice(0, 10)
}

function getTurno(iso?: string): string {
  const d = toLocalDate(iso)
  if (!d) return '—'
  const totalMin = d.getUTCHours() * 60 + d.getUTCMinutes()
  return (totalMin >= 450 && totalMin < 1170) ? 'DIA' : 'NOCHE'
}

function getFechaTurno(iso?: string): string {
  const d = toLocalDate(iso)
  if (!d) return '—'
  const totalMin = d.getUTCHours() * 60 + d.getUTCMinutes()
  if (totalMin < 450) {
    const ayer = new Date(d.getTime())
    ayer.setUTCDate(ayer.getUTCDate() - 1)
    return ayer.toISOString().slice(0, 10)
  }
  return d.toISOString().slice(0, 10)
}

// ── Componente Principal ──────────────────────────────────────────────────────

export default function PreExpansionTab() {
  const [subTab, setSubTab] = useState<SubTab>('lotes')
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
        {([
          { id: 'lotes' as SubTab, label: '🔥 Lotes' },
          { id: 'silos' as SubTab, label: '🏗️ Estado Silos' },
          { id: 'suministro' as SubTab, label: '🚚 Suministro' },
          { id: 'reporte' as SubTab, label: '📋 Reporte' },
        ]).map(tab => (
          <button key={tab.id} onClick={() => setSubTab(tab.id)}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              subTab === tab.id ? 'bg-white text-orange-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>
      {subTab === 'lotes'      && <LotesSubTab />}
      {subTab === 'silos'      && <SilosSubTab />}
      {subTab === 'suministro' && <SuministroSubTab />}
      {subTab === 'reporte'    && <ReporteSubTab />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SUB-TAB: LOTES
// ══════════════════════════════════════════════════════════════════════════════

function LotesSubTab() {
  const { token, username } = useAuth()
  const [ordenes, setOrdenes]           = useState<OrdenProduccionType[]>([])
  const [loading, setLoading]           = useState(false)
  const [showForm, setShowForm]         = useState(false)
  const [mensaje, setMensaje]           = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [productos, setProductos]       = useState<ProductoItem[]>([])
  const [ubicacionesSilos, setUbicacionesSilos] = useState<UbicacionAlmacen[]>([])

  // Form nuevo lote
  const [formSkuResina,    setFormSkuResina]    = useState('')
  const [formGrado,        setFormGrado]        = useState('')
  const [formNumeroCostal, setFormNumeroCostal] = useState('')
  const [formSkuMP,        setFormSkuMP]        = useState('')
  const [formCantUsada,    setFormCantUsada]    = useState('')
  const [formUbicacion,    setFormUbicacion]    = useState('')

  // Parcial
  const [parcialOpId,    setParcialOpId]    = useState<string | null>(null)
  const [parcialCantidad, setParcialCantidad] = useState('')

  // Modal Datos de Proceso
  const [showDatosModal, setShowDatosModal] = useState(false)
  const [datosOpId,      setDatosOpId]      = useState<string | null>(null)
  const [formDensidad,   setFormDensidad]   = useState('')
  const [formPantalla,   setFormPantalla]   = useState('')
  const [formCiclo,      setFormCiclo]      = useState('')

  // Modal Finalizar
  const [showFinalizarModal, setShowFinalizarModal] = useState(false)
  const [finalizarOpId,      setFinalizarOpId]      = useState<string | null>(null)
  const [formCantProducida,  setFormCantProducida]  = useState('')
  const [formCounterTiro,    setFormCounterTiro]    = useState('')

  // Filtros para finalizados
  const [filtroTurno,  setFiltroTurno]  = useState('')
  const [filtroFecha,  setFiltroFecha]  = useState('')
  const [filtroSku,    setFiltroSku]    = useState('')
  const [filtroSilo,   setFiltroSilo]   = useState('')

  // ── Carga ──
  const cargar = async () => {
    if (!token) return
    setLoading(true)
    try {
      const data = await getOrdenesProduccion(token, { clase: 'PRE-EXPANSION', limite: 200 })
      setOrdenes(data)
    } catch (e: any) { setMensaje({ tipo: 'error', texto: e.message }) }
    setLoading(false)
  }

  const cargarProductos = async () => {
    try {
      const prods = await getProductos()
      setProductos(prods.filter((p: ProductoItem) => (p.tipo || '').toUpperCase() === 'RESINA'))
    } catch {}
  }

  const cargarUbicacionesSilos = async () => {
    if (!token) return
    try {
      const todas = await getUbicaciones(token)
      const padre = todas.find((u: UbicacionAlmacen) => u.nombre.toUpperCase() === 'SILOS')
      if (padre) {
        const hijas = todas.filter((u: UbicacionAlmacen) => u.parent_id === padre.id)
        const principales = hijas.filter((u: UbicacionAlmacen) => !u.nombre.toUpperCase().includes('AUX'))
        setUbicacionesSilos(principales)
        if (principales.length > 0 && !formUbicacion) setFormUbicacion(principales[0].nombre)
      }
    } catch {}
  }

  useEffect(() => { cargar(); cargarProductos(); cargarUbicacionesSilos() }, [token])

  useEffect(() => {
    if (!mensaje) return
    const t = setTimeout(() => setMensaje(null), 8000)
    return () => clearTimeout(t)
  }, [mensaje])

  // BOM
  const bomComponentes: BomComponente[] = useMemo(() => {
    if (!formSkuResina) return []
    const prod = productos.find(p => p.sku === formSkuResina)
    if (!prod?.bom?.length) return []
    return prod.bom.map((c: any) => ({
      sku_componente: c.sku_componente || '',
      nombre_componente: c.nombre_componente || c.sku_componente || '',
      cantidad: c.cantidad || 0,
    }))
  }, [formSkuResina, productos])

  useEffect(() => { setFormSkuMP(''); setFormCantUsada('') }, [formSkuResina])
  useEffect(() => {
    if (bomComponentes.length === 1) setFormSkuMP(bomComponentes[0].sku_componente)
  }, [bomComponentes])

  // ── Handlers ──
  const handleIniciar = async () => {
    if (!token) return
    if (!formSkuResina || !formGrado || !formCantUsada) {
      setMensaje({ tipo: 'error', texto: 'Completa todos los campos obligatorios' })
      return
    }
    if (!formUbicacion) {
      setMensaje({ tipo: 'error', texto: 'Selecciona un silo destino' })
      return
    }
    try {
      const res = await iniciarPreExpansion(token, {
        sku_producto_resina: formSkuResina,
        sku_materia_prima:   formSkuMP || formSkuResina,
        grado:               formGrado,
        numero_costal:       formNumeroCostal || undefined,
        cantidad_usada:      parseFloat(formCantUsada),
        operador:            username || 'N/A',
        ubicacion_destino:   formUbicacion,
      })
      if (res.oc_generada) {
        setMensaje({ tipo: 'ok', texto: `Lote iniciado. ⚠️ Stock insuficiente: se generó la OC ${res.oc_generada}. Espere aprobación de Compras.` })
      } else {
        setMensaje({ tipo: 'ok', texto: res.message })
      }
      setShowForm(false)
      setFormSkuResina(''); setFormGrado(''); setFormNumeroCostal('')
      setFormSkuMP(''); setFormCantUsada('')
      if (ubicacionesSilos.length > 0) setFormUbicacion(ubicacionesSilos[0].nombre)
      cargar()
    } catch (e: any) { setMensaje({ tipo: 'error', texto: e.message }) }
  }

  const handleParcial = async () => {
    if (!token || !parcialOpId || !parcialCantidad) return
    try {
      const res = await registrarProduccionParcial(token, parcialOpId, {
        cantidad_parcial_producida: parseFloat(parcialCantidad),
      })
      if (res.es_primer_parcial) {
        setDatosOpId(parcialOpId)
        setShowDatosModal(true)
      }
      setMensaje({ tipo: 'ok', texto: res.message })
      setParcialOpId(null); setParcialCantidad('')
      cargar()
    } catch (e: any) { setMensaje({ tipo: 'error', texto: e.message }) }
  }

  const handleGuardarDatos = async () => {
    if (!token || !datosOpId) return
    if (!formDensidad || !formPantalla || !formCiclo) {
      setMensaje({ tipo: 'error', texto: 'Completa todos los campos de proceso' })
      return
    }
    try {
      await registrarDatosProceso(token, datosOpId, {
        densidad:      parseFloat(formDensidad),
        pantalla_peso: parseFloat(formPantalla),
        ciclo_seg:     parseFloat(formCiclo),
      })
      setMensaje({ tipo: 'ok', texto: 'Datos de proceso registrados' })
      setShowDatosModal(false); setDatosOpId(null)
      setFormDensidad(''); setFormPantalla(''); setFormCiclo('')
      cargar()
    } catch (e: any) { setMensaje({ tipo: 'error', texto: e.message }) }
  }

  const handleClickFinalizar = (opId: string) => {
    setFinalizarOpId(opId); setFormCantProducida(''); setFormCounterTiro('')
    setShowFinalizarModal(true)
  }

  const handleConfirmarFinalizar = async () => {
    if (!token || !finalizarOpId) return
    if (!formCantProducida) {
      setMensaje({ tipo: 'error', texto: 'Ingresa la cantidad producida' })
      return
    }
    try {
      const res = await finalizarPreExpansion(token, finalizarOpId, {
        cantidad_producida: parseFloat(formCantProducida),
        counter_tiro: formCounterTiro ? parseFloat(formCounterTiro) : undefined,
      })
      setMensaje({ tipo: 'ok', texto: res.message })
      setShowFinalizarModal(false); setFinalizarOpId(null)
      setFormCantProducida(''); setFormCounterTiro('')
      cargar()
    } catch (e: any) { setMensaje({ tipo: 'error', texto: e.message }) }
  }

  const activas     = ordenes.filter(o => o.status !== 'Finalizado')
  const finalizadas = useMemo(() => {
    return ordenes
      .filter(o => o.status === 'Finalizado')
      .filter(o => {
        if (filtroTurno && getTurno(o.fecha_inicio) !== filtroTurno) return false
        if (filtroFecha && getFechaTurno(o.fecha_inicio) !== filtroFecha) return false
        if (filtroSku   && !o.sku_producto.toLowerCase().includes(filtroSku.toLowerCase())) return false
        if (filtroSilo  && (o.ubicacion_destino || '').toLowerCase() !== filtroSilo.toLowerCase()) return false
        return true
      })
  }, [ordenes, filtroTurno, filtroFecha, filtroSku, filtroSilo])

  // Silos únicos para filtro
  const silosUnicos = useMemo(() => {
    const set = new Set(ordenes.filter(o => o.status === 'Finalizado' && o.ubicacion_destino).map(o => o.ubicacion_destino!))
    return Array.from(set).sort()
  }, [ordenes])

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">🔥 Lotes de Pre-Expansión</h2>
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
            ? mensaje.texto.includes('orden de compra') || mensaje.texto.includes('OC')
              ? 'bg-orange-50 text-orange-700 border border-orange-300'
              : 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {mensaje.texto}
        </div>
      )}

      {/* ── Formulario Nuevo Lote ── */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h3 className="font-semibold text-gray-700">Iniciar Lote de Pre-Expansión</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

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

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Grado</label>
              <input type="text" value={formGrado} onChange={e => setFormGrado(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Ej: 350, 450, CHINA..." />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Número de Costal</label>
              <input type="text" value={formNumeroCostal} onChange={e => setFormNumeroCostal(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Ej: 12, X26011741..." />
            </div>

            {bomComponentes.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Materia Prima (BOM)
                  <span className="ml-2 text-xs text-gray-400">{bomComponentes.length} comp.</span>
                </label>
                <select value={formSkuMP} onChange={e => setFormSkuMP(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Seleccionar...</option>
                  {bomComponentes.map(c => (
                    <option key={c.sku_componente} value={c.sku_componente}>
                      {c.sku_componente} ({c.cantidad} kg/kg)
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* ELIMINADO: Cantidad a Producir — ahora se pide solo al finalizar */}

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Materia Prima a Usar (kg)</label>
              <input type="number" value={formCantUsada} onChange={e => setFormCantUsada(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" min="0" step="0.01" />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Silo Destino
                {ubicacionesSilos.length > 0 && (
                  <span className="ml-2 text-xs text-gray-400">{ubicacionesSilos.length} disponibles</span>
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
                  ⚠️ No se encontraron silos. Crea sub-ubicaciones bajo &quot;SILOS&quot; en Almacén → Ubicaciones.
                </div>
              )}
            </div>
          </div>

          <button onClick={handleIniciar}
            disabled={ubicacionesSilos.length === 0}
            className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg text-sm font-medium">
            🚀 Iniciar Lote
          </button>
        </div>
      )}

      {/* ── Lotes Activos ── */}
      <div>
        <h3 className="font-semibold text-gray-700 mb-3">🟢 Lotes Activos ({activas.length})</h3>
        {activas.length === 0 ? (
          <p className="text-gray-400 text-sm py-4">No hay lotes activos</p>
        ) : (
          <div className="space-y-3">
            {activas.map(op => {
              const pct = op.cantidad_usada_requerida > 0
                ? Math.min(100, Math.round((op.cantidad_total_consumida / op.cantidad_usada_requerida) * 100))
                : 0
              return (
                <div key={op.op_id} className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-blue-600">{op.op_id}</span>
                      <span className="text-sm text-gray-500">{op.sku_producto}</span>
                      {op.grado && (
                        <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full font-medium">
                          Grado: {op.grado}
                        </span>
                      )}
                      {op.numero_costal && (
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                          Costal: {op.numero_costal}
                        </span>
                      )}
                      {op.ubicacion_destino && (
                        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                          📍 {op.ubicacion_destino}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => { setParcialOpId(op.op_id); setParcialCantidad('') }}
                        className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-medium">
                        📝 Parcial
                      </button>
                      <button onClick={() => handleClickFinalizar(op.op_id)}
                        className="bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1.5 rounded-lg text-xs font-medium">
                        ✅ Finalizar
                      </button>
                    </div>
                  </div>

                  {/* Barra progreso MP consumida */}
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gray-100 rounded-full h-3">
                      <div className="bg-orange-500 h-3 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-sm font-medium text-gray-700 w-52 text-right">
                      MP: {op.cantidad_total_consumida.toFixed(2)} / {op.cantidad_usada_requerida.toFixed(2)} kg ({pct}%)
                    </span>
                  </div>

                  <div className="mt-2 text-xs text-gray-500 flex gap-4 flex-wrap">
                    <span>Parciales: {(op.registros_parciales || []).length}</span>
                    <span>Parcial acum.: {op.cantidad_producida.toFixed(2)} kg</span>
                    <span>Operador: {op.operador || '—'}</span>
                    {op.hora_inicio_real && <span>Inicio: {formatHoraLocal(op.hora_inicio_real)}</span>}
                    {op.densidad     != null && <span>Densidad: {op.densidad} g/cm³</span>}
                    {op.pantalla_peso != null && <span>Pantalla: {op.pantalla_peso} kg</span>}
                    {op.ciclo_seg    != null && <span>Ciclo: {op.ciclo_seg} seg</span>}
                  </div>

                  {/* Form parcial inline */}
                  {parcialOpId === op.op_id && (
                    <div className="mt-3 bg-blue-50 rounded-lg p-3 flex items-end gap-3">
                      <div className="flex-1">
                        <label className="block text-xs font-medium text-blue-700 mb-1">Cantidad Parcial Producida (kg)</label>
                        <input type="number" value={parcialCantidad} onChange={e => setParcialCantidad(e.target.value)}
                          className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm"
                          min="0" step="0.01" autoFocus />
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

      {/* ── Finalizados ── */}
      {ordenes.some(o => o.status === 'Finalizado') && (
        <div>
          <h3 className="font-semibold text-gray-700 mb-3">
            ✅ Finalizados ({finalizadas.length})
          </h3>

          {/* Filtros */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-3 mb-3 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Turno</label>
              <select value={filtroTurno} onChange={e => setFiltroTurno(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs">
                <option value="">Todos</option>
                <option value="DIA">☀️ DIA</option>
                <option value="NOCHE">🌙 NOCHE</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Fecha inicio turno</label>
              <input type="date" value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">SKU</label>
              <input type="text" value={filtroSku} onChange={e => setFiltroSku(e.target.value)}
                placeholder="Buscar SKU..."
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Silo</label>
              <select value={filtroSilo} onChange={e => setFiltroSilo(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs">
                <option value="">Todos</option>
                {silosUnicos.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {finalizadas.length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">Sin resultados con los filtros aplicados</p>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-600">Turno</th>
                    <th className="px-3 py-2 text-left text-gray-600">OP ID</th>
                    <th className="px-3 py-2 text-left text-gray-600">SKU</th>
                    <th className="px-3 py-2 text-left text-gray-600">Grado</th>
                    <th className="px-3 py-2 text-left text-gray-600">Costal</th>
                    <th className="px-3 py-2 text-right text-gray-600">Producido</th>
                    <th className="px-3 py-2 text-right text-gray-600">Densidad</th>
                    <th className="px-3 py-2 text-right text-gray-600">Pantalla</th>
                    <th className="px-3 py-2 text-right text-gray-600">Ciclo</th>
                    <th className="px-3 py-2 text-right text-gray-600">Counter</th>
                    <th className="px-3 py-2 text-left text-gray-600">Silo</th>
                    <th className="px-3 py-2 text-left text-gray-600">Inicio</th>
                    <th className="px-3 py-2 text-left text-gray-600">Fin</th>
                    <th className="px-3 py-2 text-left text-gray-600">Usuario</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {finalizadas.map(op => (
                    <tr key={op.op_id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          getTurno(op.fecha_inicio) === 'DIA'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-indigo-100 text-indigo-700'
                        }`}>
                          {getTurno(op.fecha_inicio) === 'DIA' ? '☀️' : '🌙'} {getTurno(op.fecha_inicio)}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-blue-600 text-xs">{op.op_id}</td>
                      <td className="px-3 py-2 text-xs">{op.sku_producto}</td>
                      <td className="px-3 py-2 text-xs text-purple-600 font-medium">{op.grado || '—'}</td>
                      <td className="px-3 py-2 text-xs">{op.numero_costal || '—'}</td>
                      <td className="px-3 py-2 text-right font-medium text-xs">{op.cantidad_producida.toFixed(2)} kg</td>
                      <td className="px-3 py-2 text-right text-xs">{op.densidad != null ? op.densidad : '—'}</td>
                      <td className="px-3 py-2 text-right text-xs">{op.pantalla_peso != null ? `${op.pantalla_peso} kg` : '—'}</td>
                      <td className="px-3 py-2 text-right text-xs">{op.ciclo_seg != null ? `${op.ciclo_seg} s` : '—'}</td>
                      <td className="px-3 py-2 text-right text-xs">{op.counter_tiro != null ? op.counter_tiro : '—'}</td>
                      <td className="px-3 py-2 text-xs">
                        {op.ubicacion_destino
                          ? <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">{op.ubicacion_destino}</span>
                          : '—'}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                        {formatFechaHora(op.hora_inicio_real || op.fecha_inicio)}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                        {formatFechaHora(op.hora_finalizacion || op.fecha_fin)}
                      </td>
                      <td className="px-3 py-2 text-xs text-gray-500">{op.creado_por || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── MODAL: Datos de Proceso ── */}
      {showDatosModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-800">📊 Datos de Proceso</h3>
            <p className="text-sm text-gray-500">
              Primer parcial registrado para{' '}
              <span className="font-mono font-semibold">{datosOpId}</span>.
              Ingresa los datos del proceso:
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Densidad (g/cm³)</label>
                <input type="number" value={formDensidad} onChange={e => setFormDensidad(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  min="0" step="0.001" autoFocus />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Pantalla Peso (kg)</label>
                <input type="number" value={formPantalla} onChange={e => setFormPantalla(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" min="0" step="0.01" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Ciclo (seg)</label>
                <input type="number" value={formCiclo} onChange={e => setFormCiclo(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" min="0" step="1" />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setShowDatosModal(false); setDatosOpId(null) }}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Omitir</button>
              <button onClick={handleGuardarDatos}
                className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-2 rounded-lg text-sm font-medium">
                💾 Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: Finalizar ── */}
      {showFinalizarModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-800">✅ Finalizar Lote</h3>
            <p className="text-sm text-gray-500">
              Finalizando <span className="font-mono font-semibold">{finalizarOpId}</span>
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Cantidad Producida (kg) <span className="text-red-500">*</span>
                </label>
                <input type="number" value={formCantProducida} onChange={e => setFormCantProducida(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  min="0" step="0.01" autoFocus placeholder="Ingresa kg producidos..." />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Counter Tiro</label>
                <input type="number" value={formCounterTiro} onChange={e => setFormCounterTiro(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  min="0" step="1" placeholder="Ingresa el counter tiro..." />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setShowFinalizarModal(false); setFinalizarOpId(null) }}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
              <button onClick={handleConfirmarFinalizar}
                className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-medium">
                ✅ Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SUB-TAB: ESTADO SILOS (sin cambios funcionales, se mantiene igual)
// ══════════════════════════════════════════════════════════════════════════════

function SilosSubTab() {
  const { token } = useAuth()
  const [silos, setSilos]   = useState<EstadoSilo[]>([])
  const [loading, setLoading] = useState(false)
  const [tick, setTick]     = useState(0)

  const cargar = async () => {
    if (!token) return
    setLoading(true)
    try { const data = await getEstadoSilos(token); setSilos(data) } catch {}
    setLoading(false)
  }

  useEffect(() => { cargar() }, [token])
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30000)
    return () => clearInterval(interval)
  }, [])

  const handleDescargarExcel = async () => {
    if (!token) return
    try {
      const blob = await descargarEstadoSilosExcel(token)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = `estado_silos_${new Date().toISOString().slice(0, 10)}.xlsx`
      a.click(); URL.revokeObjectURL(url)
    } catch {}
  }

  const principales = silos.filter(s => !s.es_aux)
  const auxiliares  = silos.filter(s => s.es_aux)

  const calcReposoVivo = (s: EstadoSilo): number => {
    if (s.vacio || !s.hora_finalizacion_lote) return 0
    const fin = parseUTC(s.hora_finalizacion_lote)
    if (!fin) return 0
    return Math.max(0, (Date.now() - fin.getTime()) / 1000)
  }

  const extractLetra  = (n: string) => (n.match(/SILO\s+([A-Z])/i) || ['', 'Z'])[1].toUpperCase()
  const extractNumero = (n: string) => parseInt((n.match(/(\d+)$/) || ['0'])[1])

  const letrasMap = new Map<string, EstadoSilo[]>()
  principales.forEach(s => {
    const l = extractLetra(s.nombre_silo)
    if (!letrasMap.has(l)) letrasMap.set(l, [])
    letrasMap.get(l)!.push(s)
  })
  letrasMap.forEach(arr => arr.sort((a, b) => extractNumero(a.nombre_silo) - extractNumero(b.nombre_silo)))
  const letrasOrdenadas = Array.from(letrasMap.keys()).sort()
  const maxRows = Math.max(...Array.from(letrasMap.values()).map(a => a.length), 1)

  const renderSiloCard = (s: EstadoSilo, isAux = false) => {
    const reposoVivo = isAux ? 0 : calcReposoVivo(s)
    return (
      <div key={s.nombre_silo}
        className={`rounded-xl border-2 p-4 transition-all h-full ${
          s.vacio ? 'border-dashed border-gray-300 bg-gray-50'
            : isAux ? 'border-cyan-300 bg-cyan-50'
            : 'border-orange-300 bg-orange-50'
        }`}>
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-bold text-lg text-gray-800">{s.nombre_silo}</h4>
          {s.vacio
            ? <span className="text-xs bg-gray-200 text-gray-500 px-2 py-1 rounded-full">Vacío</span>
            : <span className={`text-xs px-2 py-1 rounded-full font-semibold ${isAux ? 'bg-cyan-200 text-cyan-700' : 'bg-orange-200 text-orange-700'}`}>
                {s.kg_totales} kg
              </span>}
        </div>
        {s.vacio ? (
          <p className="text-gray-400 text-sm text-center py-4">{isAux ? 'Sin suministro' : 'Sin material'}</p>
        ) : isAux && s.suministro ? (
          <div className="space-y-2 text-sm">
            {[
              ['Fuente:', <span className="font-medium text-orange-600">{s.silo_fuente}</span>],
              ['Resina:', <span className="font-medium">{s.suministro.sku_resina || '—'}</span>],
              ['Grado:', <span className="font-medium text-purple-600">{s.suministro.grado || '—'}</span>],
              ['Kg suministrados:', <span className="font-medium">{s.suministro.kg_suministrados}</span>],
              ['Reposo silo fuente:', <span className="font-medium">{formatTiempoReposo(s.suministro.tiempo_reposo_horas * 3600)}</span>],
              ['Fecha:', <span className="text-xs">{formatFechaLocal(s.suministro.fecha_suministro)}</span>],
            ].map(([label, val], i) => (
              <div key={i} className="flex justify-between">{label}{val}</div>
            ))}
            {s.suministro.maquinas_inyeccion.length > 0 && (
              <div>
                <span className="text-gray-500 text-xs">Máquinas:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {s.suministro.maquinas_inyeccion.map((m, i) => (
                    <span key={i} className="text-xs bg-white border border-cyan-200 text-cyan-700 px-2 py-0.5 rounded-full">{m}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            {[
              ['Resina:', <span className="font-medium">{s.sku_resina || '—'}</span>],
              ['Grado:', <span className="font-medium text-purple-600">{s.grado || '—'}</span>],
              ['Densidad:', <span className="font-medium">{s.densidad != null ? `${s.densidad} g/cm³` : '—'}</span>],
              ['Entrada:', <span className="text-xs">{formatFechaLocal(s.fecha_entrada)}</span>],
              ['Fin lote:', <span className="text-xs">{formatHoraLocal(s.hora_finalizacion_lote)}</span>],
              ['OP:', <span className="font-mono text-xs text-blue-600">{s.op_id_origen || '—'}</span>],
            ].map(([label, val], i) => (
              <div key={i} className="flex justify-between">{label}{val}</div>
            ))}
            <div className="mt-2 bg-white rounded-lg p-2 border border-orange-200">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">⏱️ Tiempo en reposo:</span>
                <span className="font-bold text-orange-600 text-sm">
                  {formatTiempoReposo(reposoVivo || s.tiempo_reposo_segundos)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">🏗️ Estado de Silos</h2>
        <div className="flex gap-2">
          <button onClick={handleDescargarExcel}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            📥 Descargar Excel
          </button>
          <button onClick={cargar} disabled={loading}
            className="bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg text-sm font-medium text-gray-700">🔄</button>
        </div>
      </div>

      <div>
        <h3 className="font-semibold text-gray-600 mb-3 text-sm uppercase tracking-wide">Silos Principales</h3>
        <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${letrasOrdenadas.length}, minmax(0, 1fr))` }}>
          {letrasOrdenadas.map(l => (
            <div key={`h-${l}`} className="text-center">
              <span className="text-sm font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">Columna {l}</span>
            </div>
          ))}
        </div>
        {Array.from({ length: maxRows }).map((_, ri) => (
          <div key={`row-${ri}`} className="grid gap-3 mt-3"
            style={{ gridTemplateColumns: `repeat(${letrasOrdenadas.length}, minmax(0, 1fr))` }}>
            {letrasOrdenadas.map(l => {
              const s = (letrasMap.get(l) || [])[ri]
              return s ? <div key={s.nombre_silo}>{renderSiloCard(s, false)}</div> : <div key={`empty-${l}-${ri}`} />
            })}
          </div>
        ))}
      </div>

      {auxiliares.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-600 mb-3 text-sm uppercase tracking-wide">Silos AUX (Suministro)</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {auxiliares
              .sort((a, b) => a.nombre_silo.localeCompare(b.nombre_silo, undefined, { numeric: true }))
              .map(s => renderSiloCard(s, true))}
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SUB-TAB: SUMINISTRO
// ══════════════════════════════════════════════════════════════════════════════

function SuministroSubTab() {
  const { token } = useAuth()
  const [loading, setLoading]       = useState(false)
  const [mensaje, setMensaje]       = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [suministros, setSuministros] = useState<SuministroSilo[]>([])
  const [silosPrincipales, setSilosPrincipales] = useState<UbicacionAlmacen[]>([])
  const [silosAux, setSilosAux]     = useState<UbicacionAlmacen[]>([])
  const [showForm, setShowForm]     = useState(false)

  // Form
  const [formSiloOrigen, setFormSiloOrigen] = useState('')
  const [formAuxDestino, setFormAuxDestino] = useState('')
  const [formKg,         setFormKg]         = useState('')
  const [formMaquinas,   setFormMaquinas]   = useState('')

  // Filtros historial
  const [filtroAux,    setFiltroAux]    = useState('')
  const [filtroResina, setFiltroResina] = useState('')
  const [filtroFecha,  setFiltroFecha]  = useState('')
  const [filtroUsuario, setFiltroUsuario] = useState('')

  const cargar = async () => {
    if (!token) return
    setLoading(true)
    try {
      const [sums, ubicaciones] = await Promise.all([getSuministros(token, 200), getUbicaciones(token)])
      setSuministros(sums)
      const padre = ubicaciones.find((u: UbicacionAlmacen) => u.nombre.toUpperCase() === 'SILOS')
      if (padre) {
        const hijas = ubicaciones.filter((u: UbicacionAlmacen) => u.parent_id === padre.id)
        setSilosPrincipales(hijas.filter((u: UbicacionAlmacen) => !u.nombre.toUpperCase().includes('AUX')))
        setSilosAux(hijas.filter((u: UbicacionAlmacen) => u.nombre.toUpperCase().includes('AUX')))
      }
    } catch (e: any) { setMensaje({ tipo: 'error', texto: e.message }) }
    setLoading(false)
  }

  useEffect(() => { cargar() }, [token])
  useEffect(() => {
    if (!mensaje) return
    const t = setTimeout(() => setMensaje(null), 8000)
    return () => clearTimeout(t)
  }, [mensaje])

  const handleCrear = async () => {
    if (!token) return
    if (!formSiloOrigen || !formAuxDestino || !formKg) {
      setMensaje({ tipo: 'error', texto: 'Completa todos los campos obligatorios' })
      return
    }
    const maquinasArr = formMaquinas.split(',').map(m => m.trim()).filter(Boolean)
    try {
      const res = await crearSuministro(token, {
        silo_origen:       formSiloOrigen,
        aux_destino:       formAuxDestino,
        kg_suministrados:  parseFloat(formKg),
        maquinas_inyeccion: maquinasArr,
      })
      setMensaje({ tipo: 'ok', texto: res.message })
      setShowForm(false)
      setFormSiloOrigen(''); setFormAuxDestino(''); setFormKg(''); setFormMaquinas('')
      cargar()
    } catch (e: any) { setMensaje({ tipo: 'error', texto: e.message }) }
  }

  // Filtrar historial
  const suministrosFiltrados = useMemo(() => {
    return suministros.filter(s => {
      if (filtroAux    && s.aux_destino !== filtroAux) return false
      if (filtroResina && !(s.sku_resina || '').toLowerCase().includes(filtroResina.toLowerCase())) return false
      if (filtroFecha  && formatFechaLocal(s.fecha_suministro) !== filtroFecha) return false
      if (filtroUsuario && !(s.creado_por || '').toLowerCase().includes(filtroUsuario.toLowerCase())) return false
      return true
    })
  }, [suministros, filtroAux, filtroResina, filtroFecha, filtroUsuario])

  // Opciones únicas para filtro AUX
  const auxUnicos = useMemo(() => {
    return Array.from(new Set(suministros.map(s => s.aux_destino))).sort()
  }, [suministros])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">🚚 Suministro a AUX</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowForm(!showForm)}
            className="bg-cyan-600 hover:bg-cyan-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            {showForm ? '✕ Cancelar' : '➕ Nuevo Suministro'}
          </button>
          <button onClick={cargar} disabled={loading}
            className="bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg text-sm font-medium text-gray-700">🔄</button>
        </div>
      </div>

      {mensaje && (
        <div className={`p-3 rounded-lg text-sm font-medium ${
          mensaje.tipo === 'ok'
            ? 'bg-green-50 text-green-700 border border-green-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>{mensaje.texto}</div>
      )}

      {/* ── Formulario nuevo suministro (SIN densidad) ── */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h3 className="font-semibold text-gray-700">Registrar Suministro</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">SILO de Salida</label>
              <select value={formSiloOrigen} onChange={e => setFormSiloOrigen(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">Seleccionar silo...</option>
                {silosPrincipales.map(s => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">AUX de Entrada</label>
              <select value={formAuxDestino} onChange={e => setFormAuxDestino(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">Seleccionar AUX...</option>
                {silosAux.map(s => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Kg a Suministrar</label>
              <input type="number" value={formKg} onChange={e => setFormKg(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                min="0" step="0.01" placeholder="Ej: 500" />
            </div>
            <div className="md:col-span-2 lg:col-span-3">
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Máquinas de Inyección <span className="text-xs text-gray-400">separadas por coma</span>
              </label>
              <input type="text" value={formMaquinas} onChange={e => setFormMaquinas(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Ej: MAQ-1, MAQ-3, MAQ-7" />
            </div>
          </div>
          <button onClick={handleCrear}
            className="bg-cyan-600 hover:bg-cyan-700 text-white px-6 py-2 rounded-lg text-sm font-medium">
            🚚 Registrar Suministro
          </button>
        </div>
      )}

      {/* ── Filtros historial ── */}
      <div className="bg-gray-50 rounded-xl border border-gray-200 p-3 grid grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">AUX Destino</label>
          <select value={filtroAux} onChange={e => setFiltroAux(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs">
            <option value="">Todos</option>
            {auxUnicos.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Resina (SKU)</label>
          <input type="text" value={filtroResina} onChange={e => setFiltroResina(e.target.value)}
            placeholder="Buscar SKU..."
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Fecha</label>
          <input type="date" value={filtroFecha} onChange={e => setFiltroFecha(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Usuario</label>
          <input type="text" value={filtroUsuario} onChange={e => setFiltroUsuario(e.target.value)}
            placeholder="Buscar usuario..."
            className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-xs" />
        </div>
      </div>

      {/* ── Historial de Suministros ── */}
      <div>
        <h3 className="font-semibold text-gray-700 mb-3">
          📋 Historial de Suministros ({suministrosFiltrados.length}
          {suministrosFiltrados.length !== suministros.length && (
            <span className="text-xs font-normal text-gray-400 ml-1">de {suministros.length}</span>
          )})
        </h3>
        {suministrosFiltrados.length === 0 ? (
          <p className="text-gray-400 text-sm py-4">
            {suministros.length === 0 ? 'No hay suministros registrados' : 'Sin resultados con los filtros aplicados'}
          </p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-600">ID</th>
                  <th className="px-3 py-2 text-left text-gray-600">SILO Origen</th>
                  <th className="px-3 py-2 text-left text-gray-600">AUX Destino</th>
                  <th className="px-3 py-2 text-left text-gray-600">Resina</th>
                  <th className="px-3 py-2 text-left text-gray-600">Grado</th>
                  <th className="px-3 py-2 text-right text-gray-600">Kg</th>
                  <th className="px-3 py-2 text-right text-gray-600">Kg Rest.</th>
                  <th className="px-3 py-2 text-right text-gray-600">Reposo Silo</th>
                  <th className="px-3 py-2 text-left text-gray-600">Máquinas</th>
                  <th className="px-3 py-2 text-left text-gray-600">Fecha</th>
                  <th className="px-3 py-2 text-left text-gray-600">Usuario</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {suministrosFiltrados.map((s: SuministroSilo) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 font-mono text-xs text-cyan-600">{s.suministro_id}</td>
                    <td className="px-3 py-2">
                      <span className="bg-orange-50 text-orange-600 px-2 py-0.5 rounded-full text-xs font-medium">
                        {s.silo_origen}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="bg-cyan-50 text-cyan-600 px-2 py-0.5 rounded-full text-xs font-medium">
                        {s.aux_destino}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">{s.sku_resina || '—'}</td>
                    <td className="px-3 py-2 text-xs text-purple-600 font-medium">{s.grado || '—'}</td>
                    <td className="px-3 py-2 text-right text-xs font-medium">{s.kg_suministrados} kg</td>
                    <td className="px-3 py-2 text-right text-xs text-green-700 font-medium">
                      {s.kg_restantes != null ? `${s.kg_restantes} kg` : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-xs">{s.tiempo_reposo_horas}h</td>
                    <td className="px-3 py-2 text-xs">
                      <div className="flex flex-wrap gap-1">
                        {(s.maquinas_inyeccion || []).map((m: string, i: number) => (
                          <span key={i} className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-xs">{m}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500 whitespace-nowrap">
                      {formatFechaHora(s.fecha_suministro)}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-500">{s.creado_por || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// SUB-TAB: REPORTE
// ══════════════════════════════════════════════════════════════════════════════

function ReporteSubTab() {
  const { token } = useAuth()
  const [ordenes, setOrdenes]         = useState<OrdenProduccionType[]>([])
  const [suministros, setSuministros] = useState<SuministroSilo[]>([])
  const [loading, setLoading]         = useState(false)
  const [filtroTurno, setFiltroTurno] = useState('')
  const [fechaFiltro, setFechaFiltro] = useState(() => {
    // Fecha local UTC-6
    return new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10)
  })

  // ── Helpers locales ──

  const cargar = async () => {
    if (!token) return
    setLoading(true)
    try {
      const [data, sums] = await Promise.all([
        getOrdenesProduccion(token, { clase: 'PRE-EXPANSION', limite: 500 }),
        getSuministros(token, 1000),
      ])

      // Filtrar OPs por fecha-turno usando los helpers globales corregidos
      const filtradas = data.filter((op: OrdenProduccionType) => {
        const ft = getFechaTurno(op.fecha_inicio)   // ← usa helper global
        if (ft !== fechaFiltro) return false
        if (filtroTurno && getTurno(op.fecha_inicio) !== filtroTurno) return false
        return true
      })
      setOrdenes(filtradas)

      // Filtrar suministros del mismo día/turno
      const sumsDelDia = sums.filter((s: SuministroSilo) => {
        const ft = getFechaTurno(s.fecha_suministro)  // ← usa helper global
        if (ft !== fechaFiltro) return false
        if (filtroTurno && getTurno(s.fecha_suministro) !== filtroTurno) return false
        return true
      })
      setSuministros(sumsDelDia)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { cargar() }, [token, fechaFiltro, filtroTurno])

  const handleDescargarExcel = async () => {
    if (!token) return
    try {
      const blob = await descargarReportePreexpansionExcel(token, fechaFiltro, filtroTurno || undefined)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `reporte_preexpansion_${fechaFiltro}${filtroTurno ? `_${filtroTurno}` : ''}.xlsx`
      a.click(); URL.revokeObjectURL(url)
    } catch {}
  }

  // ── Construir filas del reporte ──
  interface ReporteRow {
    op: OrdenProduccionType
    suministro: SuministroSilo | null
    esFilaPrincipal: boolean
  }

  const filas: ReporteRow[] = useMemo(() => {
    const rows: ReporteRow[] = []

    // OPs del día/turno
    ordenes.forEach(op => {
      const sumsDeOP = suministros.filter(s =>
        s.silo_origen_op_id === op.op_id
      )
      if (sumsDeOP.length === 0) {
        rows.push({ op, suministro: null, esFilaPrincipal: true })
      } else {
        sumsDeOP
          .sort((a, b) => (parseUTC(a.fecha_suministro)?.getTime() || 0) - (parseUTC(b.fecha_suministro)?.getTime() || 0))
          .forEach((sum, idx) => {
            rows.push({ op, suministro: sum, esFilaPrincipal: idx === 0 })
          })
      }
    })

    // Suministros "huérfanos" — del mismo día/turno pero de OPs antiguas
    // (OPs no incluidas en ordenes porque son de otro día)
    const opIdsEnReporte = new Set(ordenes.map(o => o.op_id))
    suministros.forEach(s => {
      if (s.silo_origen_op_id && opIdsEnReporte.has(s.silo_origen_op_id)) return  // ya incluido arriba
      // Suministro de silo viejo — crear fila huérfana
      rows.push({
        op: {
          // OP fantasma mínima para renderizar la fila
          op_id: s.silo_origen_op_id || '—',
          sku_producto: s.sku_resina || '—',
          grado: s.grado,
          ubicacion_destino: s.silo_origen,
          fecha_inicio: s.fecha_suministro,
          status: 'Finalizado',
          creado_por: s.creado_por,
        } as OrdenProduccionType,
        suministro: s,
        esFilaPrincipal: true,
      })
    })

    return rows
  }, [ordenes, suministros])

  const suministrosTotal = suministros.length
  const kgTotalSuministrado = suministros.reduce((acc, s) => acc + s.kg_suministrados, 0)

  return (
    <div className="space-y-4">
      {/* Header + controles */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-gray-800">📋 Reporte de Pre-Expansión</h2>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Filtro Turno */}
          <select value={filtroTurno} onChange={e => setFiltroTurno(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm">
            <option value="">Ambos turnos</option>
            <option value="DIA">☀️ DIA</option>
            <option value="NOCHE">🌙 NOCHE</option>
          </select>
          <input type="date" value={fechaFiltro} onChange={e => setFechaFiltro(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          <button onClick={handleDescargarExcel}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            📥 Descargar Excel
          </button>
          <button onClick={cargar} disabled={loading}
            className="bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-lg text-sm font-medium text-gray-700">
            🔄
          </button>
        </div>
      </div>

      {/* Encabezado info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between flex-wrap gap-2">
        <div>
          <span className="font-bold text-blue-800 text-lg">REPORTE DE PREEXPANSIÓN</span>
          <span className="ml-4 text-sm text-blue-600">
            Fecha: {fechaFiltro}{filtroTurno ? ` | Turno: ${filtroTurno}` : ''}
          </span>
        </div>
        <div className="flex gap-4 text-sm text-blue-500">
          <span>{ordenes.length} lotes</span>
          <span>{suministrosTotal} suministros</span>
          <span>{filas.length} filas</span>
        </div>
      </div>

      {/* Tabla */}
      {filas.length === 0 ? (
        <p className="text-gray-400 text-sm py-8 text-center">No hay registros para esta fecha</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-blue-600 text-white">
              <tr>
                {/* Columna Turno — nueva al inicio */}
                <th className="px-2 py-2 text-left whitespace-nowrap">Turno</th>
                <th className="px-2 py-2 text-left whitespace-nowrap">No. Costal</th>
                <th className="px-2 py-2 text-left whitespace-nowrap">No. Lote</th>
                <th className="px-2 py-2 text-left whitespace-nowrap">No. Silo</th>
                <th className="px-2 py-2 text-left whitespace-nowrap">Resina<br/>Grade</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">Densidad<br/>g/cm³</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">Pantalla<br/>Peso Kg</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">Ciclo<br/>Sec.</th>
                {/* Fecha entrada — nueva entre Ciclo e Inicio */}
                <th className="px-2 py-2 text-center whitespace-nowrap">Fecha<br/>Entrada</th>
                <th className="px-2 py-2 text-center whitespace-nowrap">Inicio<br/>Hr</th>
                <th className="px-2 py-2 text-center whitespace-nowrap">Final<br/>Hr</th>
                <th className="px-2 py-2 text-right whitespace-nowrap">Counter<br/>Tiro</th>
                <th className="px-2 py-2 text-left whitespace-nowrap">Silo de<br/>Salida</th>
                {/* Kg Enviados reemplaza Densidad Envío */}
                <th className="px-2 py-2 text-right whitespace-nowrap">Kg<br/>Enviados</th>
                {/* Kg Restantes — nueva */}
                <th className="px-2 py-2 text-right whitespace-nowrap">Kg<br/>Restantes</th>
                {/* Usuario reemplaza Máquinas */}
                <th className="px-2 py-2 text-left whitespace-nowrap">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filas.map((fila, idx) => {
                const { op, suministro: sum, esFilaPrincipal } = fila
                const turno = getTurno(op.fecha_inicio)

                return (
                  <tr key={`${op.op_id}-${sum?.suministro_id || 'base'}-${idx}`}
                    className={`hover:bg-blue-50/50 ${!esFilaPrincipal ? 'bg-cyan-50/30' : ''}`}>

                    {/* Turno */}
                    <td className="px-2 py-2">
                      {esFilaPrincipal && (
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          turno === 'DIA'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-indigo-100 text-indigo-700'
                        }`}>
                          {turno === 'DIA' ? '☀️' : '🌙'} {turno}
                        </span>
                      )}
                    </td>

                    {/* No. Costal */}
                    <td className="px-2 py-2 font-medium">
                      {esFilaPrincipal ? (op.numero_costal || '—') : ''}
                    </td>

                    {/* No. Lote */}
                    <td className="px-2 py-2 font-mono text-blue-600">
                      {esFilaPrincipal
                        ? op.op_id
                        : <span className="text-gray-400 text-xs italic">↳ suministro</span>}
                    </td>

                    {/* No. Silo */}
                    <td className="px-2 py-2">
                      {esFilaPrincipal && op.ubicacion_destino ? (
                        <span className="bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded text-xs font-medium">
                          {op.ubicacion_destino}
                        </span>
                      ) : esFilaPrincipal ? '—' : ''}
                    </td>

                    {/* Grado */}
                    <td className="px-2 py-2 text-purple-600 font-medium">
                      {esFilaPrincipal ? (op.grado || '—') : ''}
                    </td>

                    {/* Densidad */}
                    <td className="px-2 py-2 text-right">
                      {esFilaPrincipal ? (op.densidad != null ? op.densidad : '—') : ''}
                    </td>

                    {/* Pantalla Peso */}
                    <td className="px-2 py-2 text-right">
                      {esFilaPrincipal ? (op.pantalla_peso != null ? op.pantalla_peso : '—') : ''}
                    </td>

                    {/* Ciclo */}
                    <td className="px-2 py-2 text-right">
                      {esFilaPrincipal ? (op.ciclo_seg != null ? op.ciclo_seg : '—') : ''}
                    </td>

                    {/* Fecha Entrada */}
                    <td className="px-2 py-2 text-center">
                      {esFilaPrincipal ? formatFechaLocal(op.fecha_inicio) : ''}
                    </td>

                    {/* Inicio Hr */}
                    <td className="px-2 py-2 text-center">
                      {esFilaPrincipal ? formatHoraLocal(op.hora_inicio_real || op.fecha_inicio) : ''}
                    </td>

                    {/* Final Hr */}
                    <td className="px-2 py-2 text-center">
                      {esFilaPrincipal ? (
                        op.status !== 'Finalizado'
                          ? <span className="text-yellow-600 font-medium">En proceso</span>
                          : formatHoraLocal(op.hora_finalizacion || op.fecha_fin)
                      ) : ''}
                    </td>

                    {/* Counter Tiro */}
                    <td className="px-2 py-2 text-right">
                      {esFilaPrincipal ? (op.counter_tiro != null ? op.counter_tiro : '—') : ''}
                    </td>

                    {/* Silo de Salida (AUX destino) */}
                    <td className="px-2 py-2">
                      {sum ? (
                        <span className="bg-cyan-100 text-cyan-700 px-1.5 py-0.5 rounded text-xs font-medium">
                          {sum.aux_destino}
                        </span>
                      ) : '—'}
                    </td>

                    {/* Kg Enviados */}
                    <td className="px-2 py-2 text-right font-medium">
                      {sum ? `${sum.kg_suministrados} kg` : '—'}
                    </td>

                    <td className="px-2 py-2 text-right font-medium text-green-700">
                      {sum ? (
                        sum.kg_restantes != null && sum.kg_restantes > 0
                          ? `${sum.kg_restantes} kg`
                          : '0 kg'
                      ) : '—'}
                    </td>

                    {/* Usuario */}
                    <td className="px-2 py-2 text-gray-600">
                      {esFilaPrincipal ? (op.creado_por || '—') : (sum?.creado_por || '')}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Resumen */}
      {(ordenes.length > 0 || suministrosTotal > 0) && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-4">
          <h4 className="font-semibold text-gray-700 text-sm mb-2">📊 Resumen del Día</h4>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Total Lotes:</span>
              <span className="ml-2 font-bold text-gray-800">{ordenes.length}</span>
            </div>
            <div>
              <span className="text-gray-500">Finalizados:</span>
              <span className="ml-2 font-bold text-green-600">
                {ordenes.filter(o => o.status === 'Finalizado').length}
              </span>
            </div>
            <div>
              <span className="text-gray-500">Total Producido:</span>
              <span className="ml-2 font-bold text-gray-800">
                {ordenes.reduce((s, o) => s + o.cantidad_producida, 0).toFixed(2)} kg
              </span>
            </div>
            <div>
              <span className="text-gray-500">Suministros:</span>
              <span className="ml-2 font-bold text-cyan-600">{suministrosTotal}</span>
            </div>
            <div>
              <span className="text-gray-500">Total Suministrado:</span>
              <span className="ml-2 font-bold text-cyan-800">
                {kgTotalSuministrado.toFixed(2)} kg
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}