import { 
  InventarioItem, 
  ColaItem, 
  ColaItemCreate,
  RegistroProduccion, 
  PlanItem, 
  Anomalia 
} from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// ==========================================
// INVENTARIO PLANTA
// ==========================================
export async function getInventario(): Promise<InventarioItem[]> {
  const res = await fetch(`${API_URL}/inventario/`);
  if (!res.ok) throw new Error('Error cargando inventario');
  return res.json();
}

export async function createInventario(
  item: InventarioItem
): Promise<InventarioItem> {
  const res = await fetch(`${API_URL}/inventario/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error('Error creando item en inventario');
  return res.json();
}

export async function updateInventario(
  codigo: string,
  item: Partial<InventarioItem>
): Promise<InventarioItem> {
  const res = await fetch(`${API_URL}/inventario/${codigo}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error('Error actualizando item en inventario');
  return res.json();
}

export async function deleteInventario(codigo: string): Promise<void> {
  const res = await fetch(`${API_URL}/inventario/${codigo}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Error eliminando item del inventario');
}

export async function importarExcelInventario(
  file: File
): Promise<{ message: string; count: number }> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_URL}/inventario/importar-excel`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || 'Error importando Excel de inventario');
  }
  return res.json();
}

// ==========================================
// COLA DE IMPRESIÓN
// ==========================================
export async function getCola(): Promise<ColaItem[]> {
  const res = await fetch(`${API_URL}/etiquetas/cola/`);
  if (!res.ok) throw new Error('Error cargando cola');
  return res.json();
}

export async function agregarACola(
  item: ColaItemCreate
): Promise<ColaItem> {
  const res = await fetch(`${API_URL}/etiquetas/cola/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || 'Error agregando a cola');
  }
  return res.json();
}

export async function eliminarDeCola(item_id: number): Promise<void> {
  const res = await fetch(`${API_URL}/etiquetas/cola/${item_id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Error eliminando item de la cola');
}

export async function limpiarCola(): Promise<void> {
  const res = await fetch(`${API_URL}/etiquetas/cola/limpiar/`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Error limpiando la cola');
}

export async function generarPDF(): Promise<Blob> {
  const res = await fetch(`${API_URL}/etiquetas/generar/`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Error generando PDF');
  return res.blob();
}

// ==========================================
// PLAN DE PRODUCCIÓN
// ==========================================
export async function getPlanProduccion(): Promise<PlanItem[]> {
  const res = await fetch(`${API_URL}/plan/`);
  if (!res.ok) throw new Error('Error cargando plan de producción');
  return res.json();
}

export async function importarPlanExcel(
  file: File
): Promise<{ 
  message:           string
  partes_importadas: number
  etiquetas_en_cola: number
  errores:           string[]
}> {
  const formData = new FormData()
  formData.append('file', file)
  // ← ya no se envía turno

  const res = await fetch(`${API_URL}/plan/importar-excel`, {
    method: 'POST',
    body:   formData
  })

  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.detail || 'Error importando plan Excel')
  }
  return res.json()
}

export async function eliminarDelPlan(numero_parte: string): Promise<void> {
  const res = await fetch(`${API_URL}/plan/${encodeURIComponent(numero_parte)}`, {
    method: 'DELETE'
  })
  if (!res.ok) throw new Error('Error eliminando del plan')
}

// ==========================================
// PRODUCCIÓN
// ==========================================
export async function getRegistros(
  fecha?: string
): Promise<RegistroProduccion[]> {
  const url = new URL(`${API_URL}/produccion/registros/`);
  if (fecha) url.searchParams.append('fecha', fecha);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Error cargando registros');
  return res.json();
}

export async function getProyeccion(turno: string): Promise<any> {
  const res = await fetch(`${API_URL}/produccion/proyeccion/${turno}`);
  if (!res.ok) throw new Error('Error cargando proyección');
  return res.json();
}

export async function getSaludMaquinas(): Promise<any> {
  const res = await fetch(`${API_URL}/produccion/salud-maquinas/`);
  if (!res.ok) throw new Error('Error cargando salud de máquinas');
  return res.json();
}

export async function getAnomalias(limite: number = 10): Promise<Anomalia[]> {
  const res = await fetch(
    `${API_URL}/produccion/anomalias/?limite=${limite}`
  );
  if (!res.ok) throw new Error('Error cargando anomalías');
  return res.json();
}