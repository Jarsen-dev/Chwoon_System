'use client';
import { useState } from 'react';

function getLunes(offset = 0): string {
  const now = new Date();
  const day = now.getDay() || 7;
  const lunes = new Date(now);
  lunes.setDate(now.getDate() - (day - 1) + offset * 7);
  return lunes.toISOString().split('T')[0];
}

export default function ReportesTab({ token }: { token: string }) {
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [lunesIso, setLunesIso] = useState(getLunes());

  const handleDescargarDiario = () => {
    window.open(`/finanzas/ventas/reporte-diario/excel?fecha=${fecha}`, '_blank');
  };

  const handleDescargarSemanal = () => {
    // El endpoint de reporte semanal usa el lunes como inicio de semana
    window.open(`/finanzas/ventas/reporte-semanal/excel?fecha_inicio=${lunesIso}`, '_blank');
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
      {/* Reporte Diario */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">📄</span>
          <h3 className="text-lg font-bold text-white">Reporte Diario</h3>
        </div>
        <p className="text-sm text-gray-400 mb-6">Genera el formato oficial CW Reporte Diario con datos de envíos, camiones y facturas del día seleccionado.</p>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400">Fecha del Reporte</label>
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              className="w-full mt-1 p-2 bg-gray-800 border border-gray-700 rounded text-white [color-scheme:dark]"
            />
          </div>
          <button
            onClick={handleDescargarDiario}
            className="w-full bg-emerald-600 hover:bg-emerald-700 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <span>⬇️</span> Descargar Reporte Diario
          </button>
        </div>
      </div>

      {/* Reporte Semanal */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-2xl">📊</span>
          <h3 className="text-lg font-bold text-white">Reporte Semanal</h3>
        </div>
        <p className="text-sm text-gray-400 mb-6">Acumulado de la semana seleccionada — envíos, cumplimiento por día y SKU.</p>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-400">Semana (selecciona el Lunes)</label>
            <input
              type="date"
              value={lunesIso}
              onChange={e => setLunesIso(e.target.value)}
              className="w-full mt-1 p-2 bg-gray-800 border border-gray-700 rounded text-white [color-scheme:dark]"
            />
            <div className="flex gap-2 mt-2">
              <button onClick={() => setLunesIso(getLunes(-1))} className="text-xs text-gray-500 hover:text-gray-300 underline transition-colors">
                ← Semana anterior
              </button>
              <button onClick={() => setLunesIso(getLunes(0))} className="text-xs text-gray-500 hover:text-gray-300 underline transition-colors">
                Semana actual
              </button>
            </div>
          </div>
          <button
            onClick={handleDescargarSemanal}
            className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <span>⬇️</span> Descargar Reporte Semanal
          </button>
        </div>
      </div>
    </div>
  );
}
