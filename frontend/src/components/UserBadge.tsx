'use client';

import { ROLE_BADGE, ROLE_BADGE_FALLBACK } from '@/lib/theme';

interface UserBadgeProps {
  rol: string | null;
  username: string | null;
}

/** Role icon (tintable SVG) + username, used in module headers. */
export default function UserBadge({ rol, username }: UserBadgeProps) {
  const badge = ROLE_BADGE[rol || ''] || ROLE_BADGE_FALLBACK;
  const Icon = badge.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${badge.color}`}>
      <Icon size={16} aria-hidden /> {username}
    </span>
  );
}
