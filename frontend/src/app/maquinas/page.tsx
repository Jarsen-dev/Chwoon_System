'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import { ModuleShell, LoadingSpinner } from '@/components/ui';
import { getModuleTheme, ROLE_BADGE } from '@/lib/theme';
import { getMaquinas } from '@/lib/api';
import type { MaquinaEstado } from '@/types';
import MaquinasEPSTab from './MaquinasEPSTab';

const ALL_TABS = [
  { id: 'eps', label: '🔧 Máquinas EPS' },
];

type EstadoVivo = Partial<MaquinaEstado>;
interface WsMensaje {
  type: 'snapshot' | 'maquina_update' | string;
  maquinas?: { maquina: string; estado: EstadoVivo }[];
  maquina?: string;
  estado?: EstadoVivo;
}

const THEME = getModuleTheme('maquinas');
const ROLES_PERMITIDOS = ['admin', 'supervisor', 'operador'];

export default function MaquinasPage() {
  const [activeTab, setActiveTab] = useState('');
  const [maquinas, setMaquinas] = useState<MaquinaEstado[]>([]);
  const [wsStatus, setWsStatus] = useState<'conectado' | 'desconectado'>('desconectado');
  const { token, rol, username, logout, loading, tieneAccesoTab } = useAuth();
  const router = useRouter();
  const wsRef = useRef<WebSocket | null>(null);

  const tabs = ALL_TABS.filter(t => tieneAccesoTab('maquinas', t.id));

  useEffect(() => {
    if (tabs.length > 0 && !activeTab) setActiveTab(tabs[0].id);
  }, [tabs.length]);

  useEffect(() => {
    if (loading) return;
    if (!token) { router.push('/login'); return; }
    if (rol && !ROLES_PERMITIDOS.includes(rol)) router.push('/unauthorized');
  }, [token, rol, router, loading]);

  // Carga inicial vía REST
  const cargarMaquinas = useCallback(async () => {
    if (!token) return;
    try {
      const data = await getMaquinas(token);
      setMaquinas(data);
    } catch (e) {
      console.error('Error cargando máquinas:', e);
    }
  }, [token]);

  useEffect(() => {
    if (token) cargarMaquinas();
  }, [token, cargarMaquinas]);

  // Suscripción WebSocket en vivo (arrow simple; la auto-referencia para
  // reconectar vive en un closure anidado, así que no se usa antes de declararse).
  const conectarWebSocket = () => {
    if (!token) return;
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000';
    const socket = new WebSocket(`${wsUrl}/maquinas/ws?token=${token}`);
    wsRef.current = socket;

    socket.onopen = () => setWsStatus('conectado');
    socket.onerror = () => setWsStatus('desconectado');
    socket.onclose = () => {
      setWsStatus('desconectado');
      setTimeout(() => {
        if (wsRef.current === socket || wsRef.current === null) conectarWebSocket();
      }, 3_000);
    };

    socket.onmessage = (event) => {
      let msg: WsMensaje;
      try { msg = JSON.parse(event.data); } catch { return; }

      if (msg.type === 'snapshot' && Array.isArray(msg.maquinas)) {
        // Mezcla el estado en vivo del snapshot sobre la lista cargada por REST
        const lista = msg.maquinas;
        setMaquinas(prev => prev.map(m => {
          const s = lista.find(x => x.maquina === m.codigo);
          return s ? { ...m, ...s.estado } : m;
        }));
      } else if (msg.type === 'maquina_update' && msg.maquina) {
        setMaquinas(prev => prev.map(m =>
          m.codigo === msg.maquina ? { ...m, ...msg.estado } : m
        ));
      }
    };
  };

  useEffect(() => {
    if (!token) return;
    if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
    conectarWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.onclose = null;  // evita reconexión tras desmontar
        wsRef.current.close();
        wsRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
        <LoadingSpinner colorClass={THEME.spinner} />
      </div>
    );
  }

  if (!token || (rol && !ROLES_PERMITIDOS.includes(rol))) return null;

  const badge = ROLE_BADGE[rol || ''] || { icon: '👤', color: 'text-gray-400' };

  const headerRight = (
    <>
      <Link href="/" className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
        🏭 Producción
      </Link>
      <span className={`flex items-center gap-1.5 text-xs ${wsStatus === 'conectado' ? 'text-emerald-400' : 'text-red-400'}`}>
        <span className={`h-2 w-2 rounded-full ${wsStatus === 'conectado' ? 'bg-emerald-400' : 'bg-red-400'}`} />
        {wsStatus === 'conectado' ? 'En vivo' : 'Sin conexión'}
      </span>
      <span className={`text-sm font-medium ${badge.color}`}>{badge.icon} {username}</span>
      <button onClick={logout} className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
        🚪 Salir
      </button>
    </>
  );

  return (
    <ModuleShell
      moduleKey="maquinas"
      title="Máquinas EPS"
      tabs={tabs}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      headerRight={headerRight}
    >
      {activeTab === 'eps' && (
        <MaquinasEPSTab maquinas={maquinas} onRefresh={cargarMaquinas} />
      )}
    </ModuleShell>
  );
}
