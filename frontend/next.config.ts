import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  allowedDevOrigins: ["100.111.35.87"],

  async rewrites() {
    const BACKEND = 'http://backend:8000'

    return {
      // ── beforeFiles: se evalúan ANTES del filesystem de Next.js ───
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

        // Productos
        { source: '/productos',                     destination: `${BACKEND}/productos/` },
        { source: '/productos/:path*',              destination: `${BACKEND}/productos/:path*` },

        // ── FINANZAS ──────────────────────────────────────────────────
        { source: '/finanzas/compras/:id/etiqueta-lote/:sku', destination: `${BACKEND}/finanzas/compras/:id/etiqueta-lote/:sku` },
        { source: '/finanzas/compras/:id/pdf-detalle',        destination: `${BACKEND}/finanzas/compras/:id/pdf-detalle` },
        { source: '/finanzas/compras/:id/pdf-detalle/',       destination: `${BACKEND}/finanzas/compras/:id/pdf-detalle/` },
        { source: '/finanzas/compras/:id/pdf',                destination: `${BACKEND}/finanzas/compras/:id/pdf` },
        { source: '/finanzas/compras/:id/pdf/',               destination: `${BACKEND}/finanzas/compras/:id/pdf/` },
        { source: '/finanzas',                                destination: `${BACKEND}/finanzas/` },
        { source: '/finanzas/:path*',                         destination: `${BACKEND}/finanzas/:path*` },

        // ── CALIDAD ───────────────────────────────────────────────────
        { source: '/calidad/inspecciones/:id/pdf',  destination: `${BACKEND}/calidad/inspecciones/:id/pdf` },
        { source: '/calidad/inspecciones/:id/pdf/', destination: `${BACKEND}/calidad/inspecciones/:id/pdf/` },
        { source: '/calidad/scrap/pdf',             destination: `${BACKEND}/calidad/scrap/pdf` },
        { source: '/calidad/scrap/pdf/',            destination: `${BACKEND}/calidad/scrap/pdf/` },
        { source: '/calidad',                       destination: `${BACKEND}/calidad/` },
        { source: '/calidad/:path*',                destination: `${BACKEND}/calidad/:path*` },
      ],

      fallback: [],
    }
  },
}

export default nextConfig