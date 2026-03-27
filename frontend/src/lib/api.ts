import { Parte, ColaItem, RegistroProduccion, PlanProduccion, Anomalia } from '@/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Partes
export async function getPartes(): Promise<Parte[]> {
  const res = await fetch(`${API_URL}/partes/`);
  if (!res.ok) throw new Error('Error cargando partes');
  return res.json();
}

export async function createParte(parte: Omit<Parte, 'id'>): Promise<Parte> {
  const res = await fetch(`${API_URL}/partes/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parte),
  });
  if (!res.ok) throw new Error('Error creando parte');
  return res.json();
}

export async function updateParte(numero_parte: string, parte: Partial<Parte>): Promise<Parte> {
  const res = await fetch(`${API_URL}/partes/${numero_parte}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(parte),
  });
  if (!res.ok) throw new Error('Error actualizando parte');
  return res.json();
}

export async function deleteParte(numero_parte: string): Promise<void> {
  const res = await fetch(`${API_URL}/partes/${numero_parte}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Error eliminando parte');
}

// Etiquetas / Cola
export async function getCola(): Promise<ColaItem[]> {
  const res = await fetch(`${API_URL}/etiquetas/cola/`);
  if (!res.ok) throw new Error('Error cargando cola');
  return res.json();
}

export async function agregarACola(item: Omit<ColaItem, 'id' | 'estado'>): Promise<ColaItem> {
  const res = await fetch(`${API_URL}/etiquetas/cola/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error('Error agregando a cola');
  return res.json();
}

export async function generarPDF(): Promise<Blob> {
  const res = await fetch(`${API_URL}/etiquetas/generar/`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Error generando PDF');
  return res.blob();
}

// Producción
export async function getProyeccion(turno: string): Promise<any> {
  const res = await fetch(`${API_URL}/produccion/proyeccion/${turno}`);
  if (!res.ok) throw new Error('Error cargando proyección');
  return res.json();
}

export async function getSaludMaquinas(): Promise<any> {
  const res = await fetch(`${API_URL}/produccion/salud-maquinas`);
  if (!res.ok) throw new Error('Error cargando salud de máquinas');
  return res.json();
}

export async function importarExcelPartes(file: File): Promise<{message: string, count: number}> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_URL}/importar/partes/excel`, {
    method: 'POST',
    body: formData,
  });
  
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.detail || 'Error importando Excel');
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

export async function getRegistros(fecha?: string): Promise<RegistroProduccion[]> {
  const url = new URL(`${API_URL}/produccion/registros/`);
  if (fecha) url.searchParams.append('fecha', fecha);
  
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('Error cargando registros');
  return res.json();
}

export async function getPlanProduccion(): Promise<any[]> {
  const res = await fetch(`${API_URL}/produccion/plan/`);
  if (!res.ok) throw new Error('Error cargando plan de producción');
  return res.json();
}

export async function getAnomalias(limite: number = 10): Promise<Anomalia[]> {
  const res = await fetch(`${API_URL}/produccion/anomalias/?limite=${limite}`)
  if (!res.ok) throw new Error('Error cargando anomalías')
  return res.json()
}