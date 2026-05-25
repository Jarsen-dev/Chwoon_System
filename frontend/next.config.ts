import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  allowedDevOrigins: ["100.111.35.87"],

  async rewrites() {
    const BACKEND = 'http://backend:8000'

    return {
      beforeFiles: [
        // ── Producción PDFs ──
        {
          source:      '/produccion/registros/pdf',
          destination: `${BACKEND}/produccion/registros/pdf`,
        },
        {
          source:      '/produccion/registros/pdf/',
          destination: `${BACKEND}/produccion/registros/pdf/`,
        },
        // ── Secado ──
        {
          source:      '/secado/registros/excel',
          destination: `${BACKEND}/secado/registros/excel`,
        },
        {
          source:      '/secado/registros/excel/',
          destination: `${BACKEND}/secado/registros/excel/`,
        },
        {
          source:      '/secado/registros',
          destination: `${BACKEND}/secado/registros/`,
        },
        {
          source:      '/secado/registros/',
          destination: `${BACKEND}/secado/registros/`,
        },
        {
          source:      '/secado/escanear',
          destination: `${BACKEND}/secado/escanear/`,
        },
        {
          source:      '/secado/escanear/',
          destination: `${BACKEND}/secado/escanear/`,
        },

        // ── ÓRDENES DE PRODUCCIÓN — Excel/descargas (beforeFiles) ──
        { source: '/ordenes-produccion/estado-silos/excel',              destination: `${BACKEND}/ordenes-produccion/estado-silos/excel` },
        { source: '/ordenes-produccion/estado-silos/excel/',             destination: `${BACKEND}/ordenes-produccion/estado-silos/excel/` },
        { source: '/ordenes-produccion/reporte-preexpansion/excel',      destination: `${BACKEND}/ordenes-produccion/reporte-preexpansion/excel` },
        { source: '/ordenes-produccion/reporte-preexpansion/excel/',     destination: `${BACKEND}/ordenes-produccion/reporte-preexpansion/excel/` },
        { source: '/ordenes-produccion/estado-silos',                    destination: `${BACKEND}/ordenes-produccion/estado-silos` },
        { source: '/ordenes-produccion/estado-silos/',                   destination: `${BACKEND}/ordenes-produccion/estado-silos/` },
        { source: '/ordenes-produccion/suministros',                     destination: `${BACKEND}/ordenes-produccion/suministros` },
        { source: '/ordenes-produccion/suministros/',                    destination: `${BACKEND}/ordenes-produccion/suministros/` },
        { source: '/ordenes-produccion/unificadas',                      destination: `${BACKEND}/ordenes-produccion/unificadas` },
        { source: '/ordenes-produccion/unificadas/',                     destination: `${BACKEND}/ordenes-produccion/unificadas/` },
        { source: '/ordenes-produccion/pre-expansion/:path*',            destination: `${BACKEND}/ordenes-produccion/pre-expansion/:path*` },
        { source: '/ordenes-produccion/inyeccion/:path*',                destination: `${BACKEND}/ordenes-produccion/inyeccion/:path*` },
        { source: '/ordenes-produccion/assy/:path*',                     destination: `${BACKEND}/ordenes-produccion/assy/:path*` },

        // ── FINANZAS API (beforeFiles para evitar conflicto con app pages) ──
        { source: '/finanzas/compras/:id/etiqueta-lote/:sku', destination: `${BACKEND}/finanzas/compras/:id/etiqueta-lote/:sku` },
        { source: '/finanzas/compras/:id/pdf-detalle',        destination: `${BACKEND}/finanzas/compras/:id/pdf-detalle` },
        { source: '/finanzas/compras/:id/pdf-detalle/',       destination: `${BACKEND}/finanzas/compras/:id/pdf-detalle/` },
        { source: '/finanzas/compras/:id/pdf',                destination: `${BACKEND}/finanzas/compras/:id/pdf` },
        { source: '/finanzas/compras/:id/pdf/',               destination: `${BACKEND}/finanzas/compras/:id/pdf/` },
        { source: '/finanzas/compras/:id/aprobar',            destination: `${BACKEND}/finanzas/compras/:id/aprobar` },
        { source: '/finanzas/compras/:id/aprobar/',           destination: `${BACKEND}/finanzas/compras/:id/aprobar/` },
        { source: '/finanzas/compras/:id',                    destination: `${BACKEND}/finanzas/compras/:id` },
        { source: '/finanzas/compras/:id/',                   destination: `${BACKEND}/finanzas/compras/:id/` },
        { source: '/finanzas/compras/recepcion',              destination: `${BACKEND}/finanzas/compras/recepcion` },
        { source: '/finanzas/compras/recepcion/',             destination: `${BACKEND}/finanzas/compras/recepcion/` },
        { source: '/finanzas/compras/recepcion-lote',         destination: `${BACKEND}/finanzas/compras/recepcion-lote` },
        { source: '/finanzas/compras/recepcion-lote/',        destination: `${BACKEND}/finanzas/compras/recepcion-lote/` },
        { source: '/finanzas/compras',                        destination: `${BACKEND}/finanzas/compras` },
        { source: '/finanzas/compras/',                       destination: `${BACKEND}/finanzas/compras/` },
        { source: '/finanzas/dashboard',                      destination: `${BACKEND}/finanzas/dashboard` },
        { source: '/finanzas/dashboard/',                     destination: `${BACKEND}/finanzas/dashboard/` },
        { source: '/finanzas/recepciones',                    destination: `${BACKEND}/finanzas/recepciones` },
        { source: '/finanzas/recepciones/',                   destination: `${BACKEND}/finanzas/recepciones/` },
        { source: '/finanzas/ventas/:id/enviar',              destination: `${BACKEND}/finanzas/ventas/:id/enviar` },
        { source: '/finanzas/ventas/:id/enviar/',             destination: `${BACKEND}/finanzas/ventas/:id/enviar/` },
        { source: '/finanzas/ventas/:id',                     destination: `${BACKEND}/finanzas/ventas/:id` },
        { source: '/finanzas/ventas/:id/',                    destination: `${BACKEND}/finanzas/ventas/:id/` },
        { source: '/finanzas/ventas',                         destination: `${BACKEND}/finanzas/ventas` },
        { source: '/finanzas/ventas/',                        destination: `${BACKEND}/finanzas/ventas/` },
        { source: '/finanzas/devoluciones/:id/disposicion',   destination: `${BACKEND}/finanzas/devoluciones/:id/disposicion` },
        { source: '/finanzas/devoluciones/:id/disposicion/',  destination: `${BACKEND}/finanzas/devoluciones/:id/disposicion/` },
        { source: '/finanzas/devoluciones',                   destination: `${BACKEND}/finanzas/devoluciones` },
        { source: '/finanzas/devoluciones/',                  destination: `${BACKEND}/finanzas/devoluciones/` },
        { source: '/finanzas/plan-ventas/importar',           destination: `${BACKEND}/finanzas/plan-ventas/importar` },
        { source: '/finanzas/plan-ventas/importar/',          destination: `${BACKEND}/finanzas/plan-ventas/importar/` },
        { source: '/finanzas/plan-ventas/autorizar',          destination: `${BACKEND}/finanzas/plan-ventas/autorizar` },
        { source: '/finanzas/plan-ventas/autorizar/',         destination: `${BACKEND}/finanzas/plan-ventas/autorizar/` },
        { source: '/finanzas/plan-ventas/:id',                destination: `${BACKEND}/finanzas/plan-ventas/:id` },
        { source: '/finanzas/plan-ventas/:id/',               destination: `${BACKEND}/finanzas/plan-ventas/:id/` },
        { source: '/finanzas/plan-ventas',                    destination: `${BACKEND}/finanzas/plan-ventas` },
        { source: '/finanzas/plan-ventas/',                   destination: `${BACKEND}/finanzas/plan-ventas/` },
        { source: '/finanzas/lote/:id',                       destination: `${BACKEND}/finanzas/lote/:id` },
        { source: '/finanzas/lote/:id/',                      destination: `${BACKEND}/finanzas/lote/:id/` },
        { source: '/finanzas/limpiar/:path*',                 destination: `${BACKEND}/finanzas/limpiar/:path*` },
        { source: '/finanzas/proveedores',                    destination: `${BACKEND}/finanzas/proveedores` },
        { source: '/finanzas/proveedores/',                   destination: `${BACKEND}/finanzas/proveedores/` },
        { source: '/finanzas/proveedores/:path*',             destination: `${BACKEND}/finanzas/proveedores/:path*` },

        // ── CALIDAD API (beforeFiles) ──
        { source: '/calidad/inspecciones/:id/pdf',  destination: `${BACKEND}/calidad/inspecciones/:id/pdf` },
        { source: '/calidad/inspecciones/:id/pdf/', destination: `${BACKEND}/calidad/inspecciones/:id/pdf/` },
        { source: '/calidad/inspecciones/:id',      destination: `${BACKEND}/calidad/inspecciones/:id` },
        { source: '/calidad/inspecciones/:id/',     destination: `${BACKEND}/calidad/inspecciones/:id/` },
        { source: '/calidad/inspecciones',          destination: `${BACKEND}/calidad/inspecciones` },
        { source: '/calidad/inspecciones/',         destination: `${BACKEND}/calidad/inspecciones/` },
        { source: '/calidad/puntos-inspeccion/:path*', destination: `${BACKEND}/calidad/puntos-inspeccion/:path*` },
        { source: '/calidad/scrap/pdf',             destination: `${BACKEND}/calidad/scrap/pdf` },
        { source: '/calidad/scrap/pdf/',            destination: `${BACKEND}/calidad/scrap/pdf/` },
        { source: '/calidad/scrap',                 destination: `${BACKEND}/calidad/scrap` },
        { source: '/calidad/scrap/',                destination: `${BACKEND}/calidad/scrap/` },
        { source: '/calidad/dashboard',             destination: `${BACKEND}/calidad/dashboard` },
        { source: '/calidad/dashboard/',            destination: `${BACKEND}/calidad/dashboard/` },
        { source: '/calidad/limpiar/:path*',        destination: `${BACKEND}/calidad/limpiar/:path*` },

        // ── ALMACÉN API (beforeFiles) ──
        { source: '/almacen/recepciones/ordenes-compra/:id/etiqueta-lote/:sku', destination: `${BACKEND}/almacen/recepciones/ordenes-compra/:id/etiqueta-lote/:sku` },
        { source: '/almacen/recepciones/ordenes-compra/:id/pdf-detalle',        destination: `${BACKEND}/almacen/recepciones/ordenes-compra/:id/pdf-detalle` },
        { source: '/almacen/recepciones/ordenes-compra/:id/pdf-detalle/',       destination: `${BACKEND}/almacen/recepciones/ordenes-compra/:id/pdf-detalle/` },
        { source: '/almacen/recepciones/ordenes-compra/:id',  destination: `${BACKEND}/almacen/recepciones/ordenes-compra/:id` },
        { source: '/almacen/recepciones/ordenes-compra/:id/', destination: `${BACKEND}/almacen/recepciones/ordenes-compra/:id/` },
        { source: '/almacen/recepciones/ordenes-compra',      destination: `${BACKEND}/almacen/recepciones/ordenes-compra` },
        { source: '/almacen/recepciones/ordenes-compra/',     destination: `${BACKEND}/almacen/recepciones/ordenes-compra/` },
        { source: '/almacen/recepciones/recepcion-lote',      destination: `${BACKEND}/almacen/recepciones/recepcion-lote` },
        { source: '/almacen/recepciones/recepcion-lote/',     destination: `${BACKEND}/almacen/recepciones/recepcion-lote/` },
        { source: '/almacen/dashboard',                       destination: `${BACKEND}/almacen/dashboard` },
        { source: '/almacen/dashboard/',                      destination: `${BACKEND}/almacen/dashboard/` },
        { source: '/almacen/ubicaciones/importar',            destination: `${BACKEND}/almacen/ubicaciones/importar` },
        { source: '/almacen/ubicaciones/importar/',           destination: `${BACKEND}/almacen/ubicaciones/importar/` },
        { source: '/almacen/ubicaciones/silos-produccion',    destination: `${BACKEND}/almacen/ubicaciones/silos-produccion` },
        { source: '/almacen/ubicaciones/silos-produccion/',   destination: `${BACKEND}/almacen/ubicaciones/silos-produccion/` },
        { source: '/almacen/ubicaciones/silos-aux',           destination: `${BACKEND}/almacen/ubicaciones/silos-aux` },
        { source: '/almacen/ubicaciones/silos-aux/',          destination: `${BACKEND}/almacen/ubicaciones/silos-aux/` },
        { source: '/almacen/ubicaciones/:id',                 destination: `${BACKEND}/almacen/ubicaciones/:id` },
        { source: '/almacen/ubicaciones/:id/',                destination: `${BACKEND}/almacen/ubicaciones/:id/` },
        { source: '/almacen/ubicaciones',                     destination: `${BACKEND}/almacen/ubicaciones` },
        { source: '/almacen/ubicaciones/',                    destination: `${BACKEND}/almacen/ubicaciones/` },
        { source: '/almacen/inventario/consolidado',          destination: `${BACKEND}/almacen/inventario/consolidado` },
        { source: '/almacen/inventario/consolidado/',         destination: `${BACKEND}/almacen/inventario/consolidado/` },
        { source: '/almacen/inventario/aprobados-sin-ubicacion',  destination: `${BACKEND}/almacen/inventario/aprobados-sin-ubicacion` },
        { source: '/almacen/inventario/aprobados-sin-ubicacion/', destination: `${BACKEND}/almacen/inventario/aprobados-sin-ubicacion/` },
        { source: '/almacen/inventario/transferir',           destination: `${BACKEND}/almacen/inventario/transferir` },
        { source: '/almacen/inventario/transferir/',          destination: `${BACKEND}/almacen/inventario/transferir/` },
        { source: '/almacen/inventario/transferir-entre-ubicaciones',  destination: `${BACKEND}/almacen/inventario/transferir-entre-ubicaciones` },
        { source: '/almacen/inventario/transferir-entre-ubicaciones/', destination: `${BACKEND}/almacen/inventario/transferir-entre-ubicaciones/` },
        { source: '/almacen/inventario/consumir-fifo',        destination: `${BACKEND}/almacen/inventario/consumir-fifo` },
        { source: '/almacen/inventario/consumir-fifo/',       destination: `${BACKEND}/almacen/inventario/consumir-fifo/` },
        { source: '/almacen/inventario/:id/historial',        destination: `${BACKEND}/almacen/inventario/:id/historial` },
        { source: '/almacen/inventario/:id/historial/',       destination: `${BACKEND}/almacen/inventario/:id/historial/` },
        { source: '/almacen/inventario/:id/ajustar',          destination: `${BACKEND}/almacen/inventario/:id/ajustar` },
        { source: '/almacen/inventario/:id/ajustar/',         destination: `${BACKEND}/almacen/inventario/:id/ajustar/` },
        { source: '/almacen/inventario/:id/scrap',            destination: `${BACKEND}/almacen/inventario/:id/scrap` },
        { source: '/almacen/inventario/:id/scrap/',           destination: `${BACKEND}/almacen/inventario/:id/scrap/` },
        { source: '/almacen/inventario',                      destination: `${BACKEND}/almacen/inventario` },
        { source: '/almacen/inventario/',                     destination: `${BACKEND}/almacen/inventario/` },
        { source: '/almacen/traslados-produccion/:id/ejecutar',  destination: `${BACKEND}/almacen/traslados-produccion/:id/ejecutar` },
        { source: '/almacen/traslados-produccion/:id/ejecutar/', destination: `${BACKEND}/almacen/traslados-produccion/:id/ejecutar/` },
        { source: '/almacen/traslados-produccion/historial',  destination: `${BACKEND}/almacen/traslados-produccion/historial` },
        { source: '/almacen/traslados-produccion/historial/', destination: `${BACKEND}/almacen/traslados-produccion/historial/` },
        { source: '/almacen/traslados-produccion',            destination: `${BACKEND}/almacen/traslados-produccion` },
        { source: '/almacen/traslados-produccion/',           destination: `${BACKEND}/almacen/traslados-produccion/` },
        { source: '/almacen/traslados-historial',             destination: `${BACKEND}/almacen/traslados-historial` },
        { source: '/almacen/traslados-historial/',            destination: `${BACKEND}/almacen/traslados-historial/` },
        { source: '/almacen/eps/ubicaciones',                 destination: `${BACKEND}/almacen/eps/ubicaciones` },
        { source: '/almacen/eps/ubicaciones/',                destination: `${BACKEND}/almacen/eps/ubicaciones/` },
        { source: '/almacen/eps/inventario',                  destination: `${BACKEND}/almacen/eps/inventario` },
        { source: '/almacen/eps/inventario/',                 destination: `${BACKEND}/almacen/eps/inventario/` },
        { source: '/almacen/eps/ingresar',                    destination: `${BACKEND}/almacen/eps/ingresar` },
        { source: '/almacen/eps/ingresar/',                   destination: `${BACKEND}/almacen/eps/ingresar/` },
        { source: '/almacen/eps/historial-movimientos',       destination: `${BACKEND}/almacen/eps/historial-movimientos` },
        { source: '/almacen/eps/historial-movimientos/',      destination: `${BACKEND}/almacen/eps/historial-movimientos/` },
        { source: '/almacen/trazabilidad/:id',                destination: `${BACKEND}/almacen/trazabilidad/:id` },
        { source: '/almacen/trazabilidad/:id/',               destination: `${BACKEND}/almacen/trazabilidad/:id/` },
        { source: '/almacen/limpiar/:path*',                  destination: `${BACKEND}/almacen/limpiar/:path*` },

        // ── LOGÍSTICA API (beforeFiles) ──
        { source: '/logistica/embarques/:num/salida',            destination: `${BACKEND}/logistica/embarques/:num/salida` },
        { source: '/logistica/embarques/:num/salida/',           destination: `${BACKEND}/logistica/embarques/:num/salida/` },
        { source: '/logistica/embarques/:num/confirmar-entrega',  destination: `${BACKEND}/logistica/embarques/:num/confirmar-entrega` },
        { source: '/logistica/embarques/:num/confirmar-entrega/', destination: `${BACKEND}/logistica/embarques/:num/confirmar-entrega/` },
        { source: '/logistica/embarques',                        destination: `${BACKEND}/logistica/embarques` },
        { source: '/logistica/embarques/',                       destination: `${BACKEND}/logistica/embarques/` },
        { source: '/logistica/dashboard',                        destination: `${BACKEND}/logistica/dashboard` },
        { source: '/logistica/dashboard/',                       destination: `${BACKEND}/logistica/dashboard/` },
        { source: '/logistica/reporte-embarques',                destination: `${BACKEND}/logistica/reporte-embarques` },
        { source: '/logistica/reporte-embarques/',               destination: `${BACKEND}/logistica/reporte-embarques/` },
        { source: '/logistica/limpiar/:path*',                   destination: `${BACKEND}/logistica/limpiar/:path*` },
      ],

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

        // ── ÓRDENES DE PRODUCCIÓN (catch-all) ──
        { source: '/ordenes-produccion',              destination: `${BACKEND}/ordenes-produccion/` },
        { source: '/ordenes-produccion/:path*',       destination: `${BACKEND}/ordenes-produccion/:path*` },

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
        
        // Plan Inyección
        { source: '/plan-inyeccion',           destination: `${BACKEND}/plan-inyeccion/` },
        { source: '/plan-inyeccion/',          destination: `${BACKEND}/plan-inyeccion/` },
        { source: '/plan-inyeccion/:path*',    destination: `${BACKEND}/plan-inyeccion/:path*` },

        // Reporte Manual Inyección
        { source: '/reporte-manual-inyeccion',           destination: `${BACKEND}/reporte-manual-inyeccion/` },
        { source: '/reporte-manual-inyeccion/',          destination: `${BACKEND}/reporte-manual-inyeccion/` },
        { source: '/reporte-manual-inyeccion/:path*',    destination: `${BACKEND}/reporte-manual-inyeccion/:path*` },

        // Secado
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
      ],

      fallback: [],
    }
  },
}

export default nextConfig