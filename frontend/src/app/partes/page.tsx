'use client'

import { useState } from 'react'
import PartesTab from '@/components/PartesTab'
import ProductosTab from '@/components/ProductosTab'

const TABS = [
  { id: 'partes', label: '⚙️ Gestión de Partes', component: PartesTab },
  { id: 'productos', label: '📦 Catálogo de Productos', component: ProductosTab },
]

export default function PartesPage() {
  const [activeTab, setActiveTab] = useState('partes')

  const ActiveComponent = TABS.find((t) => t.id === activeTab)?.component

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="flex items-center gap-2 mb-6">
        <span className="text-2xl">⚙️</span>
        <h1 className="text-2xl font-bold text-slate-800">Gestión de Partes & Productos</h1>
      </div>

      <div className="flex border-b border-gray-200 mb-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-6 py-3 text-sm font-semibold transition-all border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {ActiveComponent && <ActiveComponent />}
    </div>
  )
}