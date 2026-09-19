import React, { useState, useEffect } from 'react';
import { dbService } from './services/store';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import InventarisPage from './pages/InventarisPage';
import ListBarangPage from './pages/ListBarangPage';
import KartuRfidPage from './pages/KartuRfidPage';
import PersetujuanPage from './pages/PersetujuanPage';
import PeminjamanPage from './pages/PeminjamanPage';
import PengembalianPage from './pages/PengembalianPage';
import RiwayatPage from './pages/RiwayatPage';
import TambahPetugasPage from './pages/TambahPetugasPage';
import SimulasiIotPage from './pages/SimulasiIotPage';

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [pendingCount, setPendingCount] = useState(0);

  const checkUserAndLogs = () => {
    const user = dbService.getCurrentUser();
    setCurrentUser(user);

    const logs = dbService.getTapLog();
    setPendingCount(logs.filter(l => l.status === 'pending').length);
  };

  useEffect(() => {
    checkUserAndLogs();
    const handleStorage = () => checkUserAndLogs();
    window.addEventListener('simlab_storage_updated', handleStorage);
    const interval = setInterval(checkUserAndLogs, 2000);
    return () => {
      window.removeEventListener('simlab_storage_updated', handleStorage);
      clearInterval(interval);
    };
  }, []);

  const handleLogout = () => {
    dbService.logout();
    setCurrentUser(null);
  };

  if (!currentUser) {
    return <LoginPage onLoginSuccess={(u) => setCurrentUser(u)} />;
  }

  return (
    <div className="min-h-screen bg-main flex">
      {/* Sidebar (fixed left) */}
      <Sidebar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        user={currentUser}
        onLogout={handleLogout}
        pendingCount={pendingCount}
      />

      {/* Main Content Area (offset by sidebar width 240px / w-60) */}
      <main className="flex-1 ml-60 min-h-screen flex flex-col">
        {/* Top Header */}
        <header className="h-16 bg-surface border-b border-main px-8 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-main capitalize">
              {currentTab === 'list_barang' ? 'List Barang' : currentTab.replace('_', ' ')}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs font-semibold text-main">{currentUser.nama}</p>
              <p className="text-[11px] text-muted capitalize">{currentUser.role}</p>
            </div>
          </div>
        </header>

        {/* Page Body Content */}
        <div className="p-8 flex-1">
          {currentTab === 'dashboard' && <DashboardPage setCurrentTab={setCurrentTab} />}
          {currentTab === 'inventaris' && <InventarisPage />}
          {currentTab === 'list_barang' && <ListBarangPage />}
          {currentTab === 'kartu_rfid' && <KartuRfidPage />}
          {currentTab === 'persetujuan' && <PersetujuanPage />}
          {currentTab === 'peminjaman' && <PeminjamanPage />}
          {currentTab === 'pengembalian' && <PengembalianPage />}
          {currentTab === 'riwayat' && <RiwayatPage />}
          {currentTab === 'tambah_petugas' && <TambahPetugasPage />}
          {currentTab === 'simulasi_iot' && <SimulasiIotPage />}
        </div>
      </main>
    </div>
  );
}
