import { useEffect, useCallback } from 'react';
import { IconX } from '@tabler/icons-react';

const ICON_VARIANTS = {
  danger:  'bg-red-50 text-red-700 border-red-200',
  warning: 'bg-orange-50 text-orange-700 border-orange-200',
  info:    'bg-blue-50 text-blue-800 border-blue-200',
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
      aria-labelledby="dialog-title"
    >
      <div
        className="fixed inset-0 bg-slate-900/45"
        onClick={onClose}
      />

      <div
        className={`relative bg-white w-full ${maxWidth} rounded border border-gray-300 shadow-lg flex flex-col my-auto max-h-[92vh] overflow-hidden z-10`}
      >
        <div className="flex items-start justify-between gap-3 px-4 sm:px-5 py-4 border-b border-gray-200">
          <div className="flex items-start gap-3 min-w-0">
            {Icon && (
              <div
                className={`w-9 h-9 rounded border flex items-center justify-center shrink-0 ${iconStyle}`}
              >
                <Icon size={18} />
              </div>
            )}
            <div className="min-w-0 pt-0.5">
              <h3 id="dialog-title" className="text-lg font-semibold text-gray-900 leading-snug">
                {title}
              </h3>
              {subtitle && (
                <p className="text-[15px] text-gray-600 mt-1 leading-relaxed">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {showCloseButton && (
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded shrink-0 min-h-10 min-w-10 flex items-center justify-center"
              aria-label="Tutup"
            >
              <IconX size={18} />
            </button>
          )}
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
