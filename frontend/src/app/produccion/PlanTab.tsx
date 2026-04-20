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
      const result = await importarPlanExcel(file)
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
  // BADGE DE ESTADO
  // ==========================================
  const getEstadoBadge = (estado: string) => {
    switch (estado) {
      case 'en_proceso':
        return (
          <span className="px-2.5 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-bold">
            🔄 En Proceso
          </span>
        )
      case 'completado':
        return (
          <span className="px-2.5 py-1 bg-green-100 text-green-800 rounded-full text-xs font-bold">
            ✅ Completado
          </span>
        )
      default:
        return (
          <span className="px-2.5 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-bold">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className={`px-6 py-4 ${
              modalInfo.type === 'success' ? 'bg-green-600' :
              modalInfo.type === 'error'   ? 'bg-red-600'   : 'bg-blue-600'
            }`}>
              <h3 className="text-lg font-bold text-white">{modalInfo.title}</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-700 text-sm whitespace-pre-line mb-4">
                {modalInfo.message}
              </p>
              {erroresImport.length > 0 && (
                <button
                  onClick={() => { setModalInfo(null); setIsErrorModalOpen(true) }}
                  className="w-full mb-3 px-4 py-2 rounded-lg text-sm font-medium bg-yellow-50 text-yellow-700 border border-yellow-200 hover:bg-yellow-100 transition"
                >
                  ⚠️ Ver {erroresImport.length} advertencia(s)
                </button>
              )}
              <div className="flex justify-end">
                <button
                  onClick={() => setModalInfo(null)}
                  className={`px-6 py-2.5 rounded-lg font-bold text-white transition ${
                    modalInfo.type === 'success' ? 'bg-green-600 hover:bg-green-700' :
                    modalInfo.type === 'error'   ? 'bg-red-600   hover:bg-red-700'   :
                                                   'bg-blue-600  hover:bg-blue-700'
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-red-600 px-6 py-4">
              <h3 className="text-lg font-bold text-white">
                🗑️ {confirmModal.title}
              </h3>
            </div>
            <div className="p-6">
              <p className="text-gray-700 text-sm mb-6">{confirmModal.message}</p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="px-5 py-2.5 rounded-lg font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmModal.onConfirm}
                  className="px-5 py-2.5 rounded-lg font-bold text-white bg-red-600 hover:bg-red-700 transition"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-yellow-500 px-6 py-4">
              <h3 className="text-lg font-bold text-white">⚠️ Advertencias</h3>
            </div>
            <div className="p-6">
              <div className="max-h-60 overflow-y-auto space-y-1 bg-gray-50 rounded-lg p-3 border border-gray-200">
                {erroresImport.map((err, idx) => (
                  <p key={idx} className="text-xs text-red-600 font-mono">• {err}</p>
                ))}
              </div>
              <div className="flex justify-end mt-4">
                <button
                  onClick={() => { setIsErrorModalOpen(false); setErroresImport([]) }}
                  className="px-6 py-2.5 rounded-lg font-bold text-white bg-yellow-500 hover:bg-yellow-600 transition"
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
        <h2 className="text-xl font-bold text-slate-700">
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
            className={`flex items-center gap-2 px-4 py-2 rounded font-medium text-white transition shadow-sm ${
              isImporting
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-purple-600 hover:bg-purple-700'
            }`}
          >
            {isImporting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Importando...
              </>
            ) : <>📥 Importar Excel</>}
          </button>
        </div>
      </div>

      {/* ======================================================= */}
      {/* HINT                                                     */}
      {/* ======================================================= */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-xs text-blue-700 flex items-start gap-2">
        <span className="text-base">ℹ️</span>
        <div>
          <p className="font-semibold mb-1">Formato esperado del Excel:</p>
          <p>
            Columnas requeridas:{' '}
            <code className="bg-blue-100 px-1 rounded">Número de Parte</code>{' '}
            <code className="bg-blue-100 px-1 rounded">Turno Objetivo</code>{' '}
            <code className="bg-blue-100 px-1 rounded">Meta Piezas</code>
          </p>
          <p className="mt-1">
            El turno se leerá directamente del Excel (Día / Noche por fila).
          </p>
        </div>
      </div>

      {/* ======================================================= */}
      {/* TABLA                                                    */}
      {/* ======================================================= */}
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-700 border-b">
            <tr>
              <th className="p-3 text-center font-semibold">N° Parte</th>
              <th className="p-3 text-center font-semibold">Turno Objetivo</th>
              <th className="p-3 text-center font-semibold">Meta (Piezas)</th>
              <th className="p-3 text-center font-semibold">Carritos</th>
              <th className="p-3 text-center font-semibold">Estado</th>
              <th className="p-3 text-center font-semibold">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {planes.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-12 text-center">
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
                  <tr key={idx} className="border-t hover:bg-gray-50 transition">

                    {/* N° Parte */}
                    <td className="p-3 text-center font-mono font-medium text-blue-800">
                      {p.numero_parte}
                    </td>

                    {/* Turno */}
                    <td className="p-3 text-center">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                        p.turno_objetivo === 'Día'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-indigo-100 text-indigo-800'
                      }`}>
                        {p.turno_objetivo === 'Día' ? '☀️' : '🌙'} {p.turno_objetivo}
                      </span>
                    </td>

                    {/* Meta */}
                    <td className="p-3 text-center font-bold text-slate-700">
                      {p.meta_piezas?.toLocaleString()}
                    </td>

                    {/* Carritos */}
                    <td className="p-3 text-center">
                      {carritos > 0 ? (
                        <span className="font-bold text-purple-700">
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
                          className="px-3 py-1.5 rounded text-xs font-bold text-white bg-red-500 hover:bg-red-600 transition shadow-sm flex items-center gap-1"
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