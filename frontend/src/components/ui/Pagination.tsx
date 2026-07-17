'use client';

import React from 'react';
import { IconAnterior, IconSiguiente } from '@/lib/icons';

interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
  className?: string;
}

export default function Pagination({ total, limit, offset, onChange, className = '' }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.floor(offset / limit) + 1;

  if (total <= limit) return null;

  return (
    <div className={`flex items-center justify-center gap-3 ${className}`}>
      <button
        onClick={() => onChange(Math.max(0, offset - limit))}
        disabled={offset <= 0}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-gray-300 bg-gray-800 border border-gray-700 hover:bg-gray-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <IconAnterior size={14} aria-hidden /> Anterior
      </button>
      <span className="text-xs text-gray-400 whitespace-nowrap">
        Página <span className="font-semibold text-gray-200">{currentPage}</span> de{' '}
        <span className="font-semibold text-gray-200">{totalPages}</span>
      </span>
      <button
        onClick={() => onChange(offset + limit)}
        disabled={offset + limit >= total}
        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-gray-300 bg-gray-800 border border-gray-700 hover:bg-gray-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Siguiente <IconSiguiente size={14} aria-hidden />
      </button>
    </div>
  );
}
