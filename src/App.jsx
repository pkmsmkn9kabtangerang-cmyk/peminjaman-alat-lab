import React, { useState, useEffect, useCallback, useRef } from 'react';
import { dbService } from './services/store';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import { getErrorMessage } from './lib/handleError';
import Sidebar from './components/Sidebar';
import NotificationToast from './components/NotificationToast';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import KelolaAlat from './pages/KelolaAlat';
import DaftarAlat from './pages/DaftarAlat';
import KelolaKartu from './pages/KelolaKartu';
import AktivitasKartu from './pages/AktivitasKartu';
import Peminjaman from './pages/Peminjaman';
import Pengembalian from './pages/Pengembalian';
import Riwayat from './pages/Riwayat';
import KelolaPetugas from './pages/KelolaPetugas';
import SimulasiKartu from './pages/SimulasiKartu';
import { IconBell, IconX, IconCheck, IconAlertTriangle, IconMenu2 } from '@tabler/icons-react';

const PAGE_TITLES = {
  dashboard:      'Dashboard',
  realtime_card:  'Aktivitas RFID',
  peminjaman:     'Peminjaman',
  pengembalian:   'Pengembalian',
  riwayat:        'Riwayat',
  list_alat:      'Daftar Alat',
  inventaris:     'Inventaris',
  kartu_rfid:     'Kartu RFID',
  pengguna:       'Pengguna',
  simulasi_iot:   'Simulasi Kartu',
};

function tapNotification(latest) {
  const rejected = latest.status === 'ditolak';
  let subMessage = 'Aktivitas berhasil dicatat.';
  if (rejected) {
    subMessage = getErrorMessage(latest.error_code);
  } else if (latest.jenis_tap === 'pinjam' || latest.status === 'dipinjam') {
    subMessage = 'Peminjaman berhasil dicatat.';
  } else if (latest.jenis_tap === 'kembali' || latest.status === 'dikembalikan') {
    subMessage = 'Pengembalian berhasil dicatat.';
  } else if (latest.jenis_tap === 'kartu') {
    subMessage = 'Kartu kelas terdeteksi.';
  }

  return {
    title: rejected ? 'Kartu ditolak' : 'Kartu RFID terdeteksi',
    status: rejected ? 'ditolak' : 'berhasil',
    jenis: latest.jenis_tap,
    kelas: latest.kelas,
    nama_pemegang: latest.nama_pemegang,
    nama_alat: latest.nama_alat || null,
    subMessage,
  };
}

