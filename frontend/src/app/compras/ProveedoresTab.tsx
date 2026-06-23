'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui';
import {
  IconAlertas, IconCompletado, IconCerrar, IconRanking, IconLista, IconNuevo,
  IconVer, IconEditar, IconEliminar, IconGrafico, IconDocumento, IconHistorial,
  IconInventario, IconGuardar, IconProveedores,
} from '@/lib/icons';

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
  dias_credito: number;
  estatus_calidad: string;
  direccion?: string;
  nombre_contacto?: string;
  numero_contacto?: string;
  correo_contacto?: string;
  notas: string;
  score_calidad?: number;
  score_detalle?: Record<string, any>;
  score_updated_at?: string;
  materiales: Material[];
}

interface ProveedorEvento {
  id: number;
  tipo_evento: string;
  impacto: number;
  referencia_id?: string;
  descripcion?: string;
  fecha: string;
  registrado_por?: string;
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
  const [condiciones, setCondiciones] = useState('Crédito');
  const [diasCredito, setDiasCredito] = useState(30);
  const [estatusCalidad, setEstatusCalidad] = useState('Aprobado');
  const [direccion, setDireccion] = useState('');
  const [nombreContacto, setNombreContacto] = useState('');
  const [numeroContacto, setNumeroContacto] = useState('');
  const [correoContacto, setCorreoContacto] = useState('');
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
  const [detailEvents, setDetailEvents] = useState<ProveedorEvento[]>([]);
  const [detailScore, setDetailScore] = useState<any>(null);

  const [incidentModalOpen, setIncidentModalOpen] = useState(false);
  const [incidentTipo, setIncidentTipo] = useState('MATERIAL_INCORRECTO');
  const [incidentDesc, setIncidentDesc] = useState('');
  const [incidentRef, setIncidentRef] = useState('');

  const [viewMode, setViewMode] = useState<'catalogo' | 'ranking'>('catalogo');
  const [rankingData, setRankingData] = useState<Proveedor[]>([]);

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

