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
  crearReporteManualInyeccion,
  getReportesManualesInyeccion,
  eliminarReporteManualInyeccion,
  importarReporteManualInyeccionExcel,
} from '@/lib/api'
import { UbicacionAlmacen, ReporteManualInyeccion } from '@/types'
import { PlanInyeccionItem, ReporteInyeccionGeneral } from '@/lib/api'
import CuartoSecadoTab from './CuartoSecadoTab'
import DashboardInyeccionTab from './DashboardInyeccionTab'


type SubTab = 'produccion' | 'secado' | 'reporte' | 'reporte-manual' | 'dashboard'

interface ParteInput {
  numero_parte: string
  plan_piezas: string
}

const MOTIVOS_PARO = [
  'Cambio de Molde', 'Ajustes', 'Arranque', 'Mantenimiento',
  'Molde Dañado', 'Falta de Personal', 'Falta de Material', 'Otro',
]

const MOTIVOS_MANTENIMIENTO = [
  'Soldar Puerta Eyector', 'Estopero', 'Bomba Hidráulica', 'Motor Hidráulico',
  'Manguera Hidráulica', 'Válvula Hidráulica', 'Reloj', 'Caldera',
  'Sensor de Seguridad', 'Falta de Aire', 'Fuga de Aceite', 'Eléctrico',
  'Tolva Tapada', 'Otro',
]

// ── Helpers ──────────────────────────────────────────────────────
function fmtDur(s: number): string {
  if (!s || s < 0) return '00:00:00'
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60
  return ` ${String(h).padStart(2,'0')}: ${String(m).padStart(2,'0')}: ${String(ss).padStart(2,'0')}`
}

function parseUTC(iso?: string): Date | null {
  if (!iso) return null
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
  return isNaN(d.getTime()) ? null : d
}

function toLocalDate(iso?: string): Date | null {
  const d = parseUTC(iso)
  return d ? new Date(d.getTime() - 6 * 3600000) : null
}

function fmtDateTime(iso?: string): string {
  const d = toLocalDate(iso)
  if (!d) return '—'
  return d.toISOString().slice(0, 10) + ' ' + d.toISOString().slice(11, 16)
}

function getFranjaIndex(ms: number): number {
  const localMs = ms - 6 * 3600000
  const d = new Date(localMs)
  const total = d.getUTCHours() * 60 + d.getUTCMinutes()
  if (total >= 450 && total < 1170) return Math.floor((total - 450) / 60)
  if (total >= 1170) return Math.floor((total - 1170) / 60) + 12
  return Math.floor((total + 1440 - 1170) / 60) + 12
}

function getTurnoFromISO(iso?: string): 'DIA' | 'NOCHE' {
  const d = parseUTC(iso)
  if (!d) return 'NOCHE'
  const local = new Date(d.getTime() - 6 * 3600000)
  const total = local.getUTCHours() * 60 + local.getUTCMinutes()
  return total >= 450 && total < 1170 ? 'DIA' : 'NOCHE'
}

