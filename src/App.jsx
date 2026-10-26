import { useState, useEffect, useCallback, useRef } from 'react';
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
import ChangePasswordMandiri from './pages/ChangePasswordMandiri';
import { IconBell, IconX, IconCheck, IconAlertTriangle, IconMenu2 } from '@tabler/icons-react';
import NetworkStatusBanner from './components/NetworkStatusBanner';
import { isOnline, registerOnlineSync } from './lib/networkStatus';

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
  } catch {
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
  } catch { /* noop */ }

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

function roleLabel(role) {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'admin') return 'Admin';
  return 'Petugas Lab';
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
  const isWarning = item.type === 'warning';

  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-[calc(1rem+var(--safe-bottom))] z-[60] flex justify-center sm:inset-x-auto sm:right-4 sm:justify-end">
      <div
        role={isError ? 'alert' : 'status'}
        className={`pointer-events-auto w-full max-w-sm animate-slideUp overflow-hidden rounded-xl border bg-white shadow-lg shadow-slate-900/10 ${
          isError ? 'border-red-200' : isWarning ? 'border-amber-200' : 'border-emerald-200'
        }`}
      >
        <div className="flex items-start gap-2.5 px-3.5 py-3">
          <span
            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
              isError
                ? 'bg-red-50 text-red-700'
                : isWarning
                  ? 'bg-amber-50 text-amber-700'
                  : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            {isError ? (
              <IconAlertTriangle size={16} />
            ) : isWarning ? (
              <IconAlertTriangle size={16} />
            ) : (
              <IconCheck size={16} />
            )}
          </span>
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="text-[13.5px] font-semibold leading-snug text-gray-900">{item.title}</p>
            {item.message && (
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-gray-600">{item.message}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setItem(null)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
            aria-label="Tutup"
          >
            <IconX size={15} />
          </button>
        </div>
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

    const fetchUnread = () => {
      if (!isOnline()) return;
      supabase
        .from('tap_log')
        .select('id', { count: 'exact', head: true })
        .eq('is_read', false)
        .or('jenis_terdeteksi.neq.manual,jenis_terdeteksi.is.null')
        .then(({ count, error }) => {
          if (!error && count !== null) setUnreadCount(count ?? 0);
        })
        .catch(() => {});
    };

    fetchUnread();
    const unregisterSync = registerOnlineSync(fetchUnread);

    const channel = supabase
      .channel('app-global-realtime-taps')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tap_log' }, (payload) => {
        if (payload.new?.jenis_terdeteksi === 'manual') return;
        triggerNotification(payload.new);
        setUnreadCount((n) => n + 1);
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('[Realtime] channel error. Waiting for reconnection...');
        }
      });

    return () => {
      unregisterSync();
      supabase.removeChannel(channel);
    };
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
    } catch { /* noop */ }
    setMobileMenuOpen(false);
    if (tab === 'realtime_card') {
      if (isSupabaseConfigured) {
        if (isOnline()) {
          supabase.rpc('mark_taps_read').then(() => setUnreadCount(0)).catch(() => {});
        } else {
          setUnreadCount(0);
        }
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
        try { localStorage.setItem('simlab_current_tab', tab); } catch { /* noop */ }
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
      } catch { return 'dashboard'; }
    })();
    setCurrentTab(restoredTab);
    navigateTo(TAB_TO_PATH[restoredTab] ?? '/dashboard', true);
  };

  // ── Render: Halaman /auth/* ──────────────────────────────────
  if (isAuthRoute) {
    return (
      <>
        <NetworkStatusBanner />
        <SetPassword />
      </>
    );
  }

  // ── Render: Loading ──────────────────────────────────────────
  if (authState === 'loading') {
    return (
      <>
        <NetworkStatusBanner />
        <div className="flex min-h-screen items-center justify-center bg-main px-4">
          <div className="flex flex-col items-center gap-3 text-gray-500">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
              <svg className="h-6 w-6 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            </span>
            <p className="text-sm font-medium">Memuat aplikasi...</p>
          </div>
        </div>
      </>
    );
  }

  // ── Render: Login page ───────────────────────────────────────
  if (authState === 'unauthenticated' || !currentUser) {
    return (
      <>
        <NetworkStatusBanner />
        <Login onLoginSuccess={handleLoginSuccess} />
      </>
    );
  }

  // ── Render: Wajib Ganti Password ─────────────────────────────
  if (currentUser.wajib_ganti_password) {
    return (
      <>
        <NetworkStatusBanner />
        <ChangePasswordMandiri
          user={currentUser}
          onSuccess={() => setCurrentUser({ ...currentUser, wajib_ganti_password: false })}
          onCancel={handleLogout}
        />
      </>
    );
  }

  // ── Render: Main app ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-main flex">
      <NetworkStatusBanner />
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
        <header
          className="sticky z-20 flex min-h-14 items-center border-b border-main bg-surface/95 px-3 backdrop-blur-sm sm:px-5 md:min-h-16 lg:px-6"
          style={{ top: 'var(--net-banner-height, 0px)' }}
        >
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="-ml-1 flex h-10 w-10 items-center justify-center rounded-xl text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:hidden"
                aria-label="Buka menu navigasi"
              >
                <IconMenu2 className="h-5 w-5" />
              </button>

              <div className="flex min-w-0 items-center gap-2 md:hidden">
                <span className="shrink-0 text-[15px] font-bold tracking-tight text-main">SISPAS</span>
                <span className="hidden h-3.5 w-px shrink-0 bg-gray-300 min-[380px]:block" aria-hidden="true" />
                <span className="hidden truncate text-xs text-muted min-[380px]:inline">
                  {PAGE_TITLES[currentTab] || ''}
                </span>
              </div>

              <div className="hidden min-w-0 md:block">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                  SISPAS · Lab
                </p>
                <p className="truncate text-[15px] font-semibold text-main">
                  {PAGE_TITLES[currentTab] || 'Dashboard'}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              <button
                id="btn-bell-notifikasi"
                onClick={() => handleTabChange('realtime_card')}
                className="relative flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-xl px-2.5 text-gray-700 transition-colors hover:bg-gray-100"
                aria-label={`Notifikasi${unreadCount > 0 ? `, ${unreadCount} belum dibaca` : ''}`}
                title="Buka aktivitas transaksi"
              >
                <IconBell size={21} />
                {unreadCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-700 px-1 text-[10px] font-semibold text-white ring-2 ring-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              <div className="hidden items-center gap-2.5 border-l border-gray-200 pl-3 sm:flex">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#E8F1FB] text-sm font-bold uppercase text-[#1E5AAB] ring-1 ring-blue-100">
                  {currentUser?.nama ? currentUser.nama.charAt(0) : 'U'}
                </div>
                <div className="hidden leading-tight lg:block">
                  <p className="max-w-[160px] truncate text-[13px] font-semibold text-main">
                    {currentUser?.nama ?? 'Pengguna'}
                  </p>
                  <p className="text-[11px] text-muted">{roleLabel(currentUser?.role)}</p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 min-w-0 overflow-x-hidden px-3 py-4 sm:px-5 sm:py-5 lg:p-6">
          <div className={currentTab === 'dashboard' ? 'block' : 'hidden'}>
            <Dashboard setCurrentTab={handleTabChange} user={currentUser} isActive={currentTab === 'dashboard'} />
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
