'use client';

import { useState } from 'react';
import { Card, Badge, Modal, FormInput, Button } from '@/components/ui';
import { crearMaquina, actualizarMaquina, getMaquinaEventos } from '@/lib/api';
import type { MaquinaEstado, MaquinaEvento } from '@/types';

interface Props {
  maquinas: MaquinaEstado[];
  onRefresh: () => void;
  token: string;
  isAdmin: boolean;
}

interface FormState {
  codigo: string;
  nombre: string;
  linea: string;
  tipo: string;
  marca_plc: string;
  ip_hmi: string;
  umbral_incidencia_seg: string;
}

const FORM_VACIO: FormState = {
  codigo: '', nombre: '', linea: '', tipo: '', marca_plc: '', ip_hmi: '',
  umbral_incidencia_seg: '8',
};

function estadoBadge(m: MaquinaEstado) {
  if (m.incidencias_activas && m.incidencias_activas.length > 0) {
    return <Badge variant="error">⚠️ Incidencia</Badge>;
  }
  if (m.estado_actual === 'AUTO') return <Badge variant="success">▶️ AUTO</Badge>;
  if (m.estado_actual === 'MANUAL') return <Badge variant="warning">✋ MANUAL</Badge>;
  return <Badge variant="muted">— Sin dato</Badge>;
}

