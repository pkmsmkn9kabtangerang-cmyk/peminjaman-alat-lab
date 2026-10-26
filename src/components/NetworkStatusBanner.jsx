// src/components/NetworkStatusBanner.jsx
// Indikator visual status koneksi internet & pemulihan sinkronisasi data.
// Banner berada di lapisan paling atas, tidak menutupi header, dan ruang
// konten otomatis digeser lewat CSS variable --net-banner-height.

import { useEffect, useRef, useState } from 'react';
import {
  IconWifiOff,
  IconRefresh,
  IconCheck,
  IconX,
  IconCloudOff,
} from '@tabler/icons-react';
import {
  subscribeNetworkStatus,
  isOnline,
  checkConnectionNow,
} from '../lib/networkStatus';

const RESTORED_DURATION_MS = 3200;

export default function NetworkStatusBanner() {
  const [online, setOnline] = useState(() => isOnline());
  const [reconnecting, setReconnecting] = useState(false);
  const [showRestored, setShowRestored] = useState(false);
  const [checking, setChecking] = useState(false);

  const bannerRef = useRef(null);
  const restoredTimerRef = useRef(null);
  const wasOfflineRef = useRef(!isOnline());

  useEffect(() => {
    const unsubscribe = subscribeNetworkStatus((onlineNow, reconnectingNow) => {
      setOnline(onlineNow);
      setReconnecting(reconnectingNow);

      if (!onlineNow) {
        wasOfflineRef.current = true;
        setShowRestored(false);
        if (restoredTimerRef.current) {
          clearTimeout(restoredTimerRef.current);
          restoredTimerRef.current = null;
        }
        return;
      }

      if (wasOfflineRef.current && !reconnectingNow) {
        wasOfflineRef.current = false;
        setShowRestored(true);
        if (restoredTimerRef.current) clearTimeout(restoredTimerRef.current);
        restoredTimerRef.current = setTimeout(() => {
          restoredTimerRef.current = null;
          setShowRestored(false);
        }, RESTORED_DURATION_MS);
      }
    });

    return () => {
      unsubscribe();
      if (restoredTimerRef.current) {
        clearTimeout(restoredTimerRef.current);
        restoredTimerRef.current = null;
      }
    };
  }, []);

  const visible = !online || reconnecting || showRestored;

  // Geser seluruh konten aplikasi agar banner tidak menimpa header.
  useEffect(() => {
    const root = document.documentElement;
    const el = bannerRef.current;

    if (!visible || !el) {
      root.style.setProperty('--net-banner-height', '0px');
      return undefined;
    }

    const syncHeight = () => {
      root.style.setProperty(
        '--net-banner-height',
        `${Math.ceil(el.getBoundingClientRect().height)}px`
      );
    };

    syncHeight();

    let observer;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(syncHeight);
      observer.observe(el);
    }
    window.addEventListener('resize', syncHeight);

    return () => {
      if (observer) observer.disconnect();
      window.removeEventListener('resize', syncHeight);
      root.style.setProperty('--net-banner-height', '0px');
    };
  }, [visible, reconnecting, showRestored, online]);

  const handleRetry = async () => {
    if (checking) return;
    setChecking(true);
    try {
      await checkConnectionNow();
    } finally {
      setChecking(false);
    }
  };

  if (!visible) return null;

  const mode = !online ? 'offline' : reconnecting ? 'reconnecting' : 'restored';

  return (
    <div
      ref={bannerRef}
      role="alert"
      aria-live={mode === 'offline' ? 'assertive' : 'polite'}
      className={`fixed inset-x-0 top-0 z-[120] border-b shadow-sm ${
        mode === 'offline'
          ? 'bg-amber-50 border-amber-300/80 text-amber-950'
          : mode === 'reconnecting'
            ? 'bg-blue-700 border-blue-800 text-white'
            : 'bg-emerald-700 border-emerald-800 text-white'
      }`}
    >
      <div className="mx-auto flex w-full max-w-5xl items-start gap-2.5 px-3 py-2.5 sm:items-center sm:gap-3 sm:px-5">
        <span
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full sm:mt-0 ${
            mode === 'offline'
              ? 'bg-amber-100 text-amber-800'
              : mode === 'reconnecting'
                ? 'bg-white/15 text-white'
                : 'bg-white/15 text-white'
          }`}
        >
          {mode === 'offline' && <IconWifiOff size={18} stroke={2.2} />}
          {mode === 'reconnecting' && <IconRefresh size={18} className="animate-spin" />}
          {mode === 'restored' && <IconCheck size={18} stroke={2.4} />}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold leading-tight sm:text-sm">
            {mode === 'offline' && 'Koneksi internet terputus'}
            {mode === 'reconnecting' && 'Koneksi pulih. Menyinkronkan data...'}
            {mode === 'restored' && 'Koneksi kembali normal'}
          </p>
          <p
            className={`mt-0.5 text-[11.5px] leading-snug sm:text-xs ${
              mode === 'offline' ? 'text-amber-800' : 'text-white/85'
            }`}
          >
            {mode === 'offline' && (
              <>
                <span className="sm:hidden">Data tersimpan. Banner ini hilang setelah tersambung.</span>
                <span className="hidden sm:inline">
                  Aplikasi menampilkan data tersimpan. Notifikasi akan hilang otomatis setelah tersambung.
                </span>
              </>
            )}
            {mode === 'reconnecting' &&
              'Memperbarui data terbaru dari server. Mohon tunggu sebentar.'}
            {mode === 'restored' && 'Data terbaru sudah dimuat kembali.'}
          </p>
        </div>

        {mode === 'offline' && (
          <button
            type="button"
            onClick={handleRetry}
            disabled={checking}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-amber-300 bg-white px-2.5 text-[11.5px] font-semibold text-amber-900 shadow-sm transition hover:bg-amber-100 active:scale-[0.98] disabled:opacity-60 sm:px-3 sm:text-xs"
          >
            <IconRefresh size={14} className={checking ? 'animate-spin' : ''} />
            <span className="sm:hidden">{checking ? 'Periksa' : 'Coba'}</span>
            <span className="hidden sm:inline">{checking ? 'Memeriksa' : 'Coba lagi'}</span>
          </button>
        )}

        {mode === 'restored' && (
          <button
            type="button"
            onClick={() => setShowRestored(false)}
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-white/80 transition hover:bg-white/15 hover:text-white"
            aria-label="Tutup pemberitahuan"
            title="Tutup"
          >
            <IconX size={16} />
          </button>
        )}

        {mode === 'offline' && (
          <IconCloudOff
            size={16}
            className="hidden shrink-0 text-amber-700/70 sm:block"
            aria-hidden="true"
          />
        )}
      </div>

      {mode === 'offline' && (
        <div className="h-0.5 w-full overflow-hidden bg-amber-200/60" aria-hidden="true">
          <div className="net-banner-progress h-full w-1/3 rounded-full bg-amber-500/70" />
        </div>
      )}
    </div>
  );
}
