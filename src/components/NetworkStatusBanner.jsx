// src/components/NetworkStatusBanner.jsx
// Indikator visual status koneksi internet & pemulihan sinkronisasi data

import { useState, useEffect } from 'react';
import { IconWifiOff, IconRefresh, IconCheck } from '@tabler/icons-react';
import { subscribeNetworkStatus } from '../lib/networkStatus';

export default function NetworkStatusBanner() {
  const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [reconnecting, setReconnecting] = useState(false);
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    let wasOffline = !navigator.onLine;

    const unsubscribe = subscribeNetworkStatus((isOnlineNow, isReconnectingNow) => {
      setOnline(isOnlineNow);
      setReconnecting(isReconnectingNow);

      if (isOnlineNow && wasOffline && !isReconnectingNow) {
        setShowRestored(true);
        const timer = setTimeout(() => {
          setShowRestored(false);
        }, 3500);
        wasOffline = false;
        return () => clearTimeout(timer);
      }

      if (!isOnlineNow) {
        wasOffline = true;
        setShowRestored(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // 1. Kondisi Offline
  if (!online) {
    return (
      <div
        role="alert"
        className="bg-amber-600 text-white px-3.5 py-2 text-xs sm:text-sm font-medium flex items-center justify-between shadow-sm sticky top-14 md:top-16 z-30 transition-all animate-in fade-in slide-in-from-top-1"
      >
        <div className="flex items-center gap-2 min-w-0">
          <IconWifiOff size={18} className="shrink-0 animate-pulse text-amber-200" />
          <span className="truncate">
            <strong>Koneksi terputus.</strong> Menampilkan data tersimpan. Menunggu jaringan kembali...
          </span>
        </div>
        <span className="text-[11px] bg-amber-700/80 px-2 py-0.5 rounded font-semibold uppercase tracking-wider shrink-0 ml-2">
          Offline
        </span>
      </div>
    );
  }

  // 2. Kondisi Sedang Sinkronisasi Pemulihan
  if (reconnecting) {
    return (
      <div
        role="status"
        className="bg-blue-600 text-white px-3.5 py-2 text-xs sm:text-sm font-medium flex items-center justify-between shadow-sm sticky top-14 md:top-16 z-30 transition-all animate-in fade-in slide-in-from-top-1"
      >
        <div className="flex items-center gap-2 min-w-0">
          <IconRefresh size={18} className="shrink-0 animate-spin text-blue-200" />
          <span className="truncate">
            Koneksi internet kembali. Memperbarui data terbaru dari server...
          </span>
        </div>
        <span className="text-[11px] bg-blue-700/80 px-2 py-0.5 rounded font-semibold uppercase tracking-wider shrink-0 ml-2">
          Sinkronisasi
        </span>
      </div>
    );
  }

  // 3. Kondisi Sukses Pulih (Flash selama 3.5 detik)
  if (showRestored) {
    return (
      <div
        role="status"
        className="bg-emerald-600 text-white px-3.5 py-2 text-xs sm:text-sm font-medium flex items-center justify-between shadow-sm sticky top-14 md:top-16 z-30 transition-all animate-in fade-in slide-in-from-top-1 duration-300"
      >
        <div className="flex items-center gap-2 min-w-0">
          <IconCheck size={18} className="shrink-0 text-emerald-200" />
          <span className="truncate">
            Koneksi pulih. Data transaksi dan aktivitas telah disinkronkan.
          </span>
        </div>
        <button
          onClick={() => setShowRestored(false)}
          className="text-emerald-200 hover:text-white text-xs underline shrink-0 ml-2 cursor-pointer"
        >
          Tutup
        </button>
      </div>
    );
  }

  return null;
}
