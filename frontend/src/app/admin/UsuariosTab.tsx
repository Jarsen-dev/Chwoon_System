'use client'

import { useState, useEffect } from 'react'
import {
  getUsuarios,
  createUsuario,
  updateUsuario,
  deleteUsuario,
  toggleUsuario
} from '@/lib/api'
import { Usuario, UsuarioCreate, RolUsuario, TABS_POR_MODULO, MODULOS_POR_ROL } from '@/types'
import { ROLES, ROL_BADGE, ROL_ICON } from './helpers'

interface Props {
  token: string
}

// ── Genera permisos_tabs con TODOS los tabs del rol marcados ─────────
function getDefaultPermisos(rol: RolUsuario): Record<string, string[]> {
  const modulos = MODULOS_POR_ROL[rol] ?? []
  const permisos: Record<string, string[]> = {}
  modulos.forEach(mod => {
    permisos[mod] = (TABS_POR_MODULO[mod] ?? []).map(t => t.id)
  })
  return permisos
}

export default function UsuariosTab({ token }: Props) {
  const [usuarios,       setUsuarios]       = useState<Usuario[]>([])
  const [loadingUsers,   setLoadingUsers]   = useState(true)
  const [showModal,      setShowModal]      = useState(false)
  const [editUser,       setEditUser]       = useState<Usuario | null>(null)
  const [deleteUserState,setDeleteUserState]= useState<Usuario | null>(null)
  const [error,          setError]          = useState('')

  const [form, setForm] = useState<UsuarioCreate>({
    username: '', nombre: '', email: '', password: '', rol: 'operador', permisos_tabs: null,
  })

  // permisos_tabs en el form: null = sin restricciones, dict = permisos específicos
  // usamos un estado separado para el editor visual de permisos
  const [permisosEditor, setPermisosEditor] = useState<Record<string, string[]>>({})
  const [usarPermisos,   setUsarPermisos]   = useState(false)

  // ── Cargar usuarios ──────────────────────────────────────────────
  const cargarUsuarios = async () => {
    try {
      setLoadingUsers(true)
      const data = await getUsuarios(token)
      setUsuarios(data)
    } catch (err: any) { setError(err.message) }
    finally { setLoadingUsers(false) }
  }

  useEffect(() => { cargarUsuarios() }, [])

  // ── Cuando cambia el rol en el form, resetear permisos al default del rol
  useEffect(() => {
    if (usarPermisos) {
      setPermisosEditor(getDefaultPermisos(form.rol))
    }
  }, [form.rol, usarPermisos])

  // ── Abrir modal nuevo usuario ────────────────────────────────────
  const handleNuevo = () => {
    setEditUser(null)
      setForm({ username: '', nombre: '', email: '', password: '', rol: 'operador', permisos_tabs: null })
    setUsarPermisos(false)
    setPermisosEditor(getDefaultPermisos('operador'))
    setError('')
    setShowModal(true)
  }

  // ── Abrir modal editar usuario ───────────────────────────────────
  const handleEdit = (user: Usuario) => {
    setEditUser(user)
    setForm({ username: user.username, nombre: user.nombre ?? '', email: user.email, password: '', rol: user.rol, permisos_tabs: user.permisos_tabs ?? null })

    const tienePermisos = user.permisos_tabs !== null && user.permisos_tabs !== undefined
    setUsarPermisos(tienePermisos)
    setPermisosEditor(tienePermisos ? (user.permisos_tabs as Record<string, string[]>) : getDefaultPermisos(user.rol))
    setError('')
    setShowModal(true)
  }

  // ── Toggle de un tab individual ──────────────────────────────────
  const toggleTab = (modulo: string, tabId: string) => {
    setPermisosEditor(prev => {
      const current = prev[modulo] ?? []
      const next    = current.includes(tabId)
        ? current.filter(id => id !== tabId)
        : [...current, tabId]
      return { ...prev, [modulo]: next }
    })
  }

  // ── Seleccionar/deseleccionar todos los tabs de un módulo ────────
  const toggleModulo = (modulo: string) => {
    const todosLosTabs = (TABS_POR_MODULO[modulo] ?? []).map(t => t.id)
    setPermisosEditor(prev => {
      const current    = prev[modulo] ?? []
      const todosActivos = todosLosTabs.every(id => current.includes(id))
      return { ...prev, [modulo]: todosActivos ? [] : todosLosTabs }
    })
  }

  // ── Submit ───────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    // Construir permisos_tabs final
    const permisos_tabs_final = usarPermisos ? permisosEditor : null

    try {
      if (editUser) {
        await updateUsuario(token, editUser.id, {
          nombre:        form.nombre,
          email:         form.email,
          rol:           form.rol,
          permisos_tabs: permisos_tabs_final,
          ...(form.password ? { password: form.password } : {}),
        })
      } else {
        await createUsuario(token, {
          ...form,
          permisos_tabs: permisos_tabs_final,
        })
      }
      setShowModal(false)
      setEditUser(null)
    setForm({ username: '', nombre: '', email: '', password: '', rol: 'operador', permisos_tabs: null })
      setUsarPermisos(false)
      await cargarUsuarios()
    } catch (err: any) { setError(err.message) }
  }

  const handleToggle = async (user: Usuario) => {
    try { await toggleUsuario(token, user.id); await cargarUsuarios() }
    catch (err: any) { setError(err.message) }
  }

  const handleDelete = async () => {
    if (!deleteUserState) return
    try {
      await deleteUsuario(token, deleteUserState.id)
      setDeleteUserState(null)
      await cargarUsuarios()
    } catch (err: any) { setError(err.message) }
  }

  // ── Módulos disponibles para el rol seleccionado ─────────────────
  const modulosDelRol = MODULOS_POR_ROL[form.rol] ?? []

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Gestión de Usuarios</h2>
          <p className="text-gray-400 text-sm mt-1">{usuarios.length} usuarios registrados</p>
        </div>
        <button
          onClick={handleNuevo}
          className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
        >
          ➕ Nuevo Usuario
        </button>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-500 text-red-300 rounded-lg px-4 py-3 text-sm">
          ⚠️ {error}
        </div>
      )}

      {/* ── Tabla ── */}
      {loadingUsers ? (
        <div className="text-center py-20 text-gray-400 animate-pulse">⏳ Cargando usuarios...</div>
      ) : (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-700/50 text-gray-300 text-sm">
                <th className="px-6 py-4 text-left">Usuario</th>
                <th className="px-6 py-4 text-left">Email</th>
                <th className="px-6 py-4 text-left">Rol</th>
                <th className="px-6 py-4 text-left">Permisos</th>
                <th className="px-6 py-4 text-left">Estado</th>
                <th className="px-6 py-4 text-left">Creado</th>
                <th className="px-6 py-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {usuarios.map(user => {
                const tienePermisos = user.permisos_tabs !== null && user.permisos_tabs !== undefined
                const totalTabs = tienePermisos
                  ? Object.values(user.permisos_tabs as Record<string, string[]>).flat().length
                  : null

                return (
                  <tr key={user.id} className="hover:bg-gray-700/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span>{ROL_ICON[user.rol]}</span>
                        <span className="font-medium">{user.username}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-300 text-sm">{user.email}</td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${ROL_BADGE[user.rol]}`}>
                        {user.rol}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {tienePermisos ? (
                        <span className="text-xs px-2 py-1 rounded-full font-medium bg-purple-900/50 text-purple-300 border border-purple-700">
                          🔒 {totalTabs} tabs
                        </span>
                      ) : (
                        <span className="text-xs px-2 py-1 rounded-full font-medium bg-gray-700 text-gray-400 border border-gray-600">
                          🔓 Acceso total
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        user.activo
                          ? 'bg-green-900/50 text-green-300 border border-green-700'
                          : 'bg-gray-700 text-gray-400 border border-gray-600'
                      }`}>
                        {user.activo ? '✅ Activo' : '⛔ Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-400 text-sm">
                      {user.created_at ? new Date(user.created_at).toLocaleDateString('es-MX') : '—'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEdit(user)}
                          className="text-xs bg-blue-900/50 hover:bg-blue-800 text-blue-300 px-2 py-1 rounded-lg transition-colors"
                        >
                          ✏️ Editar
                        </button>
                        <button
                          onClick={() => handleToggle(user)}
                          className="text-xs bg-yellow-900/50 hover:bg-yellow-800 text-yellow-300 px-2 py-1 rounded-lg transition-colors"
                        >
                          {user.activo ? '⛔ Desactivar' : '✅ Activar'}
                        </button>
                        <button
                          onClick={() => setDeleteUserState(user)}
                          className="text-xs bg-red-900/50 hover:bg-red-800 text-red-300 px-2 py-1 rounded-lg transition-colors"
                        >
                          🗑️ Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══ MODAL: CREAR/EDITAR USUARIO ═══ */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-xl border border-gray-700 my-8">
            <h3 className="text-lg font-bold mb-5">
              {editUser ? '✏️ Editar Usuario' : '➕ Nuevo Usuario'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">

              {/* Nombre */}
              <div>
                <label className="block text-sm text-gray-300 mb-1">Nombre</label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={e => setForm({ ...form, nombre: e.target.value })}
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                />
              </div>

              {/* Username (solo crear) */}
              {!editUser && (
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Username</label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={e => setForm({ ...form, username: e.target.value })}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
              )}

              {/* Email */}
              <div>
                <label className="block text-sm text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>

              {/* Contraseña */}
              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  {editUser ? 'Nueva Contraseña (opcional)' : 'Contraseña'}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                  required={!editUser}
                />
              </div>

              {/* Rol */}
              <div>
                <label className="block text-sm text-gray-300 mb-1">Rol</label>
                <select
                  value={form.rol}
                  onChange={e => setForm({ ...form, rol: e.target.value as RolUsuario })}
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 border border-gray-600 focus:border-blue-500 focus:outline-none"
                >
                  {ROLES.map(r => (
                    <option key={r} value={r}>{ROL_ICON[r]} {r}</option>
                  ))}
                </select>
              </div>

              {/* ── Sección de Permisos ── */}
              <div className="border border-gray-600 rounded-xl overflow-hidden">

                {/* Toggle header */}
                <button
                  type="button"
                  onClick={() => {
                    const next = !usarPermisos
                    setUsarPermisos(next)
                    if (next) setPermisosEditor(getDefaultPermisos(form.rol))
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-700/50 hover:bg-gray-700 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-200">
                      🔒 Permisos por sub-tab
                    </span>
                    {usarPermisos ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-900/50 text-purple-300 border border-purple-700">
                        Personalizado
                      </span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-gray-600 text-gray-400">
                        Acceso total al rol
                      </span>
                    )}
                  </div>
                  <span className="text-gray-400 text-lg">{usarPermisos ? '▲' : '▼'}</span>
                </button>

                {/* Checkboxes por módulo */}
                {usarPermisos && (
                  <div className="p-4 space-y-4 bg-gray-750">
                    <p className="text-xs text-gray-400">
                      Selecciona qué tabs puede ver este usuario. Solo se muestran los módulos de su rol.
                    </p>

                    {modulosDelRol.length === 0 ? (
                      <p className="text-xs text-gray-500 italic">
                        Este rol no tiene módulos configurados.
                      </p>
                    ) : (
                      modulosDelRol.map(modulo => {
                        const tabs        = TABS_POR_MODULO[modulo] ?? []
                        const seleccionados = permisosEditor[modulo] ?? []
                        const todosActivos  = tabs.every(t => seleccionados.includes(t.id))
                        const algunoActivo  = tabs.some(t => seleccionados.includes(t.id))

                        return (
                          <div key={modulo} className="bg-gray-800 rounded-lg p-3 border border-gray-700">

                            {/* Header del módulo con toggle-all */}
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-semibold text-gray-200 capitalize">
                                📂 {modulo}
                              </span>
                              <button
                                type="button"
                                onClick={() => toggleModulo(modulo)}
                                className={`text-xs px-2 py-1 rounded-lg transition-colors ${
                                  todosActivos
                                    ? 'bg-blue-900/50 text-blue-300 hover:bg-blue-800'
                                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                                }`}
                              >
                                {todosActivos ? '✓ Todos' : algunoActivo ? '~ Algunos' : '○ Ninguno'}
                              </button>
                            </div>

                            {/* Grid de checkboxes */}
                            <div className="grid grid-cols-2 gap-1.5">
                              {tabs.map(tab => {
                                const activo = seleccionados.includes(tab.id)
                                return (
                                  <label
                                    key={tab.id}
                                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
                                      activo
                                        ? 'bg-blue-900/30 border border-blue-700/50'
                                        : 'bg-gray-700/30 border border-gray-700 hover:bg-gray-700/60'
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={activo}
                                      onChange={() => toggleTab(modulo, tab.id)}
                                      className="w-3.5 h-3.5 rounded accent-blue-500"
                                    />
                                    <span className={`text-xs truncate ${activo ? 'text-blue-200' : 'text-gray-400'}`}>
                                      {tab.label}
                                    </span>
                                  </label>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                )}
              </div>

              {error && (
                <div className="bg-red-900/50 border border-red-500 text-red-300 rounded-lg px-3 py-2 text-sm">
                  ⚠️ {error}
                </div>
              )}

              {/* Botones */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowModal(false); setEditUser(null); setError('') }}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg py-2 transition-colors"
                >
                  {editUser ? '💾 Guardar' : '➕ Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══ MODAL: CONFIRMAR ELIMINACIÓN ═══ */}
      {deleteUserState && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-gray-700">
            <div className="flex justify-center mb-4">
              <div className="bg-red-900/50 rounded-full p-4"><span className="text-4xl">🗑️</span></div>
            </div>
            <h3 className="text-lg font-bold text-center text-white mb-2">Eliminar Usuario</h3>
            <p className="text-gray-400 text-center text-sm mb-1">
              ¿Estás seguro que deseas eliminar al usuario:
            </p>
            <p className="text-white font-semibold text-center mb-6">
              {ROL_ICON[deleteUserState.rol]} {deleteUserState.username}
            </p>
            {error && (
              <div className="bg-red-900/50 border border-red-500 text-red-300 rounded-lg px-3 py-2 text-sm mb-4">
                ⚠️ {error}
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteUserState(null); setError('') }}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white rounded-lg py-2.5 transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg py-2.5 transition-colors"
              >
                🗑️ Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}