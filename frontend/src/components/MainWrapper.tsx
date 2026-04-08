'use client'

import { usePathname } from 'next/navigation'

export default function MainWrapper({
  children
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  // Admin y login ocupan toda la pantalla sin padding
  const fullScreen = pathname?.startsWith('/admin') ||
                     pathname === '/login' ||
                     pathname === '/unauthorized'

  if (fullScreen) return <>{children}</>

  return (
    <main className="container mx-auto p-4">
      {children}
    </main>
  )
}
