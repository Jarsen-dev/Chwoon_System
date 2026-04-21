import {
  InventarioItem,
  ColaItem,
  ColaItemCreate,
  RegistroProduccion,
  PlanItem,
  Anomalia,
  Token,
  Usuario,
  UsuarioCreate,
  UsuarioUpdate,
  ProductoItem,
  ProductoCreate,
  ProductoUpdate,
  BomItem,
  FinanzasDashboard,
  OrdenCompra,
  OrdenVenta,
  Devolucion,
  PlanVentasSemana,
  CalidadDashboard,
  InspeccionCalidad,
  RegistroScrapItem,
  ProductoPuntosInspeccion,
} from '@/types'

const API_URL = ''

// ==========================================
// INVENTARIO PLANTA
// ==========================================
export async function getInventario(): Promise<InventarioItem[]> {
  const res = await fetch(`${API_URL}/inventario/`)
  if (!res.ok) throw new Error('Error cargando inventario')
  return res.json()
}

export async function createInventario(
  item: InventarioItem
): Promise<InventarioItem> {
  const res = await fetch(`${API_URL}/inventario/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  })
  if (!res.ok) throw new Error('Error creando item en inventario')
  return res.json()
}

export async function updateInventario(
  codigo: string,
  item: Partial<InventarioItem>
): Promise<InventarioItem> {
  const res = await fetch(`${API_URL}/inventario/${codigo}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  })
  if (!res.ok) throw new Error('Error actualizando item en inventario')
  return res.json()
}

export async function deleteInventario(codigo: string): Promise<void> {
  const res = await fetch(`${API_URL}/inventario/${codigo}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Error eliminando item del inventario')
}

export async function importarExcelInventario(
  file: File
): Promise<{ message: string; creados: number; actualizados: number; errores?: string[] }> {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(`${API_URL}/inventario/importar-excel`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.detail || 'Error importando Excel de inventario')
  }
  return res.json()
}

// ==========================================
// PRODUCTOS
// ==========================================
export async function getProductos(): Promise<ProductoItem[]> {
  const res = await fetch(`${API_URL}/productos/`)
  if (!res.ok) throw new Error('Error al obtener productos')
  return res.json()
}

export async function getProducto(sku: string): Promise<ProductoItem> {
  const res = await fetch(`${API_URL}/productos/${encodeURIComponent(sku)}`)
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Producto no encontrado')
  }
  return res.json()
}

export async function createProducto(
  data: ProductoCreate
): Promise<ProductoItem> {
  const res = await fetch(`${API_URL}/productos/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Error al crear producto')
  }
  return res.json()
}

export async function updateProducto(
  sku: string,
  data: ProductoUpdate
): Promise<ProductoItem> {
  const res = await fetch(
    `${API_URL}/productos/${encodeURIComponent(sku)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }
  )
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Error al actualizar producto')
  }
  return res.json()
}

export async function deleteProducto(sku: string): Promise<void> {
  const res = await fetch(
    `${API_URL}/productos/${encodeURIComponent(sku)}`,
    { method: 'DELETE' }
  )
  if (!res.ok) throw new Error('Error al eliminar producto')
}

export async function deleteProductosBatch(
  skus: string[]
): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/productos/delete-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skus }),
  })
  if (!res.ok) throw new Error('Error al eliminar productos')
  return res.json()
}

export async function cambiarStatusProductos(
  skus: string[],
  status: string
): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/productos/status-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ skus, status }),
  })
  if (!res.ok) throw new Error('Error al cambiar status')
  return res.json()
}

export async function actualizarPuntosInspeccion(
  sku: string,
  tipo_control: string,
  puntos: Record<string, any>[]
): Promise<{ message: string }> {
  const res = await fetch(
    `${API_URL}/productos/${encodeURIComponent(sku)}/puntos-inspeccion`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tipo_control, puntos }),
    }
  )
  if (!res.ok) throw new Error('Error al actualizar puntos de inspección')
  return res.json()
}

export async function actualizarBom(
  sku: string,
  bom: BomItem[]
): Promise<{ message: string }> {
  const res = await fetch(
    `${API_URL}/productos/${encodeURIComponent(sku)}/bom`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bom }),
    }
  )
  if (!res.ok) throw new Error('Error al actualizar BOM')
  return res.json()
}

export async function importarProductosExcel(
  file: File
): Promise<{ message: string; count: number }> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`${API_URL}/productos/importar`, {
    method: 'POST',
    body: fd,
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Error al importar productos')
  }
  return res.json()
}

export async function importarBomExcel(
  file: File
): Promise<{ message: string; count: number }> {
  const fd = new FormData()
  fd.append('file', file)
  const res = await fetch(`${API_URL}/productos/importar-bom`, {
    method: 'POST',
    body: fd,
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Error al importar BOM')
  }
  return res.json()
}

// ==========================================
// COLA DE IMPRESIÓN
// ==========================================
export async function getCola(): Promise<ColaItem[]> {
  const res = await fetch(`${API_URL}/etiquetas/cola/`)
  if (!res.ok) throw new Error('Error cargando cola')
  return res.json()
}

export async function agregarACola(
  item: ColaItemCreate,
  token: string
): Promise<ColaItem> {
  const res = await fetch(`${API_URL}/etiquetas/cola/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(item),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.detail || 'Error agregando a cola')
  }
  return res.json()
}

