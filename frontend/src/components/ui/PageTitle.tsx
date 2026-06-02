'use client';

import React from 'react';

interface PageTitleProps {
  children: React.ReactNode;
  className?: string;
}

export default function PageTitle({ children, className = '' }: PageTitleProps) {
  return <h2 className={`text-2xl font-bold text-white ${className}`}>{children}</h2>;
}
