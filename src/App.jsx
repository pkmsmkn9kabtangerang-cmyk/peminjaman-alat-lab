// src/App.jsx
// Root aplikasi: mode demo (localStorage) atau Supabase (jika .env dikonfigurasi)

import React, { useState, useEffect, useCallback } from 'react';
import { dbService } from './services/store';
import Sidebar from './components/Sidebar';
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
  list_alat:    'List Alat',
  inventaris:     'Inventaris Alat',
  kartu_rfid:     'Kartu RFID',
  pengguna:       'Pengguna',
  simulasi_iot:   'Simulasi IoT RFID',
};

export default function App() {
  const [currentUser, setCurrentUser] = useState(() => dbService.getCurrentUser());
  const [currentTab, setCurrentTab]   = useState('dashboard');
  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const refreshUnread = useCallback(() => {
    setUnreadCount(dbService.getUnreadCount());
  }, []);

  // Poll unread count + listen to storage updates
  useEffect(() => {
    refreshUnread();
    const handle = () => {
      setCurrentUser(dbService.getCurrentUser());
      refreshUnread();
    };
    window.addEventListener('simlab_storage_updated', handle);
    const interval = setInterval(refreshUnread, 3000);
    return () => {
      window.removeEventListener('simlab_storage_updated', handle);
      clearInterval(interval);
    };
  }, [refreshUnread]);

  // Saat buka Realtime Card → tandai semua terbaca
  const handleTabChange = (tab) => {
    setCurrentTab(tab);
    setMobileMenuOpen(false); // close mobile menu on nav
    if (tab === 'realtime_card') {
      dbService.markTapsRead();
      setUnreadCount(0);
    }
  };

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
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-3 sm:p-6 flex-1 min-w-0">
          {currentTab === 'dashboard'     && <DashboardPage setCurrentTab={handleTabChange} user={currentUser} />}
          {currentTab === 'realtime_card' && <RealtimeCardPage />}
          {currentTab === 'peminjaman'    && <PeminjamanPage />}
          {currentTab === 'pengembalian'  && <PengembalianPage />}
          {currentTab === 'riwayat'       && <RiwayatPage />}
          {currentTab === 'list_alat'   && <ListAlatPage />}
          {currentTab === 'inventaris'    && <InventarisPage />}
          {currentTab === 'kartu_rfid'    && <KartuRfidPage />}
          {currentTab === 'pengguna'      && <PenggunaPage />}
          {currentTab === 'simulasi_iot'  && <SimulasiIotPage />}
        </div>
      </main>
    </div>
  );
}
