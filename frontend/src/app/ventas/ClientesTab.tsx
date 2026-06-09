'use client';

import { useState, useEffect, useCallback } from 'react';
import { getClientes, crearCliente, actualizarCliente, eliminarCliente, getClienteEventos, registrarClienteEvento } from '@/lib/api';
import type { Cliente, ClienteEvento } from '@/types';

interface Props { token: string }

type ViewMode = 'catalogo' | 'ranking';

const ESTATUS_COLORS: Record<string, string> = {
  Activo:   'bg-green-500/20 text-green-400 border-green-500/30',
  VIP:      'bg-amber-500/20 text-amber-400 border-amber-500/30',
  Inactivo: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const INCIDENCIAS = [
  { label: 'Pago Tardío',          impacto: -10 },
  { label: 'Cancelación de Pedido', impacto: -15 },
  { label: 'Reclamo de Calidad',    impacto: -12 },
  { label: 'Devolución',            impacto: -8  },
  { label: 'Compra Frecuente',      impacto:  5  },
  { label: 'Volumen Alto',          impacto:  8  },
  { label: 'Otro',                  impacto: -5  },
];

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 80 ? 'text-green-400 bg-green-500/15 border-green-500/30'
              : score >= 60 ? 'text-yellow-400 bg-yellow-500/15 border-yellow-500/30'
              : 'text-red-400 bg-red-500/15 border-red-500/30';
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${color}`}>
      {score.toFixed(0)}
    </span>
  );
}

const BLANK_FORM = {
  razon_social: '',
  rfc: '',
  contacto_nombre: '',
  contacto_email: '',
  contacto_telefono: '',
  direccion: '',
  condiciones_pago: '30 días',
  dias_credito: '30',
  estatus: 'Activo',
  notas: '',
};

export default function ClientesTab({ token }: Props) {
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('catalogo');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Modals
  const [showForm, setShowForm] = useState(false);
  const [editCliente, setEditCliente] = useState<Cliente | null>(null);
  const [showDetalle, setShowDetalle] = useState(false);
  const [detalleCliente, setDetalleCliente] = useState<Cliente | null>(null);
  const [eventos, setEventos] = useState<ClienteEvento[]>([]);
  const [loadingEventos, setLoadingEventos] = useState(false);
  const [showIncidencia, setShowIncidencia] = useState(false);
  const [incCliente, setIncCliente] = useState<Cliente | null>(null);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteCliente, setDeleteCliente] = useState<Cliente | null>(null);

  // Form
  const [form, setForm] = useState(BLANK_FORM);
  const [saving, setSaving] = useState(false);

  // Incidencia form
  const [incTipo, setIncTipo] = useState(INCIDENCIAS[0].label);
  const [incDesc, setIncDesc] = useState('');
  const [incRef, setIncRef] = useState('');
  const [submittingInc, setSubmittingInc] = useState(false);

  const fetchClientes = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getClientes(token);
      setClientes(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchClientes(); }, [fetchClientes]);

  const clearMsgs = () => { setError(''); setSuccess(''); };

  const openCreate = () => {
    setEditCliente(null);
    setForm(BLANK_FORM);
    setShowForm(true);
  };

  const openEdit = (c: Cliente) => {
    setEditCliente(c);
    setForm({
      razon_social: c.razon_social,
      rfc: c.rfc || '',
      contacto_nombre: c.contacto_nombre || '',
      contacto_email: c.contacto_email || '',
      contacto_telefono: c.contacto_telefono || '',
      direccion: c.direccion || '',
      condiciones_pago: c.condiciones_pago || '30 días',
      dias_credito: String(c.dias_credito ?? 30),
      estatus: c.estatus,
      notas: c.notas || '',
    });
    setShowForm(true);
  };

  const openDetalle = async (c: Cliente) => {
    setDetalleCliente(c);
    setShowDetalle(true);
    setLoadingEventos(true);
    try {
      const ev = await getClienteEventos(token, c.id);
      setEventos(ev);
    } catch {
      setEventos([]);
    } finally {
      setLoadingEventos(false);
    }
  };

  const handleGuardar = async () => {
    clearMsgs();
    if (!form.razon_social.trim()) { setError('Razón social es obligatoria'); return; }
    setSaving(true);
    try {
      const payload = {
        razon_social: form.razon_social.trim(),
        rfc: form.rfc.trim() || undefined,
        contacto_nombre: form.contacto_nombre.trim() || undefined,
        contacto_email: form.contacto_email.trim() || undefined,
        contacto_telefono: form.contacto_telefono.trim() || undefined,
        direccion: form.direccion.trim() || undefined,
        condiciones_pago: form.condiciones_pago.trim() || undefined,
        dias_credito: parseInt(form.dias_credito) || 30,
        estatus: form.estatus,
        notas: form.notas.trim() || undefined,
      };
      if (editCliente) {
        await actualizarCliente(token, editCliente.id, payload);
        setSuccess('Cliente actualizado');
      } else {
        await crearCliente(token, payload);
        setSuccess('Cliente registrado');
      }
      setShowForm(false);
      fetchClientes();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleEliminar = async () => {
    if (!deleteCliente) return;
    try {
      await eliminarCliente(token, deleteCliente.id);
      setSuccess(`Cliente ${deleteCliente.razon_social} eliminado`);
      setShowDelete(false);
      setDeleteCliente(null);
      fetchClientes();
    } catch (err: any) {
      setError(err.message);
      setShowDelete(false);
    }
  };

  const handleIncidencia = async () => {
    if (!incCliente) return;
    clearMsgs();
    const tipo = INCIDENCIAS.find(i => i.label === incTipo);
    if (!tipo) return;
    setSubmittingInc(true);
    try {
      await registrarClienteEvento(token, incCliente.id, {
        tipo_evento: incTipo,
        impacto: tipo.impacto,
        referencia_id: incRef.trim() || undefined,
        descripcion: incDesc.trim() || undefined,
      });
      setSuccess(`Incidencia registrada. Score ajustado ${tipo.impacto > 0 ? '+' : ''}${tipo.impacto}`);
      setShowIncidencia(false);
      setIncDesc('');
      setIncRef('');
      setIncTipo(INCIDENCIAS[0].label);
      fetchClientes();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmittingInc(false);
    }
  };

  const listaOrdenada = viewMode === 'ranking'
    ? [...clientes].sort((a, b) => b.score_cliente - a.score_cliente)
    : clientes;

  const fmtFecha = (iso: string) =>
    new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

  return (
    <div className="space-y-4">
      {/* Messages */}
      {error && (
        <div className="bg-red-900/30 border border-red-500/50 rounded-lg px-4 py-3 text-red-400 flex justify-between">
          <span>❌ {error}</span>
          <button onClick={() => setError('')} className="text-red-300 hover:text-white">✕</button>
        </div>
      )}
      {success && (
        <div className="bg-green-900/30 border border-green-500/50 rounded-lg px-4 py-3 text-green-400 flex justify-between">
          <span>✅ {success}</span>
          <button onClick={() => setSuccess('')} className="text-green-300 hover:text-white">✕</button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">👥 Clientes</h2>
          <p className="text-sm text-gray-400">
            {viewMode === 'ranking' ? 'Ranking por score de cliente' : 'Catálogo de clientes registrados'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode(v => v === 'catalogo' ? 'ranking' : 'catalogo')}
            className="bg-gray-800 hover:bg-gray-700 border border-gray-700 px-3 py-2 rounded-lg text-sm transition-colors"
          >
            {viewMode === 'catalogo' ? '🏆 Ver Ranking' : '🗂️ Ver Catálogo'}
          </button>
          <button onClick={fetchClientes} className="bg-gray-700 hover:bg-gray-600 px-3 py-2 rounded-lg text-sm transition-colors">
            🔄
          </button>
          {viewMode === 'catalogo' && (
            <button onClick={openCreate} className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              ➕ Registrar Cliente
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400" />
        </div>
      ) : clientes.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <p className="text-4xl mb-3">👥</p>
          <p className="font-medium">Sin clientes registrados</p>
          <p className="text-sm mt-1">Registra el primer cliente para comenzar</p>
        </div>
      ) : viewMode === 'catalogo' ? (
        /* ── Vista Catálogo ── */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {listaOrdenada.map(c => (
            <div key={c.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-white text-base">{c.razon_social}</p>
                  <p className="text-xs text-gray-500 font-mono mt-0.5">{c.cliente_id}</p>
                  {c.rfc && <p className="text-xs text-gray-500 mt-0.5">RFC: {c.rfc}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <ScoreBadge score={c.score_cliente} />
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${ESTATUS_COLORS[c.estatus] || ESTATUS_COLORS.Activo}`}>
                    {c.estatus}
                  </span>
                </div>
              </div>

              {/* Contacto */}
              {(c.contacto_nombre || c.contacto_email || c.contacto_telefono) && (
                <div className="text-xs text-gray-400 space-y-0.5 mb-3">
                  {c.contacto_nombre && <p>👤 {c.contacto_nombre}</p>}
                  {c.contacto_email && <p>✉️ {c.contacto_email}</p>}
                  {c.contacto_telefono && <p>📞 {c.contacto_telefono}</p>}
                </div>
              )}

              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{c.condiciones_pago || '—'} · {c.dias_credito ?? 0}d crédito</span>
                <span>{fmtFecha(c.fecha_creacion)}</span>
              </div>

              {/* Acciones */}
              <div className="flex gap-2 mt-4 pt-3 border-t border-gray-800">
                <button onClick={() => openDetalle(c)} className="flex-1 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 py-1.5 rounded-lg text-xs transition-colors">
                  👁️ Detalle
                </button>
                <button onClick={() => openEdit(c)} className="flex-1 bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 py-1.5 rounded-lg text-xs transition-colors">
                  ✏️ Editar
                </button>
                <button onClick={() => { setIncCliente(c); setShowIncidencia(true); }} className="flex-1 bg-orange-600/20 hover:bg-orange-600/40 text-orange-400 py-1.5 rounded-lg text-xs transition-colors">
                  ⚠️ Incidencia
                </button>
                <button onClick={() => { setDeleteCliente(c); setShowDelete(true); }} className="bg-red-600/20 hover:bg-red-600/40 text-red-400 px-3 py-1.5 rounded-lg text-xs transition-colors">
                  🗑️
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* ── Vista Ranking ── */
        <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800">
              <tr>
                <th className="px-4 py-3 text-left text-gray-400 font-medium w-12">#</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">Cliente</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">RFC</th>
                <th className="px-4 py-3 text-center text-gray-400 font-medium">Score</th>
                <th className="px-4 py-3 text-center text-gray-400 font-medium">Estatus</th>
                <th className="px-4 py-3 text-left text-gray-400 font-medium">Condiciones</th>
                <th className="px-4 py-3 text-center text-gray-400 font-medium">Ver</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {listaOrdenada.map((c, idx) => (
                <tr key={c.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">#{idx + 1}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{c.razon_social}</p>
                    <p className="text-xs text-gray-500 font-mono">{c.cliente_id}</p>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{c.rfc || '—'}</td>
                  <td className="px-4 py-3 text-center"><ScoreBadge score={c.score_cliente} /></td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${ESTATUS_COLORS[c.estatus] || ESTATUS_COLORS.Activo}`}>
                      {c.estatus}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{c.condiciones_pago || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => openDetalle(c)} className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 px-2 py-1 rounded text-xs transition-colors">
                      👁️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modal: Crear / Editar ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-bold">{editCliente ? '✏️ Editar Cliente' : '➕ Registrar Cliente'}</h3>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm text-gray-400 mb-1">Razón Social *</label>
                  <input type="text" value={form.razon_social} onChange={e => setForm(f => ({ ...f, razon_social: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    placeholder="LG Electronics de México S.A. de C.V." />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">RFC</label>
                  <input type="text" value={form.rfc} onChange={e => setForm(f => ({ ...f, rfc: e.target.value.toUpperCase() }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    placeholder="LEM000101ABC" maxLength={13} />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Estatus</label>
                  <select value={form.estatus} onChange={e => setForm(f => ({ ...f, estatus: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none">
                    <option>Activo</option>
                    <option>VIP</option>
                    <option>Inactivo</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Nombre de Contacto</label>
                  <input type="text" value={form.contacto_nombre} onChange={e => setForm(f => ({ ...f, contacto_nombre: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    placeholder="Juan Pérez" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Teléfono</label>
                  <input type="text" value={form.contacto_telefono} onChange={e => setForm(f => ({ ...f, contacto_telefono: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    placeholder="+52 81 1234 5678" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-gray-400 mb-1">Correo</label>
                  <input type="email" value={form.contacto_email} onChange={e => setForm(f => ({ ...f, contacto_email: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    placeholder="contacto@empresa.com" />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-gray-400 mb-1">Dirección</label>
                  <input type="text" value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    placeholder="Av. Principal #100, Monterrey, NL" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Condiciones de Pago</label>
                  <select value={form.condiciones_pago} onChange={e => setForm(f => ({ ...f, condiciones_pago: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none">
                    <option>Crédito</option>
                    <option>Contado Efectivo</option>
                    <option>Contado Transferencia</option>
                    <option>30 días</option>
                    <option>45 días</option>
                    <option>60 días</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Días de Crédito</label>
                  <input type="number" value={form.dias_credito} onChange={e => setForm(f => ({ ...f, dias_credito: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    min={0} />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm text-gray-400 mb-1">Notas</label>
                  <textarea value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                    rows={3} />
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-800 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors">Cancelar</button>
              <button onClick={handleGuardar} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 px-6 py-2 rounded-lg text-sm font-medium transition-colors">
                {saving ? 'Guardando...' : editCliente ? '✅ Guardar Cambios' : '✅ Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Detalle ── */}
      {showDetalle && detalleCliente && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">{detalleCliente.razon_social}</h3>
                <p className="text-xs text-gray-500 font-mono">{detalleCliente.cliente_id}</p>
              </div>
              <div className="flex items-center gap-2">
                <ScoreBadge score={detalleCliente.score_cliente} />
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${ESTATUS_COLORS[detalleCliente.estatus] || ESTATUS_COLORS.Activo}`}>
                  {detalleCliente.estatus}
                </span>
                <button onClick={() => setShowDetalle(false)} className="text-gray-400 hover:text-white text-xl ml-2">✕</button>
              </div>
            </div>
            <div className="p-6 space-y-5">
              {/* Score visual */}
              <div className="bg-gray-800/50 rounded-xl border border-gray-700 p-4">
                <p className="text-xs text-gray-500 mb-2">Score de Cliente</p>
                <div className="flex items-center gap-4">
                  <p className="text-4xl font-bold text-white">{detalleCliente.score_cliente.toFixed(0)}</p>
                  <div className="flex-1">
                    <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          detalleCliente.score_cliente >= 80 ? 'bg-green-500'
                          : detalleCliente.score_cliente >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${detalleCliente.score_cliente}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {detalleCliente.score_cliente >= 80 ? 'Cliente de alto valor'
                       : detalleCliente.score_cliente >= 60 ? 'Cliente con incidencias'
                       : 'Cliente con riesgo alto'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Datos generales */}
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ['RFC', detalleCliente.rfc],
                  ['Condiciones', detalleCliente.condiciones_pago],
                  ['Días Crédito', detalleCliente.dias_credito ? `${detalleCliente.dias_credito} días` : '—'],
                  ['Contacto', detalleCliente.contacto_nombre],
                  ['Teléfono', detalleCliente.contacto_telefono],
                  ['Email', detalleCliente.contacto_email],
                ].map(([k, v]) => v && (
                  <div key={k} className="bg-gray-800/30 rounded-lg p-2 border border-gray-700/50">
                    <p className="text-xs text-gray-500">{k}</p>
                    <p className="text-white text-xs mt-0.5">{v}</p>
                  </div>
                ))}
              </div>

              {detalleCliente.notas && (
                <div className="bg-gray-800/30 rounded-lg p-3 border border-gray-700/50">
                  <p className="text-xs text-gray-500 mb-1">Notas</p>
                  <p className="text-sm text-gray-300">{detalleCliente.notas}</p>
                </div>
              )}

              {/* Historial de eventos */}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Historial de Eventos</p>
                {loadingEventos ? (
                  <div className="flex justify-center py-4">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-400" />
                  </div>
                ) : eventos.length === 0 ? (
                  <p className="text-xs text-gray-600 py-2">Sin eventos registrados</p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {eventos.map(ev => (
                      <div key={ev.id} className="flex items-start gap-3 bg-gray-800/30 rounded-lg p-2 border border-gray-700/50">
                        <span className={`text-sm font-bold mt-0.5 ${ev.impacto > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {ev.impacto > 0 ? '+' : ''}{ev.impacto}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-white">{ev.tipo_evento}</p>
                          {ev.descripcion && <p className="text-xs text-gray-400 truncate">{ev.descripcion}</p>}
                          {ev.referencia_id && <p className="text-xs text-gray-600 font-mono">Ref: {ev.referencia_id}</p>}
                        </div>
                        <p className="text-xs text-gray-600 whitespace-nowrap">
                          {new Date(ev.fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="p-6 border-t border-gray-800 flex justify-between">
              <button
                onClick={() => { setIncCliente(detalleCliente); setShowDetalle(false); setShowIncidencia(true); }}
                className="bg-orange-600/20 hover:bg-orange-600/40 text-orange-400 px-4 py-2 rounded-lg text-sm transition-colors"
              >
                ⚠️ Registrar Incidencia
              </button>
              <div className="flex gap-2">
                <button onClick={() => { openEdit(detalleCliente); setShowDetalle(false); }} className="bg-amber-600/20 hover:bg-amber-600/40 text-amber-400 px-4 py-2 rounded-lg text-sm transition-colors">
                  ✏️ Editar
                </button>
                <button onClick={() => setShowDetalle(false)} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors">
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Incidencia ── */}
      {showIncidencia && incCliente && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-orange-800 w-full max-w-md">
            <div className="p-6 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-orange-400">⚠️ Registrar Incidencia</h3>
              <button onClick={() => setShowIncidencia(false)} className="text-gray-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-400">Cliente: <span className="text-white">{incCliente.razon_social}</span></p>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Tipo de Incidencia</label>
                <select value={incTipo} onChange={e => setIncTipo(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-orange-500 focus:outline-none">
                  {INCIDENCIAS.map(i => (
                    <option key={i.label} value={i.label}>
                      {i.label} ({i.impacto > 0 ? '+' : ''}{i.impacto} pts)
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Impacto: <span className={`font-bold ${(INCIDENCIAS.find(i => i.label === incTipo)?.impacto ?? 0) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {(INCIDENCIAS.find(i => i.label === incTipo)?.impacto ?? 0) > 0 ? '+' : ''}{INCIDENCIAS.find(i => i.label === incTipo)?.impacto ?? 0} puntos
                  </span>
                </p>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Descripción</label>
                <textarea value={incDesc} onChange={e => setIncDesc(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                  rows={3} placeholder="Descripción de la incidencia..." />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Referencia (OV / Factura)</label>
                <input type="text" value={incRef} onChange={e => setIncRef(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                  placeholder="OV-20260608-001 (opcional)" />
              </div>
            </div>
            <div className="p-6 border-t border-gray-800 flex justify-end gap-3">
              <button onClick={() => setShowIncidencia(false)} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors">Cancelar</button>
              <button onClick={handleIncidencia} disabled={submittingInc} className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 px-6 py-2 rounded-lg text-sm font-medium transition-colors">
                {submittingInc ? 'Registrando...' : '⚠️ Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Eliminar ── */}
      {showDelete && deleteCliente && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-red-800 w-full max-w-sm">
            <div className="p-6 border-b border-gray-800">
              <h3 className="text-lg font-bold text-red-400">🗑️ Eliminar Cliente</h3>
            </div>
            <div className="p-6 space-y-3">
              <div className="bg-red-900/20 border border-red-600/40 rounded-lg p-4 space-y-2 text-sm">
                <p className="text-red-300">¿Confirmas la eliminación permanente?</p>
                <div className="flex justify-between">
                  <span className="text-gray-400">Razón Social:</span>
                  <span className="text-white font-medium">{deleteCliente.razon_social}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">ID:</span>
                  <span className="font-mono text-gray-300">{deleteCliente.cliente_id}</span>
                </div>
              </div>
              <p className="text-xs text-gray-500">No se puede eliminar si tiene órdenes de venta activas.</p>
            </div>
            <div className="p-6 border-t border-gray-800 flex justify-end gap-3">
              <button onClick={() => setShowDelete(false)} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm transition-colors">Cancelar</button>
              <button onClick={handleEliminar} className="bg-red-700 hover:bg-red-800 px-6 py-2 rounded-lg text-sm font-medium transition-colors">
                🗑️ Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
