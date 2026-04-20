'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ProduccionRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/')
  }, [router])

  return (
    <div className="fixed inset-0 bg-white flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
    </div>
  )
}