// src/components/Modal.jsx
// Komponen Modal dialog berstandar SaaS modern

import { useEffect, useCallback } from 'react';
import { IconX } from '@tabler/icons-react';

const ICON_VARIANTS = {
  danger:  'bg-red-50 text-red-600 border-red-200/80 ring-red-500/10',
  warning: 'bg-amber-50 text-amber-600 border-amber-200/80 ring-amber-500/10',
  info:    'bg-blue-50 text-blue-600 border-blue-200/80 ring-blue-500/10',
  success: 'bg-emerald-50 text-emerald-600 border-emerald-200/80 ring-emerald-500/10',
  primary: 'bg-blue-50 text-blue-600 border-blue-200/80 ring-blue-500/10',
  default: 'bg-gray-50 text-gray-700 border-gray-200 ring-gray-100',
};

export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  icon: Icon,
  iconVariant = 'default',
  children,
  maxWidth = 'max-w-md',
  showCloseButton = true,
}) {
  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    },
    [isOpen, onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      window.addEventListener('keydown', handleKeyDown);
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const iconStyle = ICON_VARIANTS[iconVariant] || ICON_VARIANTS.default;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div
        className={`relative bg-white w-full ${maxWidth} rounded-2xl shadow-2xl border border-gray-100/80 flex flex-col my-auto max-h-[92vh] overflow-hidden animate-fadeIn z-10`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 p-4 sm:p-5 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-start gap-3 min-w-0">
            {Icon && (
              <div
                className={`w-10 h-10 rounded-xl border flex items-center justify-center ring-4 shrink-0 transition-transform ${iconStyle}`}
              >
                <Icon size={20} />
              </div>
            )}
            <div className="min-w-0 pt-0.5">
              <h3 className="text-sm sm:text-base font-bold text-gray-900 leading-snug tracking-tight">
                {title}
              </h3>
              {subtitle && (
                <p className="text-xs text-gray-500 mt-0.5 leading-normal">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {showCloseButton && (
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-200/60 rounded-lg transition-colors shrink-0"
              aria-label="Tutup"
            >
              <IconX size={18} />
            </button>
          )}
        </div>

        {/* Content */}
        <div className="p-4 sm:p-6 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}

