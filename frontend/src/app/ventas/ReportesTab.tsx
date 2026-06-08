'use client';
import { useState } from 'react';

export default function ReportesTab({ token }: { token: string }) {
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);

  const handleDescargarDiario = () => {
    // Al abrir esta URL, el backend devuelve el .xlsx
    window.open(`/api/finanzas/ventas/reportes/excel-diario?fecha=${fecha}`, '_blank');
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-md">
      <h3 className="text-lg font-bold text-white mb-4">📑 Descargar Reporte de Ventas</h3>
      <p className="text-sm text-gray-400 mb-6">Genera automáticamente el formato oficial CW Reporte Diario con datos de envíos, camiones y facturas.</p>
      
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
        
        <button onClick={handleDescargarDiario} className="w-full bg-emerald-600 hover:bg-emerald-700 py-3 rounded-lg font-bold flex items-center justify-center gap-2">
          <span>⬇️</span> Descargar Reporte (Excel)
        </button>
      </div>
    </div>
  );
}