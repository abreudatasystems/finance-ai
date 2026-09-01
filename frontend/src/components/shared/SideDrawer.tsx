'use client';

import React, { useEffect } from 'react';
import { X } from 'lucide-react';

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
    <div className="fixed inset-0 z-50 flex justify-end select-none p-3 sm:p-4 md:p-5">
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className="fai-overlay fixed inset-0 bg-slate-900/40 backdrop-blur-[2px]"
      />

      {/* Panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`fai-drawer relative h-full w-full ${widthClass} bg-white shadow-2xl rounded-2xl md:rounded-3xl overflow-hidden flex flex-col`}
      >
        {/* Header */}
        <div className="px-5 py-4 text-white flex items-center justify-between bg-slate-900">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="min-w-0">
              <h2 className="font-bold text-sm truncate">{title}</h2>
              {subtitle && <p className="text-[11px] text-white/70 truncate">{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 rounded-lg hover:bg-white/15 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {/* Sticky footer */}
        {footer && (
          <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/80 backdrop-blur flex gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
