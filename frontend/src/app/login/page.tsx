'use client'

import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { FormInput, Button } from '@/components/ui'
import { IconAlertas } from '@/lib/icons'

export default function LoginPage() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
    } catch (err: any) {
      setError(err.message || 'Error al iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-gray-950 flex items-center justify-center overflow-hidden">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4">
        <div className="flex flex-col items-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/Logo.png" alt="Logo" className="h-20 w-auto mb-4" />
          <h1 className="text-2xl font-bold text-white">Sistema de Producción</h1>
          <p className="text-gray-300 mt-1 text-sm">Ingresa tus credenciales para continuar</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <FormInput
            label="Usuario"
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            placeholder="Ingresa tu usuario"
            inputSize="lg"
            required
          />
          <FormInput
            label="Contraseña"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Ingresa tu contraseña"
            inputSize="lg"
            required
          />

          {error && (
            <div className="flex items-start gap-2 p-4 rounded-lg text-sm font-medium bg-red-500/10 text-red-400 border border-red-500/20">
              <IconAlertas size={16} aria-hidden /> {error}
            </div>
          )}

          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={loading}>
            {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
          </Button>
        </form>
      </div>
    </div>
  )
}
