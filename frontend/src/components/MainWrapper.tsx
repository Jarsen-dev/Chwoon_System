'use client'

import { usePathname } from 'next/navigation'

export default function MainWrapper({
  children
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()

  const fullScreen = pathname?.startsWith('/admin') ||
                     pathname === '/login' ||
                     pathname === '/unauthorized' ||
                     pathname?.startsWith('/compras') ||
                     pathname?.startsWith('/ventas') ||
                     pathname?.startsWith('/calidad') ||
                     pathname?.startsWith('/produccion') ||
                     pathname?.startsWith('/partes') ||
                     pathname?.startsWith('/etiquetas') ||
                     pathname?.startsWith('/almacen') ||
                     pathname?.startsWith('/logistica')

  if (fullScreen) return <>{children}</>

  return (
    <main className="container mx-auto p-4">
      {children}
    </main>
  )
}