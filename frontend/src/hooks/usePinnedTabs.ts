'use client';

import { useCallback, useEffect, useState } from 'react';

const DEFAULT_PINNED = ['home', 'captura', 'dashboard', 'productos', 'etiquetas'];

function getPinnedKey(user: string) {
  return `pinnedTabs_${user}`;
}

function loadPinnedTabs(user: string): string[] {
  if (typeof window === 'undefined') return DEFAULT_PINNED;
  try {
    const stored = localStorage.getItem(getPinnedKey(user));
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return DEFAULT_PINNED;
}

function savePinnedTabs(user: string, pinned: string[]) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(getPinnedKey(user), JSON.stringify(pinned));
}

/**
 * Manages the user's pinned (quick-access) tabs, persisted to localStorage per
 * username under `pinnedTabs_${user}`.
 */
export function usePinnedTabs(username: string | null) {
  const [pinnedTabs, setPinnedTabs] = useState<string[]>(DEFAULT_PINNED);

  useEffect(() => {
    if (username) setPinnedTabs(loadPinnedTabs(username));
  }, [username]);

  const togglePin = useCallback((tabId: string) => {
    setPinnedTabs(prev => {
      const next = prev.includes(tabId)
        ? prev.filter(id => id !== tabId)
        : [...prev, tabId];
      if (username) savePinnedTabs(username, next);
      return next;
    });
  }, [username]);

  return { pinnedTabs, togglePin };
}

export { DEFAULT_PINNED };
