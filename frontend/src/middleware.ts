import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const RUTAS_PROTEGIDAS: Record<string, string[]> = {
  '/admin':    ['admin'],
  '/compras':  ['admin', 'finanzas'],
  '/ventas':   ['admin', 'finanzas'],
  '/calidad':  ['admin', 'calidad'],
  '/almacen':  ['admin', 'almacen'],
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // La ruta / está protegida pero permite todos los roles de producción
  if (pathname === '/') {
    const token = request.cookies.get('token')?.value
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    const rol = request.cookies.get('rol')?.value
    if (!rol || !['admin', 'supervisor', 'operador', 'calidad'].includes(rol)) {
      return NextResponse.redirect(new URL('/unauthorized', request.url))
    }
    return NextResponse.next()
  }

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
    '/',
    '/admin/:path*',
    '/compras/:path*',
    '/ventas/:path*',
    '/calidad/:path*',
    '/almacen/:path*',
  ],
}