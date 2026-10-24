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
import PemberianSekaliPakai from './pages/PemberianSekaliPakai';

import GantiPassword from './pages/GantiPassword';
import SetPassword from './pages/SetPassword';
import { IconBell, IconX, IconCheck, IconAlertTriangle, IconMenu2 } from '@tabler/icons-react';

// ── Internal tab keys (tidak berubah) ────────────────────────
const PAGE_TITLES = {
  dashboard: 'Dashboard',
  realtime_card: 'Aktivitas Transaksi',
  peminjaman: 'Peminjaman Manual',
  pengembalian: 'Pengembalian Manual',
  riwayat: 'Riwayat Transaksi',
  list_alat: 'Daftar Alat',
  inventaris: 'Kelola Alat',
  kartu_rfid: 'Kelola Kartu',
  pengguna: 'Kelola Pengguna',
  simulasi_iot: 'Simulasi Kartu',
  ganti_password: 'Ganti Password',
  sekali_pakai: 'Alat Sekali Pakai Manual',
};

// ── URL mapping: tab key → clean pathname ─────────────────────
const TAB_TO_PATH = {
  dashboard: '/dashboard',
  realtime_card: '/aktivitas-rfid',
  peminjaman: '/peminjaman',
  pengembalian: '/pengembalian',
  riwayat: '/riwayat',
  list_alat: '/daftar-alat',
  inventaris: '/inventaris',
  kartu_rfid: '/kartu-rfid',
  pengguna: '/pengguna',
  simulasi_iot: '/simulasi-iot',
  ganti_password: '/ganti-password',
  sekali_pakai: '/sekali-pakai',
};

// Reverse map: pathname → tab key
const PATH_TO_TAB = Object.fromEntries(
  Object.entries(TAB_TO_PATH).map(([tab, path]) => [path, tab])
);

// Pathname yang dimulai dengan /auth/ ditangani di luar flow utama
const AUTH_PATHS = ['/auth/set-password'];

// ── URL helpers ───────────────────────────────────────────────
function navigateTo(path, replace = false) {
  try {
    if (replace) {
      window.history.replaceState(null, '', path);
    } else {
      window.history.pushState(null, '', path);
    }
  } catch (_) {
    window.location.href = path;
  }
}

function getTabFromPath(pathname) {
  // Exact match
  if (PATH_TO_TAB[pathname]) return PATH_TO_TAB[pathname];
  // Legacy hash: /#dashboard → /dashboard
  return null;
}

