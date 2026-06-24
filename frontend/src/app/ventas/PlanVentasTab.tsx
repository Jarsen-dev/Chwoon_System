'use client'

import { useState, useEffect, useCallback } from 'react'
import { getPlanesVentas, getPlanVentas, importarPlanVentas, autorizarVentasMasivo } from '@/lib/api'
import type { PlanVentasSemana, PlanVentasItem, DiaSemana } from '@/types'
import { calcularDIF, colorDIF } from '@/types'
import { Button, LoadingSpinner } from '@/components/ui'
import { IconEditar, IconOk, IconCerrar, IconAlertas, IconDocumento, IconRecepciones } from '@/lib/icons'

// ─── Constantes ──────────────────────────────────────────────────────────────

const DIAS: DiaSemana[] = ['VIERNES', 'LUNES', 'MARTES', 'MIERCOLES', 'JUEVES']

const LABEL_DIA: Record<DiaSemana, string> = {
  VIERNES:   'Vie',
  LUNES:     'Lun',
  MARTES:    'Mar',
  MIERCOLES: 'Mié',
  JUEVES:    'Jue',
  SABADO:    'Sáb',
}

// Agrupar items por id1 (Control Box / Duct Multi / etc.)
function agruparPorId1(items: PlanVentasItem[]): Map<string, PlanVentasItem[]> {
  const mapa = new Map<string, PlanVentasItem[]>()
  for (const item of items) {
    const grupo = item.id1 || item.linea || 'Otros'
    if (!mapa.has(grupo)) mapa.set(grupo, [])
    mapa.get(grupo)!.push(item)
  }
  return mapa
}

// ─── Subcomponentes ──────────────────────────────────────────────────────────

