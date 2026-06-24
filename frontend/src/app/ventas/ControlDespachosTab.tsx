'use client'

import { useState, useEffect, useCallback } from 'react'
import { getOrdenesVenta, despacharOV, cambiarEstadoOV } from '@/lib/api'
import { ESTADO_COLORS } from '@/lib/api'
import type { OrdenVenta } from '@/types'
import { Button, LoadingSpinner } from '@/components/ui'
import { IconLogistica, IconActualizar, IconOk, IconCerrar, IconDocumento, IconAlertas } from '@/lib/icons'

interface Props { token: string }

const FORM_INICIAL = {
  invoice:    '',
  departure:  '',   // no_departure: folio NPX de LG  (NPX + 11 dígitos)
  camion:     '',
  chofer:     '',
  status:     'OK' as 'OK' | 'NG',
}

const NPX_REGEX = /^NPX\d{11}$/i

interface Despacho {
  envio_id: string
  ov_id: string
  chofer: string
  camion: string
  departure?: string
  estado_ov: string
  hora: string
}

export default function ControlDespachosTab({ token }: Props) {
  const [ordenes, setOrdenes]           = useState<OrdenVenta[]>([])
  const [seleccionada, setSeleccionada] = useState<OrdenVenta | null>(null)
  const [form, setForm]                 = useState(FORM_INICIAL)
  const [loading, setLoading]           = useState(true)
  const [despachando, setDespachando]   = useState(false)
  const [error, setError]               = useState('')
  const [success, setSuccess]           = useState('')
  const [historial, setHistorial]       = useState<Despacho[]>([])
  const [npxError, setNpxError]         = useState('')

  const cargarOrdenes = useCallback(async () => {
    setLoading(true)
    try {
      // Trae las OVs en estado "Lista para Carga" (listas para despacho)
      const data = await getOrdenesVenta(token, 'Lista para Carga')
      setOrdenes(data)
      // Si solo hay una, la pre-seleccionamos
      if (data.length === 1) setSeleccionada(data[0])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => { cargarOrdenes() }, [cargarOrdenes])

  const handleSeleccionar = (ov: OrdenVenta) => {
    setSeleccionada(ov)
    setForm(FORM_INICIAL)
    setError('')
    setSuccess('')
  }

  const handleDepartureChange = (value: string) => {
    setForm(f => ({ ...f, departure: value }))
    if (value && !NPX_REGEX.test(value)) {
      setNpxError('Formato inválido — debe ser NPX + 11 dígitos (ej: NPX26060000025)')
    } else {
      setNpxError('')
    }
  }

  const handleDespachar = async () => {
    if (!seleccionada) return
    if (!form.camion.trim() || !form.chofer.trim()) {
      setError('Placas y chofer son obligatorios')
      return
    }
    if (form.departure && !NPX_REGEX.test(form.departure)) {
      setError('El No. Departure tiene formato inválido')
      return
    }

    setDespachando(true)
    setError('')
    try {
      const res = await despacharOV(token, seleccionada.ov_id, {
        no_camion:     form.camion.trim(),
        chofer:        form.chofer.trim(),
        status_salida: form.status,
        cw_invoice:    form.invoice.trim() || undefined,
        no_departure:  form.departure.trim() || undefined,
      })

      const msg = form.status === 'OK'
        ? `Salida registrada. Envío: ${res.envio_id}. OV → ${res.estado_ov}`
        : `Salida NG registrada. OV vuelve a "Lista para Carga".`
      setSuccess(msg)

      // Agregar al historial del día
      if (form.status === 'OK') {
        setHistorial(prev => [{
          envio_id: res.envio_id,
          ov_id: seleccionada.ov_id,
          chofer: form.chofer.trim(),
          camion: form.camion.trim(),
          departure: form.departure.trim() || undefined,
          estado_ov: res.estado_ov,
          hora: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }),
        }, ...prev])
      }

      setSeleccionada(null)
      setForm(FORM_INICIAL)
      setNpxError('')
      await cargarOrdenes()

    } catch (err: any) {
      setError(err.message)
    } finally {
      setDespachando(false)
    }
  }

  // Rollback: devolver una OV de "Lista para Carga" a "En Preparación"
  const handleRollback = async (ov: OrdenVenta) => {
    if (!confirm(`¿Devolver ${ov.ov_id} a "En Preparación"? (problema en andén)`)) return
    try {
      await cambiarEstadoOV(token, ov.ov_id, 'En Preparación', 'Rollback desde andén')
      await cargarOrdenes()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const fmtFecha = (iso: string) =>
    new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  const totalCajas = (ov: OrdenVenta) =>
    ov.items?.reduce((s, i) => s + (i.cantidad - i.cantidad_enviada), 0) ?? 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

      {/* ── Panel izquierdo: lista de OVs en andén ── */}
      <div className="lg:col-span-2 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-teal-400 flex items-center gap-2">
            <IconLogistica size={18} aria-hidden /> Andén — Listas para Carga
          </h3>
          <button
            onClick={cargarOrdenes}
            className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200 transition-colors"
          >
            <IconActualizar size={13} aria-hidden /> Actualizar
          </button>
        </div>

        {loading && (
          <div className="flex justify-center py-8">
            <LoadingSpinner sizeClass="h-6 w-6" />
          </div>
        )}

        {!loading && ordenes.length === 0 && (
          <div className="text-center py-10 text-gray-400 bg-gray-900 rounded-xl border border-gray-800">
            <IconOk size={28} className="mx-auto mb-2 text-green-400" aria-hidden />
            <p className="text-sm font-medium">Sin órdenes en andén</p>
            <p className="text-xs mt-1">Cuando Almacén valide cajas, aparecerán aquí</p>
          </div>
        )}

        {ordenes.map(ov => {
          const cajas     = totalCajas(ov)
          const activa    = seleccionada?.ov_id === ov.ov_id
          return (
            <div
              key={ov.ov_id}
              onClick={() => handleSeleccionar(ov)}
              className={`bg-gray-900 border rounded-xl p-4 cursor-pointer transition-all ${
                activa
                  ? 'border-teal-500 ring-1 ring-teal-500/30'
                  : 'border-gray-800 hover:border-gray-600'
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-mono font-bold text-sm text-teal-400">{ov.ov_id}</p>
                  <p className="text-sm text-white mt-0.5">{ov.nombre_cliente || ov.cliente_id}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full border ${ESTADO_COLORS[ov.estado]}`}>
                  {ov.estado}
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                <span>{cajas.toLocaleString()} uds. pendientes · {ov.items?.length ?? 0} SKUs</span>
                <span>{fmtFecha(ov.fecha_creacion)}</span>
              </div>

              {/* Rollback button */}
              {ov.estado === 'Lista para Carga' && (
                <button
                  onClick={e => { e.stopPropagation(); handleRollback(ov) }}
                  className="mt-2 text-xs text-gray-500 hover:text-orange-400 transition-colors"
                >
                  ↩ Regresar a preparación
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Panel derecho: formulario de despacho ── */}
      <div className="lg:col-span-3">
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 h-full">
          {!seleccionada ? (
            <div className="flex items-center justify-center h-48 text-gray-400">
              <div className="text-center">
                <IconLogistica size={32} className="mx-auto mb-2 text-gray-600" aria-hidden />
                <p className="text-sm">Selecciona una orden del andén</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h3 className="text-base font-semibold">Firmar Salida</h3>
                  <p className="text-xs text-teal-400 font-mono mt-0.5">{seleccionada.ov_id}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Cliente</p>
                  <p className="text-sm font-medium">{seleccionada.nombre_cliente || seleccionada.cliente_id}</p>
                </div>
              </div>

              {/* Resumen de items a despachar */}
              <div className="bg-gray-800/50 rounded-lg p-3 mb-5 border border-gray-700/50">
                <p className="text-xs text-gray-500 mb-2">Items a despachar</p>
                <div className="space-y-1 max-h-28 overflow-y-auto">
                  {seleccionada.items?.map(item => (
                    <div key={item.sku_producto} className="flex justify-between text-xs">
                      <span className="font-mono text-blue-400">{item.sku_producto}</span>
                      <span className="text-gray-300">
                        {(item.cantidad - item.cantidad_enviada).toLocaleString()} uds.
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                {/* No. Departure (NPX) */}
                <div>
                  <label className="text-xs text-gray-400 flex items-center gap-1">
                    No. Departure (LG)
                    <span className="text-gray-600">— folio NPX asignado por LG</span>
                  </label>
                  <input
                    value={form.departure}
                    onChange={e => handleDepartureChange(e.target.value)}
                    placeholder="Ej: NPX26060000025"
                    className={`w-full mt-1 p-2 bg-gray-800 border rounded text-white font-mono text-sm focus:outline-none ${
                      npxError ? 'border-red-500 focus:border-red-400' : 'border-gray-700 focus:border-teal-500'
                    }`}
                  />
                  {npxError && <p className="text-xs text-red-400 mt-1">{npxError}</p>}
                  {form.departure && !npxError && <p className="inline-flex items-center gap-1 text-xs text-green-400 mt-1"><IconOk size={12} aria-hidden /> Formato válido</p>}
                </div>

                {/* CW Invoice */}
                <div>
                  <label className="text-xs text-gray-400">CW Invoice</label>
                  <input
                    value={form.invoice}
                    onChange={e => setForm({ ...form, invoice: e.target.value })}
                    placeholder="Ej: CWM3585"
                    className="w-full mt-1 p-2 bg-gray-800 border border-gray-700 rounded text-white font-mono text-sm focus:border-teal-500 focus:outline-none"
                  />
                </div>

                {/* Placas */}
                <div>
                  <label className="text-xs text-gray-400">Placas / No. Camión *</label>
                  <input
                    value={form.camion}
                    onChange={e => setForm({ ...form, camion: e.target.value })}
                    placeholder="Ej: NL-4589"
                    className="w-full mt-1 p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:border-teal-500 focus:outline-none"
                  />
                </div>

                {/* Chofer */}
                <div>
                  <label className="text-xs text-gray-400">Nombre del Chofer *</label>
                  <input
                    value={form.chofer}
                    onChange={e => setForm({ ...form, chofer: e.target.value })}
                    placeholder="Ej: Juan Pérez"
                    className="w-full mt-1 p-2 bg-gray-800 border border-gray-700 rounded text-white text-sm focus:border-teal-500 focus:outline-none"
                  />
                </div>

                {/* Status salida */}
                <div>
                  <label className="text-xs text-gray-400">Status Salida</label>
                  <div className="flex gap-3 mt-2">
                    <label className={`flex-1 flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                      form.status === 'OK'
                        ? 'border-green-500 bg-green-900/20 text-green-400'
                        : 'border-gray-700 text-gray-400 hover:border-gray-500'
                    }`}>
                      <input
                        type="radio" name="status" value="OK"
                        checked={form.status === 'OK'}
                        onChange={() => setForm({ ...form, status: 'OK' })}
                        className="hidden"
                      />
                      <IconOk size={18} aria-hidden />
                      <div>
                        <p className="text-xs font-bold">OK</p>
                        <p className="text-xs opacity-70">Salida exitosa</p>
                      </div>
                    </label>
                    <label className={`flex-1 flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                      form.status === 'NG'
                        ? 'border-red-500 bg-red-900/20 text-red-400'
                        : 'border-gray-700 text-gray-400 hover:border-gray-500'
                    }`}>
                      <input
                        type="radio" name="status" value="NG"
                        checked={form.status === 'NG'}
                        onChange={() => setForm({ ...form, status: 'NG' })}
                        className="hidden"
                      />
                      <IconCerrar size={18} aria-hidden />
                      <div>
                        <p className="text-xs font-bold">NG</p>
                        <p className="text-xs opacity-70">No go — carga detenida</p>
                      </div>
                    </label>
                  </div>
                  {form.status === 'NG' && (
                    <p className="inline-flex items-center gap-1 text-xs text-orange-400 mt-2">
                      <IconAlertas size={13} aria-hidden /> Al guardar como NG, la OV regresará a "Lista para Carga" para reintentar.
                    </p>
                  )}
                </div>

                {/* Alertas */}
                {error && (
                  <div className="bg-red-900/30 border border-red-500/40 rounded-lg px-4 py-2 text-xs text-red-400">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="bg-green-900/30 border border-green-500/40 rounded-lg px-4 py-2 text-xs text-green-400">
                    {success}
                  </div>
                )}

                <Button
                  onClick={handleDespachar}
                  disabled={despachando}
                  variant={form.status === 'NG' ? 'danger' : 'primary'}
                  size="lg"
                  className="w-full"
                  leftIcon={despachando ? undefined : form.status === 'NG' ? IconCerrar : IconOk}
                >
                  {despachando
                    ? 'Registrando...'
                    : form.status === 'NG'
                    ? 'Registrar Salida NG'
                    : 'Dar Salida Física'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
      {/* Historial del día */}
      {historial.length > 0 && (
        <div className="mt-6 border-t border-gray-800 pt-6">
          <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2"><IconDocumento size={14} aria-hidden /> Despachos de esta sesión</p>
          <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-800">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-400">Hora</th>
                  <th className="px-3 py-2 text-left text-gray-400">Envío ID</th>
                  <th className="px-3 py-2 text-left text-gray-400">OV</th>
                  <th className="px-3 py-2 text-left text-gray-400">Chofer</th>
                  <th className="px-3 py-2 text-left text-gray-400">Camión</th>
                  <th className="px-3 py-2 text-left text-gray-400">No. Departure</th>
                  <th className="px-3 py-2 text-left text-gray-400">Estado OV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {historial.map((d, i) => (
                  <tr key={i} className="hover:bg-gray-800/50">
                    <td className="px-3 py-2 text-gray-400">{d.hora}</td>
                    <td className="px-3 py-2 font-mono text-green-400">{d.envio_id}</td>
                    <td className="px-3 py-2 font-mono text-blue-400">{d.ov_id}</td>
                    <td className="px-3 py-2 text-white">{d.chofer}</td>
                    <td className="px-3 py-2 text-gray-300">{d.camion}</td>
                    <td className="px-3 py-2 font-mono text-teal-400">{d.departure || '—'}</td>
                    <td className="px-3 py-2 text-gray-300">{d.estado_ov}</td>
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