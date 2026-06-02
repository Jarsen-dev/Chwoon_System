'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { getModuleTheme } from '@/lib/theme';

interface TabDef {
  id: string;
  label: string;
}

interface ModuleShellProps {
  moduleKey: string;
  title: string;
  tabs: TabDef[];
  activeTab: string;
  onTabChange: (id: string) => void;
  /** Extra content placed in the header right side (module links, user badge, logout). */
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}

export default function ModuleShell({
  moduleKey,
  title,
  tabs,
  activeTab,
  onTabChange,
  headerRight,
  children,
}: ModuleShellProps) {
  const theme = getModuleTheme(moduleKey);

  return (
    <div className="fixed inset-0 bg-gray-950 text-white flex flex-col">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <img src="/Logo.png" alt="Logo" className="h-10 w-auto" />
          <h1 className="text-xl font-bold">{title}</h1>
        </div>
        {headerRight && (
          <div className="flex items-center gap-3">
            {headerRight}
          </div>
        )}
      </header>

      {/* Tabs */}
      {tabs.length > 0 && (
        <div className="bg-gray-900 border-b border-gray-800 px-6 shrink-0">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`px-4 py-3 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap ${
                  activeTab === tab.id
                    ? `bg-gray-950 ${theme.tabText} border-b-2 ${theme.tabBorder}`
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6">
        {children}
      </main>
    </div>
  );
}
