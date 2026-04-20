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

interface AuthContextType {
  token:    string | null | undefined
  username: string | null
  rol:      RolUsuario | null
  loading:  boolean
  login:    (username: string, password: string) => Promise<void>
  logout:   () => void
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token,    setToken]    = useState<string | null | undefined>(undefined)
  const [username, setUsername] = useState<string | null>(null)
  const [rol,      setRol]     = useState<RolUsuario | null>(null)
  const [loading,  setLoading]  = useState(true)

  const router = useRouter()

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
        setToken(null)
      }
    } catch {
      setToken(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const login = async (username: string, password: string) => {
    const data: Token = await apiLogin(username, password)

    localStorage.setItem('token',    data.access_token)
    localStorage.setItem('username', data.username)
    localStorage.setItem('rol',      data.rol)

    document.cookie = `token=${data.access_token}; path=/; SameSite=Strict`
    document.cookie = `rol=${data.rol}; path=/; SameSite=Strict`

    setToken(data.access_token)
    setUsername(data.username)
    setRol(data.rol as RolUsuario)

    // Redirigir según rol
    if (data.rol === 'admin') {
      router.push('/admin')
    } else if (data.rol === 'finanzas') {
      router.push('/finanzas')
    } else if (data.rol === 'calidad') {
      router.push('/calidad')
    } else {
      router.push('/produccion')
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    localStorage.removeItem('rol')

    document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict'
    document.cookie = 'rol=;   path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Strict'

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