const getInitialTab = () => {
  try {
    const hash = window.location.hash.replace(/^#\/?/, '');
    if (hash && PAGE_TITLES[hash]) return hash;
    const saved = localStorage.getItem('simlab_current_tab');
    if (saved && PAGE_TITLES[saved]) return saved;
  } catch (e) {
    console.error(e);
  }
  return 'dashboard';
};

function FeedbackToast() {
  const [item, setItem] = useState(null);

  useEffect(() => {
    const onFeedback = (e) => setItem(e.detail);
    window.addEventListener('simlab_feedback', onFeedback);
    return () => window.removeEventListener('simlab_feedback', onFeedback);
  }, []);

  useEffect(() => {
    if (!item) return undefined;
    const t = setTimeout(() => setItem(null), 4200);
    return () => clearTimeout(t);
  }, [item]);

  if (!item) return null;

  const isError = item.type === 'error';
  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(100%-2rem,360px)]">
      <div className={`border shadow-md rounded bg-white px-3 py-2.5 flex items-start gap-2.5 ${isError ? 'border-red-300' : 'border-green-300'}`}>
        {isError ? (
          <IconAlertTriangle size={18} className="text-red-700 shrink-0 mt-0.5" />
        ) : (
          <IconCheck size={18} className="text-green-800 shrink-0 mt-0.5" />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-gray-900">{item.title}</p>
          {item.message && <p className="text-sm text-gray-700 mt-0.5 leading-relaxed">{item.message}</p>}
        </div>
        <button
          type="button"
          onClick={() => setItem(null)}
          className="p-1 text-gray-500 hover:text-gray-800 min-h-8 min-w-8"
          aria-label="Tutup"
        >
          <IconX size={16} />
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser]   = useState(() => dbService.getCurrentUser());
  const [currentTab, setCurrentTab]     = useState(getInitialTab);
  const [unreadCount, setUnreadCount]   = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const prevLogsLen = useRef(dbService.getTapLog().length);

  const refreshUnread = useCallback(() => {
    setUnreadCount(dbService.getUnreadCount());
  }, []);

  const triggerNotification = useCallback((latest) => {
    const id = 'notif-' + Date.now();
    setNotifications([{ id, ...tapNotification(latest) }]);
  }, []);

  const dismissNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  useEffect(() => {
    refreshUnread();
    const handle = () => {
      setCurrentUser(dbService.getCurrentUser());
      refreshUnread();

      const logs = dbService.getTapLog();
      if (logs.length > prevLogsLen.current) {
        const added = logs.slice(0, logs.length - prevLogsLen.current);
        const latest = added[0];
        if (latest) triggerNotification(latest);
      }
      prevLogsLen.current = logs.length;
    };

    window.addEventListener('simlab_storage_updated', handle);
    const interval = setInterval(refreshUnread, 3000);

    let channel = null;
    if (isSupabaseConfigured) {
      channel = supabase
        .channel('app-global-realtime-taps')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tap_log' }, (payload) => {
          triggerNotification(payload.new);
          refreshUnread();
        })
        .subscribe();
    }

    return () => {
      window.removeEventListener('simlab_storage_updated', handle);
      if (channel) supabase.removeChannel(channel);
      clearInterval(interval);
    };
  }, [refreshUnread, triggerNotification]);

  const handleTabChange = useCallback((tab) => {
    if (!PAGE_TITLES[tab]) return;
    setCurrentTab(tab);
    try {
      localStorage.setItem('simlab_current_tab', tab);
      if (window.location.hash.replace(/^#\/?/, '') !== tab) {
        window.location.hash = tab;
      }
    } catch (e) {
      console.error(e);
    }
    setMobileMenuOpen(false);
    if (tab === 'realtime_card') {
      dbService.markTapsRead();
      setUnreadCount(0);
    }
  }, []);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, '');
      if (hash && PAGE_TITLES[hash] && hash !== currentTab) {
        setCurrentTab(hash);
        localStorage.setItem('simlab_current_tab', hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    if (!window.location.hash || window.location.hash === '#') {
      window.location.hash = currentTab;
    }
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [currentTab]);

  const handleLogout = () => {
    dbService.logout();
    setCurrentUser(null);
  };

  if (!currentUser) {
    return (
      <Login
        onLoginSuccess={(u) => {
          dbService.setCurrentUser(u);
          setCurrentUser(u);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-main flex">
      <NotificationToast
        notifications={notifications}
        onDismiss={dismissNotification}
        onNavigate={handleTabChange}
      />
      <FeedbackToast />

      <Sidebar
        currentTab={currentTab}
        setCurrentTab={handleTabChange}
        user={currentUser}
        onLogout={handleLogout}
        unreadCount={unreadCount}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      <main className="flex-1 md:ml-[232px] min-h-screen flex flex-col min-w-0">
        <header className="min-h-14 md:min-h-16 bg-surface border-b border-main px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            {/* Hamburger Button (Mobile Only) */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-1.5 -ml-1.5 text-muted hover:text-main hover:bg-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              aria-label="Buka menu navigasi"
            >
              <IconMenu2 className="w-6 h-6" />
            </button>
          </div>
          <button
            id="btn-bell-notifikasi"
            onClick={() => handleTabChange('realtime_card')}
            className="relative px-3 py-2 text-[15px] font-medium text-gray-700 hover:bg-gray-100 rounded min-h-11 inline-flex items-center gap-2"
          >
            <IconBell size={22} />
            {unreadCount > 0 && (
              <span className="bg-red-700 text-white text-xs font-semibold rounded-full min-w-5 h-5 px-1 flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </header>

        <div className="p-4 sm:p-6 flex-1 min-w-0">
          <div className={currentTab === 'dashboard' ? 'block' : 'hidden'}>
            <Dashboard setCurrentTab={handleTabChange} user={currentUser} />
          </div>
          {currentTab === 'realtime_card' && <AktivitasKartu />}
          {currentTab === 'peminjaman'    && <Peminjaman />}
          {currentTab === 'pengembalian'  && <Pengembalian />}
          {currentTab === 'riwayat'       && <Riwayat />}
          {currentTab === 'list_alat'     && <DaftarAlat />}
          {currentTab === 'inventaris'    && <KelolaAlat />}
          {currentTab === 'kartu_rfid'    && <KelolaKartu />}
          {currentTab === 'pengguna'      && <KelolaPetugas />}
          {currentTab === 'simulasi_iot'  && <SimulasiKartu />}
        </div>
      </main>
    </div>
  );
}
