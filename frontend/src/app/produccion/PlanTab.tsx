'use client'

import { useRef, useState } from 'react'
import { useAuth }           from '@/context/AuthContext'
import { importarPlanExcel, eliminarDelPlan, agregarACola } from '@/lib/api'
import { Modal, Button } from '@/components/ui'
import {
  IconOk, IconAlertas, IconInfo, IconEliminar, IconEtiquetas, IconActualizar,
  IconCompletado, IconSinMovimiento, IconLista, IconTurnoDia, IconTurnoNoche,
  IconDocumento, IconPendiente,
} from '@/lib/icons'

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
        title:   'Plan Importado',
        message: `Partes importadas: ${result.partes_importadas}\nEtiquetas en cola: ${result.etiquetas_en_cola}${
          result.errores.length > 0 ? `\n${result.errores.length} advertencia(s)` : ''
        }`,
        type: 'success'
      })
      onRefresh()
    } catch (error: any) {
      setModalInfo({
        title:   'Error al Importar',
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
        title:   'Error',
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
        title:   'Sin etiquetas',
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
        title:   'Error al agregar a cola',
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
            title:   'Error',
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
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-blue-500/20 text-blue-300 rounded-full text-xs font-bold">
            <IconActualizar size={13} aria-hidden /> En Proceso
          </span>
        )
      case 'completado':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-500/20 text-green-400 rounded-full text-xs font-bold">
            <IconCompletado size={13} aria-hidden /> Completado
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-yellow-500/20 text-yellow-300 rounded-full text-xs font-bold">
            <IconSinMovimiento size={13} aria-hidden /> Pendiente
          </span>
        )
    }
  }

  const ModalIcon = modalInfo
    ? (modalInfo.type === 'success' ? IconOk : modalInfo.type === 'error' ? IconAlertas : IconInfo)
    : IconInfo
  const modalTitleColor = modalInfo
    ? (modalInfo.type === 'success' ? 'text-emerald-400' : modalInfo.type === 'error' ? 'text-red-400' : 'text-blue-400')
    : ''

  return (
    <div className="space-y-4">

      {/* MODAL: NOTIFICACIÓN */}
      <Modal
        open={!!modalInfo}
        onClose={() => setModalInfo(null)}
        size="sm"
        title={<span className={`flex items-center gap-2 ${modalTitleColor}`}><ModalIcon size={18} aria-hidden /> {modalInfo?.title}</span>}
        footer={<Button variant="secondary" onClick={() => setModalInfo(null)}>Aceptar</Button>}
      >
        <p className="text-gray-300 text-sm whitespace-pre-line mb-4">{modalInfo?.message}</p>
        {erroresImport.length > 0 && (
          <button
            onClick={() => { setModalInfo(null); setIsErrorModalOpen(true) }}
            className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-[7px] rounded-md text-xs font-semibold border bg-yellow-500/10 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/20 transition"
          >
            <IconAlertas size={14} aria-hidden /> Ver {erroresImport.length} advertencia(s)
          </button>
        )}
      </Modal>

      {/* MODAL: CONFIRMAR ELIMINACIÓN */}
      <Modal
        open={!!confirmModal}
        onClose={() => setConfirmModal(null)}
        size="sm"
        title={<span className="flex items-center gap-2 text-red-400"><IconEliminar size={18} aria-hidden /> {confirmModal?.title}</span>}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmModal(null)}>Cancelar</Button>
            <Button variant="danger" onClick={() => confirmModal?.onConfirm()} leftIcon={IconEliminar}>Sí, Eliminar</Button>
          </>
        }
      >
        <p className="text-gray-300 text-sm">{confirmModal?.message}</p>
      </Modal>

      {/* MODAL: ADVERTENCIAS */}
      <Modal
        open={isErrorModalOpen}
        onClose={() => { setIsErrorModalOpen(false); setErroresImport([]) }}
        size="md"
        title={<span className="flex items-center gap-2 text-yellow-400"><IconAlertas size={18} aria-hidden /> Advertencias</span>}
        footer={<Button variant="secondary" onClick={() => { setIsErrorModalOpen(false); setErroresImport([]) }}>Entendido</Button>}
      >
        <div className="max-h-60 overflow-y-auto space-y-1 bg-gray-800 rounded-lg p-3 border border-gray-800">
          {erroresImport.map((err, idx) => (
            <p key={idx} className="text-xs text-red-400 font-mono">• {err}</p>
          ))}
        </div>
      </Modal>

      {/* ======================================================= */}
      {/* HEADER                                                   */}
      {/* ======================================================= */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <h2 className="text-xl font-bold text-gray-200 flex items-center gap-2">
          <IconLista size={20} className="text-[var(--accent)]" aria-hidden /> Gestor de Plan de Producción
        </h2>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            leftIcon={isImporting ? IconPendiente : IconDocumento}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {isImporting ? 'Importando...' : 'Importar Excel'}
          </Button>
        </div>
      </div>

      {/* ======================================================= */}
      {/* HINT                                                     */}
      {/* ======================================================= */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-3 text-xs text-blue-400 flex items-start gap-2">
        <IconInfo size={16} className="shrink-0 mt-0.5" aria-hidden />
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
                  <IconLista size={36} className="mx-auto mb-2 text-gray-500" aria-hidden />
                  <span className="text-gray-300">
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
                            <span className="inline-flex items-center gap-1">{turnoNorm === 'Día' ? <IconTurnoDia size={13} aria-hidden /> : <IconTurnoNoche size={13} aria-hidden />} {turnoNorm}</span>
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
                            <><IconEtiquetas size={14} aria-hidden /> Imprimir</>
                          )}
                        </button>

                        {/* Eliminar fila */}
                        <button
                          onClick={() => handleEliminar(p.numero_parte)}
                          className="px-3 py-1.5 rounded text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition shadow-sm flex items-center gap-1"
                          title="Eliminar del plan"
                        >
                          <IconEliminar size={14} aria-hidden /> Eliminar
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