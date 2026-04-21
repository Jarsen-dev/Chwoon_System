'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import Link from 'next/link';
import DashboardTab from './DashboardTab';
import ComprasTab from './ComprasTab';
import VentasTab from './VentasTab';
import DevolucionesTab from './DevolucionesTab';
import PlanVentasTab from './PlanVentasTab';
import ScannerIQCTab from './ScannerIQCTab';

const TABS = [
  { id: 'dashboard', label: '📊 Dashboard', icon: '📊' },
  { id: 'compras', label: '🛒 Compras', icon: '🛒' },
  { id: 'ventas', label: '💵 Ventas', icon: '💵' },
  { id: 'plan-ventas', label: '📋 Plan Ventas', icon: '📋' },
  { id: 'devoluciones', label: '🔄 Devoluciones', icon: '🔄' },
  { id: 'scanner-iqc', label: '🔍 Scanner IQC', icon: '🔍' },
];

export default function FinanzasPage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const { token, rol, username, logout, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!token) {
      router.push('/login');
      return;
    }
    if (rol && !['admin', 'finanzas'].includes(rol)) {
      router.push('/unauthorized');
    }
  }, [token, rol, router, loading]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-400" />
      </div>
    );
  }

  if (!token || (rol && !['admin', 'finanzas'].includes(rol))) {
    return null;
  }

  const rolBadge: Record<string, { icon: string; color: string }> = {
    admin: { icon: '👑', color: 'text-yellow-400' },
    finanzas: { icon: '💰', color: 'text-emerald-400' },
  };
  const badge = rolBadge[rol || ''] || { icon: '👤', color: 'text-gray-400' };

  return (
    <div className="fixed inset-0 bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <img src="/Logo.png" alt="Logo" className="h-10 w-auto" />
          <h1 className="text-xl font-bold">Panel de Compras y Ventas</h1>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            🏭 Producción
          </Link>

          {rol === 'admin' && (
            <>
              <Link
                href="/calidad"
                className="bg-cyan-600 hover:bg-cyan-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                🔬 Calidad
              </Link>
              <Link
                href="/almacen"
                className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                📦 Almacén
              </Link>
              <Link
                href="/admin"
                className="bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                👑 Admin
              </Link>
            </>
          )}

          <span className={`text-sm font-medium ${badge.color}`}>
            {badge.icon} {username}
          </span>

          <button
            onClick={logout}
            className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            🚪 Salir
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-gray-900 border-b border-gray-800 px-6 shrink-0">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium rounded-t-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-gray-950 text-emerald-400 border-b-2 border-emerald-400'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        {activeTab === 'dashboard' && <DashboardTab token={token} />}
        {activeTab === 'compras' && <ComprasTab token={token} />}
        {activeTab === 'ventas' && <VentasTab token={token} />}
        {activeTab === 'plan-ventas' && <PlanVentasTab token={token} />}
        {activeTab === 'devoluciones' && <DevolucionesTab token={token} />}
        {activeTab === 'scanner-iqc' && <ScannerIQCTab token={token} />}
      </main>
    </div>
  );
}