function BadgeDIF({ dif }: { dif: number }) {
  const color = colorDIF(dif)
  const cls =
    color === 'green'  ? 'bg-green-500/15 text-green-400 border-green-500/30' :
    color === 'yellow' ? 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30' :
                         'bg-red-500/15 text-red-400 border-red-500/30'
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border font-mono ${cls}`}>
      {dif > 0 ? '+' : ''}{dif.toLocaleString()}
    </span>
  )
}

function CeldaDia({
  item,
  dia,
  editando,
  onEdit,
}: {
  item:     PlanVentasItem
  dia:      DiaSemana
  editando: boolean
  onEdit:   (sku: string, dia: DiaSemana, qty: number) => void
}) {
  const datosDia = item.dias[dia]
  const plan     = datosDia?.plan   ?? 0
  const status   = datosDia?.status ?? 'Pendiente'
  const ovGen    = datosDia?.ov_generada
  const dif      = calcularDIF(item, dia)

  const autorizado = status === 'Autorizado'
  const difNeg     = dif < 0 && plan > 0

  return (
    <td className={`px-2 py-2 text-center align-middle ${difNeg ? 'bg-red-950/30' : ''}`}>
      <div className="flex flex-col items-center gap-1">
        {/* Cantidad editable */}
        {editando && !autorizado ? (
          <input
            type="number"
            defaultValue={plan}
            onBlur={(e) => {
              const v = parseInt(e.target.value, 10)
              if (!isNaN(v) && v !== plan) onEdit(item.sku, dia, v)
            }}
            className="w-20 text-center text-sm bg-gray-800 border border-gray-600 rounded px-1 py-0.5 text-white focus:border-blue-500 focus:outline-none"
          />
        ) : (
          <span className={`text-sm font-mono font-medium ${
            autorizado ? 'text-green-400' : plan === 0 ? 'text-gray-600' : 'text-white'
          }`}>
            {plan === 0 ? '—' : plan.toLocaleString()}
          </span>
        )}

        {/* DIF acumulada */}
        {plan > 0 && <BadgeDIF dif={dif} />}

        {/* Badge de estado */}
        {autorizado && (
          <span className="inline-flex items-center gap-0.5 text-xs text-green-500 font-medium"><IconOk size={11} aria-hidden /> Aut.</span>
        )}
        {ovGen && (
          <span className="text-xs text-blue-400 font-mono truncate max-w-[80px]" title={ovGen}>
            {ovGen.slice(-8)}
          </span>
        )}
      </div>
    </td>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function PlanVentasTab({ token }: { token: string }) {
  const [planes, setPlanes]           = useState<PlanVentasSemana[]>([])
  const [semanaActiva, setSemanaActiva] = useState<string>('')
  const [plan, setPlan]               = useState<PlanVentasSemana | null>(null)
  const [loading, setLoading]         = useState(true)
  const [importing, setImporting]     = useState(false)
  const [autorizando, setAutorizando] = useState(false)
  const [editando, setEditando]       = useState(false)
  const [error, setError]             = useState('')
  const [success, setSuccess]         = useState('')

  // Cambios pendientes de edición: { sku|dia: nuevaQty }
  const [cambios, setCambios] = useState<Record<string, number>>({})

  // ── Carga inicial ──────────────────────────────────────────────────────────

  // Detecta la semana ISO actual (YYYY-WW)
  const semanaActualISO = (): string => {
    const now = new Date()
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
    const dayNum = d.getUTCDay() || 7
    d.setUTCDate(d.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
    return `${d.getUTCFullYear()}-${String(weekNo).padStart(2, '0')}`
  }

  const cargarPlanes = useCallback(async () => {
    try {
      const lista = await getPlanesVentas(token)
      setPlanes(lista)
      if (lista.length > 0 && !semanaActiva) {
        // Auto-detectar semana actual; si no existe, usar la más reciente
        const current = semanaActualISO()
        const match = lista.find(p => p.identificador_semana === current)
        setSemanaActiva(match ? match.identificador_semana : lista[0].identificador_semana)
      }
    } catch {
      setError('No se pudieron cargar los planes de venta')
    }
  }, [token, semanaActiva])

  const cargarPlan = useCallback(async (id: string) => {
    if (!id) return
    setLoading(true)
    try {
      const data = await getPlanVentas(token, id)
      setPlan(data)
    } catch {
      setError('No se pudo cargar el plan de esta semana')
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { cargarPlanes() }, [])
  useEffect(() => { if (semanaActiva) cargarPlan(semanaActiva) }, [semanaActiva])

  // ── Importar Excel ──────────────────────────────────────────────────────────
  const handleImportar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Pedir la fecha de inicio de semana (lunes)
    const fechaStr = window.prompt(
      'Ingresa la fecha del LUNES de esta semana (YYYY-MM-DD):',
      new Date().toISOString().split('T')[0]
    )
    if (!fechaStr) return

    setImporting(true)
    setError('')
    try {
      const res = await importarPlanVentas(token, fechaStr, file)
      setSuccess(`${res.message} — ${res.total_skus} SKUs`)
      await cargarPlanes()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  // ── Edición inline ─────────────────────────────────────────────────────────
  const handleEdit = (sku: string, dia: DiaSemana, qty: number) => {
    setCambios(prev => ({ ...prev, [`${sku}|${dia}`]: qty }))
  }

  // ── Autorizar todo lo marcado ──────────────────────────────────────────────
  const handleAutorizar = async () => {
    if (!plan || Object.keys(cambios).length === 0 && !plan) return

    // Recolectar todos los días "Pendiente" con plan > 0
    const ventas: { sku: string; dia: string; cantidad: number }[] = []

    for (const item of plan.items) {
      for (const dia of DIAS) {
        const key = `${item.sku}|${dia}`
        const qty = cambios[key] ?? item.dias[dia]?.plan ?? 0
        const status = item.dias[dia]?.status
        if (qty > 0 && status !== 'Autorizado') {
          ventas.push({ sku: item.sku, dia, cantidad: qty })
        }
      }
    }

    if (ventas.length === 0) {
      setError('No hay días pendientes de autorización')
      return
    }

    setAutorizando(true)
    try {
      const res = await autorizarVentasMasivo(token, {
        identificador_semana: semanaActiva,
        ventas,
      })
      setSuccess(`${res.resultados.length} órdenes de venta generadas`)
      setCambios({})
      await cargarPlan(semanaActiva)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setAutorizando(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const grupos = plan ? agruparPorId1(plan.items) : new Map()

  // Días que realmente tienen datos en el plan activo
  const diasActivos = DIAS.filter(dia =>
    plan?.items.some(item => (item.dias[dia]?.plan ?? 0) > 0)
  )

  return (
    <div className="space-y-4">

      {/* ── Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {/* Selector de semana */}
          <select
            value={semanaActiva}
            onChange={e => setSemanaActiva(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
          >
            {planes.map(p => (
              <option key={p.identificador_semana} value={p.identificador_semana}>
                Semana {p.identificador_semana} — {p.fecha_inicio_semana}
              </option>
            ))}
          </select>

          {plan && (
            <span className="text-xs text-gray-500">
              {plan.items.length} SKUs · importado por {plan.importado_por ?? '—'}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Modo edición */}
          <Button
            variant={editando ? 'primary' : 'secondary'}
            leftIcon={IconEditar}
            onClick={() => { setEditando(e => !e); setCambios({}) }}
          >
            {editando ? 'Editando' : 'Editar'}
          </Button>

          {/* Autorizar masivo */}
          {editando && (
            <Button onClick={handleAutorizar} disabled={autorizando} leftIcon={IconOk}>
              {autorizando ? 'Autorizando...' : 'Autorizar Pendientes'}
            </Button>
          )}

          {/* Importar Excel */}
          <label className={`inline-flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            importing
              ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
              : 'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)]'
          }`}>
            <IconRecepciones size={16} aria-hidden /> {importing ? 'Importando...' : 'Importar CW PLAN'}
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              disabled={importing}
              onChange={handleImportar}
            />
          </label>
        </div>
      </div>

      {/* ── Alertas ── */}
      {error && (
        <div className="bg-red-900/30 border border-red-500/40 rounded-lg px-4 py-3 text-sm text-red-400 flex justify-between items-center">
          <span className="flex items-center gap-2"><IconAlertas size={16} aria-hidden /> {error}</span>
          <button onClick={() => setError('')} className="text-red-500 hover:text-red-300" aria-label="Cerrar"><IconCerrar size={16} aria-hidden /></button>
        </div>
      )}
      {success && (
        <div className="bg-green-900/30 border border-green-500/40 rounded-lg px-4 py-3 text-sm text-green-400 flex justify-between items-center">
          <span className="flex items-center gap-2"><IconOk size={16} aria-hidden /> {success}</span>
          <button onClick={() => setSuccess('')} className="text-green-500 hover:text-green-300" aria-label="Cerrar"><IconCerrar size={16} aria-hidden /></button>
        </div>
      )}

      {/* ── Estado vacío ── */}
      {!loading && planes.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <IconDocumento size={40} className="mx-auto mb-3 text-gray-600" aria-hidden />
          <p className="font-medium">Sin planes de venta</p>
          <p className="text-sm mt-1">Importa un Excel CW PLAN para comenzar</p>
        </div>
      )}

      {/* ── Tabla principal ── */}
      {plan && !loading && (
        <div className="overflow-x-auto rounded-xl border border-gray-800">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-900 border-b border-gray-800">
              <tr>
                <th className="px-3 py-3 text-gray-400 font-medium text-xs w-36">SKU</th>
                <th className="px-3 py-3 text-gray-400 font-medium text-xs">Descripción</th>
                <th className="px-3 py-3 text-gray-400 font-medium text-xs text-center">Línea</th>
                <th className="px-3 py-3 text-gray-400 font-medium text-xs text-center">
                  Stock CW
                  <span className="block text-gray-600 font-normal text-xs">(INV. CW)</span>
                </th>
                <th className="px-3 py-3 text-gray-400 font-medium text-xs text-center">
                  Stock LG
                  <span className="block text-gray-600 font-normal text-xs">(INV. LG)</span>
                </th>
                {diasActivos.map(dia => (
                  <th key={dia} className="px-2 py-3 text-gray-400 font-medium text-xs text-center min-w-[90px]">
                    {LABEL_DIA[dia]}
                    <span className="block text-gray-600 font-normal text-xs">Plan / DIF</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/60">
              {Array.from(grupos.entries()).map(([grupo, items]) => (
                <>
                  {/* Fila de grupo */}
                  <tr key={`grupo-${grupo}`} className="bg-gray-900/80">
                    <td
                      colSpan={5 + diasActivos.length}
                      className="px-3 py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider"
                    >
                      {grupo}
                      <span className="ml-2 text-gray-600 font-normal normal-case">
                        {items.length} SKUs
                      </span>
                    </td>
                  </tr>

                  {/* Filas de SKU */}
                  {items.map((item: PlanVentasItem) => {
                    const tieneAlerta = diasActivos.some(dia => calcularDIF(item, dia) < 0)
                    return (
                      <tr
                        key={item.sku}
                        className={`hover:bg-gray-800/40 transition-colors ${
                          tieneAlerta ? 'bg-red-950/10' : ''
                        }`}
                      >
                        {/* SKU */}
                        <td className="px-3 py-2">
                          <span className="font-mono text-xs text-blue-400">{item.sku}</span>
                          {item.model && (
                            <span className="block text-xs text-gray-500 truncate max-w-[130px]">
                              {item.model}
                            </span>
                          )}
                        </td>

                        {/* Descripción */}
                        <td className="px-3 py-2">
                          <span className="text-white text-xs">{item.descripcion}</span>
                          {item.cw_line && (
                            <span className="ml-2 text-xs text-gray-500">{item.cw_line}</span>
                          )}
                        </td>

                        {/* Línea */}
                        <td className="px-3 py-2 text-center">
                          <span className="text-xs font-medium text-gray-300">{item.linea || '—'}</span>
                        </td>

                        {/* Stock CW */}
                        <td className="px-3 py-2 text-center">
                          <span className="font-mono text-sm text-white">
                            {(item.stock_actual ?? 0).toLocaleString()}
                          </span>
                        </td>

                        {/* Stock LG */}
                        <td className="px-3 py-2 text-center">
                          <span className={`font-mono text-sm ${
                            (item.stock_lg ?? 0) === 0 ? 'text-gray-600' : 'text-cyan-400'
                          }`}>
                            {(item.stock_lg ?? 0).toLocaleString()}
                          </span>
                        </td>

                        {/* Celdas de días */}
                        {diasActivos.map((dia: DiaSemana) => (
                          <CeldaDia
                            key={dia}
                            item={item}
                            dia={dia}
                            editando={editando}
                            onEdit={handleEdit}
                          />
                        ))}
                      </tr>
                    )
                  })}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-16">
          <LoadingSpinner sizeClass="h-8 w-8" />
        </div>
      )}
    </div>
  )
}