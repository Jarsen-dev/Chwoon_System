'use client';

import Link from 'next/link';
import { navModulesForRole } from '@/lib/nav';
import { getModuleTheme } from '@/lib/theme';

interface ModuleNavLinksProps {
  rol: string | null;
  /** Current module key, excluded from the list. */
  current?: string;
}

/**
 * Compact cross-module switcher: a neutral chip per module with a colored dot
 * (the module accent) and its icon. Replaces the hardcoded, saturated link
 * blocks that were duplicated across every module page.
 */
export default function ModuleNavLinks({ rol, current }: ModuleNavLinksProps) {
  const modules = navModulesForRole(rol, current);
  if (modules.length === 0) return null;

  return (
    <nav className="flex items-center gap-1.5">
      {modules.map((m) => {
        const theme = getModuleTheme(m.key);
        const Icon = theme.icon;
        return (
          <Link
            key={m.key}
            href={m.href}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-gray-300 bg-gray-800/60 hover:bg-gray-700 hover:text-white transition-colors"
          >
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: theme.accentHex }}
              aria-hidden
            />
            <Icon size={16} aria-hidden />
            <span className="hidden lg:inline">{theme.name}</span>
          </Link>
        );
      })}
    </nav>
  );
}
