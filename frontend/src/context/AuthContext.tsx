'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react'
import { useRouter } from 'next/navigation'
import { Token, RolUsuario } from '@/types'
import { login as apiLogin } from '@/lib/api'

// ── Tipos ─────────────────────────────────────────────────────────────
interface AuthContextType {
  token:    string | null | undefined   // undefined = aún cargando
  username: string | null
  rol:      RolUsuario | null
  loading:  boolean
  login:    (username: string, password: string) => Promise<void>
  logout:   () => void
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType)

// ── Provider ──────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: ReactNode }) {
  // undefined = hydrating | null = no logueado | string = logueado
  const [token,    setToken]    = useState<string | null | undefined>(undefined)
  const [username, setUsername] = useState<string | null>(null)
  const [rol,      setRol]      = useState<RolUsuario | null>(null)
  const [loading,  setLoading]  = useState(true)

  const router = useRouter()

  // ── Hidratación desde localStorage ────────────────────────────────
  useEffect(() => {
    try {
      const savedToken    = localStorage.getItem('token')
      const savedUsername = localStorage.getItem('username')
      const savedRol      = localStorage.getItem('rol') as RolUsuario | null

      if (savedToken && savedUsername && savedRol) {
        setToken(savedToken)
        setUsername(savedUsername)
        setRol(savedRol)
      } else {
        // No hay sesión guardada → null (no undefined)
        setToken(null)
      }
    } catch {
      // localStorage no disponible (SSR edge case)
      setToken(null)
    } finally {
      setLoading(false)
    }
  }, [])

  // ── Login ──────────────────────────────────────────────────────────
  const login = async (username: string, password: string) => {
    const data: Token = await apiLogin(username, password)

    // Persistir en localStorage
    localStorage.setItem('token',    data.access_token)
    localStorage.setItem('username', data.username)
    localStorage.setItem('rol',      data.rol)

    // Persistir en cookies para el middleware
    document.cookie = `token=${data.access_token}; path=/; SameSite=Strict`
    document.cookie = `rol=${data.rol}; path=/; SameSite=Strict`

    // Actualizar estado
    setToken(data.access_token)
    setUsername(data.username)
    setRol(data.rol as RolUsuario)

    // Redirigir según rol
    if (data.rol === 'admin') {
      router.push('/admin')
    } else if (data.rol === 'finanzas') {
      router.push('/finanzas')
    } else {
      router.push('/produccion')
    }
  }

  // ── Logout ─────────────────────────────────────────────────────────
  const logout = () => {
    // Limpiar localStorage
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    localStorage.removeItem('rol')

    // Expirar cookies
    document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict'
    document.cookie = 'rol=;   path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict'

    // Limpiar estado
    setToken(null)
    setUsername(null)
    setRol(null)

    router.push('/login')
  }

  return (
    <AuthContext.Provider
      value={{ token, username, rol, loading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)