'use client'

import { useRef, useState } from 'react'
import { useAuth }           from '@/context/AuthContext'
import { importarPlanExcel, eliminarDelPlan, agregarACola } from '@/lib/api'

interface Props {
  planes:       any[]
  onRefresh:    () => void
  onGoToTab?:   (tab: string) => void    // ← NUEVO
}

type ModalInfo = {
  title:   string
  message: string
  type:    'success' | 'error' | 'info'
} | null

type ConfirmModal = {
  title:     string
  message:   string
  onConfirm: () => void
} | null

export default function PlanTab({ planes, onRefresh, onGoToTab }: Props) {
  const { token } = useAuth()

  const [isImporting, setIsImporting]           = useState(false)
  const [isPrinting, setIsPrinting]             = useState<string | null>(null)
  const [modalInfo, setModalInfo]               = useState<ModalInfo>(null)
  const [confirmModal, setConfirmModal]         = useState<ConfirmModal>(null)
  const [erroresImport, setErroresImport]       = useState<string[]>([])
  const [isErrorModalOpen, setIsErrorModalOpen] = useState(false)
  const fileInputRef                            = useRef<HTMLInputElement>(null)

  // ==========================================
  // IMPORTAR EXCEL
  // ==========================================
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setIsImporting(true)
    try {
      if (!token) {
        throw new Error('No hay sesión activa. Inicia sesión para importar.')
      }
      const result = await importarPlanExcel(file, token)
      if (result.errores?.length > 0) setErroresImport(result.errores)

      setModalInfo({
        title:   '✅ Plan Importado',
        message: `Partes importadas: ${result.partes_importadas}\nEtiquetas en cola: ${result.etiquetas_en_cola}${
          result.errores.length > 0 ? `\n⚠️ ${result.errores.length} advertencia(s)` : ''
        }`,
        type: 'success'
      })
      onRefresh()
    } catch (error: any) {
      setModalInfo({
        title:   '❌ Error al Importar',
        message: error.message || 'No se pudo procesar el archivo.',
        type:    'error'
      })
    } finally {
      setIsImporting(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  // ==========================================
  // IMPRIMIR → agregar a cola + ir a tab etiquetas
  // ==========================================
  const handleImprimir = async (plan: any) => {
    if (!token) {
      setModalInfo({
        title:   '❌ Error',
        message: 'No hay sesión activa. Inicia sesión para imprimir.',
        type:    'error'
      })
      return
    }

    const carritos = plan.qtu && plan.qtu > 0
      ? Math.ceil(plan.meta_piezas / plan.qtu)
      : 0

    if (carritos <= 0) {
      setModalInfo({
        title:   '⚠️ Sin etiquetas',
        message: `No se puede calcular la cantidad de etiquetas para "${plan.numero_parte}". Verifica que tenga QTU en el inventario.`,
        type:    'error'
      })
      return
    }

    setIsPrinting(plan.numero_parte)

    try {
      await agregarACola({
        codigo_inventario:  plan.numero_parte,
        cantidad_etiquetas: carritos,
        turno:              plan.turno_objetivo,
      }, token)

      // Navegar a la tab de etiquetas
      if (onGoToTab) {
        onGoToTab('etiquetas')
      }
    } catch (error: any) {
      setModalInfo({
        title:   '❌ Error al agregar a cola',
        message: error.message || 'No se pudo añadir a la cola de impresión.',
        type:    'error'
      })
    } finally {
      setIsPrinting(null)
    }
  }

  // ==========================================
  // ELIMINAR FILA DEL PLAN
  // ==========================================
  const handleEliminar = (numero_parte: string) => {
    setConfirmModal({
      title:   'Confirmar Eliminación',
      message: `¿Eliminar "${numero_parte}" del plan de producción?`,
      onConfirm: async () => {
        setConfirmModal(null)
        try {
          await eliminarDelPlan(numero_parte)
          onRefresh()
        } catch (error: any) {
          setModalInfo({
            title:   '❌ Error',
            message: error.message,
            type:    'error'
          })
        }
      }
    })
  }

  // ==========================================
  // HELPERS
  // ==========================================
  const normalizarTurno = (turno: string): 'Día' | 'Noche' => {
    const t = (turno || '').trim().toUpperCase()
    if (t === 'D' || t === 'DIA' || t === 'DÍA' || t === 'DIURNO' || t === 'DAY') return 'Día'
    if (t === 'N' || t === 'NOCHE' || t === 'NOCTURNO' || t === 'NIGHT') return 'Noche'
    return 'Día'
  }

  // ==========================================
  // BADGE DE ESTADO
  // ==========================================
  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case 'en_proceso':
        return (
          <span className="px-2.5 py-1 bg-blue-500/20 text-blue-300 rounded-full text-xs font-bold">
            🔄 En Proceso
          </span>
        )
      case 'completado':
        return (
          <span className="px-2.5 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold">
            ✅ Completado
          </span>
        )
      default:
        return (
          <span className="px-2.5 py-1 bg-yellow-500/20 text-yellow-300 rounded-full text-xs font-bold">
            ⏸️ Pendiente
          </span>
        )
    }
  }

  return (
    <div className="space-y-4">

      {/* ======================================================= */}
      {/* MODAL: NOTIFICACIÓN                                      */}
      {/* ======================================================= */}
      {modalInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[3px]">
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] w-full max-w-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
              <h3 className={`text-base font-bold ${
                modalInfo.type === 'success' ? 'text-emerald-400' :
                modalInfo.type === 'error'   ? 'text-red-400'     : 'text-blue-400'
              }`}>{modalInfo.title}</h3>
            </div>
            <div className="p-5">
              <p className="text-gray-300 text-sm whitespace-pre-line mb-4">
                {modalInfo.message}
              </p>
              {erroresImport.length > 0 && (
                <button
                  onClick={() => { setModalInfo(null); setIsErrorModalOpen(true) }}
                  className="w-full mb-3 inline-flex items-center justify-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold border bg-yellow-500/10 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20 transition"
                >
                  ⚠️ Ver {erroresImport.length} advertencia(s)
                </button>
              )}
              <div className="flex justify-end">
                <button
                  onClick={() => setModalInfo(null)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold border transition-all duration-150 ${
                    modalInfo.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20' :
                    modalInfo.type === 'error'   ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20' :
                                                   'bg-blue-500/10 text-blue-400 border-blue-500/30 hover:bg-blue-500/20'
                  }`}
                >
                  Aceptar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* MODAL: CONFIRMAR ELIMINACIÓN                            */}
      {/* ======================================================= */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[3px]">
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] w-full max-w-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
              <span>🗑️</span>
              <h3 className="text-base font-bold text-red-400">{confirmModal.title}</h3>
            </div>
            <div className="p-5">
              <p className="text-gray-300 text-sm mb-5">{confirmModal.message}</p>
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold border border-gray-800 text-gray-400 hover:text-white hover:border-gray-700 hover:bg-gray-800 transition-all duration-150"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmModal.onConfirm}
                  className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold border bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20 transition-all duration-150"
                >
                  Sí, Eliminar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* MODAL: ADVERTENCIAS                                      */}
      {/* ======================================================= */}
      {isErrorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-[3px]">
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
              <span>⚠️</span>
              <h3 className="text-base font-bold text-yellow-400">Advertencias</h3>
            </div>
            <div className="p-5">
              <div className="max-h-60 overflow-y-auto space-y-1 bg-gray-800 rounded-lg p-3 border border-gray-800">
                {erroresImport.map((err, idx) => (
                  <p key={idx} className="text-xs text-red-400 font-mono">• {err}</p>
                ))}
              </div>
              <div className="flex justify-end mt-4">
                <button
                  onClick={() => { setIsErrorModalOpen(false); setErroresImport([]) }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold border bg-yellow-500/10 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20 transition-all duration-150"
                >
                  Entendido
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================= */}
      {/* HEADER                                                   */}
      {/* ======================================================= */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-xl font-bold text-gray-200">
          Gestor de Plan de Producción
        </h2>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold shadow-sm transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-400 ${
              isImporting
                ? 'bg-gray-400 cursor-not-allowed text-white'
                : 'bg-green-600 hover:bg-green-700 active:scale-95 text-white'
            }`}
          >
            {isImporting ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                Importando...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 17v-2m3 2v-4m3 4v-6M4 20h16a1 1 0 001-1V5 a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"/>
                </svg>
                Importar Excel
              </>
            )}
          </button>
        </div>
      </div>

      {/* ======================================================= */}
      {/* HINT                                                     */}
      {/* ======================================================= */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-3 text-xs text-blue-400 flex items-start gap-2">
        <span className="text-base">ℹ️</span>
        <div>
          <p className="font-semibold mb-1">Formato esperado del Excel:</p>
          <p>
            Columnas requeridas:{' '}
            <code className="bg-blue-500/20 px-1 rounded">Número de Parte</code>{' '}
            <code className="bg-blue-500/20 px-1 rounded">Turno Objetivo</code>{' '}
            <code className="bg-blue-500/20 px-1 rounded">Meta Piezas</code>
          </p>
          <p className="mt-1">
            Columnas opcionales:{' '}
            <code className="bg-blue-500/20 px-1 rounded">Proceso</code>{' '}
            <code className="bg-blue-500/20 px-1 rounded">Maquina</code>
          </p>
          <p className="mt-1">
            El turno se leerá directamente del Excel (Día / Noche por fila).
          </p>
        </div>
      </div>

      {/* ======================================================= */}
      {/* TABLA                                                    */}
      {/* ======================================================= */}
      <div className="overflow-x-auto border border-gray-800 rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-gray-800 text-gray-300 border-b border-gray-800">
            <tr>
              <th className="p-3 text-center font-semibold">No. de Parte</th>
              <th className="p-3 text-center font-semibold">Proceso</th>
              <th className="p-3 text-center font-semibold">Turno Objetivo</th>
              <th className="p-3 text-center font-semibold">Máquina</th>
              <th className="p-3 text-center font-semibold">Meta (Piezas)</th>
              <th className="p-3 text-center font-semibold">Carritos</th>
              <th className="p-3 text-center font-semibold">Estado</th>
              <th className="p-3 text-center font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {planes.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-12 text-center">
                  <span className="text-4xl block mb-2">📋</span>
                  <span className="text-gray-400">
                    No hay un plan activo. Importa un archivo Excel para comenzar.
                  </span>
                </td>
              </tr>
            ) : (
              planes.map((p, idx) => {
                const carritos = p.qtu && p.qtu > 0
                  ? Math.ceil(p.meta_piezas / p.qtu)
                  : 0
                const estaImprimiendo = isPrinting === p.numero_parte

                return (
                  <tr key={idx} className="border-t border-gray-800 hover:bg-gray-800 transition">

                    {/* No. de Parte */}
                    <td className="p-3 text-center font-mono font-medium text-blue-300">
                      {p.numero_parte}
                    </td>

                    {/* Proceso */}
                    <td className="p-3 text-center">
                      <span className="font-bold text-gray-200 uppercase">
                        {p.proceso || '—'}
                      </span>
                    </td>

                    {/* Turno */}
                    <td className="p-3 text-center">
                      {(() => {
                        const turnoNorm = normalizarTurno(p.turno_objetivo)
                        return (
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                            turnoNorm === 'Día'
                              ? 'bg-yellow-500/20 text-yellow-300'
                              : 'bg-indigo-500/20 text-indigo-300'
                          }`}>
                            {turnoNorm === 'Día' ? '☀️' : '🌙'} {turnoNorm}
                          </span>
                        )
                      })()}
                    </td>

                    {/* Maquina */}
                    <td className="p-3 text-center font-bold text-gray-200">
                      {p.maquina || '—'}
                    </td>

                    {/* Meta */}
                    <td className="p-3 text-center font-bold text-gray-200">
                      {p.meta_piezas?.toLocaleString()}
                    </td>

                    {/* Carritos */}
                    <td className="p-3 text-center">
                      {carritos > 0 ? (
                        <span className="font-bold text-purple-400">
                          {carritos.toLocaleString()}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>

                    {/* Estado */}
                    <td className="p-3 text-center">
                      {getEstadoBadge(p.estado || 'pendiente')}
                    </td>

                    {/* Acciones */}
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-2">

                        {/* Imprimir → agrega a cola + cambia tab */}
                        <button
                          onClick={() => handleImprimir(p)}
                          disabled={estaImprimiendo || carritos <= 0}
                          className={`px-3 py-1.5 rounded text-xs font-bold text-white transition shadow-sm flex items-center gap-1 ${
                            estaImprimiendo || carritos <= 0
                              ? 'bg-gray-400 cursor-not-allowed'
                              : 'bg-purple-600 hover:bg-purple-700'
                          }`}
                          title={carritos <= 0
                            ? 'Sin QTU en inventario'
                            : `Agregar ${carritos} etiquetas a la cola`
                          }
                        >
                          {estaImprimiendo ? (
                            <>
                              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              Enviando...
                            </>
                          ) : (
                            <>🖨️ Imprimir</>
                          )}
                        </button>

                        {/* Eliminar fila */}
                        <button
                          onClick={() => handleEliminar(p.numero_parte)}
                          className="px-3 py-1.5 rounded text-xs font-bold text-white bg-red-500/100 hover:bg-red-600 transition shadow-sm flex items-center gap-1"
                          title="Eliminar del plan"
                        >
                          🗑️ Eliminar
                        </button>

                      </div>
                    </td>

                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {planes.length > 0 && (
        <p className="text-xs text-gray-400 text-right">
          {planes.length} parte{planes.length !== 1 ? 's' : ''} en el plan actual
        </p>
      )}
    </div>
  )
}