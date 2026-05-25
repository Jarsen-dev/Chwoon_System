'use client';

import { useState, useEffect, useRef } from 'react';

interface Material {
  id?: number;
  sku_material: string;
  codigo_proveedor: string;
  costo_unitario: number;
  moneda: string;
}

interface Proveedor {
  id: number;
  uuid: string;
  razon_social: string;
  rfc: string;
  lead_time_dias: number;
  condiciones_pago: string;
  estatus_calidad: string;
  notas: string;
  materiales: Material[];
}

export default function ProveedoresTab({ token }: { token: string }) {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Estados para Popups de Notificación (Feedback visual personalizado)
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const errorTimerRef = useRef<NodeJS.Timeout | null>(null);
  const successTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Estados para Modal de Registro / Edición
  const [modalOpen, setModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  // Campos del Formulario
  const [razonSocial, setRazonSocial] = useState('');
  const [rfc, setRfc] = useState('');
  const [leadTime, setLeadTime] = useState(7);
  const [condiciones, setCondiciones] = useState('30 días');
  const [estatusCalidad, setEstatusCalidad] = useState('Aprobado');
  const [notas, setNotas] = useState('');
  
  // Matriz de materiales dinámica dentro del form
  const [materialesForm, setMaterialesForm] = useState<Material[]>([]);
  const [newSku, setNewSku] = useState('');
  const [newCosto, setNewCosto] = useState(0);

  // Estados para Popup personalizado de confirmación de eliminación
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Proveedor | null>(null);

  // ═══════════════════════════════════════
  // NUEVO: Estado para Modal de Detalle
  // ═══════════════════════════════════════
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [detailTarget, setDetailTarget] = useState<Proveedor | null>(null);

  // ── MANEJADORES DE POPUPS DE NOTIFICACIÓN
  const setErrorMsg = (msg: string) => {
    setError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    if (msg) errorTimerRef.current = setTimeout(() => setError(''), 6000);
  };

  const setSuccessMsg = (msg: string) => {
    setSuccess(msg);
    if (successTimerRef.current) clearTimeout(successTimerRef.current);
    if (msg) successTimerRef.current = setTimeout(() => setSuccess(''), 6000);
  };

  useEffect(() => {
    return () => {
      if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  const fetchProveedores = async () => {
    try {
      const res = await fetch('/finanzas/proveedores', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProveedores(data);
      }
    } catch (err) {
      console.error("Error cargando proveedores:", err);
      setErrorMsg("Error al conectar con el servidor para cargar el catálogo.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchProveedores(); }, []);

  // Abrir formulario en modo creación
  const handleOpenCreateModal = () => {
    setIsEditing(false);
    setEditingId(null);
    setRazonSocial('');
    setRfc('');
    setLeadTime(7);
    setCondiciones('30 días');
    setEstatusCalidad('Aprobado');
    setNotas('');
    setMaterialesForm([]);
    setModalOpen(true);
  };

  // Abrir formulario en modo edición con datos precargados
  const handleOpenEditModal = (proveedor: Proveedor) => {
    setIsEditing(true);
    setEditingId(proveedor.id);
    setRazonSocial(proveedor.razon_social);
    setRfc(proveedor.rfc);
    setLeadTime(proveedor.lead_time_dias);
    setCondiciones(proveedor.condiciones_pago || '');
    setEstatusCalidad(proveedor.estatus_calidad);
    setNotas(proveedor.notas || '');
    setMaterialesForm([...proveedor.materiales]); // Clonar materiales existentes
    setModalOpen(true);
  };

  // ═══════════════════════════════════════
  // NUEVO: Abrir modal de detalle
  // ═══════════════════════════════════════
  const handleOpenDetailModal = (proveedor: Proveedor) => {
    setDetailTarget(proveedor);
    setDetailModalOpen(true);
  };

  const handleAddMaterial = () => {
    if (!newSku) return;
    setMaterialesForm([...materialesForm, {
      sku_material: newSku.toUpperCase(),
      codigo_proveedor: '',
      costo_unitario: Number(newCosto),
      moneda: 'MXN'
    }]);
    setNewSku('');
    setNewCosto(0);
  };

  const handleRemoveMaterialForm = (indexToRemove: number) => {
    setMaterialesForm(materialesForm.filter((_, idx) => idx !== indexToRemove));
  };

  const handleGuardarProveedor = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    const payload = {
        razon_social: razonSocial,
        rfc: rfc.toUpperCase(),
        lead_time_dias: Number(leadTime),
        condiciones_pago: condiciones,
        estatus_calidad: estatusCalidad,
        notas: notas,
        materiales: materialesForm
    };

    const url = isEditing ? `/finanzas/proveedores/${editingId}` : '/finanzas/proveedores';
    const method = isEditing ? 'PUT' : 'POST';

    try {
        const res = await fetch(url, {
        method: method,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
        });

        if (res.ok) {
          setModalOpen(false);
          setSuccessMsg(isEditing ? 'Proveedor actualizado con éxito.' : 'Proveedor registrado exitosamente.');
          fetchProveedores();
        } else {
          const errData = await res.json();
          console.error("❌ Error en FastAPI:", errData);
          setErrorMsg(`Error en operación: ${errData.detail ? JSON.stringify(errData.detail) : 'Campos incorrectos'}`);
        }
    } catch (err) {
        setErrorMsg("Error crítico en el servidor al intentar guardar los cambios.");
    }
  };

  const handleOpenDeleteModal = (proveedor: Proveedor) => {
    setDeleteTarget(proveedor);
    setShowDeleteModal(true);
  };

  const handleEliminarConfirm = async () => {
    if (!deleteTarget) return;
    setError('');
    setSuccess('');
    
    try {
      const res = await fetch(`/finanzas/proveedores/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setSuccessMsg(`Proveedor "${deleteTarget.razon_social}" eliminado correctamente.`);
        fetchProveedores();
      } else {
        setErrorMsg("No se pudo eliminar el proveedor. Verifique dependencias.");
      }
    } catch (err) {
      console.error(err);
      setErrorMsg("Ocurrió un error en el servidor al intentar realizar la eliminación.");
    } finally {
      setShowDeleteModal(false);
      setDeleteTarget(null);
    }
  };

  if (loading) return <div className="text-gray-400">Cargando catálogo...</div>;

  return (
    <div className="space-y-6 relative">
      
      {/* ══════ Popups Flotantes de Notificación ══════ */}
      <div className="fixed top-4 right-4 z-[60] space-y-2 pointer-events-none max-w-sm w-full">
        {error && (
          <div className="pointer-events-auto bg-gray-900/95 border-l-4 border-red-500 shadow-2xl shadow-black/50 rounded-r-xl px-4 py-3 text-red-400 flex justify-between items-start gap-3 animate-in slide-in-from-top-4 fade-in duration-300">
            <div className="flex gap-2">
              <span className="text-base">❌</span>
              <div className="text-sm">
                <span className="font-semibold block text-red-300">Error en Operación</span>
                <p className="text-gray-400 text-xs mt-0.5">{error}</p>
              </div>
            </div>
            <button onClick={() => setError('')} className="text-gray-500 hover:text-white transition-colors shrink-0 text-xs p-0.5">✕</button>
          </div>
        )}
        {success && (
          <div className="pointer-events-auto bg-gray-900/95 border-l-4 border-emerald-500 shadow-2xl shadow-black/50 rounded-r-xl px-4 py-3 text-emerald-400 flex justify-between items-start gap-3 animate-in slide-in-from-top-4 fade-in duration-300">
            <div className="flex gap-2">
              <span className="text-base">✅</span>
              <div className="text-sm">
                <span className="font-semibold block text-emerald-300">Acción Exitosa</span>
                <p className="text-gray-400 text-xs mt-0.5">{success}</p>
              </div>
            </div>
            <button onClick={() => setSuccess('')} className="text-gray-500 hover:text-white transition-colors shrink-0 text-xs p-0.5">✕</button>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Catálogo de Proveedores</h2>
          <p className="text-gray-400 text-sm">Gestiona credenciales de compra, tiempos de entrega y matriz de insumos.</p>
        </div>
        <button 
          onClick={handleOpenCreateModal}
          className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors"
        >
          ➕ Registrar Proveedor
        </button>
      </div>

      {/* Grid de Proveedores */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {proveedores.map((p) => (
          <div key={p.id} className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-lg text-white">{p.razon_social}</h3>
                  <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                    p.estatus_calidad === 'Aprobado' ? 'bg-emerald-500/20 text-emerald-400' :
                    p.estatus_calidad === 'Condicional' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {p.estatus_calidad}
                  </span>
                </div>
                <p className="text-gray-400 text-xs font-mono mt-1">{p.uuid} │ RFC: {p.rfc}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {/* ═══════════════════════════════════════ */}
                {/* NUEVO: Botón Ver Detalle */}
                {/* ═══════════════════════════════════════ */}
                <button 
                  onClick={() => handleOpenDetailModal(p)}
                  className="text-gray-400 hover:text-blue-400 hover:bg-gray-800 p-1.5 rounded transition-colors text-xs"
                  title="Ver Detalle Completo"
                >
                  👁️
                </button>
                <button 
                  onClick={() => handleOpenEditModal(p)}
                  className="text-gray-400 hover:text-amber-400 hover:bg-gray-800 p-1.5 rounded transition-colors text-xs"
                  title="Editar Proveedor"
                >
                  ✏️
                </button>
                <button 
                  onClick={() => handleOpenDeleteModal(p)}
                  className="text-gray-400 hover:text-red-400 hover:bg-gray-800 p-1.5 rounded transition-colors text-xs"
                  title="Eliminar Proveedor"
                >
                  🗑️
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-gray-950 p-3 rounded-lg text-sm border border-gray-800/50">
              <div><span className="text-gray-500">Lead Time:</span> <strong className="text-gray-300">{p.lead_time_dias} días</strong></div>
              <div><span className="text-gray-500">Crédito:</span> <strong className="text-gray-300">{p.condiciones_pago}</strong></div>
            </div>

            {/* Listado de SKUs Vinculados - MÁXIMO 3 */}
            <div>
              <h4 className="text-xs font-semibold uppercase text-gray-500 tracking-wider mb-2">
                Matriz de Materiales Surtidos 
                {p.materiales.length > 3 && (
                  <span className="text-gray-600 ml-1">({p.materiales.length} total)</span>
                )}
              </h4>
              {p.materiales.length === 0 ? (
                <p className="text-gray-600 text-xs italic">Sin materiales asignados.</p>
              ) : (
                <div className="space-y-1 pr-1">
                  {p.materiales.slice(0, 3).map((m, idx) => (
                    <div key={idx} className="flex justify-between items-center text-xs bg-gray-800/40 px-3 py-1.5 rounded border border-gray-800">
                      <span className="font-mono text-emerald-400 font-medium">{m.sku_material}</span>
                      <span className="text-gray-300 font-semibold">${m.costo_unitario.toFixed(2)} {m.moneda}</span>
                    </div>
                  ))}
                  {p.materiales.length > 3 && (
                    <p className="text-gray-500 text-xs text-center italic py-1">
                      +{p.materiales.length - 3} materiales más...
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal de Registro / Edición */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-2xl p-6 text-white space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <h3 className="text-lg font-bold border-b border-gray-800 pb-2">
              {isEditing ? `✏️ Editar Proveedor: ${razonSocial}` : '➕ Registrar Nuevo Proveedor'}
            </h3>
            <form onSubmit={handleGuardarProveedor} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400">Razón Social</label>
                  <input required type="text" value={razonSocial} onChange={(e) => setRazonSocial(e.target.value)} className="bg-gray-950 border border-gray-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-emerald-500"/>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400">RFC</label>
                  <input 
                        required 
                        type="text" 
                        minLength={12}
                        maxLength={13}
                        pattern="^[A-Z&Ññ]{3,4}[0-9]{6}[A-Z0-9]{3}$"
                        title="El RFC debe tener un formato válido de 12 o 13 caracteres"
                        value={rfc} 
                        onChange={(e) => setRfc(e.target.value)} 
                        className="bg-gray-950 border border-gray-800 rounded-lg p-2 text-sm text-white font-mono uppercase focus:outline-none focus:border-emerald-500"
                    />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400">Lead Time (Días)</label>
                  <input type="number" min="0" value={leadTime} onChange={(e) => setLeadTime(Number(e.target.value))} className="bg-gray-950 border border-gray-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-emerald-500"/>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400">Condiciones Pago</label>
                  <input type="text" value={condiciones} onChange={(e) => setCondiciones(e.target.value)} className="bg-gray-950 border border-gray-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-emerald-500"/>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400">Estatus Calidad</label>
                  <select value={estatusCalidad} onChange={(e) => setEstatusCalidad(e.target.value)} className="bg-gray-950 border border-gray-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-emerald-500">
                    <option value="Aprobado">Aprobado</option>
                    <option value="Condicional">Condicional</option>
                    <option value="Suspendido">Suspendido</option>
                  </select>
                </div>
              </div>

              {/* Notas del Proveedor */}
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Notas / Observaciones</label>
                <textarea rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} className="bg-gray-950 border border-gray-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-emerald-500 placeholder-gray-600" placeholder="Opcional: Detalles sobre logística o contactos primarios..."/>
              </div>

              {/* Sección Agregar Materiales Dinámicos */}
              <div className="border-t border-gray-800 pt-3 space-y-2">
                <h4 className="text-sm font-semibold text-gray-300 flex justify-between items-center">
                  <span>Matriz de SKUs Surtidos</span>
                  <span className="text-xs text-gray-500 font-normal">({materialesForm.length} asignados)</span>
                </h4>
                
                <div className="flex gap-2 bg-gray-950 p-2.5 rounded-lg border border-gray-800/60">
                  <input type="text" placeholder="SKU MATERIAL (Ej: MP-RES-01)" value={newSku} onChange={(e) => setNewSku(e.target.value)} className="flex-1 bg-gray-900 border border-gray-800 rounded-lg p-2 text-xs font-mono text-white uppercase focus:outline-none focus:border-emerald-500"/>
                  <input type="number" step="0.01" placeholder="Costo Unitario" value={newCosto || ''} onChange={(e) => setNewCosto(Number(e.target.value))} className="w-32 bg-gray-900 border border-gray-800 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-500"/>
                  <button type="button" onClick={handleAddMaterial} className="bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30 px-4 py-2 rounded-lg text-xs font-medium transition-colors">
                    ＋ Asignar
                  </button>
                </div>

                {/* Listado de Materiales en el Formulario con opción de eliminar del payload */}
                <div className="max-h-36 overflow-y-auto space-y-1 pt-1 pr-1">
                  {materialesForm.length === 0 ? (
                    <p className="text-gray-500 text-xs italic text-center py-2">No hay materiales cargados en este registro.</p>
                  ) : (
                    materialesForm.map((m, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-gray-950 px-3 py-1.5 rounded border border-gray-800 text-xs">
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-emerald-400 font-medium">{m.sku_material}</span>
                          <span className="text-gray-400">Coste asignado: <strong className="text-gray-200">${m.costo_unitario.toFixed(2)} MXN</strong></span>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => handleRemoveMaterialForm(idx)}
                          className="text-gray-500 hover:text-red-400 transition-colors p-0.5"
                          title="Remover material"
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-800 pt-4">
                <button type="button" onClick={() => setModalOpen(false)} className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">Cancelar</button>
                <button type="submit" className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  {isEditing ? '💾 Guardar Cambios' : 'Guardar Proveedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════ */}
      {/* NUEVO: Modal de Detalle Completo */}
      {/* ═══════════════════════════════════════ */}
      {detailModalOpen && detailTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-2xl p-6 text-white space-y-5 max-h-[90vh] overflow-y-auto shadow-2xl">
            
            {/* Header */}
            <div className="border-b border-gray-800 pb-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-xl font-bold text-white">{detailTarget.razon_social}</h3>
                    <span className={`px-2.5 py-1 rounded text-xs font-semibold ${
                      detailTarget.estatus_calidad === 'Aprobado' ? 'bg-emerald-500/20 text-emerald-400' :
                      detailTarget.estatus_calidad === 'Condicional' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {detailTarget.estatus_calidad}
                    </span>
                  </div>
                  <p className="text-gray-400 text-xs font-mono">{detailTarget.uuid}</p>
                </div>
                <button 
                  onClick={() => { setDetailModalOpen(false); setDetailTarget(null); }}
                  className="text-gray-500 hover:text-white transition-colors text-lg p-1"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Info General */}
            <div className="grid grid-cols-2 gap-4 bg-gray-950 p-4 rounded-lg border border-gray-800/50 text-sm">
              <div className="space-y-2">
                <div>
                  <span className="text-gray-500 text-xs block">RFC</span>
                  <span className="text-white font-mono">{detailTarget.rfc}</span>
                </div>
                <div>
                  <span className="text-gray-500 text-xs block">Lead Time</span>
                  <span className="text-white">{detailTarget.lead_time_dias} días</span>
                </div>
              </div>
              <div className="space-y-2">
                <div>
                  <span className="text-gray-500 text-xs block">Condiciones de Pago</span>
                  <span className="text-white">{detailTarget.condiciones_pago || 'No especificado'}</span>
                </div>
                <div>
                  <span className="text-gray-500 text-xs block">Total Materiales</span>
                  <span className="text-emerald-400 font-semibold">{detailTarget.materiales.length} SKUs</span>
                </div>
              </div>
            </div>

            {/* Notas / Observaciones */}
            {detailTarget.notas && (
              <div className="bg-gray-950/50 p-4 rounded-lg border border-gray-800/50">
                <h4 className="text-xs font-semibold uppercase text-gray-500 tracking-wider mb-2">📝 Notas / Observaciones</h4>
                <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">{detailTarget.notas}</p>
              </div>
            )}

            {/* Lista Completa de Materiales */}
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-3 flex justify-between items-center">
                <span>📦 Matriz Completa de Materiales Surtidos</span>
                <span className="text-xs text-gray-500 font-normal">{detailTarget.materiales.length} registros</span>
              </h4>
              
              {detailTarget.materiales.length === 0 ? (
                <div className="bg-gray-950 p-6 rounded-lg border border-gray-800 text-center">
                  <p className="text-gray-500 text-sm">Sin materiales asignados a este proveedor.</p>
                </div>
              ) : (
                <div className="bg-gray-950 rounded-lg border border-gray-800 overflow-hidden">
                  {/* Header de tabla */}
                  <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-800/50 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    <div className="col-span-4">SKU Material</div>
                    <div className="col-span-3">Código Prov.</div>
                    <div className="col-span-3 text-right">Costo Unitario</div>
                    <div className="col-span-2 text-right">Moneda</div>
                  </div>
                  {/* Filas */}
                  <div className="divide-y divide-gray-800/50 max-h-64 overflow-y-auto">
                    {detailTarget.materiales.map((m, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 px-4 py-2.5 text-sm hover:bg-gray-800/30 transition-colors">
                        <div className="col-span-4 font-mono text-emerald-400">{m.sku_material}</div>
                        <div className="col-span-3 text-gray-300">{m.codigo_proveedor || '—'}</div>
                        <div className="col-span-3 text-right text-white font-semibold">${m.costo_unitario.toFixed(2)}</div>
                        <div className="col-span-2 text-right text-gray-400">{m.moneda}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer con acciones */}
            <div className="flex justify-end gap-2 border-t border-gray-800 pt-4">
              <button 
                onClick={() => { setDetailModalOpen(false); setDetailTarget(null); }}
                className="bg-gray-800 hover:bg-gray-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Cerrar
              </button>
              <button 
                onClick={() => {
                  setDetailModalOpen(false);
                  handleOpenEditModal(detailTarget);
                }}
                className="bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 border border-amber-500/30 px-5 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                ✏️ Editar Proveedor
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Popup Modal: Confirmar Eliminación Personalizado */}
      {showDeleteModal && deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-red-700/40 w-full max-w-md animate-in zoom-in-95 duration-200 text-white shadow-2xl">
            <div className="p-6 border-b border-gray-800">
              <h3 className="text-lg font-bold text-red-400 flex items-center gap-2">⚠️ Confirmar Eliminación</h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-gray-300 text-sm">¿Está seguro de que desea eliminar permanentemente este proveedor?</p>
              <div className="bg-gray-950 rounded-lg p-4 border border-gray-800 space-y-1.5 text-sm">
                <p><span className="text-gray-500">Razón Social:</span> <strong className="text-white">{deleteTarget.razon_social}</strong></p>
                <p><span className="text-gray-500">RFC:</span> <span className="text-gray-300 font-mono">{deleteTarget.rfc}</span></p>
                <p><span className="text-gray-500">Materiales Asignados:</span> <span className="text-emerald-400 font-medium">{deleteTarget.materiales.length} SKUs</span></p>
              </div>
              <div className="bg-red-950/20 border border-red-900/30 rounded-lg p-3">
                <p className="text-xs text-red-400 leading-relaxed">
                  ⚠️ Esta acción es destructiva. Se romperá el vínculo directo en el catálogo y no podrá utilizarse para nuevas Órdenes de Compra hasta volver a registrarlo.
                </p>
              </div>
            </div>
            <div className="p-6 border-t border-gray-800 flex justify-end gap-3">
              <button 
                onClick={() => { setShowDeleteModal(false); setDeleteTarget(null); }} 
                className="bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleEliminarConfirm} 
                className="bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                🗑️ Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}