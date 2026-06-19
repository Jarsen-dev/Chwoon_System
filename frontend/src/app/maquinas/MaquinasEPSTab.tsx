'use client';

import { Card, Badge } from '@/components/ui';
import type { MaquinaEstado } from '@/types';

interface Props {
  maquinas: MaquinaEstado[];
  onRefresh: () => void;
}

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

export default function MaquinasEPSTab({ maquinas, onRefresh }: Props) {
  if (maquinas.length === 0) {
    return (
      <div className="text-center text-gray-400 py-20">
        <p className="text-lg">No hay máquinas registradas todavía.</p>
        <button
          onClick={onRefresh}
          className="mt-4 bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          🔄 Recargar
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Estado en tiempo real — Turno actual</h2>
        <button
          onClick={onRefresh}
          className="bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
        >
          🔄 Recargar
        </button>
      </div>

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
                {estadoBadge(m)}
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
    </div>
  );
}
