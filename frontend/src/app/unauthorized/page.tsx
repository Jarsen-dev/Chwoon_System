'use client'
import { useRouter } from 'next/navigation'

export default function UnauthorizedPage() {
  const router = useRouter()
  return (
    <div className="min-h-screen bg-gray-900 flex items-center
                    justify-center text-white">
      <div className="text-center">
        <div className="text-6xl mb-4">🚫</div>
        <h1 className="text-2xl font-bold mb-2">Acceso Denegado</h1>
        <p className="text-gray-400 mb-6">
          No tienes permiso para ver esta página
        </p>
        <button
          onClick={() => router.back()}
          className="bg-blue-600 hover:bg-blue-700 px-6 py-2
                     rounded-lg transition-colors"
        >
          ← Volver
        </button>
      </div>
    </div>
  )
}
