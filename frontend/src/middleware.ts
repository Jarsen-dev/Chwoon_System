import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const RUTAS_PROTEGIDAS: Record<string, string[]> = {
  '/admin':      ['admin'],
  '/finanzas':   ['admin', 'finanzas'],
  '/calidad':    ['admin', 'calidad'],
  '/produccion': ['admin', 'supervisor', 'operador'],
  '/inventario': ['admin', 'supervisor'],
  '/partes':     ['admin', 'supervisor', 'operador'],
  '/etiquetas':  ['admin', 'supervisor', 'operador'],
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  const rutaProtegida = Object.keys(RUTAS_PROTEGIDAS).find(ruta =>
    pathname.startsWith(ruta)
  )

  if (!rutaProtegida) return NextResponse.next()

  const token           = request.cookies.get('token')?.value
  const rol             = request.cookies.get('rol')?.value
  const rolesPermitidos = RUTAS_PROTEGIDAS[rutaProtegida]

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (!rol || !rolesPermitidos.includes(rol)) {
    return NextResponse.redirect(new URL('/unauthorized', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/admin/:path*',
    '/finanzas/:path*',
    '/calidad/:path*',
    '/produccion/:path*',
    '/inventario/:path*',
    '/partes/:path*',
    '/etiquetas/:path*',
  ],
}