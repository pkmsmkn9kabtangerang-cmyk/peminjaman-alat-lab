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

import ChangePasswordMandiri from './pages/ChangePasswordMandiri';
import GantiPassword from './pages/GantiPassword';
import SetPassword from './pages/SetPassword';
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

  ganti_password: 'Ganti Password',
};

// ── URL helpers ──────────────────────────────────────────────
// Saat login: URL bersih (hash kosong atau #login)
// Saat logout: hash dibersihkan, tidak ada #list_alat tersisa
const LOGIN_HASH = 'login';

function clearHashToLogin() {
  // Ganti hash ke 'login' agar URL jadi /#login bukan /#list_alat
  try {
    if (window.history.replaceState) {
      window.history.replaceState(null, '', window.location.pathname + '#' + LOGIN_HASH);
    } else {
      window.location.hash = LOGIN_HASH;
    }
  } catch (_) {
    window.location.hash = LOGIN_HASH;
  }
}

function getInitialTab() {
  try {
    const hash = window.location.hash.replace(/^#\/?/, '');
    // Jangan restore hash 'login' sebagai tab
    if (hash && PAGE_TITLES[hash]) return hash;
    const saved = localStorage.getItem('simlab_current_tab');
    if (saved && PAGE_TITLES[saved]) return saved;
  } catch (_) { /* noop */ }
  return 'dashboard';
}
// ────────────────────────────────────────────────────────────

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
  const [currentUser, setCurrentUser]   = useState(null);
  // null = masih loading, false = belum login, object = sudah login
  const [authState, setAuthState]       = useState('loading'); // 'loading' | 'unauthenticated' | 'authenticated'
  const [currentTab, setCurrentTab]     = useState(getInitialTab);
  const [unreadCount, setUnreadCount]   = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  
  const isSetPasswordRoute = window.location.pathname === '/auth/set-password';

  const prevLogsLen = useRef(dbService.getTapLog().length);

  // ── Auth: Supabase vs localStorage ──────────────────────────
  useEffect(() => {
    if (!isSupabaseConfigured) {
      // Mode demo: cek localStorage
      const saved = dbService.getCurrentUser();
      if (saved) {
        setCurrentUser(saved);
        setAuthState('authenticated');
      } else {
        setAuthState('unauthenticated');
        clearHashToLogin();
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
          clearHashToLogin();
        }
        return;
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, nama_lengkap, email, role, wajib_ganti_password') // bisa tambahin aktif di samping role
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
          // aktif: profile.aktif,
        });
        setAuthState('authenticated');
      } else {
        // Profil tidak aktif atau tidak ditemukan → logout
        await supabase.auth.signOut();
        setCurrentUser(null);
        setAuthState('unauthenticated');
        clearHashToLogin();
      }
    }

    // Initial session check
    supabase.auth.getSession().then(({ data: { session } }) => {
      hydrateUser(session);
    });

    // Subscribe perubahan auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      hydrateUser(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

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

    // Mode local: poll localStorage
    if (!isSupabaseConfigured) {
      setUnreadCount(dbService.getUnreadCount());
      const handle = () => {
        setCurrentUser(dbService.getCurrentUser());
        setUnreadCount(dbService.getUnreadCount());
        const logs = dbService.getTapLog();
        if (logs.length > prevLogsLen.current) {
          const latest = logs[0];
          if (latest) triggerNotification(latest);
        }
        prevLogsLen.current = dbService.getTapLog().length;
      };
      window.addEventListener('simlab_storage_updated', handle);
      const interval = setInterval(() => setUnreadCount(dbService.getUnreadCount()), 3000);
      return () => {
        window.removeEventListener('simlab_storage_updated', handle);
        clearInterval(interval);
      };
    }

    // Mode Supabase: Realtime channel
    supabase
      .from('tap_log')
      .select('id', { count: 'exact', head: true })
      .eq('is_read', false)
      .then(({ count }) => setUnreadCount(count ?? 0));

    const channel = supabase
      .channel('app-global-realtime-taps')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tap_log' }, (payload) => {
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

  // ── Tab & URL management ────────────────────────────────────
  const handleTabChange = useCallback((tab) => {
    if (!PAGE_TITLES[tab]) return;
    setCurrentTab(tab);
    try {
      localStorage.setItem('simlab_current_tab', tab);
      // Selalu update hash saat tab berubah
      if (window.location.hash.replace(/^#\/?/, '') !== tab) {
        window.location.hash = tab;
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

  // Sync tab saat hash berubah dari luar (tombol back/forward browser)
  useEffect(() => {
    if (authState !== 'authenticated') return;

    const handleHashChange = () => {
      const hash = window.location.hash.replace(/^#\/?/, '');
      if (hash && PAGE_TITLES[hash] && hash !== currentTab) {
        setCurrentTab(hash);
        try { localStorage.setItem('simlab_current_tab', hash); } catch (_) { /* noop */ }
      }
    };
    window.addEventListener('hashchange', handleHashChange);

    // Kalau hash kosong atau #login → set ke tab aktif saat ini
    const currentHash = window.location.hash.replace(/^#\/?/, '');
    if (!currentHash || currentHash === LOGIN_HASH || !PAGE_TITLES[currentHash]) {
      window.location.hash = currentTab;
    }

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [authState, currentTab]);

  // ── Logout ──────────────────────────────────────────────────
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
    // Bersihkan hash ke #login setelah logout
    clearHashToLogin();
    setAuthState('unauthenticated');
    setCurrentUser(null);
    setUnreadCount(0);
  };

  // ── Login success callback ───────────────────────────────────
  const handleLoginSuccess = (userObj) => {
    if (!isSupabaseConfigured) {
      dbService.setCurrentUser(userObj);
    }
    setCurrentUser(userObj);
    setAuthState('authenticated');
    // Restore tab yang tersimpan atau default ke dashboard
    const restoredTab = (() => {
      try {
        const saved = localStorage.getItem('simlab_current_tab');
        return (saved && PAGE_TITLES[saved]) ? saved : 'dashboard';
      } catch (_) { return 'dashboard'; }
    })();
    setCurrentTab(restoredTab);
    // Update hash ke tab yang dipilih (bukan #login lagi)
    try { window.location.hash = restoredTab; } catch (_) { /* noop */ }
  };

  // ── Render: SetPassword Route ───────────────────────────────
  if (isSetPasswordRoute) {
    return <SetPassword />;
  }

  // ── Render: Loading ─────────────────────────────────────────
  if (authState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <svg className="animate-spin h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <p className="text-sm font-medium">Memuat aplikasi...</p>
        </div>
      </div>
    );
  }

  // ── Render: Login page ──────────────────────────────────────
  // URL: /#login (hash bersih, tidak ada tab aktif di URL)
  if (authState === 'unauthenticated' || !currentUser) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // ── Render: Wajib Ganti Password ────────────────────────────
  if (currentUser.wajib_ganti_password) {
    return <ChangePasswordMandiri 
             user={currentUser} 
             onSuccess={() => setCurrentUser({...currentUser, wajib_ganti_password: false})} 
             onCancel={handleLogout} 
           />;
  }

  // ── Render: Main app ────────────────────────────────────────
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
          {currentTab === 'peminjaman'    && <Peminjaman user={currentUser} />}
          {currentTab === 'pengembalian'  && <Pengembalian user={currentUser} />}
          {currentTab === 'riwayat'       && <Riwayat />}
          {currentTab === 'list_alat'     && <DaftarAlat />}
          {currentTab === 'inventaris'    && <KelolaAlat />}
          {currentTab === 'kartu_rfid'    && <KelolaKartu />}
          {currentTab === 'pengguna'      && <KelolaPetugas currentUser={currentUser} />}
          {currentTab === 'simulasi_iot'  && <SimulasiKartu />}

          {currentTab === 'ganti_password' && <GantiPassword user={currentUser} />}
        </div>
      </main>
    </div>
  );
}
