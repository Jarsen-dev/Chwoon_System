'use client'

interface Props {
  planes: any[]
}

export default function PlanTab({ planes }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-slate-700">Gestor de Plan de Producción</h2>
        <div className="space-x-2">
          <button className="bg-purple-600 text-white px-4 py-2 rounded font-medium hover:bg-purple-700 transition">
            📥 Importar Excel
          </button>
          <button className="bg-blue-600 text-white px-4 py-2 rounded font-medium hover:bg-blue-700 transition">
            🤖 Sugerir por IA
          </button>
        </div>
      </div>
      <div className="overflow-x-auto border rounded-lg">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-slate-700 border-b">
            <tr>
              {['N° Parte','Turno Objetivo','Meta (Piezas)','Estado'].map(col => (
                <th key={col} className="p-3 text-center font-semibold">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {planes.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-12 text-center">
                  <span className="text-4xl block mb-2">📋</span>
                  <span className="text-gray-400">No hay un plan activo.</span>
                </td>
              </tr>
            ) : (
              planes.map((p, idx) => (
                <tr key={idx} className="border-t hover:bg-gray-50 transition">
                  <td className="p-3 text-center font-mono font-medium text-blue-800">{p.numero_parte}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                      p.turno_objetivo === 'Día' ? 'bg-yellow-100 text-yellow-800' : 'bg-indigo-100 text-indigo-800'
                    }`}>{p.turno_objetivo}</span>
                  </td>
                  <td className="p-3 text-center font-bold text-slate-700">{p.meta_piezas}</td>
                  <td className="p-3 text-center">
                    <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-bold">
                      ⏸️ Pendiente
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}