'use client';

import React from 'react';

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  inputSize?: 'sm' | 'md' | 'lg';
}

export default function FormInput({
  label,
  error,
  inputSize = 'md',
  className = '',
  ...props
}: FormInputProps) {
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-3 text-base',
  };

  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-semibold uppercase tracking-wider text-gray-300">{label}</label>}
      <input
        className={`w-full bg-gray-800 border border-gray-700 rounded-lg text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-[var(--accent)] transition-colors ${sizeClasses[inputSize]} ${error ? 'border-red-500 focus:border-red-500 focus:ring-red-500/40' : ''} ${className}`}
        {...props}
      />
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
