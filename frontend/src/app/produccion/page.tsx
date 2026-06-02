'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingSpinner } from '@/components/ui'

export default function ProduccionRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/')
  }, [router])

  return (
    <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
      <LoadingSpinner colorClass="border-blue-400" />
    </div>
  )
}
