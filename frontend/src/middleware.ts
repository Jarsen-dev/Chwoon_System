import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Rutas y quién puede acceder
const RUTAS_PROTEGIDAS: Record<string, string[]> = {
  '/admin':      ['admin'],
  '/finanzas':   ['admin', 'finanzas'],
  '/produccion': ['admin', 'supervisor', 'operador'],
  '/inventario': ['admin', 'supervisor'],
  '/partes':     ['admin', 'supervisor', 'operador'],
  '/etiquetas':  ['admin', 'supervisor', 'operador'],
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Busca si la ruta está protegida
  const rutaProtegida = Object.keys(RUTAS_PROTEGIDAS).find(ruta =>
    pathname.startsWith(ruta)
  )

  // Si no está protegida, pasa normal
  if (!rutaProtegida) return NextResponse.next()

  const token    = request.cookies.get('token')?.value
  const rol      = request.cookies.get('rol')?.value
  const rolesPermitidos = RUTAS_PROTEGIDAS[rutaProtegida]

  // Sin token → login
  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Sin permiso → unauthorized
  if (!rol || !rolesPermitidos.includes(rol)) {
    return NextResponse.redirect(new URL('/unauthorized', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/finanzas/:path*',
    '/produccion/:path*',
    '/inventario/:path*',
    '/partes/:path*',
    '/etiquetas/:path*',
  ]
}