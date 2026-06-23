// Central navigation matrix — single source of truth for cross-module links.
// Role → module visibility mirrors middleware.ts (RUTAS_PROTEGIDAS).
import { MODULE_THEME } from '@/lib/theme';

export interface NavModule {
  key: string;        // MODULE_THEME key
  href: string;
  roles: string[];    // roles allowed to access (matches middleware)
}

export const NAV_MODULES: NavModule[] = [
  { key: 'produccion', href: '/',          roles: ['admin', 'supervisor', 'operador', 'calidad'] },
  { key: 'compras',    href: '/compras',   roles: ['admin', 'finanzas', 'compras'] },
  { key: 'ventas',     href: '/ventas',    roles: ['admin', 'finanzas', 'ventas'] },
  { key: 'calidad',    href: '/calidad',   roles: ['admin', 'calidad'] },
  { key: 'almacen',    href: '/almacen',   roles: ['admin', 'almacen'] },
  { key: 'logistica',  href: '/logistica', roles: ['admin', 'logistica'] },
  { key: 'maquinas',   href: '/maquinas',  roles: ['admin', 'supervisor', 'operador'] },
  { key: 'admin',      href: '/admin',     roles: ['admin'] },
];

/** Modules a role may navigate to, optionally excluding the current module. */
export function navModulesForRole(rol: string | null, exclude?: string): NavModule[] {
  if (!rol) return [];
  return NAV_MODULES.filter(
    (m) => m.key !== exclude && m.roles.includes(rol) && m.key in MODULE_THEME,
  );
}
