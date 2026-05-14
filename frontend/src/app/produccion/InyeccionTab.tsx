'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { useAuth } from '@/context/AuthContext'
import {
  getPlanInyeccion,
  crearPlanInyeccionBatch,
  eliminarPlanInyeccion,
  importarPlanInyeccionExcel,
  iniciarPlanInyeccion,
  avanzarPlanInyeccion,
  registrarParoPlanInyeccion,
  reanudarPlanInyeccion,
  finalizarPlanInyeccion,
  asignarAuxSiloPlanInyeccion,
  getSilosAux,
  getReporteGeneralInyeccion,
  descargarReporteGeneralInyeccionExcel,
  descargarReporteIndividualInyeccionExcel,
} from '@/lib/api'
import { UbicacionAlmacen } from '@/types'
import { PlanInyeccionItem, ParoItem, ReporteInyeccionGeneral } from '@/lib/api'

type SubTab = 'produccion' | 'reporte'

interface ParteInput {
  numero_parte: string
  plan_piezas: string
}

const MOTIVOS_PARO = [
  'Cambio de Molde',
  'Ajustes',
  'Arranque',
  'Mantenimiento',
  'Molde Dañado',
  'Falta de Personal',
  'Falta de Material',
  'Otro',
]

const MOTIVOS_MANTENIMIENTO = [
  'Soldar Puerta Eyector',
  'Estopero',
  'Bomba Hidráulica',
  'Motor Hidráulico',
  'Manguera Hidráulica',
  'Válvula Hidráulica',
  'Reloj',
  'Caldera',
  'Sensor de Seguridad',
  'Falta de Aire',
  'Fuga de Aceite',
  'Eléctrico',
  'Tolva Tapada',
  'Otro',
]

// ── Helpers ──────────────────────────────────────────────────────

function formatDuration(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds < 0) return '00:00:00'
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

function parseUTC(iso?: string): Date | null {
  if (!iso) return null
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
  return isNaN(d.getTime()) ? null : d
}

const toLocalDate = (iso?: string): Date | null => {
  const d = parseUTC(iso)
  if (!d) return null
  return new Date(d.getTime() - 6 * 60 * 60 * 1000)
}

const formatFechaHora = (iso?: string): string => {
  const d = toLocalDate(iso)
  if (!d) return '—'
  const fecha = d.toISOString().slice(0, 10)
  const hora = d.toISOString().slice(11, 16)
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

// ── Helpers de franja horaria ────────────────────────────────────

/**
 * Determina la franja horaria actual en GMT-6
 * Retorna string tipo "07:30-08:30" o null si no está en turno
 */
const getFranjaActual = (): string | null => {
  const now = new Date()
  // Convertir a GMT-6
  const localMs = now.getTime() - 6 * 60 * 60 * 1000
  const localDate = new Date(localMs)
  const hour = localDate.getUTCHours()
  const minute = localDate.getUTCMinutes()
  const totalMinutes = hour * 60 + minute
  
  // Turno DIA: 07:30 (450) a 19:30 (1170)
  if (totalMinutes >= 450 && totalMinutes < 1170) {
    const franjaInicio = Math.floor((totalMinutes - 450) / 60) * 60 + 450
    const h = Math.floor(franjaInicio / 60)
    const m = franjaInicio % 60
    const hFin = Math.floor((franjaInicio + 60) / 60)
    const mFin = (franjaInicio + 60) % 60
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}-${hFin.toString().padStart(2,'0')}:${mFin.toString().padStart(2,'0')}`
  }
  
  // Turno NOCHE: 19:30 (1170) a 07:30 (450) del día siguiente
  if (totalMinutes >= 1170 || totalMinutes < 450) {
    let franjaInicio: number
    if (totalMinutes >= 1170) {
      franjaInicio = Math.floor((totalMinutes - 1170) / 60) * 60 + 1170
    } else {
      franjaInicio = Math.floor((totalMinutes + 1440 - 1170) / 60) * 60 + 1170
      if (franjaInicio >= 1440) franjaInicio -= 1440
    }
    const h = Math.floor(franjaInicio / 60) % 24
    const m = franjaInicio % 60
    const hFin = Math.floor((franjaInicio + 60) / 60) % 24
    const mFin = (franjaInicio + 60) % 60
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}-${hFin.toString().padStart(2,'0')}:${mFin.toString().padStart(2,'0')}`
  }
  
  return null
}

/**
 * Convierte un timestamp ISO a franja horaria GMT-6
 */
