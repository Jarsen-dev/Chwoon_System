'use client';

import { useState, useEffect } from 'react';
import {
  getUbicacionesEPS,
  getInventarioEPS,
  ingresarCarritoEPS,
  getHistorialMovimientosEPS,
} from '@/lib/api';
import { UbicacionAlmacen, LoteInventario } from '@/types';

interface Props {
  token: string;
}

type Vista = 'inventario' | 'ingresar' | 'historial';

export default function EPSTab({ token }: Props) {
  const [vista, setVista] = useState<Vista>('inventario');
  const [ubicaciones, setUbicaciones] = useState<UbicacionAlmacen[]>([]);
  const [inventario, setInventario] = useState<LoteInventario[]>([]);
  const [historial, setHistorial] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notif, setNotif] = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);

  // Form ingreso
  const [formIngreso, setFormIngreso] = useState({
    op_id: '',
    carrito_id: '',
    ubicacion_id: '',
    ubicacion_nombre: '',
  });

  const mostrarNotif = (msg: string, tipo: 'ok' | 'err' = 'ok') => {
    setNotif({ msg, tipo });
    setTimeout(() => setNotif(null), 5000);
  };

  const cargar = async () => {
    try {
      setLoading(true);
      const ubs = await getUbicacionesEPS(token);
      setUbicaciones(ubs);

      if (vista === 'inventario') {
        const inv = await getInventarioEPS(token);
        setInventario(inv);
      } else if (vista === 'historial') {
        const hist = await getHistorialMovimientosEPS(token);
        setHistorial(hist);
      }
    } catch (e: any) {
      mostrarNotif(e.message, 'err');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, [vista]);

  const handleIngresar = async () => {
    try {
      if (!formIngreso.op_id || !formIngreso.carrito_id || !formIngreso.ubicacion_id) {
        mostrarNotif('Complete todos los campos', 'err');
        return;
      }
      const res = await ingresarCarritoEPS(token, {
        op_id: formIngreso.op_id,
        carrito_id: formIngreso.carrito_id,
        ubicacion_id: parseInt(formIngreso.ubicacion_id),
        ubicacion_nombre: formIngreso.ubicacion_nombre,
      });
      mostrarNotif(`Carrito ingresado. Traslado: ${res.traslado_id}`);
      setFormIngreso({ op_id: '', carrito_id: '', ubicacion_id: '', ubicacion_nombre: '' });
      setVista('inventario');
    } catch (e: any) {
      mostrarNotif(e.message, 'err');
    }
  };

  return (
    <div className="space-y-4">
      {notif && (
        <div className={`p-3 rounded-lg text-sm font-medium ${notif.tipo === 'ok' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
          {notif.msg}
        </div>
      )}

      {/* Selector de vista */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">🏭 Almacén de EPS</h2>
        <div className="flex gap-2">
          {(['inventario', 'ingresar', 'historial'] as Vista[]).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                vista === v ? 'bg-orange-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
              }`}
            >
              {v === 'inventario' ? '📦 Inventario EPS' : v === 'ingresar' ? '➕ Ingresar Carrito' : '📜 Historial'}
            </button>
          ))}
        </div>
      </div>

      {loading && vista !== 'ingresar' ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-400" />
        </div>
      ) : (
        <>
          {/* VISTA: Inventario EPS */}
          {vista === 'inventario' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-800 sticky top-0">
                    <tr>
                      <th className="text-left p-3 text-gray-400">Lote ID</th>
                      <th className="text-left p-3 text-gray-400">SKU</th>
                      <th className="text-left p-3 text-gray-400">Producto</th>
                      <th className="text-right p-3 text-gray-400">Cantidad</th>
                      <th className="text-left p-3 text-gray-400">Ubicación</th>
                      <th className="text-left p-3 text-gray-400">OP Origen</th>
                      <th className="text-left p-3 text-gray-400">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {inventario.map((lote) => (
                      <tr key={lote.id} className="hover:bg-gray-800/50">
                        <td className="p-3 font-mono text-orange-400 text-xs">{lote.lote_id}</td>
                        <td className="p-3">{lote.sku_producto}</td>
                        <td className="p-3 text-gray-300">{lote.nombre_producto}</td>
                        <td className="p-3 text-right font-bold">{lote.cantidad_actual}</td>
                        <td className="p-3 text-gray-300">{lote.nombre_ubicacion}</td>
                        <td className="p-3 text-xs text-gray-400">{lote.op_origen || '-'}</td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400">
                            {lote.estado_calidad}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {inventario.length === 0 && (
                      <tr><td colSpan={7} className="p-8 text-center text-gray-500">Sin inventario en Almacén EPS</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="bg-gray-800 px-4 py-2 text-sm text-gray-400">
                Total: {inventario.length} lotes | Stock: {inventario.reduce((s, l) => s + l.cantidad_actual, 0).toLocaleString('es-MX')} items
              </div>
            </div>
          )}

          {/* VISTA: Ingresar Carrito */}
          {vista === 'ingresar' && (
            <div className="max-w-lg mx-auto">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                <h3 className="text-lg font-bold mb-4">➕ Ingresar Carrito desde Secado</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-gray-400">ID Orden de Producción</label>
                    <input
                      type="text"
                      value={formIngreso.op_id}
                      onChange={(e) => setFormIngreso(f => ({ ...f, op_id: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1"
                      placeholder="Ej: OP-001"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-400">ID Carrito (Lote)</label>
                    <input
                      type="text"
                      value={formIngreso.carrito_id}
                      onChange={(e) => setFormIngreso(f => ({ ...f, carrito_id: e.target.value }))}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1"
                      placeholder="Escanee o ingrese el ID del carrito"
                    />
                  </div>
                  <div>
                    <label className="text-sm text-gray-400">Ubicación Destino</label>
                    <select
                      value={formIngreso.ubicacion_id}
                      onChange={(e) => {
                        const ub = ubicaciones.find(u => u.id === parseInt(e.target.value));
                        setFormIngreso(f => ({
                          ...f,
                          ubicacion_id: e.target.value,
                          ubicacion_nombre: ub?.nombre || '',
                        }));
                      }}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white mt-1"
                    >
                      <option value="">Seleccionar ubicación...</option>
                      {ubicaciones.map(ub => (
                        <option key={ub.id} value={ub.id}>{ub.nombre}</option>
                      ))}
                    </select>
                    {ubicaciones.length === 0 && (
                      <p className="text-xs text-yellow-400 mt-1">⚠️ No hay sub-ubicaciones en ALMACEN EPS. Créelas en Ubicaciones.</p>
                    )}
                  </div>
                  <button
                    onClick={handleIngresar}
                    disabled={!formIngreso.op_id || !formIngreso.carrito_id || !formIngreso.ubicacion_id}
                    className="w-full bg-orange-600 hover:bg-orange-700 disabled:opacity-50 px-4 py-3 rounded-lg text-sm font-medium transition-colors"
                  >
                    📥 Ingresar al Almacén EPS
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* VISTA: Historial */}
          {vista === 'historial' && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-800 sticky top-0">
                    <tr>
                      <th className="text-left p-3 text-gray-400">Fecha</th>
                      <th className="text-left p-3 text-gray-400">ID Traslado</th>
                      <th className="text-left p-3 text-gray-400">ID Carrito</th>
                      <th className="text-left p-3 text-gray-400">SKU</th>
                      <th className="text-right p-3 text-gray-400">Cantidad</th>
                      <th className="text-left p-3 text-gray-400">Origen</th>
                      <th className="text-left p-3 text-gray-400">Destino</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {historial.map((mov, i) => (
                      <tr key={i} className="hover:bg-gray-800/50">
                        <td className="p-3 text-xs text-gray-400">
                          {mov.fecha ? new Date(mov.fecha).toLocaleString('es-MX') : '-'}
                        </td>
                        <td className="p-3 font-mono text-orange-400 text-xs">{mov.id_traslado || '-'}</td>
                        <td className="p-3 text-xs">{mov.id_carrito}</td>
                        <td className="p-3">{mov.sku}</td>
                        <td className="p-3 text-right font-bold">{mov.cantidad}</td>
                        <td className="p-3 text-gray-300">{mov.origen || '-'}</td>
                        <td className="p-3 text-gray-300">{mov.destino || '-'}</td>
                      </tr>
                    ))}
                    {historial.length === 0 && (
                      <tr><td colSpan={7} className="p-8 text-center text-gray-500">Sin historial de movimientos EPS</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}