'use client';

import React from 'react';
import type { LucideIcon } from '@/lib/icons';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: LucideIcon;
  rightIcon?: LucideIcon;
  children: React.ReactNode;
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-3 text-base',
};

const iconSize: Record<ButtonSize, number> = { sm: 14, md: 16, lg: 18 };

// `primary` and the deprecated `accent` both derive from the module accent
// (var(--accent)), set by ModuleThemeContext on the module root container.
const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-[var(--accent-fg)] focus:ring-[var(--accent)]',
  secondary: 'bg-gray-700 hover:bg-gray-600 text-white focus:ring-gray-500',
  ghost:
    'bg-transparent hover:bg-gray-800 text-gray-300 border border-gray-700 focus:ring-gray-500',
  danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  leftIcon: LeftIcon,
  rightIcon: RightIcon,
  className = '',
  children,
  ...props
}: ButtonProps) {
  const icoSize = iconSize[size];

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-950 disabled:opacity-50 disabled:cursor-not-allowed ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {LeftIcon && <LeftIcon size={icoSize} aria-hidden />}
      {children}
      {RightIcon && <RightIcon size={icoSize} aria-hidden />}
    </button>
  );
}
