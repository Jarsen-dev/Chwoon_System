'use client'

import { useState, useEffect, useCallback } from 'react'
import { getOrdenesCompra, validarOrdenFinanzas } from '@/lib/api'
import type { OrdenCompra } from '@/types'
import { Badge } from '@/components/ui'

interface Props { token: string }

export default function ValidacionTab({ token }: Props) {
  const [ordenes, setOrdenes] = useState<OrdenCompra[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOC, setSelectedOC] = useState<OrdenCompra | null>(null)
  
  // Estados para el visor de PDF
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfLoading, setPdfLoading] = useState(false)
  
  // Mensajes
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Modal de Rechazo
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [rechazoMotivo, setRechazoMotivo] = useState('')

  const fetchOrdenes = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getOrdenesCompra(token)
      
      // CHIVATO: Revisar qué está enviando el backend
      console.log("🔎 Datos crudos de la API:", data) 
      
      // FILTRO ESTRICTO: Solo pendientes de firma Y que YA tengan la firma de compras
      const pendientes = data.filter(oc => oc.status === 'Pendiente de Firma')
      setOrdenes(pendientes)
      
      if (selectedOC && !pendientes.find(o => o.oc_id === selectedOC.oc_id)) {
        setSelectedOC(null)
      }
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token, selectedOC])

  useEffect(() => { fetchOrdenes() }, [fetchOrdenes])

  // ==========================================
  // EFECTO: CARGAR EL PDF COMO BLOB
  // ==========================================
  useEffect(() => {
    if (!selectedOC) {
      setPdfUrl(null)
      return
    }

    let isMounted = true
    let currentObjectUrl: string | null = null

    const fetchPdf = async () => {
      setPdfLoading(true)
      try {
        const res = await fetch(`/finanzas/compras/${selectedOC.oc_id}/pdf`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        if (!res.ok) throw new Error('Error al obtener el documento')

        const blob = await res.blob()
        const objectUrl = URL.createObjectURL(blob)
        currentObjectUrl = objectUrl

        if (isMounted) {
          setPdfUrl(objectUrl)
        } else {
          URL.revokeObjectURL(objectUrl)
        }
      } catch (err) {
        console.error(err)
        if (isMounted) setPdfUrl(null)
      } finally {
        if (isMounted) setPdfLoading(false)
      }
    }

    fetchPdf()

    // Cleanup: revocar exactamente la URL creada por esta instancia del efecto
    return () => {
      isMounted = false
      if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl)
    }
  }, [selectedOC, token])

  // ==========================================
  // ACCIONES DE FINANZAS
  // ==========================================
  const handleAutorizar = async () => {
    if (!selectedOC) return
    try {
      await validarOrdenFinanzas(token, selectedOC.oc_id, { accion: 'aprobar' })
      setSuccess(`Orden ${selectedOC.oc_id} Autorizada exitosamente.`)
      fetchOrdenes()
    } catch (err: any) { setError(err.message) }
  }

  const handleRechazar = async () => {
    if (!selectedOC || !rechazoMotivo.trim()) {
      setError("Debes escribir un motivo de rechazo.")
      return
    }
    try {
      await validarOrdenFinanzas(token, selectedOC.oc_id, { accion: 'rechazar', motivo: rechazoMotivo.trim() })
      setSuccess(`Orden ${selectedOC.oc_id} rechazada y devuelta a Compras.`)
      setShowRejectModal(false)
      setRechazoMotivo('')
      fetchOrdenes()
    } catch (err: any) { setError(err.message) }
  }

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(val)

  return (
    <div className="flex h-[calc(100vh-140px)] gap-6">
      
      {/* ========================================== */}
      {/* PANEL IZQUIERDO: Lista de Órdenes */}
      {/* ========================================== */}
      <div className="w-1/3 bg-gray-900 border border-gray-800 rounded-xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-800/30">
          <h2 className="font-bold text-gray-200">⚖️ Pendientes de Autorizar</h2>
          <Badge variant="warning">{ordenes.length}</Badge>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {loading ? (
            <p className="text-center text-gray-500 mt-10 animate-pulse">Cargando órdenes...</p>
          ) : ordenes.length === 0 ? (
            <div className="text-center mt-10">
              <p className="text-4xl mb-2">✨</p>
              <p className="text-gray-500 text-sm">No hay órdenes pendientes de tu firma.</p>
            </div>
          ) : (
            ordenes.map(oc => {
              const isSelected = selectedOC?.oc_id === oc.oc_id
              const total = oc.items.reduce((acc: any, item: any) => acc + (item.cantidad_requerida * item.precio_unitario), 0)
              const ivaSeguro = oc.iva ?? 0
              const granTotal = total + (total * (ivaSeguro >= 1 ? ivaSeguro / 100 : ivaSeguro))
              
              return (
                <button
                  key={oc.oc_id}
                  onClick={() => { setSelectedOC(oc); setError(''); setSuccess('') }}
                  className={`w-full text-left p-4 rounded-lg border transition-all ${
                    isSelected 
                      ? 'bg-blue-900/20 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.1)]' 
                      : 'bg-gray-800/50 border-gray-700 hover:border-gray-500 hover:bg-gray-800'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className={`font-mono text-sm ${isSelected ? 'text-blue-400 font-bold' : 'text-emerald-400'}`}>{oc.oc_id}</span>
                    <span className="text-sm font-bold text-gray-200">{formatCurrency(granTotal)}</span>
                  </div>
                  <p className="text-sm text-gray-300 truncate">{oc.nombre_proveedor}</p>
                  <p className="text-xs text-gray-500 mt-2 flex items-center gap-1">
                    <span className="text-emerald-500">✓</span> Firmado por: {oc.firma_compras}
                  </p>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* ========================================== */}
      {/* PANEL DERECHO: Visor PDF */}
      {/* ========================================== */}
      <div className="w-2/3 bg-gray-900 border border-gray-800 rounded-xl flex flex-col overflow-hidden relative">
        
        <div className="absolute top-4 left-0 right-0 flex justify-center z-10 pointer-events-none">
          {error && <div className="bg-red-900/90 border border-red-500 text-red-200 px-4 py-2 rounded-lg shadow-lg pointer-events-auto">{error} <button onClick={()=>setError('')} className="ml-2 font-bold">✕</button></div>}
          {success && <div className="bg-green-900/90 border border-green-500 text-green-200 px-4 py-2 rounded-lg shadow-lg pointer-events-auto">{success} <button onClick={()=>setSuccess('')} className="ml-2 font-bold">✕</button></div>}
        </div>

        {!selectedOC ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <span className="text-6xl mb-4">📄</span>
            <p>Selecciona una orden de la lista para evaluarla</p>
          </div>
        ) : (
          <>
            {/* Header de Acciones */}
            <div className="p-4 border-b border-gray-800 bg-gray-800/30 flex justify-between items-center shadow-md z-10">
              <div>
                <h2 className="text-lg font-bold text-gray-100">{selectedOC.nombre_proveedor}</h2>
                <p className="font-mono text-sm text-blue-400">{selectedOC.oc_id}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setShowRejectModal(true)} className="bg-red-900/30 hover:bg-red-900/60 text-red-400 border border-red-700/50 px-4 py-2 rounded-lg text-sm transition-colors font-medium">
                  ❌ Rechazar
                </button>
                <button onClick={handleAutorizar} className="bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20 px-6 py-2 rounded-lg text-sm transition-colors font-bold">
                  ✅ Autorizar Gasto
                </button>
              </div>
            </div>

            {/* Body: Visor del PDF */}
            <div className="flex-1 bg-[#525659] p-2">
              {pdfLoading ? (
                <div className="h-full flex flex-col items-center justify-center text-gray-300">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-white mb-4"></div>
                  <p>Cargando documento original...</p>
                </div>
              ) : pdfUrl ? (
                <iframe
                  src={`${pdfUrl}#view=FitH`}
                  className="w-full h-full rounded shadow-inner bg-white"
                  title={`PDF ${selectedOC.oc_id}`}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-red-400">
                  Error al renderizar el documento.
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ========================================== */}
      {/* MODAL DE RECHAZO */}
      {/* ========================================== */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-red-900 rounded-xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-red-400 mb-2">Rechazar Orden</h3>
            <p className="text-sm text-gray-400 mb-4">
              La orden será devuelta a Compras y se borrará la firma inicial. Debes justificar el motivo para que lo corrijan.
            </p>
            <textarea
              className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm focus:border-red-500 focus:outline-none mb-4"
              rows={4}
              placeholder="Ej: El precio unitario es más alto de lo cotizado..."
              value={rechazoMotivo}
              onChange={(e) => setRechazoMotivo(e.target.value)}
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowRejectModal(false)} className="px-4 py-2 rounded-lg text-sm bg-gray-800 hover:bg-gray-700 text-gray-300">
                Cancelar
              </button>
              <button onClick={handleRechazar} className="px-4 py-2 rounded-lg text-sm bg-red-600 hover:bg-red-500 text-white font-bold">
                Confirmar Rechazo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}