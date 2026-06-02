// Centralized design tokens per module.
// Use these to drive accent colors, spinner colors, and nav link colors.
// IMPORTANT: Tailwind classes referenced here must exist as full strings in source files
// so the JIT compiler keeps them (no dynamic class concatenation at runtime).

export type AccentKey =
  | 'blue'
  | 'emerald'
  | 'violet'
  | 'cyan'
  | 'orange'
  | 'teal'
  | 'yellow'
  | 'amber'
  | 'red'
  | 'gray';

export interface ModuleTheme {
  name: string;
  accent: AccentKey;
  spinner: string;        // full border color class, e.g. 'border-emerald-400'
  navBg: string;          // full bg class, e.g. 'bg-emerald-600'
  navHover: string;       // full hover bg class, e.g. 'hover:bg-emerald-700'
  tabText: string;        // full text class, e.g. 'text-emerald-400'
  tabBorder: string;      // full border class, e.g. 'border-emerald-400'
}

export const MODULE_THEME: Record<string, ModuleTheme> = {
  compras: {
    name: 'Compras',
    accent: 'emerald',
    spinner: 'border-emerald-400',
    navBg: 'bg-emerald-600',
    navHover: 'hover:bg-emerald-700',
    tabText: 'text-emerald-400',
    tabBorder: 'border-emerald-400',
  },
  ventas: {
    name: 'Ventas',
    accent: 'violet',
    spinner: 'border-violet-400',
    navBg: 'bg-violet-600',
    navHover: 'hover:bg-violet-700',
    tabText: 'text-violet-400',
    tabBorder: 'border-violet-400',
  },
  calidad: {
    name: 'Calidad',
    accent: 'cyan',
    spinner: 'border-cyan-400',
    navBg: 'bg-cyan-600',
    navHover: 'hover:bg-cyan-700',
    tabText: 'text-cyan-400',
    tabBorder: 'border-cyan-400',
  },
  almacen: {
    name: 'Almacén',
    accent: 'orange',
    spinner: 'border-orange-400',
    navBg: 'bg-orange-600',
    navHover: 'hover:bg-orange-700',
    tabText: 'text-orange-400',
    tabBorder: 'border-orange-400',
  },
  logistica: {
    name: 'Logística',
    accent: 'teal',
    spinner: 'border-teal-400',
    navBg: 'bg-teal-600',
    navHover: 'hover:bg-teal-700',
    tabText: 'text-teal-400',
    tabBorder: 'border-teal-400',
  },
  produccion: {
    name: 'Producción',
    accent: 'blue',
    spinner: 'border-blue-400',
    navBg: 'bg-blue-600',
    navHover: 'hover:bg-blue-700',
    tabText: 'text-blue-400',
    tabBorder: 'border-blue-400',
  },
  admin: {
    name: 'Admin',
    accent: 'yellow',
    spinner: 'border-yellow-400',
    navBg: 'bg-yellow-600',
    navHover: 'hover:bg-yellow-700',
    tabText: 'text-yellow-400',
    tabBorder: 'border-yellow-400',
  },
};

// Shared role badges used in headers
export const ROLE_BADGE: Record<string, { icon: string; color: string }> = {
  admin:      { icon: '👑', color: 'text-yellow-400' },
  finanzas:   { icon: '💰', color: 'text-emerald-400' },
  compras:    { icon: '🛒', color: 'text-lime-400' },
  ventas:     { icon: '💵', color: 'text-violet-400' },
  calidad:    { icon: '🔬', color: 'text-cyan-400' },
  almacen:    { icon: '📦', color: 'text-orange-400' },
  logistica:  { icon: '🚛', color: 'text-teal-400' },
  supervisor: { icon: '🔵', color: 'text-blue-400' },
  operador:   { icon: '🟢', color: 'text-green-400' },
};

// Helper to get theme safely
export function getModuleTheme(moduleKey: string): ModuleTheme {
  return MODULE_THEME[moduleKey] || MODULE_THEME['admin'];
}

// Dark theme common colors (for non-module pages like login / unauthorized)
export const DARK_BG = 'bg-gray-950';
export const DARK_SURFACE = 'bg-gray-900';
export const DARK_SURFACE_2 = 'bg-gray-800';
export const DARK_BORDER = 'border-gray-800';
export const DARK_BORDER_2 = 'border-gray-700';
export const DARK_TEXT = 'text-white';
export const DARK_MUTED = 'text-gray-400';
