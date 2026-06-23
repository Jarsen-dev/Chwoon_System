'use client';

import React, { createContext, useContext, useMemo } from 'react';
import { getModuleTheme, type ModuleTheme } from '@/lib/theme';

interface ModuleThemeContextValue {
  moduleKey: string;
  theme: ModuleTheme;
}

const ModuleThemeContext = createContext<ModuleThemeContextValue | null>(null);

/** Accent CSS custom properties as an inline style object. */
function accentVars(theme: ModuleTheme): React.CSSProperties {
  return {
    '--accent': theme.accentHex,
    '--accent-hover': theme.accentHover,
    '--accent-soft': theme.accentSoft,
    '--accent-fg': theme.accentFg,
  } as React.CSSProperties;
}

interface ModuleThemeProviderProps {
  moduleKey: string;
  /** Extra classes for the root container. */
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

/**
 * Provides the module theme and sets the accent CSS variables (`--accent`,
 * `--accent-hover`, `--accent-soft`, `--accent-fg`) on its root container, so
 * any descendant can consume `var(--accent)` without hardcoding colors.
 */
export function ModuleThemeProvider({
  moduleKey,
  className,
  style,
  children,
}: ModuleThemeProviderProps) {
  const theme = useMemo(() => getModuleTheme(moduleKey), [moduleKey]);
  const value = useMemo(() => ({ moduleKey, theme }), [moduleKey, theme]);

  return (
    <ModuleThemeContext.Provider value={value}>
      <div className={className} style={{ ...accentVars(theme), ...style }}>
        {children}
      </div>
    </ModuleThemeContext.Provider>
  );
}

/** Returns the current module theme. Falls back to the default theme outside a provider. */
export function useModuleTheme(): ModuleTheme {
  const ctx = useContext(ModuleThemeContext);
  return ctx?.theme ?? getModuleTheme('produccion');
}
