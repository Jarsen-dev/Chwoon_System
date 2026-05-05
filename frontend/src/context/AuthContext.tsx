'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { Token, RolUsuario } from '@/types'
import { login as apiLogin, getMeUsuario } from '@/lib/api'

interface AuthContextType {
  token:         string | null | undefined
  username:      string | null
  rol:           RolUsuario | null
  permisosTabs:  Record<string, string[]> | null  // ← NUEVO
  loading:       boolean
  login:         (username: string, password: string) => Promise<void>
  logout:        () => void
  tieneAccesoTab: (modulo: string, tabId: string) => boolean  // ← NUEVO
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token,        setToken]        = useState<string | null | undefined>(undefined)
  const [username,     setUsername]     = useState<string | null>(null)
  const [rol,          setRol]          = useState<RolUsuario | null>(null)
  const [permisosTabs, setPermisosTabs] = useState<Record<string, string[]> | null>(null)  // ← NUEVO
  const [loading,      setLoading]      = useState(true)

  const router = useRouter()

  // ── Hidratar desde localStorage ──────────────────────────────────
  useEffect(() => {
    try {
      const savedToken    = localStorage.getItem('token')
      const savedUsername = localStorage.getItem('username')
      const savedRol      = localStorage.getItem('rol') as RolUsuario | null
      const savedPermisos = localStorage.getItem('permisos_tabs')  // ← NUEVO

      if (savedToken && savedUsername && savedRol) {
        setToken(savedToken)
        setUsername(savedUsername)
        setRol(savedRol)

        // Parsear permisos guardados (puede ser null si no hay)
        if (savedPermisos && savedPermisos !== 'null') {
          try {
            setPermisosTabs(JSON.parse(savedPermisos))
          } catch {
            setPermisosTabs(null)
          }
        } else {
          setPermisosTabs(null)
        }
      } else {
        setToken(null)
      }
    } catch {
      setToken(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Login ─────────────────────────────────────────────────────────
  const login = async (username: string, password: string) => {
    const data: Token = await apiLogin(username, password)

  // ── DESPUÉS (usa función centralizada de api.ts) ──────────────────
    let permisos: Record<string, string[]> | null = null
    try {
      const meData = await getMeUsuario(data.access_token)
      permisos = meData.permisos_tabs ?? null
    } catch {
      permisos = null
    }

    // Persistir en localStorage
    localStorage.setItem('token',    data.access_token)
    localStorage.setItem('username', data.username)
    localStorage.setItem('rol',      data.rol)
    localStorage.setItem('permisos_tabs', JSON.stringify(permisos))

    // Cookies para middleware
    document.cookie = `token=${data.access_token}; path=/; SameSite=Strict`
    document.cookie = `rol=${data.rol}; path=/; SameSite=Strict`

    setToken(data.access_token)
    setUsername(data.username)
    setRol(data.rol as RolUsuario)
    setPermisosTabs(permisos)

    // Redirigir según rol
    if (data.rol === 'admin')      router.push('/admin')
    else if (data.rol === 'finanzas') router.push('/compras')
    else if (data.rol === 'compras')  router.push('/compras')
    else if (data.rol === 'ventas')   router.push('/ventas')
    else if (data.rol === 'calidad')  router.push('/calidad')
    else if (data.rol === 'almacen')  router.push('/almacen')
    else if (data.rol === 'logistica') router.push('/logistica')
    else router.push('/')
  }

  // ── Logout ────────────────────────────────────────────────────────
  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    localStorage.removeItem('rol')
    localStorage.removeItem('permisos_tabs')

    document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict'
    document.cookie = 'rol=;   path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict'

    setToken(null)
    setUsername(null)
    setRol(null)
    setPermisosTabs(null)

    router.push('/login')
  }

  // ── Helper: ¿tiene acceso a este tab? ────────────────────────────
  // Reglas:
  //   1. admin → siempre true
  //   2. permisosTabs === null → true (sin restricciones, comportamiento legacy)
  //   3. módulo no está en permisosTabs → true (módulo sin restricciones)
  //   4. módulo está en permisosTabs → solo si tabId está en la lista
  const tieneAccesoTab = useCallback(
    (modulo: string, tabId: string): boolean => {
      if (rol === 'admin') return true
      if (permisosTabs === null) return true
      if (!(modulo in permisosTabs)) return true
      return permisosTabs[modulo].includes(tabId)
    },
    [rol, permisosTabs]
  )

  return (
    <AuthContext.Provider
      value={{ token, username, rol, permisosTabs, loading, login, logout, tieneAccesoTab }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)