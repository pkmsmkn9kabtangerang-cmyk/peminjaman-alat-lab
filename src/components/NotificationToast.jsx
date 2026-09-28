import { useEffect } from 'react';
import { IconX } from '@tabler/icons-react';

export default function NotificationToast({ notifications, onDismiss, onNavigate }) {
  if (!notifications || notifications.length === 0) return null;

  const item = notifications[0];

  return (
    <div className="fixed top-3 right-3 z-50 w-[min(100%-1.5rem,360px)] pointer-events-none">
      <ToastItem
        item={item}
        onDismiss={() => onDismiss(item.id)}
        onNavigate={() => onNavigate(item.targetTab || 'realtime_card')}
      />
    </div>
  );
}

function ToastItem({ item, onDismiss, onNavigate }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const rejected = item.status === 'ditolak' || item.jenis === 'ditolak';

  return (
    <div className="pointer-events-auto bg-white border border-gray-300 shadow-md rounded overflow-hidden animate-slideIn">
      <div className="px-3 py-2.5 flex items-start gap-2.5">
        <span
          className={`mt-0.5 text-sm font-semibold shrink-0 ${rejected ? 'text-red-700' : 'text-green-800'}`}
          aria-hidden
        >
          {rejected ? '✕' : '✓'}
        </span>
        <button
          type="button"
          onClick={onNavigate}
          className="flex-1 min-w-0 text-left"
        >
          <p className="text-[15px] font-semibold text-gray-900 leading-snug">
            {item.title || (rejected ? 'Kartu ditolak' : 'Kartu RFID terdeteksi')}
          </p>
          {item.kelas && (
            <p className="text-[15px] text-gray-800 mt-0.5">
              {item.kelas}
              {item.nama_pemegang ? ` · ${item.nama_pemegang}` : ''}
            </p>
          )}
          {item.nama_alat && (
            <p className="text-sm text-gray-600 mt-0.5 truncate">{item.nama_alat}</p>
          )}
          {item.subMessage && (
            <p className={`text-sm mt-1 ${rejected ? 'text-red-700' : 'text-gray-700'}`}>
              {item.subMessage}
            </p>
          )}
        </button>
        <button
          onClick={onDismiss}
          className="text-gray-500 hover:text-gray-800 p-1 rounded hover:bg-gray-100 min-h-8 min-w-8 flex items-center justify-center"
          aria-label="Tutup"
        >
          <IconX size={16} />
        </button>
      </div>
    </div>
  );
}
