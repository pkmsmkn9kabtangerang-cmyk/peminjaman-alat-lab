// src/components/NetworkStatusBanner.jsx
// Indikator visual status koneksi internet & pemulihan sinkronisasi data

import { useState, useEffect } from 'react';
import { IconWifiOff, IconRefresh, IconCheck, IconX } from '@tabler/icons-react';
import { subscribeNetworkStatus, isOnline } from '../lib/networkStatus';

export default function NetworkStatusBanner() {
  const [online, setOnline] = useState(() => isOnline());
  const [reconnecting, setReconnecting] = useState(false);
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    let wasOffline = !isOnline();

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

  // 1. Kondisi Offline (Melayang di paling atas layar, selalu terlihat di semua halaman)
  if (!online) {
    return (
      <div
        role="alert"
        className="fixed top-0 left-0 right-0 z-[100] bg-amber-600 text-white px-4 py-2.5 text-xs sm:text-sm font-medium flex items-center justify-between shadow-md border-b border-amber-700 animate-in fade-in slide-in-from-top-1"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <IconWifiOff size={19} className="shrink-0 animate-pulse text-amber-200" />
          <span className="truncate">
            <strong>Koneksi internet terputus.</strong> Menampilkan data tersimpan. Menunggu jaringan kembali...
          </span>
        </div>
        <span className="text-[11px] bg-amber-800/90 text-amber-100 px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider shrink-0 ml-2">
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
        className="fixed top-0 left-0 right-0 z-[100] bg-blue-600 text-white px-4 py-2.5 text-xs sm:text-sm font-medium flex items-center justify-between shadow-md border-b border-blue-700 animate-in fade-in slide-in-from-top-1"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <IconRefresh size={19} className="shrink-0 animate-spin text-blue-200" />
          <span className="truncate">
            Koneksi internet kembali. Memperbarui data terbaru dari server...
          </span>
        </div>
        <span className="text-[11px] bg-blue-800/90 text-blue-100 px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider shrink-0 ml-2">
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
        className="fixed top-0 left-0 right-0 z-[100] bg-emerald-600 text-white px-4 py-2.5 text-xs sm:text-sm font-medium flex items-center justify-between shadow-md border-b border-emerald-700 animate-in fade-in slide-in-from-top-1 duration-300"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <IconCheck size={19} className="shrink-0 text-emerald-200" />
          <span className="truncate">
            Koneksi internet pulih. Data transaksi dan aktivitas telah disinkronkan.
          </span>
        </div>
        <button
          onClick={() => setShowRestored(false)}
          className="text-emerald-100 hover:text-white p-1 rounded transition-colors shrink-0 ml-2 cursor-pointer"
          title="Tutup pemberitahuan"
        >
          <IconX size={16} />
        </button>
      </div>
    );
  }

  return null;
}
