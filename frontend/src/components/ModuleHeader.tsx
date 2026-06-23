'use client';

import React from 'react';

interface ModuleHeaderProps {
  title: string;
  /** Right-side content: nav links, user badge, logout, etc. */
  right?: React.ReactNode;
}

/** Shared module header: logo + title + right slot. */
export default function ModuleHeader({ title, right }: ModuleHeaderProps) {
  return (
    <header className="bg-gray-900 border-b border-gray-800 px-6 py-3 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/Logo.png" alt="Logo" className="h-10 w-auto" />
        <h1 className="text-xl font-bold">{title}</h1>
      </div>
      {right && <div className="flex items-center gap-3">{right}</div>}
    </header>
  );
}
