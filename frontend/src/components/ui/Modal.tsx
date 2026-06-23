'use client';

import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { IconCerrar } from '@/lib/icons';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
}

const sizeMap: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
};

/**
 * Accessible modal built on Radix Dialog: Escape to close, click on overlay to
 * close, focus trap, and focus return to the trigger on close — all handled by
 * Radix. `onClose` runs whenever the dialog requests to close.
 */
export default function Modal({ open, onClose, title, children, footer, size = 'md' }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50" />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <Dialog.Content
            aria-describedby={undefined}
            className={`pointer-events-auto bg-gray-900 border border-gray-700 rounded-xl w-full shadow-2xl max-h-[90vh] overflow-y-auto focus:outline-none ${sizeMap[size]}`}
          >
            <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
              <Dialog.Title className="text-base font-bold text-white">{title}</Dialog.Title>
              <Dialog.Close
                className="text-gray-300 hover:text-white transition-colors rounded focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                aria-label="Cerrar"
              >
                <IconCerrar size={20} aria-hidden />
              </Dialog.Close>
            </div>
            <div className="p-6">{children}</div>
            {footer && (
              <div className="px-6 py-4 border-t border-gray-800 flex gap-3 justify-end">{footer}</div>
            )}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
