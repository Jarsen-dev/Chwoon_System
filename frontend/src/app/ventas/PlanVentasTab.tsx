'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { getPlanesVentas, getPlanVentas, importarPlanVentas, autorizarVentasMasivo } from '@/lib/api'
import type { PlanVentasSemana, PlanVentasItem } from '@/types'

interface Props {
  token: string
}

const DIAS = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES'] as const
type Dia = typeof DIAS[number]

const DIA_LABELS: Record<Dia, string> = {
  LUNES: 'Lun', MARTES: 'Mar', MIERCOLES: 'Mié', JUEVES: 'Jue', VIERNES: 'Vie',
}

const STATUS_COLORS: Record<string, string> = {
  Pendiente:  'bg-yellow-500/20 text-yellow-400',
  Autorizado: 'bg-green-500/20 text-green-400',
}

export default function PlanVentasTab({ token }: Props) {
  const [planes, setPlanes] = useState<PlanVentasSemana[]>([])
  const [planActivo, setPlanActivo] = useState<PlanVentasSemana | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingPlan, setLoadingPlan] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Importar
  const [showImportModal, setShowImportModal] = useState(false)
  const [importFecha, setImportFecha] = useState('')
  const [importLoading, setImportLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Autorizar
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set())
  const [autorizarLoading, setAutorizarLoading] = useState(false)
  const [showResultados, setShowResultados] = useState(false)
  const [resultados, setResultados] = useState<string[]>([])

  const fetchPlanes = useCallback(async () => {
    try {
      setLoading(true)
      const res = await getPlanesVentas(token)
      setPlanes(res)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchPlanes()
  }, [fetchPlanes])

  const clearMessages = () => { setError(''); setSuccess('') }

  const handleSelectPlan = async (identificador: string) => {
    try {
      setLoadingPlan(true)
      setSelectedCells(new Set())
      const res = await getPlanVentas(token, identificador)
      setPlanActivo(res)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoadingPlan(false)
    }
  }

  const handleImportar = async () => {
    clearMessages()
    if (!importFecha) {
      setError('Seleccione una fecha de inicio de semana')
      return
    }
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setError('Seleccione un archivo Excel o CSV')
      return
    }

    try {
      setImportLoading(true)
      const res = await importarPlanVentas(token, importFecha, file)
      setSuccess(`Plan importado: ${res.total_skus} SKUs`)
      setShowImportModal(false)
      setImportFecha('')
      if (fileInputRef.current) fileInputRef.current.value = ''
      fetchPlanes()
      // Si ya hay un plan activo de esa semana, recargarlo
      const identificador = new Date(importFecha).toISOString().slice(0, 4) + '-' +
        String(getWeekNumber(new Date(importFecha))).padStart(2, '0')
      // Intentar recargar si coincide
      if (planActivo?.identificador_semana === identificador) {
        handleSelectPlan(identificador)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setImportLoading(false)
    }
  }

  const getWeekNumber = (d: Date): number => {
    const onejan = new Date(d.getFullYear(), 0, 1)
    const days = Math.floor((d.getTime() - onejan.getTime()) / 86400000)
    return Math.ceil((days + onejan.getDay() + 1) / 7)
  }

  const toggleCell = (sku: string, dia: Dia) => {
    const key = `${sku}__${dia}`
    const newSet = new Set(selectedCells)
    if (newSet.has(key)) {
      newSet.delete(key)
    } else {
      newSet.add(key)
    }
    setSelectedCells(newSet)
  }

  const isCellSelected = (sku: string, dia: Dia) => selectedCells.has(`${sku}__${dia}`)

  const handleAutorizarSeleccionados = async () => {
    clearMessages()
    if (!planActivo || selectedCells.size === 0) {
      setError('Seleccione al menos una celda para autorizar')
      return
    }

    const ventas = Array.from(selectedCells).map((key) => {
      const [sku, dia] = key.split('__')
      const item = planActivo.items.find((i) => i.sku === sku)
      const cantidad = item?.dias[dia as Dia]?.plan || 0
      return { sku, dia, cantidad }
    }).filter((v) => v.cantidad > 0)

    if (ventas.length === 0) {
      setError('Las celdas seleccionadas no tienen cantidades planificadas')
      return
    }

    try {
      setAutorizarLoading(true)
      const res = await autorizarVentasMasivo(token, {
        identificador_semana: planActivo.identificador_semana,
        ventas,
      })
      setResultados(res.resultados)
      setShowResultados(true)
      setSelectedCells(new Set())
      // Recargar el plan
      handleSelectPlan(planActivo.identificador_semana)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setAutorizarLoading(false)
    }
  }

  const selectAllPendientes = () => {
    if (!planActivo) return
    const newSet = new Set<string>()
    for (const item of planActivo.items) {
      for (const dia of DIAS) {
        const info = item.dias[dia]
        if (info && info.plan > 0 && info.status === 'Pendiente') {
          newSet.add(`${item.sku}__${dia}`)
        }
      }
    }
    setSelectedCells(newSet)
  }

  const clearSelection = () => setSelectedCells(new Set())

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })

  return (
    <div className="space-y-4">
      {/* Messages */}
      {error && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-lg px-4 py-3 text-red-400 flex justify-between">
          <span>❌ {error}</span>
          <button onClick={() => setError('')} className="text-red-300 hover:text-white">✕</button>
        </div>
      )}
      {success && (
        <div className="bg-green-900/30 border border-green-500/50 rounded-lg px-4 py-3 text-green-400 flex justify-between">
          <span>✅ {success}</span>
          <button onClick={() => setSuccess('')} className="text-green-300 hover:text-white">✕</button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">📋 Plan de Ventas Semanal</h2>
        <div className="flex gap-2">
          <button onClick={fetchPlanes} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors">
            🔄 Refrescar
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            📥 Importar Plan
          </button>
        </div>
      </div>

      {/* Lista de planes */}
      <div className="flex gap-2 flex-wrap">
        {loading ? (
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-400" />
        ) : planes.length === 0 ? (
          <p className="text-gray-500 text-sm">No hay planes registrados. Importe uno desde Excel.</p>
        ) : (
          planes.map((p) => (
            <button
              key={p.identificador_semana}
              onClick={() => handleSelectPlan(p.identificador_semana)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                planActivo?.identificador_semana === p.identificador_semana
                  ? 'bg-emerald-600 border-emerald-500 text-white'
                  : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
              }`}
            >
              📅 Semana {p.identificador_semana}
              <span className="ml-2 text-xs opacity-70">({p.total_skus || 0} SKUs)</span>
            </button>
          ))
        )}
      </div>

      {/* Tabla del plan activo */}
      {loadingPlan ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-400" />
        </div>
      ) : planActivo ? (
        <div className="space-y-3">
          {/* Info del plan */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-400">
                Semana: <span className="text-white font-medium">{planActivo.identificador_semana}</span>
                {' · '}Inicio: <span className="text-white">{formatDate(planActivo.fecha_inicio_semana)}</span>
                {' · '}Importado por: <span className="text-emerald-400">{planActivo.importado_por || 'N/A'}</span>
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={selectAllPendientes}
                className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 px-3 py-1.5 rounded-lg text-xs transition-colors"
              >
                ☑️ Seleccionar Pendientes
              </button>
              {selectedCells.size > 0 && (
                <>
                  <button
                    onClick={clearSelection}
                    className="bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-lg text-xs transition-colors"
                  >
                    ✕ Limpiar ({selectedCells.size})
                  </button>
                  <button
                    onClick={handleAutorizarSeleccionados}
                    disabled={autorizarLoading}
                    className="bg-emerald-600 hover:bg-emerald-700 px-4 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:bg-gray-600"
                  >
                    {autorizarLoading ? '⏳ Autorizando...' : `✅ Autorizar (${selectedCells.size})`}
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Grid del plan */}
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-800 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-gray-400 font-medium sticky left-0 bg-gray-800 z-10">SKU</th>
                    <th className="px-4 py-3 text-left text-gray-400 font-medium">Descripción</th>
                    {DIAS.map((dia) => (
                      <th key={dia} className="px-3 py-3 text-center text-gray-400 font-medium min-w-[100px]">
                        {DIA_LABELS[dia]}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-right text-gray-400 font-medium">Total Sem.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  {(planActivo.items || []).map((item) => {
                    const totalSemana = DIAS.reduce((sum, dia) => sum + (item.dias[dia]?.plan || 0), 0)
                    return (
                      <tr key={item.sku} className="hover:bg-gray-800/30 transition-colors">
                        <td className="px-4 py-2 font-mono text-emerald-400 text-xs sticky left-0 bg-gray-900">
                          {item.sku}
                        </td>
                        <td className="px-4 py-2 text-gray-300 text-xs max-w-[200px] truncate">
                          {item.descripcion || '—'}
                        </td>
                        {DIAS.map((dia) => {
                          const info = item.dias[dia]
                          if (!info || info.plan === 0) {
                            return (
                              <td key={dia} className="px-3 py-2 text-center text-gray-700 text-xs">
                                —
                              </td>
                            )
                          }
                          const isAutorizado = info.status === 'Autorizado'
                          const isSelected = isCellSelected(item.sku, dia)

                          return (
                            <td key={dia} className="px-1 py-1 text-center">
                              <button
                                onClick={() => !isAutorizado && toggleCell(item.sku, dia)}
                                disabled={isAutorizado}
                                className={`w-full px-2 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                                  isAutorizado
                                    ? 'bg-green-900/30 border-green-700/30 text-green-400 cursor-default'
                                    : isSelected
                                      ? 'bg-emerald-600 border-emerald-500 text-white ring-2 ring-emerald-400/50'
                                      : 'bg-yellow-900/20 border-yellow-700/30 text-yellow-400 hover:bg-yellow-900/40 cursor-pointer'
                                }`}
                              >
                                <span className="block font-bold">{info.plan}</span>
                                <span className="block text-[10px] opacity-70">
                                  {isAutorizado ? '✅' : isSelected ? '☑️' : '⏳'}
                                </span>
                              </button>
                            </td>
                          )
                        })}
                        <td className="px-4 py-2 text-right font-bold text-white">{totalSemana}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Leyenda */}
          <div className="flex gap-4 text-xs text-gray-500">
            <span><span className="inline-block w-3 h-3 rounded bg-yellow-900/40 border border-yellow-700/30 mr-1" /> Pendiente</span>
            <span><span className="inline-block w-3 h-3 rounded bg-emerald-600 mr-1" /> Seleccionado</span>
            <span><span className="inline-block w-3 h-3 rounded bg-green-900/30 border border-green-700/30 mr-1" /> Autorizado</span>
          </div>
        </div>
      ) : (
        !loading && planes.length > 0 && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
            <p className="text-4xl mb-3">📅</p>
            <p className="text-gray-400">Seleccione una semana para ver el plan de ventas</p>
          </div>
        )
      )}

      {/* ============================================ */}
      {/* Modal: Importar Plan                         */}
      {/* ============================================ */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-md">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">📥 Importar Plan de Ventas</h3>
              <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Fecha inicio de semana *</label>
                <input
                  type="date"
                  value={importFecha}
                  onChange={(e) => setImportFecha(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Archivo Excel/CSV *</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-400 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:text-white file:text-xs file:cursor-pointer"
                />
              </div>

              <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
                <p className="text-xs text-gray-400 font-semibold mb-1">📄 Formato esperado:</p>
                <p className="text-xs text-gray-500">
                  Columnas: <span className="text-gray-300">SKU, DESCRIPCION, LUNES, MARTES, MIERCOLES, JUEVES, VIERNES</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Valores numéricos en cada día representan la cantidad planificada.
                </p>
              </div>
            </div>

            <div className="p-6 border-t border-gray-800 flex justify-end gap-3">
              <button onClick={() => setShowImportModal(false)} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleImportar}
                disabled={importLoading}
                className="bg-emerald-600 hover:bg-emerald-700 px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:bg-gray-600"
              >
                {importLoading ? '⏳ Importando...' : '📥 Importar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================ */}
      {/* Modal: Resultados de autorización             */}
      {/* ============================================ */}
      {showResultados && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">📊 Resultados de Autorización</h3>
              <button onClick={() => setShowResultados(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-6 space-y-2">
              {resultados.map((r, i) => (
                <div
                  key={i}
                  className={`rounded-lg px-4 py-2 text-sm border ${
                    r.includes('✅')
                      ? 'bg-green-900/20 border-green-700/30 text-green-400'
                      : r.includes('❌')
                        ? 'bg-red-900/20 border-red-700/30 text-red-400'
                        : 'bg-yellow-900/20 border-yellow-700/30 text-yellow-400'
                  }`}
                >
                  {r}
                </div>
              ))}
            </div>
            <div className="p-6 border-t border-gray-800 flex justify-end">
              <button onClick={() => setShowResultados(false)} className="bg-gray-700 hover:bg-gray-600 px-6 py-2 rounded-lg text-sm transition-colors">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}