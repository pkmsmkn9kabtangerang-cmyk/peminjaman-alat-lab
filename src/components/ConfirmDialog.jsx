import { IconAlertTriangle } from '@tabler/icons-react';
import Modal from './Modal';
import Button from './Button';

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Hapus',
  confirmVariant = 'danger',
  loading = false,
  children,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      icon={IconAlertTriangle}
      iconVariant={confirmVariant === 'danger' ? 'danger' : 'warning'}
      maxWidth="max-w-md"
    >
      <div className="space-y-5">
        {message && (
          <p className="text-[15px] text-gray-700 leading-relaxed whitespace-pre-line">{message}</p>
        )}
        {children}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-1 border-t border-gray-200">
          <Button variant="secondary" onClick={onClose} disabled={loading} className="w-full sm:w-auto justify-center">
            Batal
          </Button>
          <Button
            variant={confirmVariant}
            onClick={onConfirm}
            disabled={loading}
            className="w-full sm:w-auto justify-center"
          >
            {loading ? 'Memproses...' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
