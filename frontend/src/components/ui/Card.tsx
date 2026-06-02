'use client';

import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'light';
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export default function Card({
  children,
  className = '',
  variant = 'default',
  padding = 'md',
}: CardProps) {
  const base =
    variant === 'light'
      ? 'rounded-xl border bg-white border-gray-200 shadow-sm'
      : 'rounded-xl border bg-gray-900 border-gray-800';

  const padMap = {
    none: '',
    sm: 'p-3',
    md: 'p-5',
    lg: 'p-6',
  };

  return <div className={`${base} ${padMap[padding]} ${className}`}>{children}</div>;
}
