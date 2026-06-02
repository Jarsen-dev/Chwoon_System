'use client'

import { useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { FormInput, Button } from '@/components/ui'

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
    <div className="fixed inset-0 bg-gray-900 flex items-center justify-center overflow-hidden">
      <div className="bg-gray-800 rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4">
        <div className="flex flex-col items-center mb-8">
          <img src="/Logo.png" alt="Logo" className="h-20 w-auto mb-4" />
          <h1 className="text-2xl font-bold text-white">Sistema de Producción</h1>
          <p className="text-gray-400 mt-1 text-sm">Ingresa tus credenciales para continuar</p>
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
            <div className="app-alert-error">
              ⚠️ {error}
            </div>
          )}

          <Button type="submit" variant="primary" buttonSize="lg" className="w-full" disabled={loading}>
            {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
          </Button>
        </form>
      </div>
    </div>
  )
}
