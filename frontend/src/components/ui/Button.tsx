'use client';

import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'accent';
  buttonSize?: 'sm' | 'md' | 'lg';
  accentColor?: string; // Tailwind color name, e.g. 'emerald' | 'orange' | 'blue'
  children: React.ReactNode;
}

export default function Button({
  variant = 'primary',
  buttonSize = 'md',
  accentColor = 'blue',
  className = '',
  children,
  ...props
}: ButtonProps) {
  const buttonSizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-3 text-base',
  };

  let variantClasses = '';
  if (variant === 'primary') {
    variantClasses = 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500';
  } else if (variant === 'secondary') {
    variantClasses = 'bg-gray-700 hover:bg-gray-600 text-white focus:ring-gray-500';
  } else if (variant === 'danger') {
    variantClasses = 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500';
  } else if (variant === 'ghost') {
    variantClasses = 'bg-transparent hover:bg-gray-800 text-gray-300 border border-gray-700 focus:ring-gray-500';
  } else if (variant === 'accent') {
    // Safe static map for accent colors used in the app
    const accentMap: Record<string, string> = {
      emerald: 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500',
      violet: 'bg-violet-600 hover:bg-violet-700 focus:ring-violet-500',
      cyan: 'bg-cyan-600 hover:bg-cyan-700 focus:ring-cyan-500',
      orange: 'bg-orange-600 hover:bg-orange-700 focus:ring-orange-500',
      teal: 'bg-teal-600 hover:bg-teal-700 focus:ring-teal-500',
      blue: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
      yellow: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
      amber: 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500',
      red: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
    };
    variantClasses = `${accentMap[accentColor] || accentMap['blue']} text-white`;
  }

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-950 disabled:opacity-50 disabled:cursor-not-allowed ${buttonSizeClasses[buttonSize]} ${variantClasses} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
