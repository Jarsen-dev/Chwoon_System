'use client'

import { useEffect, useState, useCallback } from 'react'
import { ConfiguracionEmpresa, ContactoEmpresa } from './helpers'
import { Button, Modal } from '@/components/ui'
import {
  IconOk, IconAlertas, IconEmpresa, IconGuardar, IconTag, IconUbicaciones,
  IconContacto, IconNuevo, IconEditar, IconEliminar, IconBanco, IconEstrella, type LucideIcon,
} from '@/lib/icons'

// ── helpers internos ──────────────────────────────────────────────────────────

const BASE = '/api/admin/empresa'

async function apiFetch(
  token: string,
  path: string,
  opts: RequestInit = {},
) {
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers as Record<string, string> | undefined),
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `Error ${res.status}`)
  }
  if (res.status === 204) return null
  return res.json()
}

const CFG_EMPTY: ConfiguracionEmpresa = {
  nombre: '', rfc: '', direccion: '', telefono: '', email: '',
  logo_url: '', representante_legal: '', regimen_fiscal: '',
  cp: '', ciudad: '', estado: '', pais: 'México',
  banco: '', cuenta: '', clabe: '',
}

const CONTACTO_EMPTY: ContactoEmpresa = {
  area: '', nombre: '', puesto: '', telefono: '', ext: '',
  celular: '', email: '', es_principal: false,
  horario: '', notas: '', activo: true,
}

const AREAS = [
  'Dirección General', 'Administración', 'Finanzas', 'Compras',
  'Ventas', 'Producción', 'Calidad', 'Almacén', 'Logística',
  'Recursos Humanos', 'Mantenimiento', 'TI', 'Otro',
]

// ── sub-componentes ───────────────────────────────────────────────────────────

function Field({
  label, value, onChange, type = 'text', placeholder = '', span2 = false, textarea = false,
}: {
  label: string; value: string; onChange: (v: string) => void
  type?: string; placeholder?: string; span2?: boolean; textarea?: boolean
}) {
  const cls =
    'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white ' +
    'placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors'

  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <label className="block text-xs text-gray-400 mb-1 font-medium">{label}</label>
      {textarea ? (
        <textarea
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={3}
          className={cls + ' resize-none'}
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={cls}
        />
      )}
    </div>
  )
}

function SectionHeader({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Icon size={18} className="text-[var(--accent)]" aria-hidden />
      <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider">{title}</h3>
      <div className="flex-1 border-t border-gray-700 ml-2" />
    </div>
  )
}

function Toast({ msg, type }: { msg: string; type: 'ok' | 'err' }) {
  return (
    <div
      className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-lg transition-all
        ${type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}
    >
      <span className="inline-flex items-center gap-2">{type === 'ok' ? <IconOk size={15} aria-hidden /> : <IconAlertas size={15} aria-hidden />}{msg}</span>
    </div>
  )
}

// ── EmpresaTab ────────────────────────────────────────────────────────────────