  const fetchRanking = async () => {
    try {
      const res = await fetch('/finanzas/proveedores/ranking', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRankingData(data);
      }
    } catch (err) {
      console.error("Error cargando ranking:", err);
      setErrorMsg("Error al cargar el ranking de proveedores.");
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
    setCondiciones('Crédito');
    setDiasCredito(30);
    setEstatusCalidad('Aprobado');
    setDireccion('');
    setNombreContacto('');
    setNumeroContacto('');
    setCorreoContacto('');
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
    setCondiciones(proveedor.condiciones_pago || 'Crédito');
    setDiasCredito(proveedor.dias_credito || 30);
    setEstatusCalidad(proveedor.estatus_calidad);
    setDireccion(proveedor.direccion || '');
    setNombreContacto(proveedor.nombre_contacto || '');
    setNumeroContacto(proveedor.numero_contacto || '');
    setCorreoContacto(proveedor.correo_contacto || '');
    setNotas(proveedor.notas || '');
    setMaterialesForm([...proveedor.materiales]);
    setModalOpen(true);
  };

  // ═══════════════════════════════════════
  // NUEVO: Abrir modal de detalle
  // ═══════════════════════════════════════
  const handleOpenDetailModal = async (proveedor: Proveedor) => {
    setDetailTarget(proveedor);
    setDetailModalOpen(true);
    setDetailEvents([]);
    setDetailScore(null);
    try {
      const [scoreRes, eventsRes] = await Promise.all([
        fetch(`/finanzas/proveedores/${proveedor.id}/score`, { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(`/finanzas/proveedores/${proveedor.id}/eventos?limite=10`, { headers: { 'Authorization': `Bearer ${token}` } }),
      ]);
      if (scoreRes.ok) setDetailScore(await scoreRes.json());
      if (eventsRes.ok) setDetailEvents(await eventsRes.json());
    } catch (err) {
      console.error("Error cargando detalle de score:", err);
    }
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
        dias_credito: Number(diasCredito),
        estatus_calidad: estatusCalidad,
        direccion: direccion || undefined,
        nombre_contacto: nombreContacto || undefined,
        numero_contacto: numeroContacto || undefined,
        correo_contacto: correoContacto || undefined,
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

  const handleRegistrarIncidencia = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailTarget) return;
    const tipoMap: Record<string, string> = {
      'MATERIAL_INCORRECTO': 'EXACTITUD_INCIDENCIA',
      'CANTIDAD_ERRONEA': 'EXACTITUD_INCIDENCIA',
      'OTRO': 'EXACTITUD_INCIDENCIA',
    };
    try {
      const res = await fetch(`/finanzas/proveedores/${detailTarget.id}/eventos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          tipo_evento: tipoMap[incidentTipo] || 'EXACTITUD_INCIDENCIA',
          impacto: -15.0,
          referencia_id: incidentRef || undefined,
          descripcion: `${incidentTipo}: ${incidentDesc}`,
        }),
      });
      if (res.ok) {
        setSuccessMsg('Incidencia registrada correctamente.');
        setIncidentModalOpen(false);
        setIncidentDesc('');
        setIncidentRef('');
        handleOpenDetailModal(detailTarget);
        fetchProveedores();
      } else {
        const err = await res.json();
        setErrorMsg(err.detail || 'Error al registrar incidencia.');
      }
    } catch (err) {
      setErrorMsg('Error de servidor al registrar incidencia.');
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
              <IconAlertas size={16} className="mt-0.5 shrink-0" aria-hidden />
              <div className="text-sm">
                <span className="font-semibold block text-red-300">Error en Operación</span>
                <p className="text-gray-400 text-xs mt-0.5">{error}</p>
              </div>
            </div>
            <button onClick={() => setError('')} className="text-gray-400 hover:text-white transition-colors shrink-0 p-0.5" aria-label="Cerrar"><IconCerrar size={14} aria-hidden /></button>
          </div>
        )}
        {success && (
          <div className="pointer-events-auto bg-gray-900/95 border-l-4 border-emerald-500 shadow-2xl shadow-black/50 rounded-r-xl px-4 py-3 text-emerald-400 flex justify-between items-start gap-3 animate-in slide-in-from-top-4 fade-in duration-300">
            <div className="flex gap-2">
              <IconCompletado size={16} className="mt-0.5 shrink-0" aria-hidden />
              <div className="text-sm">
                <span className="font-semibold block text-emerald-300">Acción Exitosa</span>
                <p className="text-gray-400 text-xs mt-0.5">{success}</p>
              </div>
            </div>
            <button onClick={() => setSuccess('')} className="text-gray-400 hover:text-white transition-colors shrink-0 p-0.5" aria-label="Cerrar"><IconCerrar size={14} aria-hidden /></button>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center gap-2">
            {viewMode === 'catalogo'
              ? <><IconProveedores size={22} className="text-[var(--accent)]" aria-hidden /> Catálogo de Proveedores</>
              : <><IconRanking size={22} className="text-[var(--accent)]" aria-hidden /> Ranking de Proveedores</>}
          </h2>
          <p className="text-gray-300 text-sm">
            {viewMode === 'catalogo' ? 'Gestiona credenciales de compra, tiempos de entrega y matriz de insumos.' : 'Ordenados por score de calidad descendente.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            leftIcon={viewMode === 'catalogo' ? IconRanking : IconLista}
            onClick={() => { setViewMode(viewMode === 'catalogo' ? 'ranking' : 'catalogo'); if (viewMode === 'catalogo') fetchRanking(); }}
          >
            {viewMode === 'catalogo' ? 'Ver Ranking' : 'Ver Catálogo'}
          </Button>
          {viewMode === 'catalogo' && (
            <Button leftIcon={IconNuevo} onClick={handleOpenCreateModal}>Registrar Proveedor</Button>
          )}
        </div>
      </div>

      {viewMode === 'ranking' ? (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-800/50 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            <div className="col-span-1 text-center">#</div>
            <div className="col-span-4">Proveedor</div>
            <div className="col-span-2 text-center">Score</div>
            <div className="col-span-2 text-center">Estatus</div>
            <div className="col-span-2 text-center">Lead Time</div>
            <div className="col-span-1 text-center">Acción</div>
          </div>
          <div className="divide-y divide-gray-800/50">
            {rankingData.map((p, idx) => (
              <div key={p.id} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm items-center hover:bg-gray-800/30 transition-colors">
                <div className="col-span-1 text-center font-bold text-gray-400">{idx + 1}</div>
                <div className="col-span-4">
                  <div className="font-semibold text-white">{p.razon_social}</div>
                  <div className="text-xs text-gray-500 font-mono">{p.rfc}</div>
                </div>
                <div className="col-span-2 text-center">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                    (p.score_calidad ?? 100) >= 80 ? 'bg-emerald-500/20 text-emerald-400' :
                    (p.score_calidad ?? 100) >= 60 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {Math.round(p.score_calidad ?? 100)}
                  </span>
                </div>
                <div className="col-span-2 text-center">
                  <span className={`text-xs font-semibold ${
                    p.estatus_calidad === 'Aprobado' ? 'text-emerald-400' :
                    p.estatus_calidad === 'Condicional' ? 'text-yellow-400' : 'text-red-400'
                  }`}>{p.estatus_calidad}</span>
                </div>
                <div className="col-span-2 text-center text-gray-300">{p.lead_time_dias} días</div>
                <div className="col-span-1 text-center">
                  <button onClick={() => handleOpenDetailModal(p)} className="text-blue-400 hover:text-blue-300 text-xs">Ver</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
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
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    (p.score_calidad ?? 100) >= 80 ? 'bg-emerald-500/20 text-emerald-400' :
                    (p.score_calidad ?? 100) >= 60 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'
                  }`}>
                    {p.score_calidad !== undefined ? `${Math.round(p.score_calidad)}/100` : '100/100'}
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
                  className="text-gray-300 hover:text-blue-400 hover:bg-gray-800 p-1.5 rounded transition-colors"
                  title="Ver Detalle Completo" aria-label="Ver detalle"
                >
                  <IconVer size={16} aria-hidden />
                </button>
                <button
                  onClick={() => handleOpenEditModal(p)}
                  className="text-gray-300 hover:text-amber-400 hover:bg-gray-800 p-1.5 rounded transition-colors"
                  title="Editar Proveedor" aria-label="Editar proveedor"
                >
                  <IconEditar size={16} aria-hidden />
                </button>
                <button
                  onClick={() => handleOpenDeleteModal(p)}
                  className="text-gray-300 hover:text-red-400 hover:bg-gray-800 p-1.5 rounded transition-colors"
                  title="Eliminar Proveedor" aria-label="Eliminar proveedor"
                >
                  <IconEliminar size={16} aria-hidden />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 bg-gray-950 p-3 rounded-lg text-sm border border-gray-800/50">
              <div><span className="text-gray-500">Lead Time:</span> <strong className="text-gray-300">{p.lead_time_dias} días</strong></div>
              <div><span className="text-gray-500">Crédito:</span> <strong className="text-gray-300">{p.dias_credito} días</strong></div>
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
      )}

      {/* Modal de Registro / Edición */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-2xl p-6 text-white space-y-4 max-h-[90vh] overflow-y-auto shadow-2xl">
            <h3 className="text-lg font-bold border-b border-gray-800 pb-2 flex items-center gap-2">
              {isEditing
                ? <><IconEditar size={18} aria-hidden /> Editar Proveedor: {razonSocial}</>
                : <><IconNuevo size={18} aria-hidden /> Registrar Nuevo Proveedor</>}
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

<div className="grid grid-cols-4 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400">Lead Time (Días)</label>
                  <input type="number" min="0" value={leadTime} onChange={(e) => setLeadTime(Number(e.target.value))} className="bg-gray-950 border border-gray-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-emerald-500"/>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400">Condiciones Pago</label>
                  <select value={condiciones} onChange={(e) => setCondiciones(e.target.value)} className="bg-gray-950 border border-gray-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-emerald-500">
                    <option value="Crédito">Crédito</option>
                    <option value="Contado Efectivo">Contado Efectivo</option>
                    <option value="Contado Transferencia">Contado Transferencia</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400">Días Crédito</label>
                  <input type="number" min="0" value={diasCredito} onChange={(e) => setDiasCredito(Number(e.target.value))} className="bg-gray-950 border border-gray-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-emerald-500"/>
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

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400">Dirección</label>
                  <input type="text" value={direccion} onChange={(e) => setDireccion(e.target.value)} className="bg-gray-950 border border-gray-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-emerald-500" placeholder="Calle, número, colonia, ciudad, CP"/>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400">Nombre Contacto</label>
                  <input type="text" value={nombreContacto} onChange={(e) => setNombreContacto(e.target.value)} className="bg-gray-950 border border-gray-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-emerald-500" placeholder="Nombre del contacto"/>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400">Número Contacto</label>
                  <input type="text" value={numeroContacto} onChange={(e) => setNumeroContacto(e.target.value)} className="bg-gray-950 border border-gray-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-emerald-500" placeholder="Teléfono fijo o móvil"/>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400">Correo Contacto</label>
                  <input type="email" value={correoContacto} onChange={(e) => setCorreoContacto(e.target.value)} className="bg-gray-950 border border-gray-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-emerald-500" placeholder="correo@ejemplo.com"/>
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
                  <button type="button" onClick={handleAddMaterial} className="inline-flex items-center gap-1 bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30 border border-emerald-500/30 px-4 py-2 rounded-lg text-xs font-medium transition-colors">
                    <IconNuevo size={14} aria-hidden /> Asignar
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
                          className="text-gray-400 hover:text-red-400 transition-colors p-0.5"
                          title="Remover material" aria-label="Remover material"
                        >
                          <IconCerrar size={14} aria-hidden />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-gray-800 pt-4">
                <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancelar</Button>
                <Button type="submit" leftIcon={isEditing ? IconGuardar : undefined}>
                  {isEditing ? 'Guardar Cambios' : 'Guardar Proveedor'}
                </Button>
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
                  className="text-gray-400 hover:text-white transition-colors p-1" aria-label="Cerrar"
                >
                  <IconCerrar size={18} aria-hidden />
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
                  <span className="text-gray-500 text-xs block">Días Crédito</span>
                  <span className="text-white">{detailTarget.dias_credito || 'No especificado'}</span>
                </div>
                <div>
                  <span className="text-gray-500 text-xs block">Total Materiales</span>
                  <span className="text-emerald-400 font-semibold">{detailTarget.materiales.length} SKUs</span>
                </div>
              </div>
            </div>

            {/* Score Global */}
            {detailScore && (
              <div className="bg-gray-950 p-4 rounded-lg border border-gray-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2"><IconGrafico size={16} aria-hidden /> Score de Calidad</h4>
                  <span className={`text-2xl font-bold ${
                    detailScore.score_calidad >= 80 ? 'text-emerald-400' :
                    detailScore.score_calidad >= 60 ? 'text-yellow-400' : 'text-red-400'
                  }`}>{Math.round(detailScore.score_calidad)}/100</span>
                </div>
                {detailScore.recomendacion_estatus && (
                  <div className="bg-amber-950/20 border border-amber-500/20 rounded-lg p-2">
                    <p className="text-xs text-amber-400 flex items-center gap-1"><IconAlertas size={13} aria-hidden /> {detailScore.recomendacion_estatus}</p>
                  </div>
                )}
                {detailScore.score_detalle && (
                  <div className="space-y-2">
                    {['calidad','puntualidad','exactitud','credito'].map((cat) => {
                      const val = detailScore.score_detalle[cat] ?? 100;
                      const pct = Math.min(100, Math.max(0, val));
                      const color = pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-yellow-500' : 'bg-red-500';
                      return (
                        <div key={cat}>
                          <div className="flex justify-between text-xs mb-0.5">
                            <span className="text-gray-400 capitalize">{cat}</span>
                            <span className="text-white font-semibold">{Math.round(pct)}</span>
                          </div>
                          <div className="w-full bg-gray-800 rounded-full h-2">
                            <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Notas / Observaciones */}
            {detailTarget.notas && (
              <div className="bg-gray-950/50 p-4 rounded-lg border border-gray-800/50">
                <h4 className="text-xs font-semibold uppercase text-gray-400 tracking-wider mb-2 flex items-center gap-2"><IconDocumento size={14} aria-hidden /> Notas / Observaciones</h4>
                <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">{detailTarget.notas}</p>
              </div>
            )}

            {/* Historial de Eventos */}
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-3 flex items-center gap-2"><IconHistorial size={16} aria-hidden /> Últimos Eventos</h4>
              {detailEvents.length === 0 ? (
                <div className="bg-gray-950 p-4 rounded-lg border border-gray-800 text-center">
                  <p className="text-gray-500 text-sm">Sin eventos registrados.</p>
                </div>
              ) : (
                <div className="bg-gray-950 rounded-lg border border-gray-800 overflow-hidden divide-y divide-gray-800/50 max-h-64 overflow-y-auto">
                  {detailEvents.map((ev) => (
                    <div key={ev.id} className="px-4 py-2.5 text-sm flex justify-between items-center">
                      <div>
                        <span className="text-gray-300 font-medium">{ev.tipo_evento}</span>
                        {ev.descripcion && <p className="text-gray-500 text-xs">{ev.descripcion}</p>}
                        {ev.referencia_id && <p className="text-gray-600 text-xs">Ref: {ev.referencia_id}</p>}
                      </div>
                      <div className="text-right">
                        <span className={`font-bold ${ev.impacto >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {ev.impacto > 0 ? '+' : ''}{ev.impacto}
                        </span>
                        <p className="text-gray-600 text-xs">{new Date(ev.fecha).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Lista Completa de Materiales */}
            <div>
              <h4 className="text-sm font-semibold text-gray-300 mb-3 flex justify-between items-center">
                <span className="flex items-center gap-2"><IconInventario size={16} aria-hidden /> Matriz Completa de Materiales Surtidos</span>
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
            <div className="flex justify-between items-center border-t border-gray-800 pt-4">
              <button
                onClick={() => setIncidentModalOpen(true)}
                className="inline-flex items-center gap-2 bg-red-600/20 text-red-400 hover:bg-red-600/30 border border-red-500/30 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                <IconAlertas size={16} aria-hidden /> Registrar Incidencia
              </button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => { setDetailModalOpen(false); setDetailTarget(null); }}>Cerrar</Button>
                <button
                  onClick={() => {
                    setDetailModalOpen(false);
                    handleOpenEditModal(detailTarget);
                  }}
                  className="inline-flex items-center gap-2 bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 border border-amber-500/30 px-5 py-2 rounded-lg text-sm font-medium transition-colors"
                >
                  <IconEditar size={16} aria-hidden /> Editar Proveedor
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Registrar Incidencia */}
      {incidentModalOpen && detailTarget && (
        <div className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl w-full max-w-md p-6 text-white space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold border-b border-gray-800 pb-2 flex items-center gap-2"><IconAlertas size={18} aria-hidden /> Registrar Incidencia</h3>
            <form onSubmit={handleRegistrarIncidencia} className="space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Tipo de Incidencia</label>
                <select value={incidentTipo} onChange={(e) => setIncidentTipo(e.target.value)} className="bg-gray-950 border border-gray-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-emerald-500">
                  <option value="MATERIAL_INCORRECTO">Material Incorrecto</option>
                  <option value="CANTIDAD_ERRONEA">Cantidad Errónea</option>
                  <option value="OTRO">Otro</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Descripción</label>
                <textarea rows={3} value={incidentDesc} onChange={(e) => setIncidentDesc(e.target.value)} className="bg-gray-950 border border-gray-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-emerald-500" placeholder="Describe la incidencia..." required />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-gray-400">Referencia OC ID (opcional)</label>
                <input type="text" value={incidentRef} onChange={(e) => setIncidentRef(e.target.value)} className="bg-gray-950 border border-gray-800 rounded-lg p-2 text-sm text-white focus:outline-none focus:border-emerald-500" placeholder="Ej: OC-20260101120000" />
              </div>
              <div className="flex justify-end gap-2 border-t border-gray-800 pt-4">
                <Button type="button" variant="secondary" onClick={() => setIncidentModalOpen(false)}>Cancelar</Button>
                <Button type="submit" variant="danger">Registrar</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Popup Modal: Confirmar Eliminación Personalizado */}
      {showDeleteModal && deleteTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-2xl border border-red-700/40 w-full max-w-md animate-in zoom-in-95 duration-200 text-white shadow-2xl">
            <div className="p-6 border-b border-gray-800">
              <h3 className="text-lg font-bold text-red-400 flex items-center gap-2"><IconAlertas size={18} aria-hidden /> Confirmar Eliminación</h3>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-gray-300 text-sm">¿Está seguro de que desea eliminar permanentemente este proveedor?</p>
              <div className="bg-gray-950 rounded-lg p-4 border border-gray-800 space-y-1.5 text-sm">
                <p><span className="text-gray-500">Razón Social:</span> <strong className="text-white">{deleteTarget.razon_social}</strong></p>
                <p><span className="text-gray-500">RFC:</span> <span className="text-gray-300 font-mono">{deleteTarget.rfc}</span></p>
                <p><span className="text-gray-500">Materiales Asignados:</span> <span className="text-emerald-400 font-medium">{deleteTarget.materiales.length} SKUs</span></p>
              </div>
              <div className="bg-red-950/20 border border-red-900/30 rounded-lg p-3">
                <p className="text-xs text-red-400 leading-relaxed flex items-start gap-1">
                  <IconAlertas size={13} className="mt-0.5 shrink-0" aria-hidden />
                  <span>Esta acción es destructiva. Se romperá el vínculo directo en el catálogo y no podrá utilizarse para nuevas Órdenes de Compra hasta volver a registrarlo.</span>
                </p>
              </div>
            </div>
            <div className="p-6 border-t border-gray-800 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => { setShowDeleteModal(false); setDeleteTarget(null); }}>Cancelar</Button>
              <Button variant="danger" onClick={handleEliminarConfirm} leftIcon={IconEliminar}>Eliminar</Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}