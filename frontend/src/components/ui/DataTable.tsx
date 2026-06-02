'use client';

import React from 'react';

export type DataTableColumn<T> = {
  key: string;
  header: React.ReactNode;
  render?: (row: T, index: number) => React.ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
};

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  loading?: boolean;
  emptyText?: string;
  maxHeight?: string;
  stickyHeader?: boolean;
  className?: string;
}

export default function DataTable<T extends Record<string, any>>({
  columns,
  data,
  loading,
  emptyText = 'No hay registros',
  maxHeight,
  stickyHeader = true,
  className = '',
}: DataTableProps<T>) {
  const alignClass = (a?: string) => {
    if (a === 'center') return 'text-center';
    if (a === 'right') return 'text-right';
    return 'text-left';
  };

  return (
    <div className={`overflow-x-auto ${maxHeight ? `max-h-[${maxHeight}] overflow-y-auto` : ''} ${className}`}>
      <table className="w-full text-sm divide-y divide-gray-800">
        <thead className={stickyHeader ? 'sticky top-0 z-10' : undefined}>
          <tr className="bg-gray-800">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`px-4 py-3 text-xs font-medium text-gray-400 uppercase tracking-wider ${alignClass(col.align)} ${col.className || ''}`}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800">
          {loading && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-400">
                <div className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-400" />
                  Cargando...
                </div>
              </td>
            </tr>
          )}
          {!loading && data.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-gray-500">
                {emptyText}
              </td>
            </tr>
          )}
          {!loading &&
            data.map((row, idx) => (
              <tr key={idx} className="hover:bg-gray-800/50 transition-colors">
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`px-4 py-3 whitespace-nowrap text-white ${alignClass(col.align)} ${col.className || ''}`}
                  >
                    {col.render ? col.render(row, idx) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
