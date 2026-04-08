'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useRouter } from 'next/navigation'
import {
  getUsuarios,
  createUsuario,
  updateUsuario,
  deleteUsuario,
  toggleUsuario
} from '@/lib/api'
import { Usuario, UsuarioCreate, RolUsuario } from '@/types'

const ROLES: RolUsuario[] = ['admin', 'supervisor', 'operador']

const ROL_BADGE: Record<RolUsuario, string> = {
  admin:      'bg-red-900/50   text-red-300   border border-red-700',
  supervisor: 'bg-blue-900/50  text-blue-300  border border-blue-700',
  operador:   'bg-green-900/50 text-green-300 border border-green-700',
}

const ROL_ICON: Record<RolUsuario, string> = {
  admin:      '👑',
  supervisor: '🔵',
  operador:   '🟢',
}

export default function AdminPage() {
  const { token, rol, username, logout, loading } = useAuth()
  const router = useRouter()

  const [usuarios,  setUsuarios]  = useState<Usuario[]>([])
  const [loading2,   setLoading2]   = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editUser,  setEditUser]  = useState<Usuario | null>(null)
  const [error,     setError]     = useState('')
  const [deleteUser, setDeleteUser] = useState<Usuario | null>(null)

  const [form, setForm] = useState<UsuarioCreate>({
    username: '',
    email:    '',
    password: '',
    rol:      'operador',
  })

  useEffect(() => {
    if (loading) return

    if (!token || rol !== 'admin') {
      router.push('/login')
      return
    }
    cargarUsuarios()
  }, [token, rol, loading])

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center">
        <div className="text-white text-xl">⏳ Cargando...</div>
      </div>
    )
  }

  const cargarUsuarios = async () => {
    try {
      setLoading2(true)
      const data = await getUsuarios(token!)
      setUsuarios(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading2(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      if (editUser) {
        await updateUsuario(token!, editUser.id, {
          email: form.email,
          rol:   form.rol,
          ...(form.password ? { password: form.password } : {})
        })
      } else {
        await createUsuario(token!, form)
      }
      setShowModal(false)
      setEditUser(null)
      setForm({ username: '', email: '', password: '', rol: 'operador' })
      await cargarUsuarios()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleEdit = (user: Usuario) => {
    setEditUser(user)
    setForm({
      username: user.username,
      email:    user.email,
      password: '',
      rol:      user.rol,
    })
    setShowModal(true)
  }

  const handleToggle = async (user: Usuario) => {
    try {
      await toggleUsuario(token!, user.id)
      await cargarUsuarios()
    } catch (err: any) {
      setError(err.message)
    }
  }

  const handleDelete = async () => {
    if (!deleteUser) return
    try {
      await deleteUsuario(token!, deleteUser.id)
      setDeleteUser(null)
      await cargarUsuarios()
    } catch (err: any) {
      setError(err.message)
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-900 text-white flex flex-col overflow-hidden">

      {/* Navbar admin */}
      <nav className="bg-gray-800 border-b border-gray-700 px-6 py-3
                      flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <img src="/Logo.png" alt="Logo" className="h-10 w-auto" />
          <h1 className="text-lg font-bold">Panel de Administración</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/')}
            className="text-sm bg-gray-700 hover:bg-gray-600 px-3 py-1.5
                       rounded-lg transition-colors"
          >
            🏠 Inicio
          </button>
          <span className="text-gray-400 text-sm">
            {ROL_ICON[rol as RolUsuario]} {username}
          </span>
          <button
            onClick={logout}
            className="text-sm bg-red-900/50 hover:bg-red-800 text-red-300
                       px-3 py-1.5 rounded-lg transition-colors"
          >
            🚪 Salir
          </button>
        </div>
      </nav>

      {/* Contenido scrollable */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">

          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold">Gestión de Usuarios</h2>
              <p className="text-gray-400 text-sm mt-1">
                {usuarios.length} usuarios registrados
              </p>
            </div>
            <button
              onClick={() => {
                setEditUser(null)
                setForm({ username: '', email: '', password: '', rol: 'operador' })
                setError('')
                setShowModal(true)
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold
                         px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
            >
              ➕ Nuevo Usuario
            </button>
          </div>

          {error && (
            <div className="bg-red-900/50 border border-red-500 text-red-300
                            rounded-lg px-4 py-3 text-sm mb-4">
              ⚠️ {error}
            </div>
          )}

          {/* Tabla */}
          {loading2 ? (
            <div className="text-center py-20 text-gray-400">
              ⏳ Cargando usuarios...
            </div>
          ) : (
            <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-700/50 text-gray-300 text-sm">
                    <th className="px-6 py-4 text-left">Usuario</th>
                    <th className="px-6 py-4 text-left">Email</th>
                    <th className="px-6 py-4 text-left">Rol</th>
                    <th className="px-6 py-4 text-left">Estado</th>
                    <th className="px-6 py-4 text-left">Creado</th>
                    <th className="px-6 py-4 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {usuarios.map(user => (
                    <tr key={user.id}
                        className="hover:bg-gray-700/30 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span>{ROL_ICON[user.rol]}</span>
                          <span className="font-medium">{user.username}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-300 text-sm">
                        {user.email}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs px-2 py-1 rounded-full
                                         font-medium ${ROL_BADGE[user.rol]}`}>
                          {user.rol}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium
                          ${user.activo
                            ? 'bg-green-900/50 text-green-300 border border-green-700'
                            : 'bg-gray-700    text-gray-400  border border-gray-600'
                          }`}>
                          {user.activo ? '✅ Activo' : '⛔ Inactivo'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-400 text-sm">
                        {user.created_at
                          ? new Date(user.created_at).toLocaleDateString('es-MX')
                          : '—'}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleEdit(user)}
                            className="text-xs bg-blue-900/50 hover:bg-blue-800
                                       text-blue-300 px-2 py-1 rounded-lg transition-colors"
                          >
                            ✏️ Editar
                          </button>
                          <button
                            onClick={() => handleToggle(user)}
                            className="text-xs bg-yellow-900/50 hover:bg-yellow-800
                                       text-yellow-300 px-2 py-1 rounded-lg transition-colors"
                          >
                            {user.activo ? '⛔ Desactivar' : '✅ Activar'}
                          </button>
                          <button
                            onClick={() => setDeleteUser(user)}
                            className="text-xs bg-red-900/50 hover:bg-red-800
                                      text-red-300 px-2 py-1 rounded-lg transition-colors"
                          >
                            🗑️ Eliminar
                        </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center
                        justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-md
                          border border-gray-700">
            <h3 className="text-lg font-bold mb-5">
              {editUser ? '✏️ Editar Usuario' : '➕ Nuevo Usuario'}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              {!editUser && (
                <div>
                  <label className="block text-sm text-gray-300 mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={e => setForm({ ...form, username: e.target.value })}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2
                               border border-gray-600 focus:border-blue-500
                               focus:outline-none"
                    required
                  />
                </div>
              )}

              <div>
                <label className="block text-sm text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2
                             border border-gray-600 focus:border-blue-500
                             focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">
                  {editUser ? 'Nueva Contraseña (opcional)' : 'Contraseña'}
                </label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2
                             border border-gray-600 focus:border-blue-500
                             focus:outline-none"
                  required={!editUser}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-300 mb-1">Rol</label>
                <select
                  value={form.rol}
                  onChange={e =>
                    setForm({ ...form, rol: e.target.value as RolUsuario })
                  }
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2
                             border border-gray-600 focus:border-blue-500
                             focus:outline-none"
                >
                  {ROLES.map(r => (
                    <option key={r} value={r}>
                      {ROL_ICON[r]} {r}
                    </option>
                  ))}
                </select>
              </div>

              {error && (
                <div className="bg-red-900/50 border border-red-500
                                text-red-300 rounded-lg px-3 py-2 text-sm">
                  ⚠️ {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false)
                    setEditUser(null)
                    setError('')
                  }}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white
                             rounded-lg py-2 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white
                             font-semibold rounded-lg py-2 transition-colors"
                >
                  {editUser ? '💾 Guardar' : '➕ Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal Eliminar */}
      {deleteUser && (
        <div className="fixed inset-0 bg-black/70 flex items-center
                        justify-center z-50 p-4">
          <div className="bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-sm
                          border border-gray-700">

            {/* Icono */}
            <div className="flex justify-center mb-4">
              <div className="bg-red-900/50 rounded-full p-4">
                <span className="text-4xl">🗑️</span>
              </div>
            </div>

            {/* Texto */}
            <h3 className="text-lg font-bold text-center text-white mb-2">
              Eliminar Usuario
            </h3>
            <p className="text-gray-400 text-center text-sm mb-1">
              ¿Estás seguro que deseas eliminar al usuario:
            </p>
            <p className="text-white font-semibold text-center mb-6">
              {ROL_ICON[deleteUser.rol]} {deleteUser.username}
            </p>

            {error && (
              <div className="bg-red-900/50 border border-red-500
                              text-red-300 rounded-lg px-3 py-2 text-sm mb-4">
                ⚠️ {error}
              </div>
            )}

            {/* Botones */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setDeleteUser(null)
                  setError('')
                }}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white
                          rounded-lg py-2.5 transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white
                          font-semibold rounded-lg py-2.5 transition-colors"
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