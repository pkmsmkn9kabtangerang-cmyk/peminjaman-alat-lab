import { useEffect } from 'react';
import {
  IconAlertTriangle,
  IconArrowRight,
  IconCircleCheck,
  IconX,
} from '@tabler/icons-react';

export default function NotificationToast({ notifications, onDismiss, onNavigate }) {
  if (!notifications || notifications.length === 0) return null;

  const item = notifications[0];

  return (
    <div
      className="pointer-events-none fixed right-3 z-[110] w-[calc(100vw-1.5rem)] max-w-sm sm:right-4"
      style={{ top: 'calc(var(--net-banner-height, 0px) + 0.75rem)' }}
    >
      <ToastItem
        key={item.id}
        item={item}
        onDismiss={() => onDismiss(item.id)}
        onNavigate={() => onNavigate(item.targetTab || 'realtime_card')}
      />
    </div>
  );
}

function ToastItem({ item, onDismiss, onNavigate }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 5500);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  const rejected = item.status === 'ditolak' || item.jenis === 'ditolak';

  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-auto animate-slideIn overflow-hidden rounded-xl border bg-white shadow-lg shadow-slate-900/12 ${
        rejected ? 'border-red-200' : 'border-emerald-200'
      }`}
    >
      <div className="flex items-start gap-2.5 p-3.5">
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
            rejected ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'
          }`}
          aria-hidden="true"
        >
          {rejected ? <IconAlertTriangle size={17} /> : <IconCircleCheck size={17} />}
        </span>

        <button type="button" onClick={onNavigate} className="min-w-0 flex-1 text-left">
          <p className="text-[13.5px] font-semibold leading-snug text-gray-900">
            {item.title || (rejected ? 'Kartu ditolak' : 'Kartu RFID terdeteksi')}
          </p>
          {item.kelas && (
            <p className="mt-0.5 text-[12.5px] font-medium text-gray-700">
              {item.kelas}
              {item.nama_pemegang ? ` · ${item.nama_pemegang}` : ''}
            </p>
          )}
          {item.nama_alat && (
            <p className="mt-0.5 truncate text-[12.5px] text-gray-500">{item.nama_alat}</p>
          )}
          {item.subMessage && (
            <p className={`mt-1 text-[12px] leading-relaxed ${rejected ? 'text-red-700' : 'text-gray-600'}`}>
              {item.subMessage}
            </p>
          )}
          <span
            className={`mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold ${
              rejected ? 'text-red-700' : 'text-[#1E5AAB]'
            }`}
          >
            Lihat aktivitas
            <IconArrowRight size={13} />
          </span>
        </button>

        <button
          type="button"
          onClick={onDismiss}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Tutup notifikasi"
        >
          <IconX size={16} />
        </button>
      </div>

      <div className={`h-0.5 w-full ${rejected ? 'bg-red-100' : 'bg-emerald-100'}`} aria-hidden="true">
        <div
          className={`toast-progress h-full w-full origin-left ${
            rejected ? 'bg-red-500/70' : 'bg-emerald-500/70'
          }`}
        />
      </div>
    </div>
  );
}
