'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { IconButton } from '@/components/ui';

interface SideDrawerProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** Sticky footer content (typically the action buttons). */
  footer?: React.ReactNode;
  children: React.ReactNode;
  widthClass?: string;
}

/**
 * Right-side slide-over panel. Replaces centered modals for creation flows.
 * Handles the backdrop, ESC-to-close, body scroll lock and a sticky
 * header/footer with a scrollable body.
 */
export const SideDrawer: React.FC<SideDrawerProps> = ({
  title,
  subtitle,
  onClose,
  footer,
  children,
  widthClass = 'max-w-md',
}) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end select-none p-2 sm:p-3">
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className="fai-overlay fixed inset-0 bg-black/40 backdrop-blur-[2px]"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`fai-drawer relative h-full w-full ${widthClass} bg-white shadow-2xl rounded-xl border border-neutral-200 overflow-hidden flex flex-col`}
      >
        {/* Header */}
        <div className="px-4 py-3 flex items-center justify-between gap-3 border-b border-neutral-200 bg-white">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="min-w-0">
              <h2 className="font-semibold text-13 text-neutral-900 truncate">{title}</h2>
              {subtitle && <p className="text-2xs text-neutral-500 truncate">{subtitle}</p>}
            </div>
          </div>
          <IconButton
            label="Fechar"
            onClick={onClose}
            size="md"
          >
            <X />
          </IconButton>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4">{children}</div>

        {/* Sticky footer */}
        {footer && (
          <div className="px-4 py-3 border-t border-neutral-200 bg-white flex items-center justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