function getInitialTab() {
  const pathname = window.location.pathname;
  const tabFromPath = getTabFromPath(pathname);
  if (tabFromPath) return tabFromPath;

  // Fallback: cek hash lama #dashboard → migrate ke path
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (hash && PAGE_TITLES[hash]) return hash;

  // Fallback ke localStorage
  try {
    const saved = localStorage.getItem('simlab_current_tab');
    if (saved && PAGE_TITLES[saved]) return saved;
  } catch (_) { /* noop */ }

  return 'dashboard';
}
// ─────────────────────────────────────────────────────────────

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
        {isError
          ? <IconAlertTriangle size={18} className="text-red-700 shrink-0 mt-0.5" />
          : <IconCheck size={18} className="text-green-800 shrink-0 mt-0.5" />}
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-gray-900">{item.title}</p>
          {item.message && <p className="text-sm text-gray-700 mt-0.5 leading-relaxed">{item.message}</p>}
        </div>
        <button type="button" onClick={() => setItem(null)} className="p-1 text-gray-500 hover:text-gray-800 min-h-8 min-w-8" aria-label="Tutup">
          <IconX size={16} />
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [authState, setAuthState] = useState('loading'); // 'loading' | 'unauthenticated' | 'authenticated'
  const [currentTab, setCurrentTab] = useState(getInitialTab);
  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const currentPathname = window.location.pathname;
  const isAuthRoute = AUTH_PATHS.includes(currentPathname);

  const prevLogsLen = useRef(dbService.getTapLog().length);

  // ── Auth: Supabase vs localStorage ──────────────────────────
  useEffect(() => {
    // Jika di halaman auth khusus, jangan lakukan redirect apapun
    if (isAuthRoute) {
      setAuthState('unauthenticated'); // agar tidak stuck di loading
      return;
    }

    if (!isSupabaseConfigured) {
      // Mode demo: cek localStorage
      const saved = dbService.getCurrentUser();
      if (saved) {
        setCurrentUser(saved);
        setAuthState('authenticated');
      } else {
        setAuthState('unauthenticated');
        navigateTo('/login', true);
      }
      return;
    }

    // Mode Supabase: cek session aktif
    let mounted = true;

    async function hydrateUser(session) {
      if (!session?.user) {
        if (mounted) {
          setCurrentUser(null);
          setAuthState('unauthenticated');
          if (!isAuthRoute) navigateTo('/login', true);
        }
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, nama_lengkap, email, role, wajib_ganti_password')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!mounted) return;
      if (profile) {
        setCurrentUser({
          uid: profile.id,
          nama: profile.nama_lengkap || session.user.email,
          email: profile.email || session.user.email,
          role: profile.role,
          wajib_ganti_password: profile.wajib_ganti_password,
        });
        setAuthState('authenticated');
      } else {
        await supabase.auth.signOut();
        setCurrentUser(null);
        setAuthState('unauthenticated');
        navigateTo('/login', true);
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      hydrateUser(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      hydrateUser(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Unread count & Realtime tap notifications ────────────────
  const triggerNotification = useCallback((latest) => {
    const id = 'notif-' + Date.now();
    setNotifications([{ id, ...tapNotification(latest) }]);
  }, []);

  const dismissNotification = useCallback((id) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  useEffect(() => {
    if (authState !== 'authenticated') return;

    if (!isSupabaseConfigured) {
      setUnreadCount(dbService.getUnreadCount());
      const handle = () => {
        setCurrentUser(dbService.getCurrentUser());
        setUnreadCount(dbService.getUnreadCount());
        const logs = dbService.getTapLog().filter((l) => l.jenis_terdeteksi !== 'manual');
        if (logs.length > prevLogsLen.current) {
          const latest = logs[0];
          if (latest) triggerNotification(latest);
        }
        prevLogsLen.current = logs.length;
      };
      window.addEventListener('simlab_storage_updated', handle);
      const interval = setInterval(() => setUnreadCount(dbService.getUnreadCount()), 3000);
      return () => {
        window.removeEventListener('simlab_storage_updated', handle);
        clearInterval(interval);
      };
    }

    supabase
      .from('tap_log')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false)
      .or('jenis_terdeteksi.neq.manual,jenis_terdeteksi.is.null')
      .then(({ count }) => setUnreadCount(count ?? 0));

    const channel = supabase
      .channel('app-global-realtime-taps')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tap_log' }, (payload) => {
        if (payload.new?.jenis_terdeteksi === 'manual') return;
        triggerNotification(payload.new);
        setUnreadCount((n) => n + 1);
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('[Realtime] channel error. Reconnecting...');
        }
      });

    return () => supabase.removeChannel(channel);
  }, [authState, triggerNotification]);

  // ── Tab & URL management ─────────────────────────────────────
  const handleTabChange = useCallback((tab) => {
    if (!PAGE_TITLES[tab]) return;
    setCurrentTab(tab);
    try {
      localStorage.setItem('simlab_current_tab', tab);
      const targetPath = TAB_TO_PATH[tab] ?? '/dashboard';
      if (window.location.pathname !== targetPath) {
        navigateTo(targetPath);
      }
    } catch (_) { /* noop */ }
    setMobileMenuOpen(false);
    if (tab === 'realtime_card') {
      if (isSupabaseConfigured) {
        supabase.rpc('mark_taps_read').then(() => setUnreadCount(0));
      } else {
        dbService.markTapsRead();
        setUnreadCount(0);
      }
    }
  }, []);

  // Sync tab saat user klik Back/Forward browser
  useEffect(() => {
    if (authState !== 'authenticated') return;

    const handlePopState = () => {
      const tab = getTabFromPath(window.location.pathname);
      if (tab && tab !== currentTab) {
        setCurrentTab(tab);
        try { localStorage.setItem('simlab_current_tab', tab); } catch (_) { /* noop */ }
      }
    };
    window.addEventListener('popstate', handlePopState);

    // Jika pathname tidak dikenali tapi user sudah login, push ke path yang benar
    const pathTab = getTabFromPath(window.location.pathname);
    if (!pathTab && window.location.pathname !== '/login') {
      navigateTo(TAB_TO_PATH[currentTab] ?? '/dashboard', true);
    }

    return () => window.removeEventListener('popstate', handlePopState);
  }, [authState, currentTab]);

  // ── Logout ───────────────────────────────────────────────────
  const handleLogout = async () => {
    try {
      if (isSupabaseConfigured) {
        await supabase.auth.signOut();
      } else {
        dbService.logout();
        setCurrentUser(null);
      }
    } catch (err) {
      console.error('[Logout] error:', err);
    }
    navigateTo('/login', true);
    setAuthState('unauthenticated');
    setCurrentUser(null);
    setUnreadCount(0);
  };

  // ── Login success callback ────────────────────────────────────
  const handleLoginSuccess = (userObj) => {
    if (!isSupabaseConfigured) {
      dbService.setCurrentUser(userObj);
    }
    setCurrentUser(userObj);
    setAuthState('authenticated');
    const restoredTab = (() => {
      try {
        const saved = localStorage.getItem('simlab_current_tab');
        return (saved && PAGE_TITLES[saved]) ? saved : 'dashboard';
      } catch (_) { return 'dashboard'; }
    })();
    setCurrentTab(restoredTab);
    navigateTo(TAB_TO_PATH[restoredTab] ?? '/dashboard', true);
  };

  // ── Render: Halaman /auth/* ──────────────────────────────────
  if (isAuthRoute) {
    return <SetPassword />;
  }

  // ── Render: Loading ──────────────────────────────────────────
  if (authState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <svg className="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
          <p className="text-sm font-medium">Memuat aplikasi...</p>
        </div>
      </div>
    );
  }

  // ── Render: Login page ───────────────────────────────────────
  if (authState === 'unauthenticated' || !currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // ── Render: Wajib Ganti Password ─────────────────────────────
  if (currentUser.wajib_ganti_password) {
    return <ChangePasswordMandiri
      user={currentUser}
      onSuccess={() => setCurrentUser({ ...currentUser, wajib_ganti_password: false })}
      onCancel={handleLogout}
    />;
  }

  // ── Render: Main app ─────────────────────────────────────────
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

      <main className="flex-1 md:ml-[68px] min-h-screen flex flex-col min-w-0 transition-all duration-300">
        <header className="min-h-14 md:min-h-16 bg-surface border-b border-main px-3 sm:px-6 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 -ml-1 text-muted hover:text-main hover:bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
              aria-label="Buka menu navigasi"
            >
              <IconMenu2 className="w-6 h-6" />
            </button>
            <div className="md:hidden flex items-center gap-2 min-w-0">
              <span className="font-bold text-main text-base tracking-tight shrink-0">SISPAS</span>
              <span className="text-xs text-muted truncate max-w-[130px] sm:max-w-none">
                {PAGE_TITLES[currentTab] || ''}
              </span>
            </div>
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

        <div className="p-3 sm:p-6 flex-1 min-w-0 overflow-x-hidden">
          <div className={currentTab === 'dashboard' ? 'block' : 'hidden'}>
            <Dashboard setCurrentTab={handleTabChange} user={currentUser} />
          </div>
          {currentTab === 'realtime_card' && <AktivitasKartu />}
          {currentTab === 'peminjaman' && <Peminjaman user={currentUser} />}
          {currentTab === 'pengembalian' && <Pengembalian user={currentUser} />}
          {currentTab === 'riwayat' && <Riwayat />}
          {currentTab === 'list_alat' && <DaftarAlat />}
          {currentTab === 'inventaris' && <KelolaAlat />}
          {currentTab === 'kartu_rfid' && <KelolaKartu />}
          {currentTab === 'pengguna' && <KelolaPetugas currentUser={currentUser} />}
          {currentTab === 'simulasi_iot' && <SimulasiKartu />}
          {currentTab === 'ganti_password' && <GantiPassword user={currentUser} />}
          {currentTab === 'sekali_pakai' && <PemberianSekaliPakai user={currentUser} />}
        </div>
      </main>
    </div>
  );
}
