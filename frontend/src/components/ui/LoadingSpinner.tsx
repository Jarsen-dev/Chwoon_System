'use client';

import React from 'react';

interface LoadingSpinnerProps {
  /** Override the spinner color with a Tailwind border class, e.g. 'border-emerald-400'.
   *  When omitted, derives from the module accent (var(--accent)). */
  colorClass?: string;
  sizeClass?: string;  // e.g. 'h-12 w-12'
  label?: string;
}

export default function LoadingSpinner({
  colorClass,
  sizeClass = 'h-12 w-12',
  label,
}: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div
        className={`animate-spin rounded-full ${sizeClass} border-b-2 ${colorClass || 'border-[var(--accent)]'}`}
      />
      {label && <span className="text-sm text-gray-300">{label}</span>}
    </div>
  );
}
