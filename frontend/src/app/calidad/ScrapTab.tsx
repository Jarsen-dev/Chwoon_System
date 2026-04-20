'use client';

import { useState, useEffect } from 'react';
import { getScrap, registrarScrap, descargarPdfScrap } from '@/lib/api';
import type { RegistroScrapItem } from '@/types';

interface Props {
  token: string;
}

export default function ScrapTab({ token }: Props) {
  const [registros, setRegistros] = useState<RegistroScrapItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Filtros
  const [filtroFecha, setFiltroFecha] = useState('');
  const [filtroSku, setFiltroSku] = useState('');
  const [filtroOrigen, setFiltroOrigen] = useState('');

  // Modal crear
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({
    sku_producto: '',
    nombre_producto: '',
    lote_id: '',
    cantidad: '',
    motivo: '',
    origen: 'Inventario',
    referencia: '',
  });

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getScrap(token, {
        fecha: filtroFecha || undefined,
        sku: filtroSku || undefined,
        origen: filtroOrigen || undefined,
        limite: 200,
      });
      setRegistros(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const aplicarFiltros = () => fetchData();

  const limpiarFiltros = () => {
    setFiltroFecha('');
    setFiltroSku('');
    setFiltroOrigen('');
    setTimeout(fetchData, 0);
  };

  const handleCrear = async () => {
    if (!formData.sku_producto || !formData.cantidad) {
      setError('SKU y cantidad son requeridos');
      return;
    }
    try {
      setLoading(true);
      const res = await registrarScrap(token, {
        sku_producto: formData.sku_producto,
        nombre_producto: formData.nombre_producto || undefined,
        lote_id: formData.lote_id || undefined,
        cantidad: parseFloat(formData.cantidad),
        motivo: formData.motivo || undefined,
        origen: formData.origen,
        referencia: formData.referencia || undefined,
      });
      setSuccess(`✅ Scrap registrado: ${res.scrap_id}`);
      setShowModal(false);
      setFormData({
        sku_producto: '', nombre_producto: '', lote_id: '',
        cantidad: '', motivo: '', origen: 'Inventario', referencia: '',
      });
      fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDescargarPdf = async () => {
    try {
      await descargarPdfScrap(token, filtroFecha || undefined, filtroSku || undefined);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const formatFecha = (fecha?: string) => {
    if (!fecha) return 'N/A';
    try {
      return new Date(fecha).toLocaleString('es-MX', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch {
      return fecha;
    }
  };

  const totalScrap = registros.reduce((acc, r) => acc + r.cantidad, 0);

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-xl p-4 flex items-center justify-between">
          <p className="text-red-400">❌ {error}</p>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-300">✕</button>
        </div>
      )}
      {success && (
        <div className="bg-green-900/30 border border-green-500/50 rounded-xl p-4 flex items-center justify-between">
          <p className="text-green-400">{success}</p>
          <button onClick={() => setSuccess('')} className="text-green-400 hover:text-green-300">✕</button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">🗑️ Reporte de Scrap</h2>
          <p className="text-gray-400 text-sm mt-1">Registro unificado de scrap (producción, inventario, devoluciones)</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleDescargarPdf}
            className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            📄 PDF
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            + Registrar Scrap
          </button>
          <button
            onClick={fetchData}
            className="bg-cyan-600 hover:bg-cyan-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-gray-900 rounded-xl border border-gray-700 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <input
            type="date"
            value={filtroFecha}
            onChange={(e) => setFiltroFecha(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
          />
          <input
            value={filtroSku}
            onChange={(e) => setFiltroSku(e.target.value.toUpperCase())}
            placeholder="Filtrar por SKU..."
            className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white
                       placeholder-gray-500 focus:outline-none focus:border-red-500"
          />
          <select
            value={filtroOrigen}
            onChange={(e) => setFiltroOrigen(e.target.value)}
            className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
          >
            <option value="">Todos los orígenes</option>
            <option value="Produccion">Producción</option>
            <option value="Inventario">Inventario</option>
            <option value="Devolucion">Devolución</option>
          </select>
          <div className="flex gap-2">
            <button onClick={aplicarFiltros} className="flex-1 bg-red-600 hover:bg-red-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors">
              🔍 Filtrar
            </button>
            <button onClick={limpiarFiltros} className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg text-sm transition-colors">
              ✕
            </button>
          </div>
        </div>
      </div>

      {/* Resumen */}
      <div className="bg-gray-900 rounded-xl border border-red-500/30 p-4 flex items-center justify-between">
        <span className="text-sm text-gray-400">{registros.length} registros encontrados</span>
        <span className="text-lg font-bold text-red-400">Total Scrap: {totalScrap.toLocaleString()}</span>
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-red-400" />
        </div>
      ) : (
        <div className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden">
          <div className="overflow-x-auto max-h-[450px] overflow-y-auto">
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-800 z-10">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400">Fecha</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400">ID</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400">SKU</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400">Lote</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400">Cantidad</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400">Origen</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400">Motivo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400">Registrado por</th>
                </tr>
              </thead>
              <tbody>
                {registros.map((reg) => (
                  <tr key={reg.id} className="border-t border-gray-800 hover:bg-gray-800/50">
                    <td className="px-4 py-3 text-xs text-gray-400">{formatFecha(reg.fecha)}</td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-300">{reg.scrap_id}</td>
                    <td className="px-4 py-3 text-xs font-mono text-white">{reg.sku_producto}</td>
                    <td className="px-4 py-3 text-xs font-mono text-gray-400">{reg.lote_id || '—'}</td>
                    <td className="px-4 py-3 text-xs text-right font-bold text-red-400">{reg.cantidad}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                        reg.origen === 'Produccion' ? 'bg-blue-900/40 text-blue-400' :
                        reg.origen === 'Inventario' ? 'bg-orange-900/40 text-orange-400' :
                        'bg-yellow-900/40 text-yellow-400'
                      }`}>
                        {reg.origen}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400 max-w-[150px] truncate">{reg.motivo || '—'}</td>
                    <td className="px-4 py-3 text-xs text-gray-400">{reg.registrado_por || '—'}</td>
                  </tr>
                ))}
                {registros.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                      No se encontraron registros de scrap
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Crear Scrap */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-700 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-red-400">🗑️ Registrar Scrap</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-300 mb-1">SKU *</label>
                <input
                  value={formData.sku_producto}
                  onChange={(e) => setFormData(p => ({ ...p, sku_producto: e.target.value.toUpperCase() }))}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                  placeholder="SKU del producto..."
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Nombre del producto</label>
                <input
                  value={formData.nombre_producto}
                  onChange={(e) => setFormData(p => ({ ...p, nombre_producto: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                  placeholder="Nombre..."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Lote ID</label>
                  <input
                    value={formData.lote_id}
                    onChange={(e) => setFormData(p => ({ ...p, lote_id: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Cantidad *</label>
                  <input
                    type="number"
                    value={formData.cantidad}
                    onChange={(e) => setFormData(p => ({ ...p, cantidad: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Origen</label>
                  <select
                    value={formData.origen}
                    onChange={(e) => setFormData(p => ({ ...p, origen: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                  >
                    <option value="Produccion">Producción</option>
                    <option value="Inventario">Inventario</option>
                    <option value="Devolucion">Devolución</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-300 mb-1">Referencia</label>
                  <input
                    value={formData.referencia}
                    onChange={(e) => setFormData(p => ({ ...p, referencia: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-red-500"
                    placeholder="OP / OC / ID..."
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">Motivo</label>
                <textarea
                  value={formData.motivo}
                  onChange={(e) => setFormData(p => ({ ...p, motivo: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white
                             placeholder-gray-500 focus:outline-none focus:border-red-500 resize-y"
                  rows={2}
                  placeholder="Motivo del scrap..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCrear}
                disabled={!formData.sku_producto || !formData.cantidad}
                className="bg-red-600 hover:bg-red-700 px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                Registrar Scrap
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}