// ═══════════════════════════════════════════════════════════════
// ROOT COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function InyeccionTab() {
  const [subTab, setSubTab] = useState<SubTab>('produccion')

  const tabs: { id: SubTab; label: string; icon: string }[] = [
    { id: 'produccion',     label: 'Producción',     icon: '⚙️' },
    { id: 'secado',         label: 'Cuarto Secado',  icon: '🌡️' },
    { id: 'reporte',        label: 'Reporte',        icon: '📊' },
    { id: 'reporte-manual', label: 'Reporte Manual', icon: '📝' },
    { id: 'dashboard',      label: 'Dashboard',      icon: '📈' },
  ]

  return (
    <div className="min-h-full rounded-[14px] p-[18px] bg-[radial-gradient(circle_at_top,rgba(245,158,11,0.05),transparent_28%),linear-gradient(180deg,#0a0a0a_0%,#000000_100%)] text-white">
      <div className="flex gap-[2px] bg-gray-950 border border-gray-800 rounded-[10px] p-1 mb-5 shadow-[0_10px_30px_rgba(0,0,0,0.28)]">
        {tabs.map(t => (
          <button
            key={t.id}
            className={`flex-1 px-2 py-[9px] rounded-[7px] border-none bg-transparent text-gray-400 text-xs font-medium cursor-pointer transition-all duration-150 tracking-wide whitespace-nowrap hover:text-white hover:bg-gray-800 ${subTab === t.id ? ' bg-amber-500 text-black font-semibold shadow-[0_2px_8px_rgba(245,158,11,0.35)]': ''}`}
            onClick={() => setSubTab(t.id)}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-[calc(100vh-240px)] bg-transparent">
        {subTab === 'produccion'     && <ProduccionSubTab />}
        {subTab === 'secado'         && <CuartoSecadoTab />}
        {subTab === 'reporte'        && <ReporteSubTab />}
        {subTab === 'reporte-manual' && <ReporteManualSubTab />}
        {subTab === 'dashboard'      && <DashboardInyeccionTab />}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SUB-TAB: PRODUCCIÓN
// ═══════════════════════════════════════════════════════════════
function ProduccionSubTab() {
  const { token } = useAuth()
  const [items, setItems]     = useState<PlanInyeccionItem[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg]         = useState<{tipo:'ok'|'error'; texto:string}|null>(null)
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [formMaquina, setFormMaquina]     = useState('')
  const [formPrioridad, setFormPrioridad] = useState('')
  const [formCav, setFormCav]             = useState('')
  const [formAuxSilo, setFormAuxSilo]     = useState('')
  const [partes, setPartes] = useState<ParteInput[]>([{ numero_parte: '', plan_piezas: '' }])
  const [silosAux, setSilosAux] = useState<UbicacionAlmacen[]>([])

  // Modals
  const [avanceModal, setAvanceModal]     = useState<{id:number;cav:number;numero_parte:string}|null>(null)
  const [avanceCiclo, setAvanceCiclo]     = useState('')
  const [avanceContador, setAvanceContador] = useState('')
  const [reanudarModal, setReanudarModal] = useState<{id:number;maquina:string;numero_parte:string}|null>(null)
  const [reanudarMotivo, setReanudarMotivo]           = useState('')
  const [reanudarSubMotivo, setReanudarSubMotivo]     = useState('')
  const [reanudarComentarios, setReanudarComentarios] = useState('')
  const [finalizarModal, setFinalizarModal]   = useState<{id:number;numero_parte:string;maquina:string}|null>(null)
  const [eliminarModal, setEliminarModal]     = useState<{id:number;numero_parte:string;maquina:string}|null>(null)
  const [paroModal, setParoModal]             = useState<{id:number;numero_parte:string;maquina:string}|null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const [nowTick, setNowTick] = useState(Date.now())

  const cargar = async () => {
    if (!token) return
    setLoading(true)
    try { setItems(await getPlanInyeccion(token)) }
    catch (e: any) { showMsg('error', e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { cargar() }, [token])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 7000)
    return () => clearTimeout(t)
  }, [msg])
  useEffect(() => {
    if (!token) return
    getSilosAux(token).then(setSilosAux).catch(() => {})
  }, [token])
  useEffect(() => {
    const iv = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(iv)
  }, [])

  const showMsg = (tipo: 'ok'|'error', texto: string) => setMsg({ tipo, texto })

  const puedeAvanzar = (item: PlanInyeccionItem): boolean => {
    if (item.status !== 'En Proceso' || item.en_paro) return false
    if (!item.hora_ultimo_avance) return true
    const ultimo = parseUTC(item.hora_ultimo_avance)
    if (!ultimo) return true
    return getFranjaIndex(nowTick) > getFranjaIndex(ultimo.getTime())
  }

  const calcTrabajo = (item: PlanInyeccionItem): number => {
    let t = item.tiempo_acumulado_seg || 0
    if (!item.en_paro && item.hora_ultimo_inicio) {
      const ul = parseUTC(item.hora_ultimo_inicio)
      if (ul) t += Math.floor((nowTick - ul.getTime()) / 1000)
    }
    return t
  }

  const calcParo = (item: PlanInyeccionItem): number => {
    if (!item.en_paro || !item.paros) return 0
    const activo = [...item.paros].reverse().find(p => p.status === 'Activo')
    if (!activo) return 0
    const ini = parseUTC(activo.inicio)
    return ini ? Math.floor((nowTick - ini.getTime()) / 1000) : 0
  }

  // Lists
  const pendientes = items.filter(i => i.status === 'Pendiente')
  const enProceso  = items.filter(i => i.status === 'En Proceso')
  const finalizados = items.filter(i => i.status === 'Finalizado')

  const gruposPendientes = useMemo(() => {
    const map = new Map<string, PlanInyeccionItem[]>()
    pendientes.forEach(p => {
      const k = ` ${p.maquina}| ${p.prioridad}`
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(p)
    })
    map.forEach(arr => arr.sort((a,b) => a.orden_secuencia - b.orden_secuencia))
    return Array.from(map.entries()).sort((a,b) => a[1][0].prioridad - b[1][0].prioridad)
  }, [pendientes])

  // Handlers
  const handleGuardar = async () => {
    if (!token) return
    const maquina   = formMaquina.trim().toUpperCase()
    const prioridad = parseInt(formPrioridad)
    const cav       = parseInt(formCav)
    if (!maquina || isNaN(prioridad)) { showMsg('error', 'Ingresa máquina y prioridad'); return }
    if (isNaN(cav) || cav < 1)        { showMsg('error', 'Ingresa número de cavidades válido'); return }
    const validas = partes.filter(p => p.numero_parte.trim() && parseInt(p.plan_piezas) > 0)
    if (!validas.length)              { showMsg('error', 'Agrega al menos un número de parte'); return }
    try {
      await crearPlanInyeccionBatch(token, validas.map((p, idx) => ({
        maquina, prioridad, cav, numero_parte: p.numero_parte.trim().toUpperCase(),
        plan_piezas: parseInt(p.plan_piezas), orden_secuencia: idx,
        aux_silo: formAuxSilo || null, paros: [], piezas_producidas: 0,
        status: 'Pendiente', tiempo_acumulado_seg: 0, en_paro: false,
      })))
      showMsg('ok', 'Plan guardado correctamente')
      setShowForm(false)
      setFormMaquina(''); setFormPrioridad(''); setFormCav(''); setFormAuxSilo('')
      setPartes([{ numero_parte: '', plan_piezas: '' }])
      cargar()
    } catch (e: any) { showMsg('error', e.message) }
  }

  const handleImportar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!token || !e.target.files?.[0]) return
    try {
      const res = await importarPlanInyeccionExcel(token, e.target.files[0])
      showMsg(res.errores.length ? 'error' : 'ok', ` ${res.message} — ${res.creados} creados`)
      cargar()
    } catch (e: any) { showMsg('error', e.message) }
    finally { if (fileRef.current) fileRef.current.value = '' }
  }

  const handleIniciar = async (id: number) => {
    if (!token) return
    try { await iniciarPlanInyeccion(token, id); cargar() }
    catch (e: any) { showMsg('error', e.message) }
  }

  const handleAuxSilo = async (id: number, val: string) => {
    if (!token) return
    try { await asignarAuxSiloPlanInyeccion(token, id, val); cargar() }
    catch (e: any) { showMsg('error', e.message) }
  }

  const handleAvanzar = async () => {
    if (!token || !avanceModal || !avanceCiclo || !avanceContador) return
    try {
      const piezas = parseInt(avanceContador) * avanceModal.cav
      await avanzarPlanInyeccion(token, avanceModal.id, piezas, parseFloat(avanceCiclo), parseInt(avanceContador))
      setAvanceModal(null); setAvanceCiclo(''); setAvanceContador('')
      cargar()
    } catch (e: any) { showMsg('error', e.message) }
  }

  const handleConfirmarParo = async () => {
    if (!token || !paroModal) return
    try {
      await registrarParoPlanInyeccion(token, paroModal.id, { motivo: '', comentarios: '' })
      showMsg('ok', 'Paro registrado')
      setParoModal(null); cargar()
    } catch (e: any) { showMsg('error', e.message) }
  }

  const handleReanudar = async () => {
    if (!token || !reanudarModal || !reanudarMotivo) { showMsg('error', 'Selecciona un motivo'); return }
    if (reanudarMotivo === 'Mantenimiento' && !reanudarSubMotivo) { showMsg('error', 'Selecciona motivo de mantenimiento'); return }
    try {
      await reanudarPlanInyeccion(token, reanudarModal.id, {
        motivo: reanudarMotivo,
        motivo_mantenimiento: reanudarMotivo === 'Mantenimiento' ? reanudarSubMotivo : null,
        comentarios: reanudarComentarios.trim(),
      })
      showMsg('ok', 'Orden reanudada')
      setReanudarModal(null); setReanudarMotivo(''); setReanudarSubMotivo(''); setReanudarComentarios('')
      cargar()
    } catch (e: any) { showMsg('error', e.message) }
  }

  const handleConfirmarFinalizar = async () => {
    if (!token || !finalizarModal) return
    try {
      const res = await finalizarPlanInyeccion(token, finalizarModal.id)
      showMsg('ok', res.message + (res.siguiente_iniciado ? ` → Siguiente: ${res.siguiente_iniciado.numero_parte}` : ''))
      setFinalizarModal(null); cargar()
    } catch (e: any) { showMsg('error', e.message) }
  }

  const handleConfirmarEliminar = async () => {
    if (!token || !eliminarModal) return
    try {
      await eliminarPlanInyeccion(token, eliminarModal.id)
      showMsg('ok', 'Registro eliminado')
      setEliminarModal(null); cargar()
    } catch (e: any) { showMsg('error', e.message) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* ── Header row ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#ededed' }}>⚙️ Plan de Inyección</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
            {pendientes.length} pendiente · {enProceso.length} en proceso · {finalizados.length} finalizado
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-amber-500 text-black border-amber-500 hover:bg-amber-400" onClick={() => setShowForm(!showForm)}>
            {showForm ? '✕ Cancelar' : '＋ Nuevo Plan'}
          </button>
          <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-emerald-500/100/10 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/100/20" onClick={() => fileRef.current?.click()}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Importar Excel
          </button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportar} />
          <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-transparent text-gray-400 border-gray-800 hover:text-white hover:border-gray-700 hover:bg-gray-800" onClick={cargar} disabled={loading}>
            {loading ? '⟳' : '↻'} Actualizar
          </button>
        </div>
      </div>

      {/* Alert */}
      {msg && (
        <div className={`px-3.5 py-2.5 rounded-[7px] text-xs font-medium flex items-start gap-2 animate-[slide-in_0.2s_ease] ${msg.tipo === 'ok' ? 'bg-emerald-500/100/10 text-emerald-500 border border-emerald-500/30' : 'bg-red-500/100/10 text-red-500 border border-red-500/30'}`}>
          {msg.tipo === 'ok' ? '✓' : '⚠'} {msg.texto}
        </div>
      )}

      {/* ── Nuevo Plan form ── */}
      {showForm && (
        <div className="bg-gray-900 border border-gray-800 rounded-[10px] overflow-hidden">
          <div className="px-4 py-3 bg-gray-800 border-b border-gray-800 flex items-center gap-[10px]">
            <span style={{ fontSize: 12, fontWeight: 700, color: '#f59e0b' }}>NUEVO PLAN</span>
          </div>
          <div className="p-4" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10 }}>
              {[
                { label: 'Máquina', val: formMaquina, set: setFormMaquina, up: true },
                { label: 'Prioridad', val: formPrioridad, set: setFormPrioridad, num: true },
                { label: 'Cavidades', val: formCav, set: setFormCav, num: true },
              ].map(f => (
                <div key={f.label}>
                  <label className="block text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400 mb-[5px]">{f.label}</label>
                  <input
                    className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none transition-colors duration-150 appearance-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 placeholder:text-gray-400"
                    type={f.num ? 'number' : 'text'}
                    value={f.val}
                    onChange={e => f.set(f.up ? e.target.value.toUpperCase() : e.target.value)}
                    min={f.num ? 1 : undefined}
                  />
                </div>
              ))}
              <div>
                <label className="block text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400 mb-[5px]">Silo AUX</label>
                <select className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none transition-colors duration-150 appearance-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15" value={formAuxSilo} onChange={e => setFormAuxSilo(e.target.value)}>
                  <option value="">— Sin AUX —</option>
                  {silosAux.map(s => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
                </select>
              </div>
            </div>

            <div className="h-px bg-gray-800 my-4" style={{ margin: '4px 0' }} />
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#9ca3af', marginBottom: 6 }}>NÚMEROS DE PARTE</div>

            {partes.map((p, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none transition-colors duration-150 appearance-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 placeholder:text-gray-400"
                  style={{ flex: 2 }}
                  placeholder="No. de Parte"
                  value={p.numero_parte}
                  onChange={e => {
                    const n = [...partes]; n[idx].numero_parte = e.target.value.toUpperCase(); setPartes(n)
                  }}
                />
                <input
                  className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none transition-colors duration-150 appearance-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 placeholder:text-gray-400"
                  style={{ flex: 1 }}
                  type="number"
                  placeholder="Plan pzas"
                  value={p.plan_piezas}
                  min={1}
                  onChange={e => {
                    const n = [...partes]; n[idx].plan_piezas = e.target.value; setPartes(n)
                  }}
                />
                {partes.length > 1 && (
                  <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-red-500/100/10 text-red-500 border border-red-500/30 hover:bg-red-500/100/20" style={{ padding: '7px 10px' }}
                    onClick={() => setPartes(partes.filter((_, i) => i !== idx))}>✕</button>
                )}
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
              <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-transparent text-gray-400 border-gray-800 hover:text-white hover:border-gray-700 hover:bg-gray-800"
                onClick={() => setPartes([...partes, { numero_parte: '', plan_piezas: '' }])}>
                ＋ Agregar parte
              </button>
              <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-amber-500 text-black border-amber-500 hover:bg-amber-400" onClick={handleGuardar}>💾 Guardar Plan</button>
            </div>
          </div>
        </div>
      )}

      {/* ── PENDIENTES ── */}
      {pendientes.length > 0 && (
        <div>
          <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-amber-500 mb-2.5 flex items-center gap-2 after:content-[''] after:flex-1 after:h-px after:bg-gray-800">Planificación · {pendientes.length}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {gruposPendientes.map(([key, grupo]) => (
              <div key={key} className="bg-gray-900 border border-gray-800 rounded-[10px] overflow-hidden">
                <div className="px-4 py-3 bg-gray-800 border-b border-gray-800 flex items-center gap-[10px]">
                  <span className="font-mono text-[13px] font-semibold text-amber-500 bg-amber-500/10 border border-amber-500/30 px-[10px] py-0.5 rounded">{grupo[0].maquina}</span>
                  <span className="text-[10px] font-semibold tracking-[0.06em] uppercase px-2 py-0.5 rounded-[20px] inline-flex items-center gap-1 bg-gray-400/10 text-gray-400 border border-gray-400/25">PRIORIDAD {grupo[0].prioridad}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 'auto' }}>{grupo.length} parte(s)</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr>
                        <th>#</th><th>No. de Parte</th><th className="r">Plan</th>
                        <th>Silo AUX</th><th className="c">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grupo.map(item => (
                        <tr key={item.id}>
                          <td style={{ color: '#9ca3af', fontSize: 11 }}>{item.orden_secuencia + 1}</td>
                          <td><span className="font-mono text-[13px] font-medium text-cyan-500">{item.numero_parte}</span></td>
                          <td className="r mono" style={{ color: '#ededed' }}>{item.plan_piezas.toLocaleString()}</td>
                          <td>
                            <select className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none transition-colors duration-150 appearance-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15" style={{ fontSize: 11 }}
                              value={item.aux_silo || ''}
                              onChange={e => handleAuxSilo(item.id, e.target.value)}>
                              <option value="">— AUX —</option>
                              {silosAux.map(s => <option key={s.id} value={s.nombre}>{s.nombre}</option>)}
                            </select>
                          </td>
                          <td className="c">
                            <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                              <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-emerald-500/100/10 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/100/20" onClick={() => handleIniciar(item.id)}>▶ Iniciar</button>
                              <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-red-500/100/10 text-red-500 border border-red-500/30 hover:bg-red-500/100/20" style={{ padding: '7px 10px' }}
                                onClick={() => setEliminarModal({ id: item.id, numero_parte: item.numero_parte, maquina: item.maquina })}>
                                🗑
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── EN PROCESO ── */}
      {enProceso.length > 0 && (
        <div>
          <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-amber-500 mb-2.5 flex items-center gap-2 after:content-[''] after:flex-1 after:h-px after:bg-gray-800">En Proceso · {enProceso.length}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {enProceso.map(item => {
              const pct = item.plan_piezas > 0 ? Math.min(100, Math.round((item.piezas_producidas / item.plan_piezas) * 100)) : 0
              const trabajo = calcTrabajo(item)
              const paro   = calcParo(item)
              const enParo = item.en_paro
              const puedAv = puedeAvanzar(item)

              return (
                <div key={item.id} className={`bg-gray-900 border border-gray-800 rounded-[10px] transition-[border-color] duration-200 ${enParo ? ' border-red-500/50 bg-red-500/100/5': ''}`}>
                  {/* Top row */}
                  <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-[10px] flex-wrap">
                    <span className="font-mono text-[13px] font-semibold text-amber-500 bg-amber-500/10 border border-amber-500/30 px-[10px] py-0.5 rounded">{item.maquina}</span>
                    <span className="text-[10px] font-semibold tracking-[0.06em] uppercase px-2 py-0.5 rounded-[20px] inline-flex items-center gap-1 bg-gray-400/10 text-gray-400 border border-gray-400/25" style={{ fontSize: 10 }}>P{item.prioridad}</span>
                    <span className="font-mono text-[13px] font-medium text-cyan-500">{item.numero_parte}</span>
                    {item.aux_silo && (
                      <span className="text-[10px] font-semibold tracking-[0.06em] uppercase px-2 py-0.5 rounded-[20px] inline-flex items-center gap-1" style={{ background: 'rgba(6,182,212,0.1)', color: '#06b6d4', border: '1px solid rgba(6,182,212,0.25)', fontSize: 10 }}>
                        🏭 {item.aux_silo}
                      </span>
                    )}
                    <span className={`text-[10px] font-semibold tracking-[0.06em] uppercase px-2 py-0.5 rounded-[20px] inline-flex items-center gap-1 ${enParo ? 'bg-red-500/100/10 text-red-500 border border-red-500/30 animate-[blink-pill_1s_ease-in-out_infinite]' : 'bg-emerald-500/100/10 text-emerald-500 border border-emerald-500/30'}`}>
                      {enParo ? '⬛ PARO' : '⬤ ACTIVO'}
                    </span>
                    <div style={{ marginLeft: 'auto' }}>
                      <span className={`font-mono text-[22px] font-semibold text-white tracking-wide ${enParo ? ' text-red-500': ''}`}>
                        {fmtDur(enParo ? paro : trabajo)}
                      </span>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="px-4 py-3.5">
                    {/* Progress */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                      <div className="h-[6px] bg-gray-800 rounded-[3px] overflow-hidden" style={{ flex: 1 }}>
                        <div className={`h-full rounded-[3px] transition-[width] duration-[400ms] bg-gradient-to-r from-amber-500 to-amber-400 ${enParo ? ' border-red-500/50 bg-red-500/100/5' : pct >= 100 ? ' bg-gradient-to-r from-emerald-500 to-emerald-400': ''}`} style={{ width: `${pct}%` }} />
                      </div>
                      <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 12, color: '#9ca3af', whiteSpace: 'nowrap' }}>
                        {item.piezas_producidas.toLocaleString()} / {item.plan_piezas.toLocaleString()}
                        <span style={{ color: pct >= 100 ? '#10b981' : enParo ? '#ef4444' : '#f59e0b', marginLeft: 6 }}>
                          {pct}%
                        </span>
                      </span>
                    </div>

                    {/* Actions */}
                    {!enParo ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        <button
                          className={`inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed ${puedAv ? 'bg-amber-500 text-black border-amber-500 hover:bg-amber-400' : 'bg-transparent text-gray-400 border-gray-800 hover:text-white hover:border-gray-700 hover:bg-gray-800'}`}
                          disabled={!puedAv}
                          onClick={() => puedAv && setAvanceModal({ id: item.id, cav: item.cav, numero_parte: item.numero_parte })}
                          title={puedAv ? '' : 'Ya se registró avance en esta franja horaria'}
                        >
                          {puedAv ? '➕ Registrar Avance' : '⏳ Esperar siguiente hora'}
                        </button>
                        <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-red-500/100/10 text-red-500 border border-red-500/30 hover:bg-red-500/100/20"
                          onClick={() => setParoModal({ id: item.id, numero_parte: item.numero_parte, maquina: item.maquina })}>
                          ⏸ Paro
                        </button>
                        <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-emerald-500/100/10 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/100/20"
                          onClick={() => setFinalizarModal({ id: item.id, numero_parte: item.numero_parte, maquina: item.maquina })}>
                          ✓ Finalizar
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <div className="bg-red-500/100/10 border border-red-500/25 rounded-[7px] px-3 py-2.5 text-[11px] text-red-400" style={{ flex: 1 }}>
                          Máquina en paro — registra el motivo para reanudar
                        </div>
                        <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-amber-500 text-black border-amber-500 hover:bg-amber-400"
                          onClick={() => setReanudarModal({ id: item.id, maquina: item.maquina, numero_parte: item.numero_parte })}>
                          ▶ Reanudar
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {pendientes.length === 0 && enProceso.length === 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-[10px] overflow-hidden">
          <div className="px-5 py-10 text-center text-gray-400">
            <div className="text-[32px] mb-2 opacity-50">⚙️</div>
            <div className="text-[13px]">No hay órdenes activas. Crea un plan o importa desde Excel.</div>
          </div>
        </div>
      )}

      {/* ── FINALIZADAS ── */}
      {finalizados.length > 0 && (
        <div>
          <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-amber-500 mb-2.5 flex items-center gap-2 after:content-[''] after:flex-1 after:h-px after:bg-gray-800">Finalizadas · {finalizados.length}</div>
          <div className="bg-gray-900 border border-gray-800 rounded-[10px] overflow-hidden overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th>Máquina</th><th>P</th><th>No. de Parte</th>
                  <th className="r">Plan</th><th className="r">Producido</th>
                  <th className="c">Inicio</th><th className="c">Fin</th>
                  <th className="c">Tiempo</th>
                </tr>
              </thead>
              <tbody>
                {finalizados.map(item => (
                  <tr key={item.id}>
                    <td><span className="font-mono text-[13px] font-semibold text-amber-500 bg-amber-500/10 border border-amber-500/30 px-[10px] py-0.5 rounded">{item.maquina}</span></td>
                    <td><span className="text-[10px] font-semibold tracking-[0.06em] uppercase px-2 py-0.5 rounded-[20px] inline-flex items-center gap-1 bg-blue-500/100/10 text-blue-500 border border-blue-500/30">{item.prioridad}</span></td>
                    <td><span className="font-mono text-[13px] font-medium text-cyan-500">{item.numero_parte}</span></td>
                    <td className="r mono">{item.plan_piezas.toLocaleString()}</td>
                    <td className="r mono" style={{ color: '#10b981', fontWeight: 600 }}>{item.piezas_producidas.toLocaleString()}</td>
                    <td className="c" style={{ fontSize: 11, color: '#9ca3af' }}>{fmtDateTime(item.hora_inicio)}</td>
                    <td className="c" style={{ fontSize: 11, color: '#9ca3af' }}>{fmtDateTime(item.hora_fin)}</td>
                    <td className="c mono" style={{ color: '#3b82f6', fontSize: 11 }}>{fmtDur(item.tiempo_acumulado_seg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ MODALS ═══ */}

      {/* Avance */}
      {avanceModal && (
        <div className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4 backdrop-blur-[3px] animate-[fade-in_0.15s_ease]">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-[480px] shadow-[0_20px_60px_rgba(0,0,0,0.6)] animate-[modal-in_0.2s_ease]">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <span className="text-sm font-bold text-white">➕ Registrar Avance</span>
              <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-transparent text-gray-400 border-gray-800 hover:text-white hover:border-gray-700 hover:bg-gray-800" style={{ padding: '4px 10px' }}
                onClick={() => { setAvanceModal(null); setAvanceCiclo(''); setAvanceContador('') }}>✕</button>
            </div>
            <div className="p-5" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ background: '#1f2937', borderRadius: 7, padding: '10px 14px', fontSize: 12 }}>
                <span className="font-mono text-[13px] font-medium text-cyan-500">{avanceModal.numero_parte}</span>
                <span style={{ color: '#9ca3af', marginLeft: 10 }}>Cav: {avanceModal.cav}</span>
              </div>
              {avanceCiclo && avanceContador && (
                <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 7, padding: '10px 14px', textAlign: 'center' }}>
                  <span style={{ fontSize: 11, color: '#9ca3af' }}>Piezas a registrar: </span>
                  <span style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 20, fontWeight: 600, color: '#f59e0b', marginLeft: 6 }}>
                    {(parseInt(avanceContador || '0') * avanceModal.cav).toLocaleString()}
                  </span>
                  <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 6 }}>({avanceContador} × {avanceModal.cav} cav)</span>
                </div>
              )}
              <div><label className="block text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400 mb-[5px]">Tiempo de Ciclo (seg)</label>
                <input className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none transition-colors duration-150 appearance-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 placeholder:text-gray-400" type="number" min={0} step={0.1} value={avanceCiclo}
                  onChange={e => setAvanceCiclo(e.target.value)} autoFocus placeholder="ej: 45" /></div>
              <div><label className="block text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400 mb-[5px]">Contador por Hora</label>
                <input className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none transition-colors duration-150 appearance-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 placeholder:text-gray-400" type="number" min={0} value={avanceContador}
                  onChange={e => setAvanceContador(e.target.value)} placeholder="ej: 120" /></div>
            </div>
            <div className="px-5 py-3.5 border-t border-gray-800 flex gap-2 justify-end">
              <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-transparent text-gray-400 border-gray-800 hover:text-white hover:border-gray-700 hover:bg-gray-800" onClick={() => { setAvanceModal(null); setAvanceCiclo(''); setAvanceContador('') }}>Cancelar</button>
              <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-amber-500 text-black border-amber-500 hover:bg-amber-400" disabled={!avanceCiclo || !avanceContador} onClick={handleAvanzar}>Registrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Paro */}
      {paroModal && (
        <div className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4 backdrop-blur-[3px] animate-[fade-in_0.15s_ease]">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-[480px] shadow-[0_20px_60px_rgba(0,0,0,0.6)] animate-[modal-in_0.2s_ease]">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <span className="text-sm font-bold text-white">⏸ Registrar Paro</span>
            </div>
            <div className="p-5" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, color: '#9ca3af' }}>
                Máquina <span style={{ color: '#ededed', fontWeight: 600 }}>{paroModal.maquina}</span> · <span className="font-mono text-[13px] font-medium text-cyan-500">{paroModal.numero_parte}</span>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/25 rounded-[7px] px-3 py-2.5 text-[11px] text-amber-400">El cronómetro de paro comenzará inmediatamente. El motivo se registra al reanudar.</div>
            </div>
            <div className="px-5 py-3.5 border-t border-gray-800 flex gap-2 justify-end">
              <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-transparent text-gray-400 border-gray-800 hover:text-white hover:border-gray-700 hover:bg-gray-800" onClick={() => setParoModal(null)}>Cancelar</button>
              <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-red-500/100/10 text-red-500 border border-red-500/30 hover:bg-red-500/100/20" onClick={handleConfirmarParo}>⏸ Confirmar Paro</button>
            </div>
          </div>
        </div>
      )}

      {/* Reanudar */}
      {reanudarModal && (
        <div className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4 backdrop-blur-[3px] animate-[fade-in_0.15s_ease]">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-[480px] shadow-[0_20px_60px_rgba(0,0,0,0.6)] animate-[modal-in_0.2s_ease]">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <span className="text-sm font-bold text-white">▶ Reanudar — Registrar Motivo de Paro</span>
            </div>
            <div className="p-5" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 12, color: '#9ca3af' }}>
                {reanudarModal.maquina} · <span className="font-mono text-[13px] font-medium text-cyan-500">{reanudarModal.numero_parte}</span>
              </div>
              <div>
                <label className="block text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400 mb-[5px]">Motivo del Paro *</label>
                <select className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none transition-colors duration-150 appearance-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15" value={reanudarMotivo} onChange={e => setReanudarMotivo(e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {MOTIVOS_PARO.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              {reanudarMotivo === 'Mantenimiento' && (
                <div>
                  <label className="block text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400 mb-[5px]">Motivo de Mantenimiento *</label>
                  <select className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none transition-colors duration-150 appearance-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15" value={reanudarSubMotivo} onChange={e => setReanudarSubMotivo(e.target.value)}>
                    <option value="">— Seleccionar —</option>
                    {MOTIVOS_MANTENIMIENTO.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400 mb-[5px]">Comentarios</label>
                <textarea className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none transition-colors duration-150 appearance-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15" rows={2} value={reanudarComentarios}
                  onChange={e => setReanudarComentarios(e.target.value)} placeholder="Describe lo ocurrido..." />
              </div>
            </div>
            <div className="px-5 py-3.5 border-t border-gray-800 flex gap-2 justify-end">
              <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-transparent text-gray-400 border-gray-800 hover:text-white hover:border-gray-700 hover:bg-gray-800" onClick={() => {
                setReanudarModal(null); setReanudarMotivo(''); setReanudarSubMotivo(''); setReanudarComentarios('')
              }}>Cancelar</button>
              <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-amber-500 text-black border-amber-500 hover:bg-amber-400"
                disabled={!reanudarMotivo || (reanudarMotivo === 'Mantenimiento' && !reanudarSubMotivo)}
                onClick={handleReanudar}>▶ Reanudar</button>
            </div>
          </div>
        </div>
      )}

      {/* Finalizar */}
      {finalizarModal && (
        <div className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4 backdrop-blur-[3px] animate-[fade-in_0.15s_ease]">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-[480px] shadow-[0_20px_60px_rgba(0,0,0,0.6)] animate-[modal-in_0.2s_ease]">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <span className="text-sm font-bold text-white">✓ Finalizar Orden</span>
            </div>
            <div className="p-5" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, color: '#9ca3af' }}>
                <span style={{ color: '#ededed', fontWeight: 600 }}>{finalizarModal.maquina}</span> · <span className="font-mono text-[13px] font-medium text-cyan-500">{finalizarModal.numero_parte}</span>
              </div>
              <div className="bg-amber-500/10 border border-amber-500/25 rounded-[7px] px-3 py-2.5 text-[11px] text-amber-400">Se creará el lote de inventario. Si hay una siguiente parte en secuencia, iniciará automáticamente.</div>
            </div>
            <div className="px-5 py-3.5 border-t border-gray-800 flex gap-2 justify-end">
              <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-transparent text-gray-400 border-gray-800 hover:text-white hover:border-gray-700 hover:bg-gray-800" onClick={() => setFinalizarModal(null)}>Cancelar</button>
              <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-emerald-500/100/10 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/100/20" onClick={handleConfirmarFinalizar}>✓ Confirmar</button>
            </div>
          </div>
        </div>
      )}

      {/* Eliminar */}
      {eliminarModal && (
        <div className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4 backdrop-blur-[3px] animate-[fade-in_0.15s_ease]">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-[480px] shadow-[0_20px_60px_rgba(0,0,0,0.6)] animate-[modal-in_0.2s_ease]">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <span className="text-sm font-bold text-white">🗑 Eliminar Registro</span>
            </div>
            <div className="p-5" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 13, color: '#9ca3af' }}>
                <span style={{ color: '#ededed', fontWeight: 600 }}>{eliminarModal.maquina}</span> · <span className="font-mono text-[13px] font-medium text-cyan-500">{eliminarModal.numero_parte}</span>
              </div>
              <div className="bg-red-500/100/10 border border-red-500/25 rounded-[7px] px-3 py-2.5 text-[11px] text-red-400">Esta acción no se puede deshacer.</div>
            </div>
            <div className="px-5 py-3.5 border-t border-gray-800 flex gap-2 justify-end">
              <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-transparent text-gray-400 border-gray-800 hover:text-white hover:border-gray-700 hover:bg-gray-800" onClick={() => setEliminarModal(null)}>Cancelar</button>
              <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-red-500/100/10 text-red-500 border border-red-500/30 hover:bg-red-500/100/20" onClick={handleConfirmarEliminar}>🗑 Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SUB-TAB: REPORTE
// ═══════════════════════════════════════════════════════════════
function ReporteSubTab() {
  const { token } = useAuth()
  const [reporte, setReporte] = useState<ReporteInyeccionGeneral[]>([])
  const [loading, setLoading] = useState(false)
  const [filtroTurno, setFiltroTurno] = useState('')
  const [fecha, setFecha] = useState(() => new Date(Date.now() - 6 * 3600000).toISOString().slice(0, 10))

  const cargar = async () => {
    if (!token) return
    setLoading(true)
    try { setReporte(await getReporteGeneralInyeccion(token, fecha, filtroTurno || undefined)) }
    catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { cargar() }, [token, fecha, filtroTurno])

  const dlExcel = async () => {
    if (!token) return
    const blob = await descargarReporteGeneralInyeccionExcel(token, fecha, filtroTurno || undefined)
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url
    a.download = `reporte_inyeccion_ ${fecha} ${filtroTurno ? '_' + filtroTurno : ''}.xlsx`
    a.click(); URL.revokeObjectURL(url)
  }

  const dlIndividual = async (id: number, parte: string, maq: string) => {
    if (!token) return
    const blob = await descargarReporteIndividualInyeccionExcel(token, id)
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url
    a.download = `reporte_individual_ ${parte}_ ${maq}.xlsx`
    document.body.appendChild(a); a.click()
    document.body.removeChild(a); URL.revokeObjectURL(url)
  }

  const fmtTime = (s: number) => {
    if (!s) return '00:00:00'
    return ` ${String(Math.floor(s/3600)).padStart(2,'0')}: ${String(Math.floor((s%3600)/60)).padStart(2,'0')}: ${String(s%60).padStart(2,'0')}`
  }

  // Stats
  const totalProd = reporte.reduce((a, r) => a + r.produccion_total, 0)
  const avgPct    = reporte.length ? Math.round(reporte.reduce((a, r) => a + r.percent_prod, 0) / reporte.length) : 0
  const enParo    = reporte.filter(r => r.tiempo_paro > 0).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#ededed' }}>📊 Reporte de Inyección</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{reporte.length} registros</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none transition-colors duration-150 appearance-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15" style={{ width: 'auto' }} value={filtroTurno} onChange={e => setFiltroTurno(e.target.value)}>
            <option value="">Ambos turnos</option>
            <option value="DIA">☀️ DIA</option>
            <option value="NOCHE">🌙 NOCHE</option>
          </select>
          <input className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none transition-colors duration-150 appearance-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 placeholder:text-gray-400" style={{ width: 'auto' }} type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
          <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-emerald-500/100/10 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/100/20" onClick={dlExcel}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Descargar Excel
          </button>
          <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-transparent text-gray-400 border-gray-800 hover:text-white hover:border-gray-700 hover:bg-gray-800" onClick={cargar} disabled={loading}>{loading ? '⟳' : '↻'}</button>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 10 }}>
        <div className="bg-gray-800 border border-gray-800 rounded-lg px-4 py-3">
          <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-gray-400">Producción Total</div>
          <div className="font-mono text-[26px] font-semibold text-white mt-0.5 amber">{totalProd.toLocaleString()}</div>
        </div>
        <div className="bg-gray-800 border border-gray-800 rounded-lg px-4 py-3">
          <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-gray-400">Eficiencia Promedio</div>
          <div className={`font-mono text-[26px] font-semibold text-white mt-0.5 ${avgPct >= 90 ? 'green' : avgPct >= 70 ? 'amber' : 'red'}`}>{avgPct}%</div>
        </div>
        <div className="bg-gray-800 border border-gray-800 rounded-lg px-4 py-3">
          <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-gray-400">Con Paros</div>
          <div className={`font-mono text-[26px] font-semibold text-white mt-0.5 ${enParo > 0 ? 'red' : 'green'}`}>{enParo}</div>
        </div>
        <div className="bg-gray-800 border border-gray-800 rounded-lg px-4 py-3">
          <div className="text-[10px] font-semibold tracking-[0.08em] uppercase text-gray-400">Registros</div>
          <div className="font-mono text-[26px] font-semibold text-white mt-0.5">{reporte.length}</div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-900 border border-gray-800 rounded-[10px] overflow-hidden overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th>Lote</th><th>Fecha</th><th className="c">Turno</th>
              <th>No. de Parte</th><th>Máquina</th>
              <th className="c">Cav</th><th className="c">Ciclo</th>
              <th className="c">T. Trabajo</th>
              <th className="r">Meta</th><th className="r">Producido</th>
              <th className="c">%</th><th className="c">T. Paro</th>
              <th className="c">DL</th>
            </tr>
          </thead>
          <tbody>
            {reporte.length === 0 ? (
              <tr><td colSpan={13} style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13 }}>
                No hay registros para el filtro seleccionado
              </td></tr>
            ) : reporte.map((row, idx) => {
              const turno = row.turno_real || getTurnoFromISO(row.fecha)
              return (
                <tr key={idx}>
                  <td className="mono" style={{ fontSize: 11 }}>{row.lote}</td>
                  <td style={{ fontSize: 11, color: '#9ca3af' }}>{row.fecha}</td>
                  <td className="c">
                    <span className="text-[10px] font-semibold tracking-[0.06em] uppercase px-2 py-0.5 rounded-[20px] inline-flex items-center gap-1" style={{
                      background: turno === 'DIA' ? 'rgba(245,158,11,0.1)' : 'rgba(139,92,246,0.1)',
                      color: turno === 'DIA' ? '#f59e0b' : '#8b5cf6',
                      border: `1px solid ${turno === 'DIA' ? 'rgba(245,158,11,0.25)' : 'rgba(139,92,246,0.25)'}`,
                    }}>
                      {turno === 'DIA' ? '☀' : '☾'} {turno}
                    </span>
                  </td>
                  <td><span className="font-mono text-[13px] font-medium text-cyan-500">{row.numero_parte}</span></td>
                  <td><span className="font-mono text-[13px] font-semibold text-amber-500 bg-amber-500/10 border border-amber-500/30 px-[10px] py-0.5 rounded" style={{ fontSize: 11 }}>{row.maquina}</span></td>
                  <td className="c mono" style={{ fontSize: 11 }}>{row.cav}</td>
                  <td className="c mono" style={{ fontSize: 11 }}>{row.ciclo ?? '—'}</td>
                  <td className="c mono" style={{ fontSize: 11 }}>{fmtTime(row.tiempo_trabajo)}</td>
                  <td className="r mono" style={{ fontSize: 11 }}>{row.meta_plan.toLocaleString()}</td>
                  <td className="r mono" style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>{row.produccion_total.toLocaleString()}</td>
                  <td className="c">
                    <span className={`font-mono text-[11px] font-semibold px-[7px] py-0.5 rounded ${row.percent_prod >= 90 ? 'bg-emerald-500/100/10 text-emerald-500' : row.percent_prod >= 70 ? 'bg-amber-500/10 text-amber-500' : 'bg-red-500/100/10 text-red-500'}`}>
                      {row.percent_prod}%
                    </span>
                  </td>
                  <td className="c mono" style={{ fontSize: 11, color: row.tiempo_paro > 0 ? '#ef4444' : '#9ca3af' }}>
                    {fmtTime(row.tiempo_paro)}
                  </td>
                  <td className="c">
                    <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-emerald-500/100/10 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/100/20" style={{ padding: '5px 8px' }}
                      onClick={() => dlIndividual(row.orden_id, row.numero_parte, row.maquina)}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SUB-TAB: REPORTE MANUAL
// ═══════════════════════════════════════════════════════════════
const MOTIVOS_PARO_LIST = [
  'Cambio de Molde','Ajustes','Arranque','Mantenimiento',
  'Molde Danado','Falta Personal','Falta Material','Otro',
]
const MOTIVOS_MANT_LIST = [
  'Soldar Puerta Ejector','Estopero','Bomba Hidraulica','Motor Hidraulico',
  'Manguera Hidraulica','Valvula Hidraulica','Reloj','Caldera',
  'Sensor Seguridad','Falta Aire','Fuga Aceite','Electrico','Tolva Tapada','Extra',
]
const MOTIVOS_SCRAP_LIST = [
  'Falta Llenado','Cruda','Quebrada','Hinchada','Arranque',
  'Fuera de Dimension','Pandeada','Aplastada por Molde',
]

interface ParoRow { id: number; motivo: string; tiempo: string; subMotivo: string; subTiempo: string }
interface ScrapRow { id: number; motivo: string; cantidad: string }

function ReporteManualSubTab() {
  const { token } = useAuth()
  const [items, setItems]     = useState<ReporteManualInyeccion[]>([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg]         = useState<{tipo:'ok'|'error';texto:string}|null>(null)
  const [detalleModal, setDetalleModal] = useState<ReporteManualInyeccion|null>(null)
  const [eliminarModal, setEliminarModal] = useState<ReporteManualInyeccion|null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const PROD_INIT = {
    turno:'', numero_parte:'', descripcion:'', cliente:'', resina:'', proceso:'',
    peso:'', cav_bom:'', ciclo:'', type:'', maquina:'', cav_real:'', ciclo_real:'',
    tiempo_trabajo:'', produccion_total:'',
  }
  const [prod, setProd] = useState({ ...PROD_INIT })
  const [parosRows, setParosRows] = useState<ParoRow[]>([{ id: 1, motivo: '', tiempo: '', subMotivo: '', subTiempo: '' }])
  const [scrapRows, setScrapRows] = useState<ScrapRow[]>([{ id: 1, motivo: '', cantidad: '' }])

  const cargar = async () => {
    if (!token) return
    setLoading(true)
    try { setItems(await getReportesManualesInyeccion(token)) }
    catch (e: any) { showMsg('error', e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { cargar() }, [token])
  useEffect(() => { if (!msg) return; const t = setTimeout(() => setMsg(null), 7000); return () => clearTimeout(t) }, [msg])

  const showMsg = (tipo:'ok'|'error', texto:string) => setMsg({ tipo, texto })

  const buildPayload = () => {
    const p: any = {
      ...prod,
      peso: parseFloat(prod.peso||'0'),
      cav_bom: parseInt(prod.cav_bom||'0'),
      ciclo: parseFloat(prod.ciclo||'0'),
      cav_real: parseInt(prod.cav_real||'0'),
      ciclo_real: parseFloat(prod.ciclo_real||'0'),
      tiempo_trabajo: parseFloat(prod.tiempo_trabajo||'0'),
      produccion_total: parseInt(prod.produccion_total||'0'),
      cambio_molde:0, ajustes:0, arranque_paro:0, mantenimiento:0, molde_danado:0,
      falta_personal:0, falta_material:0, otro_paro:0,
      soldar_puerta_ejector:0, estopero:0, bomba_hidraulica:0, motor_hidraulico:0,
      manguera_hidraulica:0, valvula_hidraulica:0, reloj:0, caldera:0, sensor_seguridad:0,
      falta_aire:0, fuga_aceite:0, electrico:0, tolva_tapada:0, extra:0,
      scrap_falta_llenado:0, scrap_cruda:0, scrap_quebrada:0, scrap_hinchada:0,
      scrap_arranque:0, scrap_fuera_dimension:0, scrap_pandeada:0, scrap_aplastada_molde:0,
    }
    parosRows.forEach(r => {
      const t = parseFloat(r.tiempo||'0'), st = parseFloat(r.subTiempo||'0')
      const map: Record<string,string> = {
        'Cambio de Molde':'cambio_molde','Ajustes':'ajustes','Arranque':'arranque_paro',
        'Mantenimiento':'mantenimiento','Molde Danado':'molde_danado','Falta Personal':'falta_personal',
        'Falta Material':'falta_material','Otro':'otro_paro',
      }
      if (map[r.motivo]) p[map[r.motivo]] += t
      const submap: Record<string,string> = {
        'Soldar Puerta Ejector':'soldar_puerta_ejector','Estopero':'estopero','Bomba Hidraulica':'bomba_hidraulica',
        'Motor Hidraulico':'motor_hidraulico','Manguera Hidraulica':'manguera_hidraulica',
        'Valvula Hidraulica':'valvula_hidraulica','Reloj':'reloj','Caldera':'caldera',
        'Sensor Seguridad':'sensor_seguridad','Falta Aire':'falta_aire','Fuga Aceite':'fuga_aceite',
        'Electrico':'electrico','Tolva Tapada':'tolva_tapada','Extra':'extra',
      }
      if (submap[r.subMotivo]) p[submap[r.subMotivo]] += st
    })
    scrapRows.forEach(r => {
      const c = parseInt(r.cantidad||'0')
      const map: Record<string,string> = {
        'Falta Llenado':'scrap_falta_llenado','Cruda':'scrap_cruda','Quebrada':'scrap_quebrada',
        'Hinchada':'scrap_hinchada','Arranque':'scrap_arranque','Fuera de Dimension':'scrap_fuera_dimension',
        'Pandeada':'scrap_pandeada','Aplastada por Molde':'scrap_aplastada_molde',
      }
      if (map[r.motivo]) p[map[r.motivo]] += c
    })
    return p
  }

  const validar = (): string|null => {
    const req: [string,string][] = [
      ['turno','Turno'],['numero_parte','No. Parte'],['descripcion','Descripcion'],
      ['cliente','Cliente'],['resina','Resina'],['proceso','Proceso'],
      ['peso','Peso'],['cav_bom','Cav BOM'],['ciclo','Ciclo'],['type','Type'],
      ['maquina','Maquina'],['cav_real','Cav Real'],['ciclo_real','Ciclo Real'],
      ['tiempo_trabajo','Tiempo Trabajo'],['produccion_total','Produccion Total'],
    ]
    for (const [k, label] of req) {
      if (!(prod as any)[k]?.toString().trim()) return ` ${label} es obligatorio`
    }
    return null
  }

  const handleConfirmar = async () => {
    if (!token) return
    const err = validar(); if (err) { showMsg('error', err); return }
    try {
      await crearReporteManualInyeccion(token, buildPayload())
      showMsg('ok', 'Reporte guardado correctamente')
      setProd({ ...PROD_INIT })
      setParosRows([{ id: 1, motivo: '', tiempo: '', subMotivo: '', subTiempo: '' }])
      setScrapRows([{ id: 1, motivo: '', cantidad: '' }])
      cargar()
    } catch (e: any) { showMsg('error', e.message) }
  }

  const handleImportar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!token || !e.target.files?.[0]) return
    try {
      const res = await importarReporteManualInyeccionExcel(token, e.target.files[0])
      showMsg(res.errores?.length ? 'error' : 'ok', ` ${res.message} — ${res.creados} registros`)
      cargar()
    } catch (e: any) { showMsg('error', e.message) }
    finally { if (fileRef.current) fileRef.current.value = '' }
  }

  const handleEliminar = async () => {
    if (!token || !eliminarModal) return
    try {
      await eliminarReporteManualInyeccion(token, eliminarModal.id)
      showMsg('ok', 'Registro eliminado')
      setEliminarModal(null); cargar()
    } catch (e: any) { showMsg('error', e.message) }
  }

  const Campo = ({ label, campo, type='text', opts }: { label:string; campo:string; type?:string; opts?:string[] }) => (
    <div>
      <label className="block text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400 mb-[5px]">{label}</label>
      {opts ? (
        <select className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none transition-colors duration-150 appearance-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15" value={(prod as any)[campo]}
          onChange={e => setProd({ ...prod, [campo]: e.target.value })}>
          <option value="">— Seleccionar —</option>
          {opts.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none transition-colors duration-150 appearance-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 placeholder:text-gray-400" type={type} step={type==='number'?'any':undefined}
          value={(prod as any)[campo]}
          onChange={e => setProd({ ...prod, [campo]: type!=='text' ? e.target.value : e.target.value.toUpperCase() })} />
      )}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#ededed' }}>📝 Reporte Manual — Inyección</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-emerald-500/100/10 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/100/20" onClick={() => fileRef.current?.click()}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Importar Excel
          </button>
          <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-transparent text-gray-400 border-gray-800 hover:text-white hover:border-gray-700 hover:bg-gray-800" onClick={cargar} disabled={loading}>{loading ? '⟳' : '↻'}</button>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImportar} />
        </div>
      </div>

      {msg && <div className={`px-3.5 py-2.5 rounded-[7px] text-xs font-medium flex items-start gap-2 animate-[slide-in_0.2s_ease] ${msg.tipo==='ok'?'bg-emerald-500/100/10 text-emerald-500 border border-emerald-500/30':'bg-red-500/100/10 text-red-500 border border-red-500/30'}`}>{msg.tipo==='ok'?'✓':'⚠'} {msg.texto}</div>}

      {/* ── SECCIÓN PRODUCCIÓN ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-[10px] overflow-hidden">
        <div className="px-4 py-3 bg-gray-800 border-b border-gray-800 flex items-center gap-[10px]">
          <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', letterSpacing: '0.1em', textTransform: 'uppercase' }}>Datos de Producción</span>
        </div>
        <div className="p-4">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(170px,1fr))', gap: 12 }}>
            <Campo label="Turno *" campo="turno" opts={['DIA','NOCHE']} />
            <Campo label="No. de Parte *" campo="numero_parte" />
            <div style={{ gridColumn: 'span 2' }}><Campo label="Descripción *" campo="descripcion" /></div>
            <div style={{ gridColumn: 'span 2' }}><Campo label="Cliente *" campo="cliente" /></div>
            <Campo label="Resina *" campo="resina" opts={['EPS','EPP']} />
            <Campo label="Proceso *" campo="proceso" opts={['ASSY','PACKING','BLOCK']} />
            <Campo label="Peso *" campo="peso" type="number" />
            <Campo label="Cav BOM *" campo="cav_bom" type="number" />
            <Campo label="Ciclo *" campo="ciclo" type="number" />
            <Campo label="Type *" campo="type" />
            <Campo label="Máquina *" campo="maquina" />
            <Campo label="Cav Real *" campo="cav_real" type="number" />
            <Campo label="Ciclo Real *" campo="ciclo_real" type="number" />
            <Campo label="Tiempo Trabajo (hrs) *" campo="tiempo_trabajo" type="number" />
            <Campo label="Producción Total *" campo="produccion_total" type="number" />
          </div>
        </div>
      </div>

      {/* ── PAROS ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-[10px] overflow-hidden">
        <div className="px-4 py-3 bg-gray-800 border-b border-gray-800 flex items-center gap-[10px]">
          <span style={{ fontSize: 11, fontWeight: 700, color: '#ef4444', letterSpacing: '0.1em', textTransform: 'uppercase' }}>⏸ Paros</span>
        </div>
        <div className="p-4" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {parosRows.map((row, idx) => (
            <div key={row.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 10, borderBottom: idx < parosRows.length-1 ? '1px solid #1f2937' : 'none' }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 2 }}>
                  <label className="block text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400 mb-[5px]">Motivo</label>
                  <select className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none transition-colors duration-150 appearance-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15" value={row.motivo}
                    onChange={e => { const r = [...parosRows]; r[idx].motivo = e.target.value; setParosRows(r) }}>
                    <option value="">— Seleccionar —</option>
                    {MOTIVOS_PARO_LIST.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div style={{ width: 120 }}>
                  <label className="block text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400 mb-[5px]">Tiempo (hrs)</label>
                  <input className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none transition-colors duration-150 appearance-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 placeholder:text-gray-400" type="number" step="0.1" min={0} value={row.tiempo}
                    onChange={e => { const r = [...parosRows]; r[idx].tiempo = e.target.value; setParosRows(r) }} />
                </div>
                {parosRows.length > 1 && (
                  <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-red-500/100/10 text-red-500 border border-red-500/30 hover:bg-red-500/100/20" style={{ padding: '7px 10px', marginBottom: 0 }}
                    onClick={() => setParosRows(parosRows.filter((_,i) => i !== idx))}>✕</button>
                )}
              </div>
              {row.motivo === 'Mantenimiento' && (
                <div style={{ display: 'flex', gap: 8, paddingLeft: 16 }}>
                  <div style={{ flex: 2 }}>
                    <label className="block text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400 mb-[5px]">Motivo Mantenimiento</label>
                    <select className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none transition-colors duration-150 appearance-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15" value={row.subMotivo}
                      onChange={e => { const r = [...parosRows]; r[idx].subMotivo = e.target.value; setParosRows(r) }}>
                      <option value="">— Seleccionar —</option>
                      {MOTIVOS_MANT_LIST.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div style={{ width: 120 }}>
                    <label className="block text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400 mb-[5px]">Tiempo (hrs)</label>
                    <input className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none transition-colors duration-150 appearance-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 placeholder:text-gray-400" type="number" step="0.1" min={0} value={row.subTiempo}
                      onChange={e => { const r = [...parosRows]; r[idx].subTiempo = e.target.value; setParosRows(r) }} />
                  </div>
                </div>
              )}
            </div>
          ))}
          <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-transparent text-gray-400 border-gray-800 hover:text-white hover:border-gray-700 hover:bg-gray-800" style={{ alignSelf: 'flex-start' }}
            onClick={() => setParosRows([...parosRows, { id: Date.now(), motivo: '', tiempo: '', subMotivo: '', subTiempo: '' }])}>
            ＋ Agregar paro
          </button>
        </div>
      </div>

      {/* ── SCRAP ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-[10px] overflow-hidden">
        <div className="px-4 py-3 bg-gray-800 border-b border-gray-800 flex items-center gap-[10px]">
          <span style={{ fontSize: 11, fontWeight: 700, color: '#f97316', letterSpacing: '0.1em', textTransform: 'uppercase' }}>♻️ Scrap</span>
        </div>
        <div className="p-4" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {scrapRows.map((row, idx) => (
            <div key={row.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-end', paddingBottom: 8, borderBottom: idx < scrapRows.length-1 ? '1px solid #1f2937' : 'none' }}>
              <div style={{ flex: 2 }}>
                <label className="block text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400 mb-[5px]">Motivo</label>
                <select className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none transition-colors duration-150 appearance-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15" value={row.motivo}
                  onChange={e => { const r = [...scrapRows]; r[idx].motivo = e.target.value; setScrapRows(r) }}>
                  <option value="">— Seleccionar —</option>
                  {MOTIVOS_SCRAP_LIST.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <div style={{ width: 120 }}>
                <label className="block text-[10px] font-bold tracking-[0.08em] uppercase text-gray-400 mb-[5px]">Cantidad</label>
                <input className="w-full bg-gray-950 border border-gray-800 rounded-md px-2.5 py-2 text-xs text-white outline-none transition-colors duration-150 appearance-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/15 placeholder:text-gray-400" type="number" min={0} value={row.cantidad}
                  onChange={e => { const r = [...scrapRows]; r[idx].cantidad = e.target.value; setScrapRows(r) }} />
              </div>
              {scrapRows.length > 1 && (
                <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-red-500/100/10 text-red-500 border border-red-500/30 hover:bg-red-500/100/20" style={{ padding: '7px 10px' }}
                  onClick={() => setScrapRows(scrapRows.filter((_,i) => i !== idx))}>✕</button>
              )}
            </div>
          ))}
          <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-transparent text-gray-400 border-gray-800 hover:text-white hover:border-gray-700 hover:bg-gray-800" style={{ alignSelf: 'flex-start' }}
            onClick={() => setScrapRows([...scrapRows, { id: Date.now(), motivo: '', cantidad: '' }])}>
            ＋ Agregar scrap
          </button>
        </div>
      </div>

      <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-amber-500 text-black border-amber-500 hover:bg-amber-400" style={{ width: '100%', justifyContent: 'center', padding: '11px 0', fontSize: 13 }}
        onClick={handleConfirmar}>
        💾 Confirmar y Guardar Reporte
      </button>

      {/* ── HISTORIAL ── */}
      <div>
        <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-amber-500 mb-2.5 flex items-center gap-2 after:content-[''] after:flex-1 after:h-px after:bg-gray-800">Historial · {items.length}</div>
        <div className="bg-gray-900 border border-gray-800 rounded-[10px] overflow-hidden overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th>Fecha</th><th className="c">Turno</th><th>No. Parte</th>
                <th>Descripción</th><th>Cliente</th>
                <th className="r">Prod. Total</th><th className="r">Prod. Buena</th>
                <th className="c">%</th><th className="c">Scrap</th>
                <th className="c">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: 13 }}>No hay registros</td></tr>
              ) : items.map(item => (
                <tr key={item.id}>
                  <td style={{ fontSize: 11, color: '#9ca3af' }}>{item.fecha?.slice(0,10) || '—'}</td>
                  <td className="c">
                    <span className="text-[10px] font-semibold tracking-[0.06em] uppercase px-2 py-0.5 rounded-[20px] inline-flex items-center gap-1" style={{
                      background: item.turno==='DIA'?'rgba(245,158,11,0.1)':'rgba(139,92,246,0.1)',
                      color: item.turno==='DIA'?'#f59e0b':'#8b5cf6',
                      border: `1px solid ${item.turno==='DIA'?'rgba(245,158,11,0.25)':'rgba(139,92,246,0.25)'}`,
                    }}>
                      {item.turno==='DIA'?'☀':'☾'} {item.turno}
                    </span>
                  </td>
                  <td><span className="font-mono text-[13px] font-medium text-cyan-500">{item.numero_parte}</span></td>
                  <td style={{ fontSize: 11, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.descripcion}</td>
                  <td style={{ fontSize: 11, color: '#9ca3af' }}>{item.cliente}</td>
                  <td className="r mono" style={{ fontSize: 11 }}>{item.produccion_total.toLocaleString()}</td>
                  <td className="r mono" style={{ fontSize: 11, color: '#10b981', fontWeight: 600 }}>{item.produccion_buena.toLocaleString()}</td>
                  <td className="c">
                    <span className={`font-mono text-[11px] font-semibold px-[7px] py-0.5 rounded ${item.produccion_porcentaje>=90?'bg-emerald-500/100/10 text-emerald-500':item.produccion_porcentaje>=70?'bg-amber-500/10 text-amber-500':'bg-red-500/100/10 text-red-500'}`}>
                      {(item.produccion_porcentaje??0).toFixed(1)}%
                    </span>
                  </td>
                  <td className="c mono" style={{ fontSize: 11, color: item.scrap_total>0?'#f97316':'#9ca3af' }}>
                    {item.scrap_total}
                  </td>
                  <td className="c">
                    <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                      <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-blue-500/100/10 text-blue-500 border border-blue-500/30 hover:bg-blue-500/100/20" style={{ padding: '5px 8px', fontSize: 11 }}
                        onClick={() => setDetalleModal(item)}>👁 Ver</button>
                      <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-red-500/100/10 text-red-500 border border-red-500/30 hover:bg-red-500/100/20" style={{ padding: '5px 8px', fontSize: 11 }}
                        onClick={() => setEliminarModal(item)}>🗑</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Detalle */}
      {detalleModal && (
        <div className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4 backdrop-blur-[3px] animate-[fade-in_0.15s_ease]">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-[480px] shadow-[0_20px_60px_rgba(0,0,0,0.6)] animate-[modal-in_0.2s_ease] wide" style={{ maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <span className="text-sm font-bold text-white">📋 {detalleModal.numero_parte} — {detalleModal.cliente}</span>
              <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-transparent text-gray-400 border-gray-800 hover:text-white hover:border-gray-700 hover:bg-gray-800" style={{ padding: '4px 10px' }} onClick={() => setDetalleModal(null)}>✕</button>
            </div>
            <div className="p-5" style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

              {/* Produccion chips */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#f59e0b', marginBottom: 8 }}>Producción</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 8 }}>
                  {[
                    ['Turno', detalleModal.turno],
                    ['Maquina', detalleModal.maquina],
                    ['Resina', detalleModal.resina],
                    ['Proceso', detalleModal.proceso],
                    ['Peso', detalleModal.peso],
                    ['Cav BOM', detalleModal.cav_bom],
                    ['Ciclo', detalleModal.ciclo],
                    ['Cav Real', detalleModal.cav_real],
                    ['Ciclo Real', detalleModal.ciclo_real],
                    ['T. Trabajo', ` ${detalleModal.tiempo_trabajo} hrs`],
                    ['Prod. Total', detalleModal.produccion_total],
                    ['Prod. Buena', detalleModal.produccion_buena],
                    ['Prod. Kg', (detalleModal.produccion_kg??0).toFixed(2)],
                    ['Meta Total', (detalleModal.produccion_meta_total??0).toFixed(0)],
                    ['Eficiencia', `${(detalleModal.produccion_porcentaje??0).toFixed(1)}%`],
                    ['C/M', detalleModal.cm ?? 0],
                  ].map(([k,v]) => (
                    <div key={k as string} style={{ background: '#1f2937', borderRadius: 6, padding: '8px 10px' }}>
                      <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>{k}</div>
                      <div style={{ fontSize: 13, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', color: '#ededed', fontWeight: 500 }}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Paros */}
              {detalleModal.tiempo_paro_total > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#ef4444', marginBottom: 8 }}>Paros · {(detalleModal.tiempo_paro_total??0).toFixed(2)} hrs</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 8 }}>
                    {[
                      ['Cambio Molde', detalleModal.cambio_molde],
                      ['Ajustes', detalleModal.ajustes],
                      ['Arranque', detalleModal.arranque_paro],
                      ['Mantenimiento', detalleModal.mantenimiento],
                      ['Molde Danado', detalleModal.molde_danado],
                      ['Falta Personal', detalleModal.falta_personal],
                      ['Falta Material', detalleModal.falta_material],
                      ['Otro', detalleModal.otro_paro],
                    ].filter(([,v]) => (v as number) > 0).map(([k,v]) => (
                      <div key={k as string} style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 6, padding: '8px 10px' }}>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>{k}</div>
                        <div style={{ fontSize: 13, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', color: '#ef4444' }}>{v} hrs</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Scrap */}
              {detalleModal.scrap_total > 0 && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#f97316', marginBottom: 8 }}>
                    Scrap · {detalleModal.scrap_total} pzas · {(detalleModal.scrap_porcentaje??0).toFixed(1)}%
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 8 }}>
                    {[
                      ['Falta Llenado', detalleModal.scrap_falta_llenado],
                      ['Cruda', detalleModal.scrap_cruda],
                      ['Quebrada', detalleModal.scrap_quebrada],
                      ['Hinchada', detalleModal.scrap_hinchada],
                      ['Arranque', detalleModal.scrap_arranque],
                      ['Fuera Dim.', detalleModal.scrap_fuera_dimension],
                      ['Pandeada', detalleModal.scrap_pandeada],
                      ['Aplastada', detalleModal.scrap_aplastada_molde],
                    ].filter(([,v]) => (v as number) > 0).map(([k,v]) => (
                      <div key={k as string} style={{ background: 'rgba(249,115,22,0.07)', border: '1px solid rgba(249,115,22,0.15)', borderRadius: 6, padding: '8px 10px' }}>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>{k}</div>
                        <div style={{ fontSize: 13, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', color: '#f97316' }}>{v} pzas</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="px-5 py-3.5 border-t border-gray-800 flex gap-2 justify-end">
              <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-transparent text-gray-400 border-gray-800 hover:text-white hover:border-gray-700 hover:bg-gray-800" onClick={() => setDetalleModal(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Eliminar */}
      {eliminarModal && (
        <div className="fixed inset-0 bg-black/70 z-[9999] flex items-center justify-center p-4 backdrop-blur-[3px] animate-[fade-in_0.15s_ease]">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-[480px] shadow-[0_20px_60px_rgba(0,0,0,0.6)] animate-[modal-in_0.2s_ease]">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center justify-between">
              <span className="text-sm font-bold text-white">🗑 Eliminar Registro</span>
            </div>
            <div className="p-5" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 13, color: '#9ca3af' }}>
                <span className="font-mono text-[13px] font-medium text-cyan-500">{eliminarModal.numero_parte}</span> · {eliminarModal.cliente}
              </div>
              <div className="bg-red-500/100/10 border border-red-500/25 rounded-[7px] px-3 py-2.5 text-[11px] text-red-400">Esta acción no se puede deshacer.</div>
            </div>
            <div className="px-5 py-3.5 border-t border-gray-800 flex gap-2 justify-end">
              <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-transparent text-gray-400 border-gray-800 hover:text-white hover:border-gray-700 hover:bg-gray-800" onClick={() => setEliminarModal(null)}>Cancelar</button>
              <button className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold tracking-wide border border-transparent cursor-pointer transition-all duration-150 whitespace-nowrap disabled:opacity-[0.38] disabled:cursor-not-allowed bg-red-500/100/10 text-red-500 border border-red-500/30 hover:bg-red-500/100/20" onClick={handleEliminar}>🗑 Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}