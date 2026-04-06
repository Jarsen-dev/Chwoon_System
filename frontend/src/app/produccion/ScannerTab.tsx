'use client'

import { RegistroConMeta } from './page'
import { getFaltanStyle } from './helpers'

interface Props {
  registros:      RegistroConMeta[]
  alertas:        { tipo: string; motivo: string; id: number }[]
  inputValue:     string
  inputRef: React.RefObject<HTMLInputElement | null>
  setAlertas:     React.Dispatch<React.SetStateAction<{ tipo: string; motivo: string; id: number }[]>>
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  handleKeyDown:     (e: React.KeyboardEvent) => void
}

export default function ScannerTab({
  registros, alertas, inputValue,
  inputRef, setAlertas,
  handleInputChange, handleKeyDown
}: Props) {
  return (
    <div className="space-y-5">
      <div className="text-center">
        <h2 className="text-lg font-bold text-blue-700 mb-3 tracking-wide uppercase">
          Escanee el Código del Carrito
        </h2>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="Esperando lectura de código QR..."
          className="w-full max-w-xl text-center text-2xl p-4 border-2 border-blue-400 rounded-lg shadow-inner focus:outline-none focus:ring-4 focus:ring-blue-200 uppercase tracking-widest placeholder:text-gray-300 placeholder:text-lg"
          autoComplete="off"
          autoFocus
        />
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="flex flex-col gap-2">
          {alertas.slice(0, 3).map(alerta => (
            <div key={alerta.id} className="bg-red-50 border-l-4 border-red-500 text-red-700 p-3 rounded flex justify-between items-start">
              <div>
                <p className="font-bold text-sm">🚨 ALERTA: {alerta.tipo}</p>
                <p className="text-sm mt-0.5">{alerta.motivo}</p>
              </div>
              <button
                onClick={() => setAlertas(alertas.filter(a => a.id !== alerta.id))}
                className="text-red-400 hover:text-red-700 font-bold ml-4 text-lg"
              >✖</button>
            </div>
          ))}
        </div>
      )}

      {/* Tabla */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100 border-b border-gray-200">
              {['Hora','Máquina','N° Parte','Carrito','QTY','Total','Meta Plan','Faltan'].map(col => (
                <th key={col} className="p-3 text-center font-semibold text-slate-600 whitespace-nowrap">
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {registros.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-12 text-center">
                  <span className="text-4xl block mb-2">📷</span>
                  <span className="text-gray-400">Esperando escaneo...</span>
                </td>
              </tr>
            ) : (
              registros.map((reg, idx) => (
                <tr
                  key={`${reg.hora}-${reg.numero_parte}-${idx}`}
                  className={`border-b transition-colors ${
                    idx === 0 ? 'bg-blue-50 border-l-4 border-l-blue-500' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className={`p-3 text-center font-mono text-sm ${idx === 0 ? 'text-blue-700 font-semibold' : 'text-slate-500'}`}>
                    {reg.hora}
                  </td>
                  <td className={`p-3 text-center ${idx === 0 ? 'text-slate-800 font-semibold' : 'text-slate-600'}`}>
                    {reg.maquina}
                  </td>
                  <td className={`p-3 text-center font-mono font-bold ${idx === 0 ? 'text-blue-700' : 'text-blue-600'}`}>
                    {reg.numero_parte}
                  </td>
                  <td className="p-3 text-center text-slate-600">#{reg.carrito_numero}</td>
                  <td className={`p-3 text-center font-semibold ${idx === 0 ? 'text-slate-800' : 'text-slate-700'}`}>
                    {reg.qty_bolsa}
                  </td>
                  <td className={`p-3 text-center font-bold ${idx === 0 ? 'text-emerald-700' : 'text-emerald-600'}`}>
                    {reg.total_acumulado}
                  </td>
                  <td className="p-3 text-center text-slate-500">{reg.meta_plan ?? 'N/A'}</td>
                  <td className={`p-3 text-center ${getFaltanStyle(reg.faltan ?? 'N/A')}`}>
                    {reg.faltan === 0 ? '✅ 0' : (reg.faltan ?? 'N/A')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {registros.length > 0 && (
        <p className="text-right text-xs text-gray-400">
          {registros.length} registro(s) en este turno
        </p>
      )}
    </div>
  )
}