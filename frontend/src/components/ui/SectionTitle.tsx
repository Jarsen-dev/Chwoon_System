'use client';

import React from 'react';

interface SectionTitleProps {
  children: React.ReactNode;
  className?: string;
}

export default function SectionTitle({ children, className = '' }: SectionTitleProps) {
  return <h3 className={`text-lg font-semibold text-gray-300 ${className}`}>{children}</h3>;
}