export async function eliminarDeCola(item_id: number): Promise<void> {
  const res = await fetch(`${API_URL}/etiquetas/cola/${item_id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Error eliminando item de la cola')
}

export async function limpiarCola(): Promise<void> {
  const res = await fetch(`${API_URL}/etiquetas/cola/limpiar/`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error('Error limpiando la cola')
}

export async function generarPDF(token: string): Promise<Blob> {
  const res = await fetch(`${API_URL}/etiquetas/generar/`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) throw new Error('Error generando PDF')
  return res.blob()
}

// ==========================================
// PLAN DE PRODUCCIÓN
// ==========================================
export async function getPlanProduccion(): Promise<PlanItem[]> {
  const res = await fetch(`${API_URL}/plan/`)
  if (!res.ok) throw new Error('Error cargando plan de producción')
  return res.json()
}

export async function importarPlanExcel(
  file: File
): Promise<{
  message: string
  partes_importadas: number
  etiquetas_en_cola: number
  errores: string[]
}> {
  const formData = new FormData()
  formData.append('file', file)

  const res = await fetch(`${API_URL}/plan/importar-excel`, {
    method: 'POST',
    body: formData,
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.detail || 'Error importando plan Excel')
  }
  return res.json()
}

export async function eliminarDelPlan(numero_parte: string): Promise<void> {
  const res = await fetch(
    `${API_URL}/plan/${encodeURIComponent(numero_parte)}`,
    { method: 'DELETE' }
  )
  if (!res.ok) throw new Error('Error eliminando del plan')
}

// ==========================================
// PRODUCCIÓN
// ==========================================
export async function getRegistros(
  fecha?: string,
  turno?: string
): Promise<RegistroProduccion[]> {
  const url = new URL('/produccion/registros/', window.location.origin)
  if (fecha) url.searchParams.append('fecha', fecha)
  if (turno) url.searchParams.append('turno', turno)
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error('Error cargando registros')
  return res.json()
}

export async function getProyeccion(turno: string): Promise<any> {
  const res = await fetch(`${API_URL}/produccion/proyeccion/${turno}`)
  if (!res.ok) throw new Error('Error cargando proyección')
  return res.json()
}

export async function getSaludMaquinas(): Promise<any> {
  const res = await fetch(`${API_URL}/produccion/salud-maquinas/`)
  if (!res.ok) throw new Error('Error cargando salud de máquinas')
  return res.json()
}

export async function getAnomalias(limite: number = 10): Promise<Anomalia[]> {
  const res = await fetch(
    `${API_URL}/produccion/anomalias/?limite=${limite}`
  )
  if (!res.ok) throw new Error('Error cargando anomalías')
  return res.json()
}

// ==========================================
// AUTH
// ==========================================
export async function login(
  username: string,
  password: string
): Promise<Token> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.detail || 'Error al iniciar sesión')
  }
  return res.json()
}

export async function getMe(token: string): Promise<Usuario> {
  const res = await fetch(`${API_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Token inválido')
  return res.json()
}

// ==========================================
// USUARIOS (solo admin)
// ==========================================
export async function getUsuarios(token: string): Promise<Usuario[]> {
  const res = await fetch(`${API_URL}/api/auth/usuarios`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Error cargando usuarios')
  return res.json()
}

export async function createUsuario(
  token: string,
  data: UsuarioCreate
): Promise<Usuario> {
  const res = await fetch(`${API_URL}/api/auth/usuarios`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.detail || 'Error creando usuario')
  }
  return res.json()
}

export async function updateUsuario(
  token: string,
  id: number,
  data: UsuarioUpdate
): Promise<Usuario> {
  const res = await fetch(`${API_URL}/api/auth/usuarios/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.detail || 'Error actualizando usuario')
  }
  return res.json()
}

export async function deleteUsuario(
  token: string,
  id: number
): Promise<void> {
  const res = await fetch(`${API_URL}/api/auth/usuarios/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Error eliminando usuario')
}

export async function toggleUsuario(
  token: string,
  id: number
): Promise<{ activo: boolean; username: string }> {
  const res = await fetch(`${API_URL}/api/auth/usuarios/${id}/toggle`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Error cambiando estado del usuario')
  return res.json()
}

// ==========================================
// FINANZAS — Dashboard
// ==========================================
export async function getFinanzasDashboard(token: string): Promise<FinanzasDashboard> {
  const res = await fetch(`${API_URL}/finanzas/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Error al obtener dashboard de finanzas')
  return res.json()
}

// ==========================================
// FINANZAS — Órdenes de Compra
// ==========================================
export async function getOrdenesCompra(token: string, status?: string): Promise<OrdenCompra[]> {
  const params = status ? `?status=${status}` : ''
  const res = await fetch(`${API_URL}/finanzas/compras${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Error al obtener órdenes de compra')
  return res.json()
}

export async function getOrdenCompra(token: string, ocId: string): Promise<OrdenCompra> {
  const res = await fetch(`${API_URL}/finanzas/compras/${ocId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Error al obtener orden de compra')
  return res.json()
}

export async function crearOrdenCompra(token: string, data: {
  id_proveedor: string
  nombre_proveedor: string
  items: { sku_producto: string; nombre_producto: string; cantidad_requerida: number; precio_unitario: number; moneda?: string }[]
  notas?: string
}): Promise<{ message: string; oc_id: string; id: number }> {
  const res = await fetch(`${API_URL}/finanzas/compras`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Error al crear orden de compra')
  }
  return res.json()
}

export async function actualizarOrdenCompra(token: string, ocId: string, data: any): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/finanzas/compras/${ocId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Error al actualizar orden de compra')
  }
  return res.json()
}

export async function eliminarOrdenCompra(token: string, ocId: string): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/finanzas/compras/${ocId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Error al eliminar orden de compra')
  }
  return res.json()
}

export async function registrarRecepcion(token: string, data: {
  oc_id: string
  sku_producto: string
  cantidad_recibida: number
  notas?: string
}): Promise<{ message: string; recepcion_id: string; nuevo_status_oc: string }> {
  const res = await fetch(`${API_URL}/finanzas/compras/recepcion`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Error al registrar recepción')
  }
  return res.json()
}

export async function registrarRecepcionLote(token: string, data: {
  oc_id: string
  sku_producto: string
  cantidad_recibida: number
  notas?: string
}[]): Promise<{ message: string; recepciones: string[]; nuevo_status_oc: string }> {
  const res = await fetch(`${API_URL}/finanzas/compras/recepcion-lote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Error al registrar recepciones')
  }
  return res.json()
}

export async function getRecepciones(token: string): Promise<any[]> {
  const res = await fetch(`${API_URL}/finanzas/recepciones`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Error al obtener recepciones')
  return res.json()
}

export async function descargarPdfOrdenCompra(token: string, ocId: string): Promise<void> {
  const res = await fetch(`${API_URL}/finanzas/compras/${ocId}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Error al generar PDF')
  }
  const blob = await res.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${ocId}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

export async function descargarEtiquetaLote(token: string, ocId: string, sku: string): Promise<void> {
  const res = await fetch(`${API_URL}/finanzas/compras/${ocId}/etiqueta-lote/${encodeURIComponent(sku)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Error al generar etiqueta de lote')
  }
  const blob = await res.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `ETIQUETA_LOTE_${ocId}_${sku}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

export async function descargarPdfDetalleOC(token: string, ocId: string): Promise<void> {
  const res = await fetch(`${API_URL}/finanzas/compras/${ocId}/pdf-detalle`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Error al generar PDF detalle')
  }
  const blob = await res.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${ocId}_detalle.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

// ==========================================
// FINANZAS — Órdenes de Venta
// ==========================================
export async function getOrdenesVenta(token: string, estado?: string): Promise<OrdenVenta[]> {
  const params = estado ? `?estado=${estado}` : ''
  const res = await fetch(`${API_URL}/finanzas/ventas${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Error al obtener órdenes de venta')
  return res.json()
}

export async function getOrdenVenta(token: string, ovId: string): Promise<OrdenVenta> {
  const res = await fetch(`${API_URL}/finanzas/ventas/${ovId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Error al obtener orden de venta')
  return res.json()
}

export async function crearOrdenVenta(token: string, data: {
  cliente_id: string
  nombre_cliente?: string
  items: { sku_producto: string; nombre_producto?: string; cantidad: number; precio_unitario?: number; moneda?: string }[]
  notas?: string
}): Promise<{ message: string; ov_id: string; id: number }> {
  const res = await fetch(`${API_URL}/finanzas/ventas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Error al crear orden de venta')
  }
  return res.json()
}

export async function actualizarOrdenVenta(token: string, ovId: string, data: any): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/finanzas/ventas/${ovId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Error al actualizar orden de venta')
  }
  return res.json()
}

export async function enviarOrdenVenta(token: string, ovId: string): Promise<{ message: string; envio_id: string }> {
  const res = await fetch(`${API_URL}/finanzas/ventas/${ovId}/enviar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Error al enviar orden de venta')
  }
  return res.json()
}

// ==========================================
// FINANZAS — Devoluciones
// ==========================================
export async function getDevoluciones(token: string, estado?: string): Promise<Devolucion[]> {
  const params = estado ? `?estado=${estado}` : ''
  const res = await fetch(`${API_URL}/finanzas/devoluciones${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Error al obtener devoluciones')
  return res.json()
}

export async function crearDevolucion(token: string, data: {
  ov_id: string
  sku_producto: string
  nombre_producto?: string
  cantidad_devuelta: number
  motivo: string
  lote_produccion_origen?: string
}): Promise<{ message: string; devolucion_id: string }> {
  const res = await fetch(`${API_URL}/finanzas/devoluciones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Error al registrar devolución')
  }
  return res.json()
}

export async function procesarDisposicion(token: string, devolucionId: string, data: {
  cantidad_scrap: number
  cantidad_retrabajo: number
}): Promise<{ message: string; disposicion: string }> {
  const res = await fetch(`${API_URL}/finanzas/devoluciones/${devolucionId}/disposicion`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Error al procesar disposición')
  }
  return res.json()
}

// ==========================================
// FINANZAS — Plan de Ventas
// ==========================================
export async function getPlanesVentas(token: string): Promise<PlanVentasSemana[]> {
  const res = await fetch(`${API_URL}/finanzas/plan-ventas`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Error al obtener planes de ventas')
  return res.json()
}

export async function getPlanVentas(token: string, identificadorSemana: string): Promise<PlanVentasSemana> {
  const res = await fetch(`${API_URL}/finanzas/plan-ventas/${identificadorSemana}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Error al obtener plan de ventas')
  return res.json()
}

export async function importarPlanVentas(token: string, fechaInicioSemana: string, file: File): Promise<{ message: string; total_skus: number }> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await fetch(`${API_URL}/finanzas/plan-ventas/importar?fecha_inicio_semana=${fechaInicioSemana}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Error al importar plan de ventas')
  }
  return res.json()
}

export async function autorizarVentasMasivo(token: string, data: {
  identificador_semana: string
  ventas: { sku: string; dia: string; cantidad: number }[]
}): Promise<{ resultados: string[] }> {
  const res = await fetch(`${API_URL}/finanzas/plan-ventas/autorizar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Error al autorizar ventas')
  }
  return res.json()
}

// ==========================================
// FINANZAS — Limpieza (solo admin)
// ==========================================
export async function limpiarComprasCompletadas(token: string): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/finanzas/limpiar/compras-completadas`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Error al limpiar')
  }
  return res.json()
}

export async function limpiarDevolucionesFinalizadas(token: string, dias: number = 90): Promise<{ message: string }> {
  const res = await fetch(`${API_URL}/finanzas/limpiar/devoluciones-finalizadas?dias=${dias}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Error al limpiar')
  }
  return res.json()
}

export async function getInfoLote(token: string, loteId: string): Promise<any> {
  const res = await fetch(`${API_URL}/finanzas/lote/${encodeURIComponent(loteId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Lote no encontrado')
  }
  return res.json()
}

// ==========================================
// CALIDAD — Dashboard
// ==========================================
export async function getCalidadDashboard(token: string): Promise<CalidadDashboard> {
  const res = await fetch(`${API_URL}/calidad/dashboard`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Error al obtener dashboard de calidad')
  return res.json()
}

// ==========================================
// CALIDAD — Inspecciones
// ==========================================
export async function getInspecciones(
  token: string,
  params?: { tipo?: string; resultado?: string; fecha_desde?: string; fecha_hasta?: string; limite?: number }
): Promise<InspeccionCalidad[]> {
  const searchParams = new URLSearchParams()
  if (params?.tipo) searchParams.append('tipo', params.tipo)
  if (params?.resultado) searchParams.append('resultado', params.resultado)
  if (params?.fecha_desde) searchParams.append('fecha_desde', params.fecha_desde)
  if (params?.fecha_hasta) searchParams.append('fecha_hasta', params.fecha_hasta)
  if (params?.limite) searchParams.append('limite', params.limite.toString())
  const qs = searchParams.toString()
  const res = await fetch(`${API_URL}/calidad/inspecciones${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Error al obtener inspecciones')
  return res.json()
}

export async function getInspeccion(token: string, inspeccionId: string): Promise<InspeccionCalidad> {
  const res = await fetch(`${API_URL}/calidad/inspecciones/${inspeccionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Error al obtener inspección')
  return res.json()
}

export async function registrarInspeccion(token: string, data: {
  lote_id?: string
  sku_producto: string
  nombre_producto?: string
  tipo_inspeccion: string
  resultado_final: string
  resultados_puntos: { punto: string; especificacion?: string; resultado: string }[]
  oc_origen?: string
  op_origen?: string
  cantidad_inspeccionada?: number
  notas?: string
}): Promise<{ message: string; inspeccion_id: string; resultado: string }> {
  const res = await fetch(`${API_URL}/calidad/inspecciones`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Error al registrar inspección')
  }
  return res.json()
}

export async function descargarPdfInspeccion(token: string, inspeccionId: string): Promise<void> {
  const res = await fetch(`${API_URL}/calidad/inspecciones/${inspeccionId}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Error al generar PDF de inspección')
  const blob = await res.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `inspeccion_${inspeccionId}.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

// ==========================================
// CALIDAD — Puntos de inspección
// ==========================================
export async function getPuntosInspeccion(token: string, sku: string): Promise<ProductoPuntosInspeccion> {
  const res = await fetch(`${API_URL}/calidad/puntos-inspeccion/${encodeURIComponent(sku)}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Error al obtener puntos de inspección')
  }
  return res.json()
}

// ==========================================
// CALIDAD — Scrap
// ==========================================
export async function getScrap(
  token: string,
  params?: { fecha?: string; sku?: string; origen?: string; limite?: number }
): Promise<RegistroScrapItem[]> {
  const searchParams = new URLSearchParams()
  if (params?.fecha) searchParams.append('fecha', params.fecha)
  if (params?.sku) searchParams.append('sku', params.sku)
  if (params?.origen) searchParams.append('origen', params.origen)
  if (params?.limite) searchParams.append('limite', params.limite.toString())
  const qs = searchParams.toString()
  const res = await fetch(`${API_URL}/calidad/scrap${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Error al obtener scrap')
  return res.json()
}

export async function registrarScrap(token: string, data: {
  sku_producto: string
  nombre_producto?: string
  lote_id?: string
  cantidad: number
  motivo?: string
  origen: string
  referencia?: string
}): Promise<{ message: string; scrap_id: string }> {
  const res = await fetch(`${API_URL}/calidad/scrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.detail || 'Error al registrar scrap')
  }
  return res.json()
}

export async function descargarPdfScrap(token: string, fecha?: string, sku?: string): Promise<void> {
  const params = new URLSearchParams()
  if (fecha) params.append('fecha', fecha)
  if (sku) params.append('sku', sku)
  const qs = params.toString()
  const res = await fetch(`${API_URL}/calidad/scrap/pdf${qs ? `?${qs}` : ''}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Error al generar PDF de scrap')
  const blob = await res.blob()
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `reporte_scrap.pdf`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}