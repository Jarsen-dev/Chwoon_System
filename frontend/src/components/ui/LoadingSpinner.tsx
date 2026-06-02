'use client';

import React from 'react';

interface LoadingSpinnerProps {
  colorClass?: string; // e.g. 'border-emerald-400'
  sizeClass?: string;  // e.g. 'h-12 w-12'
  label?: string;
}

export default function LoadingSpinner({
  colorClass = 'border-blue-400',
  sizeClass = 'h-12 w-12',
  label,
}: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3">
      <div className={`animate-spin rounded-full ${sizeClass} border-b-2 ${colorClass}`} />
      {label && <span className="text-sm text-gray-400">{label}</span>}
    </div>
  );
}
