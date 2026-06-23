'use client';

import React from 'react';
import { ModuleThemeProvider } from '@/context/ModuleThemeContext';
import ModuleHeader from '@/components/ModuleHeader';
import ModuleNavLinks from '@/components/ModuleNavLinks';
import UserBadge from '@/components/UserBadge';
import Button from '@/components/ui/Button';
import { IconSalir, type LucideIcon } from '@/lib/icons';

export interface TabDef {
  id: string;
  label: string;
  /** Optional during migration; required for fully-migrated modules. */
  icon?: LucideIcon;
}

interface ModuleShellProps {
  moduleKey: string;
  title: string;
  tabs: TabDef[];
  activeTab: string;
  onTabChange: (id: string) => void;
  /**
   * Custom header right content. When omitted and `rol`/`onLogout` are given,
   * a standard right side is rendered: cross-module links + user badge + logout.
   */
  headerRight?: React.ReactNode;
  rol?: string | null;
  username?: string | null;
  onLogout?: () => void;
  children: React.ReactNode;
}

export default function ModuleShell({
  moduleKey,
  title,
  tabs,
  activeTab,
  onTabChange,
  headerRight,
  rol,
  username,
  onLogout,
  children,
}: ModuleShellProps) {
  const defaultRight =
    headerRight ??
    (rol !== undefined ? (
      <>
        <ModuleNavLinks rol={rol ?? null} current={moduleKey} />
        <UserBadge rol={rol ?? null} username={username ?? null} />
        {onLogout && (
          <Button variant="danger" size="md" leftIcon={IconSalir} onClick={onLogout}>
            Salir
          </Button>
        )}
      </>
    ) : null);

  return (
    <ModuleThemeProvider
      moduleKey={moduleKey}
      className="fixed inset-0 bg-gray-950 text-white flex flex-col"
    >
      <ModuleHeader title={title} right={defaultRight} />

      {tabs.length > 0 && (
        <div className="bg-gray-900 border-b border-gray-800 px-6 shrink-0">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`inline-flex items-center gap-2 px-4 py-3 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap border-b-2 ${
                    active
                      ? 'bg-gray-950 text-[var(--accent)] border-[var(--accent)]'
                      : 'text-gray-300 border-transparent hover:text-white hover:bg-gray-800'
                  }`}
                >
                  {Icon && <Icon size={16} aria-hidden />}
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </ModuleThemeProvider>
  );
}
