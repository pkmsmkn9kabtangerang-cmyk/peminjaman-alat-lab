import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { IconX } from '@tabler/icons-react';

const ICON_VARIANTS = {
  danger: 'bg-red-50 text-red-700 border-red-200',
  warning: 'bg-orange-50 text-orange-700 border-orange-200',
  info: 'bg-blue-50 text-blue-800 border-blue-200',
  success: 'bg-green-50 text-green-800 border-green-200',
  primary: 'bg-blue-50 text-blue-800 border-blue-200',
  default: 'bg-gray-50 text-gray-700 border-gray-200',
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
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const iconStyle = ICON_VARIANTS[iconVariant] || ICON_VARIANTS.default;

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
    >
      <div className="fixed inset-0 animate-fadeIn bg-slate-900/50 backdrop-blur-[1.5px]" onClick={onClose} />

      <div
        className={`relative z-10 my-auto flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl animate-slideUp sm:rounded-xl sm:animate-popIn ${maxWidth}`}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-gray-300 sm:hidden" aria-hidden="true" />

        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-4 pb-3.5 pt-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-start gap-3">
            {Icon && (
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${iconStyle}`}>
                <Icon size={18} />
              </div>
            )}
            <div className="min-w-0 pt-0.5">
              <h3 id="dialog-title" className="text-[17px] font-semibold leading-snug text-gray-900 sm:text-lg">
                {title}
              </h3>
              {subtitle && (
                <p className="mt-1 text-[12.5px] leading-relaxed text-gray-600 sm:text-[13.5px]">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {showCloseButton && (
            <button
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              aria-label="Tutup"
            >
              <IconX size={18} />
            </button>
          )}
        </div>

        <div className="overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(1rem+var(--safe-bottom))] sm:px-5 sm:py-5 sm:pb-5">
          {children}
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
