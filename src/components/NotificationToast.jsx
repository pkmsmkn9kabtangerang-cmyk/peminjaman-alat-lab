// src/components/NotificationToast.jsx
// Popup notifikasi realtime saat ada aktivitas data baru masuk ke sistem

import { useState, useEffect } from 'react';
import {
  IconRadioactive,
  IconCheck,
  IconX,
  IconArrowRight,
  IconBox,
  IconClock,
} from '@tabler/icons-react';

export default function NotificationToast({ notifications, onDismiss, onNavigate }) {
  if (!notifications || notifications.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
      {notifications.map((item) => (
        <ToastItem
          key={item.id}
          item={item}
          onDismiss={() => onDismiss(item.id)}
          onNavigate={() => onNavigate(item.targetTab || 'realtime_card')}
        />
      ))}
    </div>
  );
}

function ToastItem({ item, onDismiss, onNavigate }) {
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    const duration = 5000;
    const intervalTime = 50;
    const step = (intervalTime / duration) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev <= step) {
          clearInterval(timer);
          onDismiss();
          return 0;
        }
        return prev - step;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [onDismiss]);

  const isKembali = item.jenis === 'kembali';
  const isPinjam = item.jenis === 'pinjam';

  return (
    <div
      className={`pointer-events-auto bg-white rounded-xl shadow-xl border overflow-hidden transition-all duration-300 transform translate-y-0 animate-slideIn ${
        isKembali
          ? 'border-purple-300 ring-2 ring-purple-100'
          : isPinjam
          ? 'border-blue-300 ring-2 ring-blue-100'
          : 'border-emerald-300 ring-2 ring-emerald-100'
      }`}
    >
      <div className="p-3.5 flex items-start gap-3">
        {/* Icon Badge with Pulse Indicator */}
        <div
          className={`p-2 rounded-xl shrink-0 ${
            isKembali
              ? 'bg-purple-50 text-purple-600'
              : isPinjam
              ? 'bg-blue-50 text-blue-600'
              : 'bg-emerald-50 text-emerald-600'
          }`}
        >
          <IconRadioactive size={20} className="animate-spin-slow" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1 mb-0.5">
            <span
              className={`text-[10px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                isKembali
                  ? 'bg-purple-100 text-purple-800'
                  : isPinjam
                  ? 'bg-blue-100 text-blue-800'
                  : 'bg-emerald-100 text-emerald-800'
              }`}
            >
              {item.title || 'Aktivitas Tap RFID'}
            </span>
            <span className="text-[10px] text-gray-400 font-mono flex items-center gap-0.5">
              <IconClock size={10} />
              Baru saja
            </span>
          </div>

          <p className="text-xs font-bold text-gray-900 leading-snug truncate">
            {item.kelas ? `${item.kelas} — ` : ''}
            {item.nama_alat || item.message}
          </p>

          {item.subMessage && (
            <p className="text-[11px] text-gray-500 mt-0.5 truncate">
              {item.subMessage}
            </p>
          )}

          <div className="mt-2 flex items-center justify-between gap-2 pt-1 border-t border-gray-100">
            <button
              onClick={onNavigate}
              className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 transition"
            >
              Lihat di Realtime Card <IconArrowRight size={12} />
            </button>
            <span className="text-[9px] text-gray-400 font-mono">
              UID: {item.uid_kartu || '—'}
            </span>
          </div>
        </div>

        {/* Dismiss Button */}
        <button
          onClick={onDismiss}
          className="text-gray-400 hover:text-gray-600 p-1 -mr-1 -mt-1 rounded-lg hover:bg-gray-100 transition"
          aria-label="Tutup"
        >
          <IconX size={14} />
        </button>
      </div>

      {/* Progress Bar Timer */}
      <div className="w-full bg-gray-100 h-1">
        <div
          className={`h-1 transition-all duration-75 ${
            isKembali ? 'bg-purple-500' : isPinjam ? 'bg-blue-500' : 'bg-emerald-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