function formatoHora(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatoFechaHora(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('es-MX', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function MaquinasEPSTab({ maquinas, onRefresh, token, isAdmin }: Props) {
  const [modalAbierto, setModalAbierto] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  // Modal de historial de incidencias por máquina
  const [incMaquina, setIncMaquina] = useState<MaquinaEstado | null>(null);
  const [incEventos, setIncEventos] = useState<MaquinaEvento[]>([]);
  const [incCargando, setIncCargando] = useState(false);

  const abrirIncidencias = async (m: MaquinaEstado) => {
    setIncMaquina(m);
    setIncEventos([]);
    setIncCargando(true);
    try {
      const data = await getMaquinaEventos(token, m.codigo, 100, 'INCIDENCIA');
      setIncEventos(data);
    } catch {
      setIncEventos([]);
    } finally {
      setIncCargando(false);
    }
  };

  const abrirAlta = () => {
    setEditandoId(null);
    setForm(FORM_VACIO);
    setError('');
    setModalAbierto(true);
  };

  const abrirEdicion = (m: MaquinaEstado) => {
    setEditandoId(m.id);
    setForm({
      codigo: m.codigo,
      nombre: m.nombre,
      linea: m.linea ?? '',
      tipo: m.tipo ?? '',
      marca_plc: m.marca_plc ?? '',
      ip_hmi: m.ip_hmi ?? '',
      umbral_incidencia_seg: String(m.umbral_incidencia_seg ?? 8),
    });
    setError('');
    setModalAbierto(true);
  };

  const set = (campo: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [campo]: e.target.value }));

  const guardar = async () => {
    if (!form.codigo.trim() || !form.nombre.trim()) {
      setError('Código y nombre son obligatorios.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      const umbral = parseInt(form.umbral_incidencia_seg, 10);
      if (editandoId !== null) {
        await actualizarMaquina(token, editandoId, {
          nombre: form.nombre.trim(),
          linea: form.linea.trim() || undefined,
          tipo: form.tipo.trim() || undefined,
          marca_plc: form.marca_plc.trim() || undefined,
          ip_hmi: form.ip_hmi.trim() || undefined,
          umbral_incidencia_seg: isNaN(umbral) ? undefined : umbral,
        });
      } else {
        await crearMaquina(token, {
          codigo: form.codigo.trim(),
          nombre: form.nombre.trim(),
          linea: form.linea.trim() || undefined,
          tipo: form.tipo.trim() || undefined,
          marca_plc: form.marca_plc.trim() || undefined,
          ip_hmi: form.ip_hmi.trim() || undefined,
          umbral_incidencia_seg: isNaN(umbral) ? undefined : umbral,
        });
      }
      setModalAbierto(false);
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const desactivar = async (m: MaquinaEstado) => {
    if (!confirm(`¿Desactivar la máquina ${m.nombre} (${m.codigo})? Dejará de mostrarse, pero su historial se conserva.`)) return;
    try {
      await actualizarMaquina(token, m.id, { activa: false });
      onRefresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error al desactivar.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Estado en tiempo real — Turno actual</h2>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button
              onClick={abrirAlta}
              className="bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            >
              ➕ Agregar máquina
            </button>
          )}
          <button
            onClick={onRefresh}
            className="bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
          >
            🔄 Recargar
          </button>
        </div>
      </div>

      {maquinas.length === 0 ? (
        <div className="text-center text-gray-400 py-20">
          <p className="text-lg">No hay máquinas registradas todavía.</p>
          {isAdmin && (
            <button
              onClick={abrirAlta}
              className="mt-4 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              ➕ Agregar la primera máquina
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {maquinas.map((m) => {
            const meta = m.meta_h ?? 0;
            const piezas = m.piezas_turno ?? 0;
            const pct = meta > 0 ? Math.min(100, Math.round((piezas / meta) * 100)) : 0;

            return (
              <Card key={m.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-white">{m.nombre}</h3>
                    <p className="text-xs text-gray-500">{m.codigo}{m.linea ? ` · ${m.linea}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {estadoBadge(m)}
                    <button
                      onClick={() => abrirIncidencias(m)}
                      title="Historial de incidencias"
                      className="text-gray-400 hover:text-white text-sm transition-colors"
                    >
                      📋
                    </button>
                    {isAdmin && (
                      <>
                        <button
                          onClick={() => abrirEdicion(m)}
                          title="Editar"
                          className="text-gray-400 hover:text-white text-sm transition-colors"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => desactivar(m)}
                          title="Desactivar"
                          className="text-gray-400 hover:text-red-400 text-sm transition-colors"
                        >
                          🗑️
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Avance vs meta */}
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Avance del turno</span>
                    <span className="font-semibold text-white">
                      {piezas}{meta > 0 ? ` / ${meta}` : ''} pzas
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-gray-800 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500' : 'bg-red-500'}`}
                      style={{ width: `${meta > 0 ? pct : 0}%` }}
                    />
                  </div>
                  {meta > 0 && <p className="text-right text-xs text-gray-500 mt-0.5">{pct}%</p>}
                </div>

                {/* Telemetría */}
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-gray-800/60 py-2">
                    <p className="text-xs text-gray-500">Counter</p>
                    <p className="font-bold text-white">{m.counter ?? '—'}</p>
                  </div>
                  <div className="rounded-lg bg-gray-800/60 py-2">
                    <p className="text-xs text-gray-500">Paso</p>
                    <p className="font-bold text-white">{m.process_no ?? '—'}</p>
                  </div>
                  <div className="rounded-lg bg-gray-800/60 py-2">
                    <p className="text-xs text-gray-500">Meta/H</p>
                    <p className="font-bold text-white">{m.meta_h ?? '—'}</p>
                  </div>
                </div>

                {/* Incidencias activas */}
                {m.incidencias_activas && m.incidencias_activas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.incidencias_activas.map((inc, i) => (
                      <Badge key={i} variant="error">{inc}</Badge>
                    ))}
                  </div>
                )}

                <p className="text-xs text-gray-600 mt-auto">
                  Última actualización: {formatoHora(m.ultima_actualizacion)}
                </p>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de alta / edición */}
      <Modal
        open={modalAbierto}
        onClose={() => setModalAbierto(false)}
        title={editandoId !== null ? 'Editar máquina' : 'Agregar máquina'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalAbierto(false)}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <FormInput
            label="Código *"
            value={form.codigo}
            onChange={set('codigo')}
            placeholder="SHM-1234VS"
            disabled={editandoId !== null}
          />
          <FormInput label="Nombre *" value={form.nombre} onChange={set('nombre')} placeholder="Sunghoon SHM-1234VS" />
          <FormInput label="Línea" value={form.linea} onChange={set('linea')} placeholder="L2 / R1 / …" />
          <FormInput label="Tipo" value={form.tipo} onChange={set('tipo')} placeholder="EPS / EPP / INYECCION" />
          <FormInput label="Marca PLC" value={form.marca_plc} onChange={set('marca_plc')} placeholder="LS XBM" />
          <FormInput label="IP HMI" value={form.ip_hmi} onChange={set('ip_hmi')} placeholder="192.168.0.132" />
          <FormInput
            label="Umbral incidencia (seg)"
            type="number"
            value={form.umbral_incidencia_seg}
            onChange={set('umbral_incidencia_seg')}
            placeholder="8"
          />
        </div>
        {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      </Modal>

      {/* Modal de historial de incidencias */}
      <Modal
        open={incMaquina !== null}
        onClose={() => setIncMaquina(null)}
        title={incMaquina ? `Incidencias — ${incMaquina.nombre}` : 'Incidencias'}
        footer={
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setIncMaquina(null)}>Cerrar</Button>
          </div>
        }
      >
        {incCargando ? (
          <p className="text-sm text-gray-400 py-6 text-center">Cargando incidencias…</p>
        ) : incEventos.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">Sin incidencias registradas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-800">
                  <th className="py-2 pr-3">Fecha/hora</th>
                  <th className="py-2 pr-3">Incidencia</th>
                  <th className="py-2 pr-3">Evento</th>
                  <th className="py-2 text-right">Duración</th>
                </tr>
              </thead>
              <tbody>
                {incEventos.map((ev) => {
                  const esFin = ev.tipo_evento === 'INCIDENCIA_FIN';
                  const dur = ev.metadata?.duracion_seg;
                  return (
                    <tr key={ev.id} className="border-b border-gray-800/50">
                      <td className="py-2 pr-3 text-gray-300 whitespace-nowrap">{formatoFechaHora(ev.created_at)}</td>
                      <td className="py-2 pr-3 text-white">{ev.metadata?.incidencia ?? '—'}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={esFin ? 'muted' : 'error'}>
                          {esFin ? 'Fin' : 'Inicio'}
                        </Badge>
                      </td>
                      <td className="py-2 text-right text-gray-300 whitespace-nowrap">
                        {dur != null ? `${dur}s` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Modal>
    </div>
  );
}
