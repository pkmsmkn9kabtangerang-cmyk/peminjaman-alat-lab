// src/App.jsx
// Root aplikasi: mode demo (localStorage) atau Supabase (jika .env dikonfigurasi)

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { dbService } from './services/store';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import Sidebar from './components/Sidebar';
import NotificationToast from './components/NotificationToast';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import InventarisPage from './pages/InventarisPage';
import ListAlatPage from './pages/ListAlatPage';
import KartuRfidPage from './pages/KartuRfidPage';
import RealtimeCardPage from './pages/RealtimeCardPage';
import PeminjamanPage from './pages/PeminjamanPage';
import PengembalianPage from './pages/PengembalianPage';
import RiwayatPage from './pages/RiwayatPage';
import PenggunaPage from './pages/PenggunaPage';
import SimulasiIotPage from './pages/SimulasiIotPage';
import { IconBell } from '@tabler/icons-react';

const PAGE_TITLES = {
  dashboard:      'Dashboard',
  realtime_card:  'Realtime Card',
  peminjaman:     'Peminjaman Manual',
  pengembalian:   'Pengembalian Manual',
  riwayat:        'Riwayat Peminjaman',
  list_alat:      'List Alat',
  inventaris:     'Inventaris Alat',
  kartu_rfid:     'Kartu RFID',
  pengguna:       'Pengguna',
  simulasi_iot:   'Simulasi IoT RFID',
};

// Ambil tab awal dari URL hash atau localStorage agar saat di-refresh posisi tab tetap terjaga
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

  // Trigger popup notifikasi mengambang (maks 3 item)
  const triggerNotification = useCallback((notif) => {
    const id = 'notif-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
    setNotifications((prev) => [
      { id, ...notif },
      ...prev,
    ].slice(0, 3));
  }, []);

  const dismissNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Poll unread count + listen to storage updates & realtime tap notifications
  useEffect(() => {
    refreshUnread();
    const handle = () => {
      setCurrentUser(dbService.getCurrentUser());
      refreshUnread();

      // Deteksi adanya data tap RFID baru yang masuk ke sistem
      const logs = dbService.getTapLog();
      if (logs.length > prevLogsLen.current) {
        const added = logs.slice(0, logs.length - prevLogsLen.current);
        const latest = added[0];
        if (latest) {
          triggerNotification({
            title: latest.status === 'ditolak' ? 'Tap Ditolak' : 'Data Masuk: Tap RFID',
            jenis: latest.jenis_tap,
            kelas: latest.kelas,
            nama_alat: latest.nama_alat || latest.error_code || 'Aktivitas Tap',
            uid_kartu: latest.uid_kartu,
            subMessage: latest.status === 'ditolak'
              ? `Ditolak: ${latest.error_code}`
              : `Status: Berhasil (${latest.jenis_terdeteksi})`,
          });
        }
      }
      prevLogsLen.current = logs.length;
    };

    window.addEventListener('simlab_storage_updated', handle);
    const interval = setInterval(refreshUnread, 3000);

    // Supabase Realtime channel jika Supabase terkonfigurasi
    let channel = null;
    if (isSupabaseConfigured) {
      channel = supabase
        .channel('app-global-realtime-taps')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tap_log' }, (payload) => {
          const latest = payload.new;
          triggerNotification({
            title: latest.status === 'ditolak' ? 'Tap Ditolak' : 'Data Masuk: Tap RFID',
            jenis: latest.jenis_tap,
            kelas: latest.kelas,
            nama_alat: latest.nama_alat || latest.error_code || 'Aktivitas Tap',
            uid_kartu: latest.uid_kartu,
            subMessage: latest.status === 'ditolak'
              ? `Ditolak: ${latest.error_code}`
              : `Status: Berhasil (${latest.jenis_terdeteksi})`,
          });
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

  // Handle pergantian tab & sinkronisasi dengan URL hash dan localStorage
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
    setMobileMenuOpen(false); // close mobile menu on nav
    if (tab === 'realtime_card') {
      dbService.markTapsRead();
      setUnreadCount(0);
    }
  }, []);

  // Sinkronisasi saat user menekan tombol Back / Forward di browser atau refresh
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
      <LoginPage
        onLoginSuccess={(u) => {
          dbService.setCurrentUser(u);
          setCurrentUser(u);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-main flex">
      {/* Popup Notifikasi Realtime Melayang */}
      <NotificationToast
        notifications={notifications}
        onDismiss={dismissNotification}
        onNavigate={handleTabChange}
      />

      {/* Sidebar */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={handleTabChange}
        user={currentUser}
        onLogout={handleLogout}
        unreadCount={unreadCount}
        mobileMenuOpen={mobileMenuOpen}
        setMobileMenuOpen={setMobileMenuOpen}
      />

      {/* Main Content */}
      <main className="flex-1 transition-all duration-300 md:ml-16 min-h-screen flex flex-col min-w-0">
        {/* Header */}
        <header className="h-14 bg-surface border-b border-main px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20 shadow-sm">
          <div className="flex items-center gap-3">
            {/* Hamburger Button (Mobile Only) */}
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-1.5 -ml-2 text-gray-500 hover:bg-gray-100 rounded-lg transition"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h2 className="text-sm font-bold text-main truncate">
              {PAGE_TITLES[currentTab] ?? currentTab}
            </h2>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            {/* Bell Notifikasi */}
            <button
              id="btn-bell-notifikasi"
              onClick={() => handleTabChange('realtime_card')}
              className="relative p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
              title="Realtime Card"
            >
              <IconBell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none ring-2 ring-white animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Page Content: Dashboard tetap dipertahankan mounted agar tidak re-render/hilang saat berpindah menu */}
        <div className="p-3 sm:p-6 flex-1 min-w-0">
          <div className={currentTab === 'dashboard' ? 'block' : 'hidden'}>
            <DashboardPage setCurrentTab={handleTabChange} user={currentUser} />
          </div>
          {currentTab === 'realtime_card' && <RealtimeCardPage />}
          {currentTab === 'peminjaman'    && <PeminjamanPage />}
          {currentTab === 'pengembalian'  && <PengembalianPage />}
          {currentTab === 'riwayat'       && <RiwayatPage />}
          {currentTab === 'list_alat'     && <ListAlatPage />}
          {currentTab === 'inventaris'    && <InventarisPage />}
          {currentTab === 'kartu_rfid'    && <KartuRfidPage />}
          {currentTab === 'pengguna'      && <PenggunaPage />}
          {currentTab === 'simulasi_iot'  && <SimulasiIotPage />}
        </div>
      </main>
    </div>
  );
}
