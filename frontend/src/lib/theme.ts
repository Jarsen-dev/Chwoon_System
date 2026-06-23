// Centralized design tokens per module.
// Use these to drive accent colors, spinner colors, and nav link colors.
// IMPORTANT: Tailwind classes referenced here must exist as full strings in source files
// so the JIT compiler keeps them (no dynamic class concatenation at runtime).

import type { LucideIcon } from '@/lib/icons';
import {
  IconAdmin,
  IconFinanzas,
  IconCompras,
  IconVentas,
  IconCalidad,
  IconAlmacen,
  IconLogistica,
  IconProduccion,
  IconMaquinas,
  IconUsuario,
} from '@/lib/icons';

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
  // Raw hex/rgba values used to drive CSS custom properties (--accent, etc.)
  // via ModuleThemeContext. These are NOT Tailwind classes.
  accentHex: string;      // accent base (≈ Tailwind 600), e.g. '#059669'
  accentHover: string;    // accent hover (≈ Tailwind 700), e.g. '#047857'
  accentSoft: string;     // accent at ~15% alpha for tenue backgrounds/chips
  accentFg: string;       // foreground over the accent (text on buttons)
  icon: LucideIcon;       // module icon
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
    accentHex: '#059669',
    accentHover: '#047857',
    accentSoft: 'rgba(16,185,129,0.15)',
    accentFg: '#ffffff',
    icon: IconCompras,
  },
  ventas: {
    name: 'Ventas',
    accent: 'violet',
    spinner: 'border-violet-400',
    navBg: 'bg-violet-600',
    navHover: 'hover:bg-violet-700',
    tabText: 'text-violet-400',
    tabBorder: 'border-violet-400',
    accentHex: '#7c3aed',
    accentHover: '#6d28d9',
    accentSoft: 'rgba(139,92,246,0.15)',
    accentFg: '#ffffff',
    icon: IconVentas,
  },
  calidad: {
    name: 'Calidad',
    accent: 'cyan',
    spinner: 'border-cyan-400',
    navBg: 'bg-cyan-600',
    navHover: 'hover:bg-cyan-700',
    tabText: 'text-cyan-400',
    tabBorder: 'border-cyan-400',
    accentHex: '#0891b2',
    accentHover: '#0e7490',
    accentSoft: 'rgba(6,182,212,0.15)',
    accentFg: '#ffffff',
    icon: IconCalidad,
  },
  almacen: {
    name: 'Almacén',
    accent: 'orange',
    spinner: 'border-orange-400',
    navBg: 'bg-orange-600',
    navHover: 'hover:bg-orange-700',
    tabText: 'text-orange-400',
    tabBorder: 'border-orange-400',
    accentHex: '#ea580c',
    accentHover: '#c2410c',
    accentSoft: 'rgba(249,115,22,0.15)',
    accentFg: '#ffffff',
    icon: IconAlmacen,
  },
  logistica: {
    name: 'Logística',
    accent: 'teal',
    spinner: 'border-teal-400',
    navBg: 'bg-teal-600',
    navHover: 'hover:bg-teal-700',
    tabText: 'text-teal-400',
    tabBorder: 'border-teal-400',
    accentHex: '#0d9488',
    accentHover: '#0f766e',
    accentSoft: 'rgba(20,184,166,0.15)',
    accentFg: '#ffffff',
    icon: IconLogistica,
  },
  produccion: {
    name: 'Producción',
    accent: 'blue',
    spinner: 'border-blue-400',
    navBg: 'bg-blue-600',
    navHover: 'hover:bg-blue-700',
    tabText: 'text-blue-400',
    tabBorder: 'border-blue-400',
    accentHex: '#2563eb',
    accentHover: '#1d4ed8',
    accentSoft: 'rgba(59,130,246,0.15)',
    accentFg: '#ffffff',
    icon: IconProduccion,
  },
  admin: {
    name: 'Admin',
    accent: 'yellow',
    spinner: 'border-yellow-400',
    navBg: 'bg-yellow-600',
    navHover: 'hover:bg-yellow-700',
    tabText: 'text-yellow-400',
    tabBorder: 'border-yellow-400',
    accentHex: '#ca8a04',
    accentHover: '#a16207',
    accentSoft: 'rgba(234,179,8,0.15)',
    accentFg: '#ffffff',
    icon: IconAdmin,
  },
  maquinas: {
    name: 'Máquinas',
    accent: 'red',
    spinner: 'border-red-400',
    navBg: 'bg-red-600',
    navHover: 'hover:bg-red-700',
    tabText: 'text-red-400',
    tabBorder: 'border-red-400',
    accentHex: '#dc2626',
    accentHover: '#b91c1c',
    accentSoft: 'rgba(239,68,68,0.15)',
    accentFg: '#ffffff',
    icon: IconMaquinas,
  },
};

// Shared role badges used in headers. `icon` is a Lucide component (tintable SVG).
export interface RoleBadge {
  icon: LucideIcon;
  color: string;
}

export const ROLE_BADGE: Record<string, RoleBadge> = {
  admin:      { icon: IconAdmin,      color: 'text-yellow-400' },
  finanzas:   { icon: IconFinanzas,   color: 'text-emerald-400' },
  compras:    { icon: IconCompras,    color: 'text-lime-400' },
  ventas:     { icon: IconVentas,     color: 'text-violet-400' },
  calidad:    { icon: IconCalidad,    color: 'text-cyan-400' },
  almacen:    { icon: IconAlmacen,    color: 'text-orange-400' },
  logistica:  { icon: IconLogistica,  color: 'text-teal-400' },
  supervisor: { icon: IconUsuario,    color: 'text-blue-400' },
  operador:   { icon: IconUsuario,    color: 'text-green-400' },
};

// Fallback badge when role is unknown.
export const ROLE_BADGE_FALLBACK: RoleBadge = { icon: IconUsuario, color: 'text-gray-400' };

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