export default function EmpresaTab({ token }: { token: string }) {
  // ── info general ──
  const [cfg, setCfg]         = useState<ConfiguracionEmpresa>(CFG_EMPTY)
  const [cfgExists, setCfgExists] = useState(false)
  const [cfgLoading, setCfgLoading] = useState(true)
  const [cfgSaving, setCfgSaving]   = useState(false)

  // ── contactos ──
  const [contactos, setContactos]       = useState<ContactoEmpresa[]>([])
  const [ctLoading, setCtLoading]       = useState(true)
  const [filterArea, setFilterArea]     = useState('')
  const [filterActivo, setFilterActivo] = useState<'todos' | 'activos' | 'inactivos'>('activos')

  // ── modal contacto ──
  const [modal, setModal]           = useState<'closed' | 'new' | 'edit'>('closed')
  const [modalData, setModalData]   = useState<ContactoEmpresa>(CONTACTO_EMPTY)
  const [modalSaving, setModalSaving] = useState(false)

  // ── feedback ──
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)

  const showToast = (msg: string, type: 'ok' | 'err') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ── carga inicial ─────────────────────────────────────────────────
  const loadCfg = useCallback(async () => {
    setCfgLoading(true)
    try {
      const data = await apiFetch(token, '/actual')
      if (data) {
        setCfg(data)
        setCfgExists(true)
      } else {
        setCfg(CFG_EMPTY)
        setCfgExists(false)
      }
    } catch {
      setCfg(CFG_EMPTY)
    } finally {
      setCfgLoading(false)
    }
  }, [token])

  const loadContactos = useCallback(async () => {
    setCtLoading(true)
    try {
      const data = await apiFetch(token, '/contactos')
      setContactos(data ?? [])
    } catch {
      setContactos([])
    } finally {
      setCtLoading(false)
    }
  }, [token])

  useEffect(() => {
    loadCfg()
    loadContactos()
  }, [loadCfg, loadContactos])

  // ── guardar info general ──────────────────────────────────────────
  const saveCfg = async () => {
    if (!cfg.nombre.trim()) {
      showToast('El nombre de empresa es obligatorio.', 'err')
      return
    }
    setCfgSaving(true)
    try {
      const method = cfgExists ? 'PUT' : 'POST'
      const saved = await apiFetch(token, '/actual', {
        method,
        body: JSON.stringify(cfg),
      })
      setCfg(saved)
      setCfgExists(true)
      showToast('Información guardada correctamente.', 'ok')
    } catch (e: any) {
      showToast(e.message, 'err')
    } finally {
      setCfgSaving(false)
    }
  }

  // ── contactos filtrados ───────────────────────────────────────────
  const contactosFiltrados = contactos.filter(c => {
    if (filterArea && c.area !== filterArea) return false
    if (filterActivo === 'activos'   && !c.activo) return false
    if (filterActivo === 'inactivos' && c.activo)  return false
    return true
  })

  // ── abrir modal ───────────────────────────────────────────────────
  const openNew = () => {
    setModalData(CONTACTO_EMPTY)
    setModal('new')
  }
  const openEdit = (c: ContactoEmpresa) => {
    setModalData({ ...c })
    setModal('edit')
  }
  const closeModal = () => setModal('closed')

  // ── guardar contacto ──────────────────────────────────────────────
  const saveContacto = async () => {
    if (!modalData.nombre.trim() || !modalData.area.trim()) {
      showToast('Nombre y área son obligatorios.', 'err')
      return
    }
    setModalSaving(true)
    try {
      if (modal === 'new') {
        const created = await apiFetch(token, '/contactos', {
          method: 'POST',
          body: JSON.stringify(modalData),
        })
        setContactos(prev => [...prev, created])
        // Si era principal, actualizar los demás del área
        if (created.es_principal) {
          await loadContactos()
        }
        showToast('Contacto creado.', 'ok')
      } else {
        const updated = await apiFetch(token, `/contactos/${modalData.id}`, {
          method: 'PUT',
          body: JSON.stringify(modalData),
        })
        if (updated.es_principal) {
          await loadContactos()
        } else {
          setContactos(prev => prev.map(c => c.id === updated.id ? updated : c))
        }
        showToast('Contacto actualizado.', 'ok')
      }
      closeModal()
    } catch (e: any) {
      showToast(e.message, 'err')
    } finally {
      setModalSaving(false)
    }
  }

  // ── eliminar contacto ─────────────────────────────────────────────
  const deleteContacto = async (id: number) => {
    if (!confirm('¿Eliminar este contacto?')) return
    try {
      await apiFetch(token, `/contactos/${id}`, { method: 'DELETE' })
      setContactos(prev => prev.filter(c => c.id !== id))
      showToast('Contacto eliminado.', 'ok')
    } catch (e: any) {
      showToast(e.message, 'err')
    }
  }

  // ── toggle activo ─────────────────────────────────────────────────
  const toggleActivo = async (c: ContactoEmpresa) => {
    try {
      const updated = await apiFetch(token, `/contactos/${c.id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...c, activo: !c.activo }),
      })
      setContactos(prev => prev.map(x => x.id === updated.id ? updated : x))
    } catch (e: any) {
      showToast(e.message, 'err')
    }
  }

  // ── field helpers ─────────────────────────────────────────────────
  const setCfgField = (key: keyof ConfiguracionEmpresa) => (val: string) =>
    setCfg(prev => ({ ...prev, [key]: val }))

  const setMdField = (key: keyof ContactoEmpresa) => (val: string | boolean) =>
    setModalData(prev => ({ ...prev, [key]: val }))

  // ── áreas únicas de contactos existentes + predefinidas ──────────
  const areasExistentes = Array.from(new Set([
    ...AREAS,
    ...contactos.map(c => c.area),
  ])).sort()

  // ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8">
      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* ═══ SECCIÓN 1: INFO GENERAL ═══════════════════════════════ */}
      <section className="bg-gray-900 border border-gray-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <IconEmpresa size={24} className="text-[var(--accent)]" aria-hidden />
            <div>
              <h2 className="text-lg font-bold text-white">Información General</h2>
              <p className="text-xs text-gray-300">Datos fiscales y de contacto de la empresa</p>
            </div>
          </div>
          <Button onClick={saveCfg} disabled={cfgSaving || cfgLoading} leftIcon={IconGuardar}>
            {cfgSaving ? 'Guardando…' : 'Guardar'}
          </Button>
        </div>

        {cfgLoading ? (
          <div className="flex justify-center py-12">
            <span className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* — Datos principales — */}
            <div>
              <SectionHeader icon={IconTag} title="Datos principales" />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Nombre de la empresa *" value={cfg.nombre ?? ''} onChange={setCfgField('nombre')} placeholder="Mi Empresa S.A. de C.V." span2 />
                <Field label="RFC"                    value={cfg.rfc ?? ''}    onChange={setCfgField('rfc')}    placeholder="XAXX010101000" />
                <Field label="Régimen Fiscal"          value={cfg.regimen_fiscal ?? ''} onChange={setCfgField('regimen_fiscal')} placeholder="601 - General de Ley" />
                <Field label="Representante Legal"     value={cfg.representante_legal ?? ''} onChange={setCfgField('representante_legal')} placeholder="Nombre Completo" span2 />
              </div>
            </div>

            {/* — Dirección — */}
            <div>
              <SectionHeader icon={IconUbicaciones} title="Dirección" />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Dirección"  value={cfg.direccion ?? ''} onChange={setCfgField('direccion')} placeholder="Calle, número, colonia" span2 textarea />
                <Field label="CP"         value={cfg.cp ?? ''}        onChange={setCfgField('cp')}        placeholder="64000" />
                <Field label="Ciudad"     value={cfg.ciudad ?? ''}    onChange={setCfgField('ciudad')}    placeholder="Monterrey" />
                <Field label="Estado"     value={cfg.estado ?? ''}    onChange={setCfgField('estado')}    placeholder="Nuevo León" />
                <Field label="País"       value={cfg.pais ?? ''}      onChange={setCfgField('pais')}      placeholder="México" />
              </div>
            </div>

            {/* — Contacto — */}
            <div>
              <SectionHeader icon={IconContacto} title="Contacto" />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Teléfono" value={cfg.telefono ?? ''} onChange={setCfgField('telefono')} placeholder="+52 81 1234 5678" />
                <Field label="Correo electrónico" value={cfg.email ?? ''} onChange={setCfgField('email')} type="email" placeholder="contacto@empresa.com" />
                <Field label="URL del Logo" value={cfg.logo_url ?? ''} onChange={setCfgField('logo_url')} placeholder="https://..." span2 />
              </div>
            </div>

            {/* — Datos bancarios — */}
            <div>
              <SectionHeader icon={IconBanco} title="Datos Bancarios" />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Banco"   value={cfg.banco ?? ''}  onChange={setCfgField('banco')}  placeholder="BBVA / Banamex / HSBC…" />
                <Field label="Cuenta"  value={cfg.cuenta ?? ''} onChange={setCfgField('cuenta')} placeholder="0123456789" />
                <Field label="CLABE"   value={cfg.clabe ?? ''}  onChange={setCfgField('clabe')}  placeholder="012345678901234567" span2 />
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ═══ SECCIÓN 2: DIRECTORIO DE CONTACTOS ════════════════════ */}
      <section className="bg-gray-900 border border-gray-700 rounded-xl p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <IconContacto size={24} className="text-[var(--accent)]" aria-hidden />
            <div>
              <h2 className="text-lg font-bold text-white">Directorio de Contactos</h2>
              <p className="text-xs text-gray-300">Contactos por área con datos de localización</p>
            </div>
          </div>
          <Button onClick={openNew} leftIcon={IconNuevo}>Nuevo Contacto</Button>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap gap-3 mb-5">
          <select
            value={filterArea}
            onChange={e => setFilterArea(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white
              focus:outline-none focus:border-blue-500"
          >
            <option value="">Todas las áreas</option>
            {areasExistentes.map(a => <option key={a} value={a}>{a}</option>)}
          </select>

          <div className="flex rounded-lg overflow-hidden border border-gray-700">
            {(['todos', 'activos', 'inactivos'] as const).map(opt => (
              <button
                key={opt}
                onClick={() => setFilterActivo(opt)}
                className={`px-4 py-2 text-xs font-medium capitalize transition-colors
                  ${filterActivo === opt
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white'}`}
              >
                {opt}
              </button>
            ))}
          </div>

          <span className="ml-auto text-xs text-gray-500 self-center">
            {contactosFiltrados.length} contacto{contactosFiltrados.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Tabla */}
        {ctLoading ? (
          <div className="flex justify-center py-12">
            <span className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : contactosFiltrados.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <IconContacto size={36} className="mx-auto mb-2 text-gray-600" aria-hidden />
            <p className="text-sm">No hay contactos registrados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-700">
                  {['Área', 'Nombre / Puesto', 'Teléfono / Ext', 'Celular', 'Email', 'Horario', 'Estado', ''].map(h => (
                    <th key={h} className="text-left text-xs text-gray-400 font-medium py-3 px-3 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {contactosFiltrados.map(c => (
                  <tr key={c.id} className="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                    {/* Área */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        {c.es_principal && (
                          <IconEstrella size={12} className="text-yellow-400 fill-yellow-400" aria-label="Principal" />
                        )}
                        <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full whitespace-nowrap">
                          {c.area}
                        </span>
                      </div>
                    </td>
                    {/* Nombre/Puesto */}
                    <td className="py-3 px-3">
                      <p className="font-medium text-white">{c.nombre}</p>
                      {c.puesto && <p className="text-xs text-gray-400">{c.puesto}</p>}
                    </td>
                    {/* Teléfono */}
                    <td className="py-3 px-3 text-gray-300">
                      <p>{c.telefono || '—'}</p>
                      {c.ext && <p className="text-xs text-gray-500">Ext. {c.ext}</p>}
                    </td>
                    {/* Celular */}
                    <td className="py-3 px-3 text-gray-300">{c.celular || '—'}</td>
                    {/* Email */}
                    <td className="py-3 px-3">
                      {c.email
                        ? <a href={`mailto:${c.email}`} className="text-blue-400 hover:underline text-xs">{c.email}</a>
                        : <span className="text-gray-600">—</span>}
                    </td>
                    {/* Horario */}
                    <td className="py-3 px-3 text-xs text-gray-400">{c.horario || '—'}</td>
                    {/* Estado */}
                    <td className="py-3 px-3">
                      <button
                        onClick={() => toggleActivo(c)}
                        className={`text-xs px-2 py-1 rounded-full font-medium transition-colors
                          ${c.activo
                            ? 'bg-emerald-900/40 text-emerald-300 hover:bg-emerald-900/70'
                            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'}`}
                      >
                        {c.activo ? 'Activo' : 'Inactivo'}
                      </button>
                    </td>
                    {/* Acciones */}
                    <td className="py-3 px-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEdit(c)}
                          className="text-blue-400 hover:text-blue-300 transition-colors"
                          aria-label="Editar contacto"
                        >
                          <IconEditar size={15} aria-hidden />
                        </button>
                        <button
                          onClick={() => deleteContacto(c.id!)}
                          className="text-red-400 hover:text-red-300 transition-colors"
                          aria-label="Eliminar contacto"
                        >
                          <IconEliminar size={15} aria-hidden />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ═══ MODAL CONTACTO ═════════════════════════════════════════ */}
      <Modal
        open={modal !== 'closed'}
        onClose={closeModal}
        size="2xl"
        title={
          modal === 'new'
            ? <span className="flex items-center gap-2"><IconNuevo size={18} aria-hidden /> Nuevo Contacto</span>
            : <span className="flex items-center gap-2"><IconEditar size={18} aria-hidden /> Editar Contacto</span>
        }
        footer={
          <>
            <Button variant="secondary" onClick={closeModal}>Cancelar</Button>
            <Button onClick={saveContacto} disabled={modalSaving} leftIcon={IconGuardar}>
              {modalSaving ? 'Guardando…' : 'Guardar'}
            </Button>
          </>
        }
      >
            {/* Body */}
            <div className="space-y-5">
              {/* Área + Nombre */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-gray-400 mb-1 font-medium">Área *</label>
                  <select
                    value={modalData.area}
                    onChange={e => setMdField('area')(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm
                      text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="">Seleccionar…</option>
                    {areasExistentes.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </div>
                <Field
                  label="Nombre completo *"
                  value={modalData.nombre}
                  onChange={setMdField('nombre')}
                  placeholder="Juan García"
                />
              </div>

              <Field
                label="Puesto"
                value={modalData.puesto ?? ''}
                onChange={setMdField('puesto')}
                placeholder="Gerente de Área"
              />

              {/* Teléfonos */}
              <div className="grid grid-cols-2 gap-4">
                <Field label="Teléfono"       value={modalData.telefono ?? ''} onChange={setMdField('telefono')} placeholder="+52 81 1234 5678" />
                <Field label="Extensión"      value={modalData.ext ?? ''}      onChange={setMdField('ext')}      placeholder="101" />
                <Field label="Celular"        value={modalData.celular ?? ''}  onChange={setMdField('celular')}  placeholder="+52 81 9876 5432" />
                <Field label="Correo"         value={modalData.email ?? ''}    onChange={setMdField('email')}    type="email" placeholder="usuario@empresa.com" />
                <Field label="Horario"        value={modalData.horario ?? ''} onChange={setMdField('horario')}  placeholder="L-V 8:00–17:00" />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1 font-medium">Notas</label>
                <textarea
                  value={modalData.notas ?? ''}
                  onChange={e => setMdField('notas')(e.target.value)}
                  rows={3}
                  placeholder="Información adicional…"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm
                    text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              {/* Flags */}
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={modalData.es_principal}
                    onChange={e => setMdField('es_principal')(e.target.checked)}
                    className="w-4 h-4 rounded accent-yellow-400"
                  />
                  <span className="text-sm text-gray-300 inline-flex items-center gap-1"><IconEstrella size={14} aria-hidden /> Contacto principal del área</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={modalData.activo}
                    onChange={e => setMdField('activo')(e.target.checked)}
                    className="w-4 h-4 rounded accent-emerald-400"
                  />
                  <span className="text-sm text-gray-300 inline-flex items-center gap-1"><IconOk size={14} aria-hidden /> Activo</span>
                </label>
              </div>
            </div>
      </Modal>
    </div>
  )
}