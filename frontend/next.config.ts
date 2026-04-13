import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  allowedDevOrigins: ["100.111.35.87"],

  async rewrites() {
    const BACKEND = 'http://backend:8000'

    return {
      // ── beforeFiles: se evalúan ANTES del filesystem de Next.js ───
      // Necesario para rutas que colisionan con páginas existentes
      beforeFiles: [
        // PDF de producción (colisiona con /produccion/page.tsx)
        {
          source:      '/produccion/registros/pdf',
          destination: `${BACKEND}/produccion/registros/pdf`,
        },
        {
          source:      '/produccion/registros/pdf/',
          destination: `${BACKEND}/produccion/registros/pdf/`,
        },

        // Excel de secado
        {
          source:      '/secado/registros/excel',
          destination: `${BACKEND}/secado/registros/excel`,
        },
        {
          source:      '/secado/registros/excel/',
          destination: `${BACKEND}/secado/registros/excel/`,
        },

        // Registros de secado
        {
          source:      '/secado/registros',
          destination: `${BACKEND}/secado/registros/`,
        },
        {
          source:      '/secado/registros/',
          destination: `${BACKEND}/secado/registros/`,
        },

        // Escanear secado
        {
          source:      '/secado/escanear',
          destination: `${BACKEND}/secado/escanear/`,
        },
        {
          source:      '/secado/escanear/',
          destination: `${BACKEND}/secado/escanear/`,
        },
      ],

      // ── afterFiles: se evalúan DESPUÉS del filesystem ─────────────
      afterFiles: [
        // Auth
        { source: '/api/:path*',                    destination: `${BACKEND}/api/:path*` },

        // Etiquetas
        { source: '/etiquetas',                     destination: `${BACKEND}/etiquetas/` },
        { source: '/etiquetas/cola/limpiar',        destination: `${BACKEND}/etiquetas/cola/limpiar/` },
        { source: '/etiquetas/cola/limpiar/',       destination: `${BACKEND}/etiquetas/cola/limpiar/` },
        { source: '/etiquetas/cola/:path*',         destination: `${BACKEND}/etiquetas/cola/:path*` },
        { source: '/etiquetas/generar',             destination: `${BACKEND}/etiquetas/generar/` },
        { source: '/etiquetas/generar/',            destination: `${BACKEND}/etiquetas/generar/` },
        { source: '/etiquetas/:path*',              destination: `${BACKEND}/etiquetas/:path*` },

        // Inventario
        { source: '/inventario',                    destination: `${BACKEND}/inventario/` },
        { source: '/inventario/:path*',             destination: `${BACKEND}/inventario/:path*` },

        // Producción
        { source: '/produccion/registros',          destination: `${BACKEND}/produccion/registros/` },
        { source: '/produccion/registros/',         destination: `${BACKEND}/produccion/registros/` },
        { source: '/produccion/registros/:path*',   destination: `${BACKEND}/produccion/registros/:path*` },
        { source: '/produccion/anomalias',          destination: `${BACKEND}/produccion/anomalias/` },
        { source: '/produccion/anomalias/',         destination: `${BACKEND}/produccion/anomalias/` },
        { source: '/produccion/anomalias/:path*',   destination: `${BACKEND}/produccion/anomalias/:path*` },
        { source: '/produccion/salud-maquinas',     destination: `${BACKEND}/produccion/salud-maquinas/` },
        { source: '/produccion/salud-maquinas/',    destination: `${BACKEND}/produccion/salud-maquinas/` },
        { source: '/produccion/turno-actual',       destination: `${BACKEND}/produccion/turno-actual/` },
        { source: '/produccion/turno-actual/',      destination: `${BACKEND}/produccion/turno-actual/` },
        { source: '/produccion/historial-turnos',   destination: `${BACKEND}/produccion/historial-turnos/` },
        { source: '/produccion/historial-turnos/',  destination: `${BACKEND}/produccion/historial-turnos/` },
        { source: '/produccion/plan/:path*',        destination: `${BACKEND}/produccion/plan/:path*` },
        { source: '/produccion/proyeccion/:path*',  destination: `${BACKEND}/produccion/proyeccion/:path*` },
        { source: '/produccion/paros/:path*',       destination: `${BACKEND}/produccion/paros/:path*` },
        { source: '/produccion/ws/:path*',          destination: `${BACKEND}/produccion/ws/:path*` },
        { source: '/produccion/:path*',             destination: `${BACKEND}/produccion/:path*` },

        // Secado — resto dinámico
        { source: '/secado',                        destination: `${BACKEND}/secado/` },
        { source: '/secado/:path*',                 destination: `${BACKEND}/secado/:path*` },

        // Plan
        { source: '/plan',                          destination: `${BACKEND}/plan/` },
        { source: '/plan/:path*',                   destination: `${BACKEND}/plan/:path*` },

        // Partes
        { source: '/partes',                        destination: `${BACKEND}/partes/` },
        { source: '/partes/:path*',                 destination: `${BACKEND}/partes/:path*` },
      ],

      fallback: [],
    }
  },
}

export default nextConfig