const getFranjaFromTimestamp = (iso?: string): string | null => {
  if (!iso) return null
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
  if (isNaN(d.getTime())) return null
  
  const localMs = d.getTime() - 6 * 60 * 60 * 1000
  const localDate = new Date(localMs)
  const hour = localDate.getUTCHours()
  const minute = localDate.getUTCMinutes()
  const totalMinutes = hour * 60 + minute
  
  // Determinar franja (mismo cálculo que arriba)
  if (totalMinutes >= 450 && totalMinutes < 1170) {
    const franjaInicio = Math.floor((totalMinutes - 450) / 60) * 60 + 450
    const h = Math.floor(franjaInicio / 60)
    const m = franjaInicio % 60
    const hFin = Math.floor((franjaInicio + 60) / 60)
    const mFin = (franjaInicio + 60) % 60
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}-${hFin.toString().padStart(2,'0')}:${mFin.toString().padStart(2,'0')}`
  }
  
  if (totalMinutes >= 1170 || totalMinutes < 450) {
    let franjaInicio: number
    if (totalMinutes >= 1170) {
      franjaInicio = Math.floor((totalMinutes - 1170) / 60) * 60 + 1170
    } else {
      franjaInicio = Math.floor((totalMinutes + 1440 - 1170) / 60) * 60 + 1170
      if (franjaInicio >= 1440) franjaInicio -= 1440
    }
    const h = Math.floor(franjaInicio / 60) % 24
    const m = franjaInicio % 60
    const hFin = Math.floor((franjaInicio + 60) / 60) % 24
    const mFin = (franjaInicio + 60) % 60
    return `${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}-${hFin.toString().padStart(2,'0')}:${mFin.toString().padStart(2,'0')}`
  }
  
  return null
}

// ══════════════════════════════════════════════════════════════════
// FIX: Helper para determinar turno desde hora UTC usando GMT-6
// ══════════════════════════════════════════════════════════════════
const getTurnoFromUTC = (iso?: string): 'DIA' | 'NOCHE' | '—' => {
  const d = parseUTC(iso)
  if (!d) return '—'
  // Convertir a GMT-6
  const localMs = d.getTime() - 6 * 60 * 60 * 1000
  const localDate = new Date(localMs)
  const hour = localDate.getUTCHours()  // Usamos UTCHours porque ya hicimos el offset manual
  const minute = localDate.getUTCMinutes()
  
  // Turno DIA: 07:30 a 19:29:59
  // Turno NOCHE: 19:30 a 07:29:59 (del día siguiente)
  const totalMinutes = hour * 60 + minute
  
  if (totalMinutes >= 450 && totalMinutes < 1170) {  // 07:30 = 450, 19:30 = 1170
    return 'DIA'
  } else {
    return 'NOCHE'
  }
}

// ══════════════════════════════════════════════════════════════════
export default function InyeccionTab() {
  const [subTab, setSubTab] = useState<SubTab>('produccion')
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
        {([
          { id: 'produccion' as SubTab, label: '🏭 Producción' },
          { id: 'reporte' as SubTab, label: '📋 Reporte' },
        ]).map(tab => (
          <button key={tab.id} onClick={() => setSubTab(tab.id)}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
              subTab === tab.id ? 'bg-white text-purple-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {tab.label}
          </button>
        ))}
      </div>
      {subTab === 'produccion' && <ProduccionSubTab />}
      {subTab === 'reporte' && <ReporteSubTab />}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// SUB-TAB: PRODUCCIÓN (con Paros integrados)
// ══════════════════════════════════════════════════════════════════

function ProduccionSubTab() {
  const { token } = useAuth()
  const [items, setItems] = useState<PlanInyeccionItem[]>([])
  const [loading, setLoading] = useState(false)
  const [mensaje, setMensaje] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  // Formulario plan
  const [showForm, setShowForm] = useState(false)
  const [formMaquina, setFormMaquina] = useState('')
  const [formPrioridad, setFormPrioridad] = useState('')
  const [formCav, setFormCav] = useState('')
  const [formAuxSilo, setFormAuxSilo] = useState('')
  const [partes, setPartes] = useState<ParteInput[]>([{ numero_parte: '', plan_piezas: '' }])

  // Silos AUX disponibles
  const [silosAux, setSilosAux] = useState<UbicacionAlmacen[]>([])

  // Importar Excel
  const fileRef = useRef<HTMLInputElement>(null)

  // Avance modal
  const [avanceModal, setAvanceModal] = useState<{id: number; cav: number; numero_parte: string} | null>(null)
  const [avanceTiempoCiclo, setAvanceTiempoCiclo] = useState('')
  const [avanceContadorHora, setAvanceContadorHora] = useState('')

  // Reanudar modal
  const [reanudarModal, setReanudarModal] = useState<{id: number; maquina: string; numero_parte: string} | null>(null)
  const [reanudarMotivo, setReanudarMotivo] = useState('')
  const [reanudarMotivoMantenimiento, setReanudarMotivoMantenimiento] = useState('')
  const [reanudarComentarios, setReanudarComentarios] = useState('')

  // ══════════════════════════════════════════════════════════════════
  // FIX: Modal de confirmación para finalizar
  // ══════════════════════════════════════════════════════════════════
  const [finalizarModal, setFinalizarModal] = useState<{id: number; numero_parte: string; maquina: string} | null>(null)

  // ══════════════════════════════════════════════════════════════════
  // FIX: Modal de confirmación para eliminar
  // ══════════════════════════════════════════════════════════════════
  const [eliminarModal, setEliminarModal] = useState<{id: number; numero_parte: string; maquina: string} | null>(null)

  // ══════════════════════════════════════════════════════════════════
  // FIX: Modal de confirmación para paro
  // ══════════════════════════════════════════════════════════════════
  const [paroModal, setParoModal] = useState<{id: number; numero_parte: string; maquina: string} | null>(null)

  // Contador en vivo
  const [nowTick, setNowTick] = useState(Date.now())

    // ── Verificar si ya se registró avance en la hora actual ──
  const puedeRegistrarAvance = (item: PlanInyeccionItem): boolean => {
    // Si no está en proceso o está en paro, no puede
    if (item.status !== 'En Proceso' || item.en_paro) return false
    
    // Si no hay hora_ultimo_inicio, es la primera vez → permitir
    if (!item.hora_ultimo_inicio) return true
    
    const ultimo = parseUTC(item.hora_ultimo_inicio)
    if (!ultimo) return true
    
    const ahora = Date.now()
    const ultimoMs = ultimo.getTime()
    
    // Calcular franjas horarias en GMT-6
    const getFranjaIndex = (timestampMs: number): number => {
      const localMs = timestampMs - 6 * 60 * 60 * 1000
      const d = new Date(localMs)
      const hour = d.getUTCHours()
      const minute = d.getUTCMinutes()
      const totalMinutes = hour * 60 + minute
      
      if (totalMinutes >= 450 && totalMinutes < 1170) {
        // Turno día: franjas de 60 min desde 07:30
        return Math.floor((totalMinutes - 450) / 60)
      }
      if (totalMinutes >= 1170) {
        // Noche primera parte
        return Math.floor((totalMinutes - 1170) / 60) + 12
      }
      // Noche segunda parte (madrugada)
      return Math.floor((totalMinutes + 1440 - 1170) / 60) + 12
    }
    
    const franjaUltimo = getFranjaIndex(ultimoMs)
    const franjaActual = getFranjaIndex(ahora)
    
    // Solo permitir si estamos en una franja diferente
    return franjaActual > franjaUltimo
  }

  // ── Carga ──
  const cargar = async () => {
    if (!token) return
    setLoading(true)
    try {
      const data = await getPlanInyeccion(token)
      setItems(data)
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [token])

  useEffect(() => {
    if (!mensaje) return
    const t = setTimeout(() => setMensaje(null), 8000)
    return () => clearTimeout(t)
  }, [mensaje])

  // Cargar silos AUX
  useEffect(() => {
    if (!token) return
    const cargarSilos = async () => {
      try {
        const data = await getSilosAux(token)
        setSilosAux(data)
      } catch {}
    }
    cargarSilos()
  }, [token])

  useEffect(() => {
    const iv = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [])

  // ── Handlers form ──
  const agregarParte = () => {
    setPartes(prev => [...prev, { numero_parte: '', plan_piezas: '' }])
  }

  const quitarParte = (idx: number) => {
    setPartes(prev => prev.filter((_, i) => i !== idx))
  }

  const actualizarParte = (idx: number, campo: keyof ParteInput, valor: string) => {
    setPartes(prev => prev.map((p, i) => i === idx ? { ...p, [campo]: valor } : p))
  }

  const validarPrioridad = (): boolean => {
    const maquina = formMaquina.trim().toUpperCase()
    const prioridad = parseInt(formPrioridad)
    if (!maquina || isNaN(prioridad)) return true
    const conflicto = items.find(i => 
      i.prioridad === prioridad && 
      i.maquina !== maquina && 
      i.status !== 'Finalizado'
    )
    if (conflicto) {
      setMensaje({ tipo: 'error', texto: `La prioridad ${prioridad} ya está asignada a la máquina ${conflicto.maquina} (activa)` })
      return false
    }
    return true
  }

  const handleGuardar = async () => {
    if (!token) return
    const maquina = formMaquina.trim().toUpperCase()
    const prioridad = parseInt(formPrioridad)
    const cav = parseInt(formCav)
    if (!maquina || isNaN(prioridad)) {
      setMensaje({ tipo: 'error', texto: 'Ingresa máquina y prioridad' })
      return
    }
    if (isNaN(cav) || cav < 1) {
      setMensaje({ tipo: 'error', texto: 'Ingresa un número de cavidades válido' })
      return
    }
    const validas = partes.filter(p => p.numero_parte.trim() && parseInt(p.plan_piezas) > 0)
    if (validas.length === 0) {
      setMensaje({ tipo: 'error', texto: 'Agrega al menos un número de parte con plan válido' })
      return
    }
    if (!validarPrioridad()) return

    const payload = validas.map((p, idx) => ({
      maquina,
      prioridad,
      cav,
      numero_parte: p.numero_parte.trim().toUpperCase(),
      plan_piezas: parseInt(p.plan_piezas),
      orden_secuencia: idx,
      aux_silo: formAuxSilo || null,
      paros: [],
      piezas_producidas: 0,
      status: 'Pendiente',
      tiempo_acumulado_seg: 0,
      en_paro: false,
    }))

    try {
      await crearPlanInyeccionBatch(token, payload)
      setMensaje({ tipo: 'ok', texto: 'Plan guardado correctamente' })
      setShowForm(false)
      setFormMaquina(''); setFormPrioridad(''); setFormCav(''); setFormAuxSilo(''); setPartes([{ numero_parte: '', plan_piezas: '' }])
      cargar()
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message })
    }
  }

  const handleImportar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!token || !e.target.files?.[0]) return
    try {
      const res = await importarPlanInyeccionExcel(token, e.target.files[0])
      let texto = `${res.message} — ${res.creados} registros creados.`
      if (res.errores.length > 0) texto += ` Errores: ${res.errores.length}`
      setMensaje({ tipo: res.errores.length ? 'error' : 'ok', texto })
      cargar()
    } catch (err: any) {
      setMensaje({ tipo: 'error', texto: err.message })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // FIX: Abrir modal de confirmación para eliminar (reemplaza confirm nativo)
  // ══════════════════════════════════════════════════════════════════
  const handleClickEliminar = (id: number, numeroParte: string, maquina: string) => {
    setEliminarModal({ id, numero_parte: numeroParte, maquina })
  }

  const handleConfirmarEliminar = async () => {
    if (!token || !eliminarModal) return
    try {
      await eliminarPlanInyeccion(token, eliminarModal.id)
      setMensaje({ tipo: 'ok', texto: 'Registro eliminado correctamente' })
      setEliminarModal(null)
      cargar()
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message })
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // FIX: Abrir modal de confirmación para paro
  // ══════════════════════════════════════════════════════════════════
  const handleClickParo = (id: number, numeroParte: string, maquina: string) => {
    setParoModal({ id, numero_parte: numeroParte, maquina })
  }

  const handleConfirmarParo = async () => {
    if (!token || !paroModal) return
    try {
      await registrarParoPlanInyeccion(token, paroModal.id, {
        motivo: '',
        comentarios: '',
      })
      setMensaje({ tipo: 'ok', texto: 'Paro registrado correctamente' })
      setParoModal(null)
      cargar()
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message })
    }
  }

  const handleIniciar = async (id: number) => {
    if (!token) return
    try {
      await iniciarPlanInyeccion(token, id)
      cargar()
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message })
    }
  }

  const handleAsignarAuxSilo = async (id: number, auxSilo: string) => {
    if (!token) return
    try {
      await asignarAuxSiloPlanInyeccion(token, id, auxSilo)
      cargar()
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message })
    }
  }

  const handleAvanzar = async () => {
    if (!token || !avanceModal || !avanceTiempoCiclo || !avanceContadorHora) return
    try {
      const piezas = parseInt(avanceContadorHora) * avanceModal.cav
      await avanzarPlanInyeccion(
        token,
        avanceModal.id,
        piezas,
        parseFloat(avanceTiempoCiclo),
        parseInt(avanceContadorHora)
      )
      setAvanceModal(null)
      setAvanceTiempoCiclo('')
      setAvanceContadorHora('')
      cargar()
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message })
    }
  }

  const handleReanudar = async () => {
    if (!token || !reanudarModal) return
    if (!reanudarMotivo) {
      setMensaje({ tipo: 'error', texto: 'Selecciona un motivo de paro' })
      return
    }
    if (reanudarMotivo === 'Mantenimiento' && !reanudarMotivoMantenimiento) {
      setMensaje({ tipo: 'error', texto: 'Selecciona un motivo de mantenimiento' })
      return
    }

    try {
      await reanudarPlanInyeccion(token, reanudarModal.id, {
        motivo: reanudarMotivo,
        motivo_mantenimiento: reanudarMotivo === 'Mantenimiento' ? reanudarMotivoMantenimiento : null,
        comentarios: reanudarComentarios.trim(),
      })
      setMensaje({ tipo: 'ok', texto: 'Orden reanudada correctamente' })
      setReanudarModal(null)
      setReanudarMotivo(''); setReanudarMotivoMantenimiento(''); setReanudarComentarios('')
      cargar()
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message })
    }
  }

  const handleClickFinalizar = (id: number, numeroParte: string, maquina: string) => {
    setFinalizarModal({ id, numero_parte: numeroParte, maquina })
  }

  const handleConfirmarFinalizar = async () => {
    if (!token || !finalizarModal) return
    try {
      const res = await finalizarPlanInyeccion(token, finalizarModal.id)
      let texto = res.message
      if (res.siguiente_iniciado) {
        texto += ` → Siguiente iniciado: ${res.siguiente_iniciado.numero_parte}`
      }
      setMensaje({ tipo: 'ok', texto })
      setFinalizarModal(null)
      cargar()
    } catch (e: any) {
      setMensaje({ tipo: 'error', texto: e.message })
    }
  }

  // ── Computed ──
  const pendientes = items.filter(i => i.status === 'Pendiente')
  const enProceso = items.filter(i => i.status === 'En Proceso')
  const finalizadas = items.filter(i => i.status === 'Finalizado')

  const gruposPendientes = useMemo(() => {
    const map = new Map<string, PlanInyeccionItem[]>()
    pendientes.forEach(p => {
      const key = `${p.maquina}|${p.prioridad}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    })
    map.forEach(arr => arr.sort((a, b) => a.orden_secuencia - b.orden_secuencia))
    return Array.from(map.entries()).sort((a, b) => a[1][0].prioridad - b[1][0].prioridad)
  }, [pendientes])

  const calcularTiempoTrabajo = (item: PlanInyeccionItem): number => {
    let total = item.tiempo_acumulado_seg || 0
    if (!item.en_paro && item.hora_ultimo_inicio) {
      const ultimo = parseUTC(item.hora_ultimo_inicio)
      if (ultimo) {
        total += Math.floor((nowTick - ultimo.getTime()) / 1000)
      }
    }
    return total
  }

  const calcularTiempoParoVivo = (item: PlanInyeccionItem): number => {
    if (!item.en_paro || !item.paros) return 0
    const paroActivo = [...item.paros].reverse().find(p => p.status === 'Activo')
    if (!paroActivo) return 0
    const inicio = parseUTC(paroActivo.inicio)
    if (!inicio) return 0
    return Math.floor((nowTick - inicio.getTime()) / 1000)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">🏭 Producción — Inyección</h2>
        <div className="flex gap-2">
          <button onClick={() => setShowForm(!showForm)}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            {showForm ? '✕ Cancelar' : '➕ Nuevo Plan'}
          </button>
          <button onClick={() => fileRef.current?.click()}
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
            📥 Importar Excel
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportar} />
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

      {/* ── Formulario ── */}
      {showForm && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <h3 className="font-semibold text-gray-700 flex items-center gap-2">
            📋 Nuevo Plan de Inyección
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Máquina</label>
              <input value={formMaquina} onChange={e => setFormMaquina(e.target.value)}
                onBlur={validarPrioridad}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm uppercase"
                placeholder="Ej: INY-01" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Prioridad</label>
              <input type="number" value={formPrioridad} onChange={e => setFormPrioridad(e.target.value)}
                onBlur={validarPrioridad}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="1, 2, 3..." min={1} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Cav</label>
              <input type="number" value={formCav} onChange={e => setFormCav(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                placeholder="Ej: 4" min={1} />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-600 mb-1">Silo Aux</label>
              <select value={formAuxSilo} onChange={e => setFormAuxSilo(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">-- Seleccionar AUX --</option>
                {silosAux.map(s => (
                  <option key={s.id} value={s.nombre}>{s.nombre}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <span className="text-xs text-gray-400">
                La prioridad define el orden entre máquinas. No puede repetirse en otra máquina.
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="border-t pt-4">
              <label className="block text-sm font-medium text-gray-600 mb-2">Números de Parte</label>
              <div className="space-y-2">
                {partes.map((p, idx) => (
                  <div key={idx} className="flex gap-2 items-center border-b pb-2 last:border-b-0">
                    <input value={p.numero_parte} onChange={e => actualizarParte(idx, 'numero_parte', e.target.value)}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm uppercase"
                      placeholder="No. de Parte" />
                    <input type="number" value={p.plan_piezas} onChange={e => actualizarParte(idx, 'plan_piezas', e.target.value)}
                      className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                      placeholder="Plan" min={1} />
                    {partes.length > 1 && (
                      <button onClick={() => quitarParte(idx)}
                        className="text-red-400 hover:text-red-600 px-2">✕</button>
                    )}
                  </div>
                ))}
                <div className="pt-4">
                  <button onClick={agregarParte}
                    className="flex items-center gap-1 text-sm text-purple-600 hover:text-purple-800 font-medium">
                    ➕ Agregar otro número de parte
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <button onClick={handleGuardar}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
              💾 Guardar Plan
            </button>
          </div>
        </div>
      )}

      {/* NIVEL 1: PLANIFICACIÓN */}
      <div>
        <h3 className="font-semibold text-gray-700 mb-3">📋 Planificación ({pendientes.length})</h3>
        {gruposPendientes.length === 0 ? (
          <p className="text-gray-400 text-sm py-4">No hay órdenes pendientes</p>
        ) : (
          <div className="space-y-4">
            {gruposPendientes.map(([key, grupo]) => (
              <div key={key} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-gray-800">{grupo[0].maquina}</span>
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                      Prioridad {grupo[0].prioridad}
                    </span>
                    <span className="text-xs text-gray-400">{grupo.length} parte(s)</span>
                  </div>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-4 py-2 text-left text-gray-600">Sec</th>
                      <th className="px-4 py-2 text-left text-gray-600">No. Parte</th>
                      <th className="px-4 py-2 text-right text-gray-600">Plan</th>
                      <th className="px-4 py-2 text-left text-gray-600">Silo Aux</th>
                      <th className="px-4 py-2 text-center text-gray-600">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {grupo.map(item => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 text-gray-400 text-xs">{item.orden_secuencia + 1}</td>
                        <td className="px-4 py-2 font-medium">{item.numero_parte}</td>
                        <td className="px-4 py-2 text-right">{item.plan_piezas.toLocaleString()} pz</td>
                        <td className="px-4 py-2">
                          <select
                            value={item.aux_silo || ''}
                            onChange={e => handleAsignarAuxSilo(item.id, e.target.value)}
                            className="border border-gray-300 rounded px-2 py-1 text-xs w-full"
                          >
                            <option value="">-- AUX --</option>
                            {silosAux.map(s => (
                              <option key={s.id} value={s.nombre}>{s.nombre}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <div className="flex justify-center gap-2">
                            <button onClick={() => handleIniciar(item.id)}
                              className="bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1 rounded-lg text-xs font-medium">
                              ▶ Iniciar
                            </button>
                            {/* FIX: Abrir modal de confirmación en lugar de confirm nativo */}
                            <button onClick={() => handleClickEliminar(item.id, item.numero_parte, item.maquina)}
                              className="text-red-400 hover:text-red-600 text-xs">🗑</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* NIVEL 2: EN PROCESO (con Paros integrados) */}
      <div>
        <h3 className="font-semibold text-gray-700 mb-3">🟢 En Proceso ({enProceso.length})</h3>
        {enProceso.length === 0 ? (
          <p className="text-gray-400 text-sm py-4">No hay órdenes en proceso</p>
        ) : (
          <div className="space-y-3">
            {enProceso.map(item => {
              const pct = item.plan_piezas > 0
                ? Math.min(100, Math.round((item.piezas_producidas / item.plan_piezas) * 100))
                : 0
              const tiempoTrabajo = calcularTiempoTrabajo(item)
              const tiempoParo = calcularTiempoParoVivo(item)
              const estaEnParo = item.en_paro

              return (
                <div key={item.id} className={`rounded-xl border p-4 transition-all ${
                  estaEnParo 
                    ? 'border-red-400 bg-red-50 shadow-md' 
                    : 'border-gray-200 bg-white'
                }`}>
                  {/* Header de la tarjeta */}
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-bold text-gray-800">{item.maquina}</span>
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                        Prio {item.prioridad}
                      </span>
                      <span className="font-mono font-semibold text-purple-600">{item.numero_parte}</span>
                      {item.aux_silo && (
                        <span className="text-xs bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded-full font-medium">
                          🏭 {item.aux_silo}
                        </span>
                      )}
                      {estaEnParo && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold animate-pulse">
                          🛑 EN PARO
                        </span>
                      )}
                    </div>

                    {/* Contadores */}
                    <div className="flex items-center gap-4">
                      {estaEnParo ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-red-500 font-medium">Tiempo Paro:</span>
                          <span className="font-mono text-lg font-bold text-red-600 tracking-wider">
                            {formatDuration(tiempoParo)}
                          </span>
                        </div>
                      ) : (
                        <div className="font-mono text-lg font-bold text-gray-800 tracking-wider">
                          {formatDuration(tiempoTrabajo)}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Barra de progreso */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex-1 bg-gray-100 rounded-full h-3">
                      <div 
                        className={`h-3 rounded-full transition-all ${estaEnParo ? 'bg-red-400' : 'bg-purple-500'}`} 
                        style={{ width: `${pct}%` }} 
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-700 w-40 text-right">
                      {item.piezas_producidas.toLocaleString()} / {item.plan_piezas.toLocaleString()} ({pct}%)
                    </span>
                  </div>

                  {/* Botones de acción */}
                  <div className="flex flex-wrap items-center gap-2">
                    {!estaEnParo ? (
                      <>
                        {(() => {
                          const puedeAvanzar = puedeRegistrarAvance(item)
                          return (
                            <button 
                              onClick={() => puedeAvanzar && setAvanceModal({id: item.id, cav: item.cav, numero_parte: item.numero_parte})}
                              disabled={!puedeAvanzar}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                                puedeAvanzar
                                  ? 'bg-blue-100 hover:bg-blue-200 text-blue-700'
                                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                              }`}
                              title={puedeAvanzar ? 'Registrar avance de esta hora' : 'Ya se registró avance en esta hora. Espere la siguiente franja.'}
                            >
                              {puedeAvanzar ? '➕ Registrar Avance' : '⏳ Esperar siguiente hora'}
                            </button>
                          )
                        })()}
                        <button onClick={() => handleClickParo(item.id, item.numero_parte, item.maquina)}
                          className="bg-red-100 hover:bg-red-200 text-red-700 px-3 py-1.5 rounded-lg text-xs font-medium">
                          🛑 Paro
                        </button>
                        <button onClick={() => handleClickFinalizar(item.id, item.numero_parte, item.maquina)}
                          className="bg-green-100 hover:bg-green-200 text-green-700 px-3 py-1.5 rounded-lg text-xs font-medium">
                          ✅ Finalizar
                        </button>
                      </>
                    ) : (
                      <button onClick={() => setReanudarModal({
                          id: item.id, 
                          maquina: item.maquina, 
                          numero_parte: item.numero_parte
                        })}
                        className="bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-4 py-2 rounded-lg text-sm font-bold">
                        ▶ Reanudar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* NIVEL 3: FINALIZADAS */}
      {finalizadas.length > 0 && (
        <div>
          <h3 className="font-semibold text-gray-700 mb-3">✅ Finalizadas ({finalizadas.length})</h3>
          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-blue-600 text-white">
                <tr>
                  <th className="px-3 py-2 text-left whitespace-nowrap">Máquina</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">Prioridad</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">No. Parte</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Plan</th>
                  <th className="px-3 py-2 text-right whitespace-nowrap">Producido</th>
                  <th className="px-3 py-2 text-center whitespace-nowrap">Inicio</th>
                  <th className="px-3 py-2 text-center whitespace-nowrap">Fin</th>
                  <th className="px-3 py-2 text-left whitespace-nowrap">Tiempo Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {finalizadas.map(item => (
                  <tr key={item.id} className="hover:bg-blue-50/50">
                    <td className="px-3 py-2 font-medium">{item.maquina}</td>
                    <td className="px-3 py-2 text-xs">
                      <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                        {item.prioridad}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono text-purple-600 font-semibold">{item.numero_parte}</td>
                    <td className="px-3 py-2 text-right">{item.plan_piezas.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right font-bold text-emerald-600">{item.piezas_producidas.toLocaleString()}</td>
                    <td className="px-3 py-2 text-center text-xs text-gray-500 whitespace-nowrap">
                      {item.hora_inicio ? formatFechaHora(item.hora_inicio) : '—'}
                    </td>
                    <td className="px-3 py-2 text-center text-xs text-gray-500 whitespace-nowrap">
                      {item.hora_fin ? formatFechaHora(item.hora_fin) : '—'}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs font-medium text-blue-600">
                      {formatDuration(item.tiempo_acumulado_seg)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL: Confirmar Eliminar
          ════════════════════════════════════════════════════════════════════════ */}
      {eliminarModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-800">🗑 Eliminar Registro</h3>
            <p className="text-sm text-gray-500">
              ¿Estás seguro de eliminar la orden de la máquina{' '}
              <span className="font-bold">{eliminarModal.maquina}</span> con la parte{' '}
              <span className="font-bold">{eliminarModal.numero_parte}</span>?
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-700">
              ⚠️ Esta acción no se puede deshacer. El registro se eliminará permanentemente del plan.
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setEliminarModal(null)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
              <button onClick={handleConfirmarEliminar}
                className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-lg text-sm font-medium">
                🗑 Confirmar Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          MODAL: Confirmar Paro
          ════════════════════════════════════════════════════════════════════════ */}
      {paroModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-800">🛑 Registrar Paro</h3>
            <p className="text-sm text-gray-500">
              ¿Estás seguro de registrar un paro para la máquina{' '}
              <span className="font-bold">{paroModal.maquina}</span> con la parte{' '}
              <span className="font-bold">{paroModal.numero_parte}</span>?
            </p>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-700">
              ⚠️ El tiempo de paro comenzará a contar inmediatamente. Asegúrate de que la máquina realmente esté detenida.
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setParoModal(null)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
              <button onClick={handleConfirmarParo}
                className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-lg text-sm font-medium">
                🛑 Confirmar Paro
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Confirmar Finalizar */}
      {finalizarModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-800">✅ Finalizar Orden</h3>
            <p className="text-sm text-gray-500">
              ¿Estás seguro de finalizar la orden de la máquina{' '}
              <span className="font-bold">{finalizarModal.maquina}</span> con la parte{' '}
              <span className="font-bold">{finalizarModal.numero_parte}</span>?
            </p>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-700">
              ⚠️ Esta acción no se puede deshacer. Se creará el lote de inventario y se iniciará la siguiente orden en secuencia si existe.
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setFinalizarModal(null)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
              <button onClick={handleConfirmarFinalizar}
                className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-medium">
                ✅ Confirmar Finalizar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Reanudar (captura motivo del paro) */}
      {reanudarModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-800">▶ Reanudar Orden</h3>
            <p className="text-sm text-gray-500">
              Máquina: <span className="font-bold">{reanudarModal.maquina}</span> | 
              Parte: <span className="font-bold">{reanudarModal.numero_parte}</span>
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Motivo del Paro *</label>
              <select value={reanudarMotivo} onChange={e => setReanudarMotivo(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                <option value="">Seleccionar...</option>
                {MOTIVOS_PARO.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            {reanudarMotivo === 'Mantenimiento' && (
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Motivo del Mantenimiento *</label>
                <select value={reanudarMotivoMantenimiento} onChange={e => setReanudarMotivoMantenimiento(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Seleccionar...</option>
                  {MOTIVOS_MANTENIMIENTO.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Comentarios</label>
              <textarea value={reanudarComentarios} onChange={e => setReanudarComentarios(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                rows={2} placeholder="Describe lo ocurrido durante el paro..." />
            </div>

            <div className="flex gap-3 justify-end">
              <button onClick={() => {
                  setReanudarModal(null)
                  setReanudarMotivo(''); setReanudarMotivoMantenimiento(''); setReanudarComentarios('')
                }}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
              <button onClick={handleReanudar}
                disabled={!reanudarMotivo || (reanudarMotivo === 'Mantenimiento' && !reanudarMotivoMantenimiento)}
                className={`px-5 py-2 rounded-lg text-sm font-medium ${
                  reanudarMotivo && (reanudarMotivo !== 'Mantenimiento' || reanudarMotivoMantenimiento)
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}>
                ▶ Reanudar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Registrar Avance */}
      {avanceModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h3 className="text-lg font-bold text-gray-800">➕ Registrar Avance</h3>
            <p className="text-sm text-gray-500">
              Parte: <span className="font-bold">{avanceModal.numero_parte}</span> | Cav: <span className="font-bold">{avanceModal.cav}</span>
            </p>

            <div className="bg-blue-50 rounded-lg p-3 text-sm">
              <span className="text-gray-600">Piezas a registrar: </span>
              <span className="font-bold text-blue-700">
                {avanceContadorHora && avanceModal ? (parseInt(avanceContadorHora || '0') * avanceModal.cav).toLocaleString() : '—'} pz
              </span>
              <span className="text-xs text-gray-400 ml-2">({avanceContadorHora || 0} × {avanceModal?.cav} cav)</span>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Tiempo de Ciclo (segundos)</label>
              <input type="number" value={avanceTiempoCiclo} onChange={e => setAvanceTiempoCiclo(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Ej: 45" min={0} step={0.1} autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Contador por Hora</label>
              <input type="number" value={avanceContadorHora} onChange={e => setAvanceContadorHora(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Ej: 120" min={0} />
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setAvanceModal(null); setAvanceTiempoCiclo(''); setAvanceContadorHora('') }}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
              <button onClick={handleAvanzar}
                disabled={!avanceTiempoCiclo || !avanceContadorHora}
                className={`px-5 py-2 rounded-lg text-sm font-medium ${
                  avanceTiempoCiclo && avanceContadorHora
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}>
                Registrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════
// SUB-TAB: REPORTE — FIX: Turno calculado correctamente con GMT-6
// ══════════════════════════════════════════════════════════════════

function ReporteSubTab() {
  const { token } = useAuth()
  const [reporte, setReporte] = useState<ReporteInyeccionGeneral[]>([])
  const [loading, setLoading] = useState(false)
  const [filtroTurno, setFiltroTurno] = useState('')
  const [fechaFiltro, setFechaFiltro] = useState(() => {
    return new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString().slice(0, 10)
  })

  const cargar = async () => {
    if (!token) return
    setLoading(true)
    try {
      const data = await getReporteGeneralInyeccion(token, fechaFiltro, filtroTurno || undefined)
      setReporte(data)
    } catch (e: any) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [token, fechaFiltro, filtroTurno])

  const handleDescargarExcel = async () => {
    if (!token) return
    try {
      const blob = await descargarReporteGeneralInyeccionExcel(token, fechaFiltro, filtroTurno || undefined)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `reporte_inyeccion_${fechaFiltro}${filtroTurno ? `_${filtroTurno}` : ''}.xlsx`
      a.click(); URL.revokeObjectURL(url)
    } catch (e: any) {
      console.error(e)
    }
  }

  const handleDescargarIndividual = async (ordenId: number, numeroParte: string, maquina: string) => {
    if (!token) return
    try {
      const blob = await descargarReporteIndividualInyeccionExcel(token, ordenId)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `reporte_individual_${numeroParte}_${maquina}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e: any) {
      console.error(e)
    }
  }

  const fmtTime = (segundos: number): string => {
    if (!segundos) return '00:00:00'
    const h = Math.floor(segundos / 3600)
    const m = Math.floor((segundos % 3600) / 60)
    const s = segundos % 60
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
  }

  // ══════════════════════════════════════════════════════════════════
  // FIX: Helper para calcular turno correcto desde UTC con offset GMT-6
  // ══════════════════════════════════════════════════════════════════
  const calcularTurnoReal = (iso?: string): 'DIA' | 'NOCHE' | '—' => {
    if (!iso) return '—'
    const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
    if (isNaN(d.getTime())) return '—'
    // Convertir UTC a GMT-6
    const localMs = d.getTime() - 6 * 60 * 60 * 1000
    const localDate = new Date(localMs)
    const hour = localDate.getUTCHours()
    const minute = localDate.getUTCMinutes()
    const totalMinutes = hour * 60 + minute
    
    // DIA: 07:30 (450 min) hasta 19:29:59 (1169 min)
    // NOCHE: 19:30 (1170 min) hasta 07:29:59 (449 min del día siguiente)
    if (totalMinutes >= 450 && totalMinutes < 1170) {
      return 'DIA'
    }
    return 'NOCHE'
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-gray-800">📋 Reporte de Inyección</h2>
        <div className="flex items-center gap-3 flex-wrap">
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

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between flex-wrap gap-2">
        <div>
          <span className="font-bold text-blue-800 text-lg">REPORTE DE INYECCIÓN</span>
          <span className="ml-4 text-sm text-blue-600">
            Fecha: {fechaFiltro}{filtroTurno ? ` | Turno: ${filtroTurno}` : ''}
          </span>
        </div>
        <div className="flex gap-4 text-sm text-blue-500">
          <span>{reporte.length} registros</span>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-blue-600 text-white">
            <tr>
              <th className="px-2 py-2 text-left whitespace-nowrap">Lote</th>
              <th className="px-2 py-2 text-left whitespace-nowrap">Fecha</th>
              <th className="px-2 py-2 text-center whitespace-nowrap">Turno</th>
              <th className="px-2 py-2 text-left whitespace-nowrap">No. Parte</th>
              <th className="px-2 py-2 text-left whitespace-nowrap">Máquina</th>
              <th className="px-2 py-2 text-center whitespace-nowrap">Cav</th>
              <th className="px-2 py-2 text-center whitespace-nowrap">Ciclo</th>
              <th className="px-2 py-2 text-center whitespace-nowrap">Tiempo Trabajo</th>
              <th className="px-2 py-2 text-right whitespace-nowrap">Meta Plan</th>
              <th className="px-2 py-2 text-right whitespace-nowrap">Prod. Total</th>
              <th className="px-2 py-2 text-center whitespace-nowrap">% Prod</th>
              <th className="px-2 py-2 text-center whitespace-nowrap">Descargar</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {reporte.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-8 text-center text-gray-400">
                  No hay registros para el filtro seleccionado
                </td>
              </tr>
            ) : (
              reporte.map((row, idx) => {
                // FIX: Calcular turno real con GMT-6
                const turnoReal = calcularTurnoReal(row.fecha)
                // Si el backend ya envía turno_real, usarlo; si no, usar el calculado
                const turnoDisplay = row.turno_real || turnoReal
                
                return (
                  <tr key={idx} className="hover:bg-blue-50/50">
                    <td className="px-2 py-2 font-mono text-xs">{row.lote}</td>
                    <td className="px-2 py-2">{row.fecha}</td>
                    <td className="px-2 py-2 text-center">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        turnoDisplay === 'DIA'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-indigo-100 text-indigo-700'
                      }`}>
                        {turnoDisplay === 'DIA' ? '☀️' : '🌙'} {turnoDisplay}
                      </span>
                    </td>
                    <td className="px-2 py-2 font-medium">{row.numero_parte}</td>
                    <td className="px-2 py-2">{row.maquina}</td>
                    <td className="px-2 py-2 text-center">{row.cav}</td>
                    <td className="px-2 py-2 text-center">{row.ciclo || '—'}</td>
                    <td className="px-2 py-2 text-center font-mono">{fmtTime(row.tiempo_trabajo)}</td>
                    <td className="px-2 py-2 text-right">{row.meta_plan.toLocaleString()}</td>
                    <td className="px-2 py-2 text-right font-bold text-emerald-600">{row.produccion_total.toLocaleString()}</td>
                    <td className="px-2 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        row.percent_prod >= 100 ? 'bg-green-100 text-green-700'
                          : row.percent_prod >= 80 ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                      }`}>
                        {row.percent_prod}%
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button onClick={() => handleDescargarIndividual(row.orden_id, row.numero_parte, row.maquina)}
                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-600 px-2 py-1.5 rounded-lg text-xs font-medium"
                        title="Descargar Reporte Individual">
                        📥
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}