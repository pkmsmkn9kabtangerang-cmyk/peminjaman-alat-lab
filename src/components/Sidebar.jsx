import { useEffect, useState } from 'react';
import {
  IconLayoutDashboard,
  IconTools,
  IconListDetails,
  IconIdBadge2,
  IconHandStop,
  IconCornerDownLeft,
  IconHistory,
  IconUsers,
  IconLogout,
  IconCreditCard,
  IconKey,
  IconFlask,
  IconX,
} from '@tabler/icons-react';
import logo from '../assets/logo.png';
import ConfirmDialog from './ConfirmDialog';

const SCHOOL_NAME = import.meta.env.VITE_SCHOOL_NAME ?? 'SMK Negeri';

const MENU_SECTIONS = [
  {
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: IconLayoutDashboard, roles: ['super_admin', 'admin', 'petugas'] },
    ],
  },
  {
    title: 'Aktivitas Transaksi',
    items: [
      { id: 'realtime_card', label: 'Aktivitas Transaksi', icon: IconCreditCard, roles: ['super_admin', 'admin', 'petugas'] },
      { id: 'riwayat', label: 'Riwayat Transaksi', icon: IconHistory, roles: ['super_admin', 'admin', 'petugas'] },
      { id: 'kartu_rfid', label: 'Kelola Kartu', icon: IconIdBadge2, roles: ['super_admin', 'admin'] },

      // { id: 'simulasi_iot', label: 'Simulasi Kartu', icon: IconCpu, roles: ['admin', 'petugas'] },
    ],
  },
  {
    title: 'Inventaris & Pengguna',
    items: [
      { id: 'list_alat', label: 'Daftar Alat', icon: IconListDetails, roles: ['super_admin', 'admin', 'petugas'] },
      { id: 'inventaris', label: 'Kelola Alat', icon: IconTools, roles: ['super_admin', 'admin'] },
      { id: 'pengguna', label: 'Kelola Pengguna', icon: IconUsers, roles: ['super_admin', 'admin'] },
    ],
  },
  {
    title: 'Transaksi Manual',
    items: [
      { id: 'peminjaman', label: 'Peminjaman Manual', icon: IconHandStop, roles: ['super_admin', 'admin', 'petugas'] },
      { id: 'pengembalian', label: 'Pengembalian Manual', icon: IconCornerDownLeft, roles: ['super_admin', 'admin', 'petugas'] },
      { id: 'sekali_pakai', label: 'Alat Sekali Pakai', icon: IconFlask, roles: ['super_admin', 'admin', 'petugas'] },
    ],
  },
];

function getRoleLabel(role) {
  if (role === 'super_admin') return 'Super Admin';
  if (role === 'admin') return 'Admin';
  return 'Petugas lab';
}

export default function Sidebar({ currentTab, setCurrentTab, user, onLogout, unreadCount = 0, mobileMenuOpen, setMobileMenuOpen }) {
  const role = user?.role ?? 'petugas';
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  // Kunci scroll halaman saat drawer mobile terbuka.
  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileMenuOpen]);

  // Tutup drawer dengan tombol Escape.
  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen, setMobileMenuOpen]);

  return (
    <>
      <div
        className={`fixed inset-x-0 bottom-0 z-30 bg-slate-900/45 backdrop-blur-[1px] transition-opacity duration-200 md:hidden ${
          mobileMenuOpen ? 'animate-fadeIn opacity-100' : 'pointer-events-none opacity-0'
        }`}
        style={{ top: 'var(--net-banner-height, 0px)' }}
        onClick={() => setMobileMenuOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={`fixed left-0 z-40 flex select-none flex-col overflow-hidden border-r border-main bg-surface transition-all duration-300 ease-in-out group
          w-[272px] max-w-[85vw] md:w-[68px] md:hover:w-[240px] md:hover:shadow-2xl
          ${mobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'}
        `}
        style={{
          top: 'var(--net-banner-height, 0px)',
          height: 'calc(100dvh - var(--net-banner-height, 0px))',
        }}
        aria-label="Menu navigasi utama"
      >
        <div className="flex min-h-16 shrink-0 items-center gap-3 overflow-hidden border-b border-main px-3.5 py-3">
          <img src={logo} alt="Logo sekolah" className="h-9 w-9 shrink-0 object-contain" />
          <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100">
            <h1 className="text-[15px] font-bold leading-tight tracking-tight text-main">SISPAS</h1>
            <p className="truncate text-[11.5px] leading-tight text-muted">{SCHOOL_NAME}</p>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:hidden"
            aria-label="Tutup menu navigasi"
          >
            <IconX size={19} />
          </button>
        </div>

        <nav className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden px-2.5 py-3 md:px-2 md:py-4 md:group-hover:px-2.5">
          {MENU_SECTIONS.map((section, idx) => {
            const items = section.items.filter((item) => item.roles.includes(role));
            if (items.length === 0) return null;
            return (
              <div key={section.title || idx}>
                {section.title && (
                  <div className="mb-1 h-4 overflow-hidden">
                    <p className="truncate whitespace-nowrap px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100">
                      {section.title}
                    </p>
                  </div>
                )}
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const Icon = item.icon;
                    const active = currentTab === item.id;
                    const badge = item.id === 'realtime_card' ? unreadCount : 0;
                    return (
                      <button
                        key={item.id}
                        id={`nav-${item.id}`}
                        onClick={() => {
                          setCurrentTab(item.id);
                          setMobileMenuOpen(false);
                        }}
                        title={item.label}
                        aria-current={active ? 'page' : undefined}
                        className={`relative flex min-h-11 w-full items-center gap-3 overflow-hidden rounded-lg px-2.5 py-2.5 text-left text-[14px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                          active
                            ? 'bg-[#E8F1FB] font-semibold text-[#1E5AAB]'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {active && (
                          <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-[#1E5AAB]" aria-hidden="true" />
                        )}
                        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                          <Icon size={20} className={active ? 'text-[#1E5AAB]' : 'text-gray-500'} />
                          {badge > 0 && (
                            <span className="absolute -right-1 -top-1 hidden h-2.5 w-2.5 rounded-full bg-red-600 ring-2 ring-white md:inline-block md:group-hover:hidden" />
                          )}
                        </span>
                        <span className="flex-1 truncate whitespace-nowrap transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100">
                          {item.label}
                        </span>
                        {badge > 0 && (
                          <span className="ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-red-700 px-1.5 text-[10.5px] font-semibold text-white md:hidden md:group-hover:inline-flex">
                            {badge > 99 ? '99+' : badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-main px-2.5 py-3 md:px-2 md:group-hover:px-2.5">
          <div className="mb-3 flex items-center gap-3 overflow-hidden rounded-lg px-1 py-1">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#E8F1FB] text-sm font-bold uppercase text-[#1E5AAB] shadow-xs ring-1 ring-blue-100">
              {user?.nama ? user.nama.charAt(0) : 'U'}
            </div>
            <div className="min-w-0 flex-1 overflow-hidden whitespace-nowrap transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100">
              <p className="truncate text-[13.5px] font-semibold text-main">{user?.nama ?? 'Pengguna'}</p>
              <p className="truncate text-[11px] text-muted">{getRoleLabel(user?.role)}</p>
            </div>
          </div>

          <button
            id="btn-ganti-password"
            onClick={() => {
              setCurrentTab('ganti_password');
              setMobileMenuOpen(false);
            }}
            title="Ganti Password"
            className="mb-1 flex min-h-11 w-full items-center gap-3 overflow-hidden rounded-lg px-2.5 py-2.5 text-[14px] font-medium text-gray-600 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <IconKey size={20} className="shrink-0 text-gray-500" />
            <span className="truncate whitespace-nowrap transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100">
              Ganti Password
            </span>
          </button>

          <button
            id="btn-logout"
            onClick={() => {
              setShowLogoutConfirm(true);
              setMobileMenuOpen(false);
            }}
            title="Keluar"
            className="flex min-h-11 w-full items-center gap-3 overflow-hidden rounded-lg border border-red-200 px-2.5 py-2.5 text-[14px] font-semibold text-red-700 transition-colors hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            <IconLogout size={20} className="shrink-0" />
            <span className="truncate whitespace-nowrap transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100">
              Keluar
            </span>
          </button>
        </div>
      </aside>

      <ConfirmDialog
        isOpen={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={() => {
          setShowLogoutConfirm(false);
          onLogout();
        }}
        title="Yakin ingin keluar?"
        message="Anda perlu login kembali untuk mengakses aplikasi SISPAS."
        confirmLabel="Ya, Keluar"
        confirmVariant="danger"
        icon={IconLogout}
      />
    </>
  );
}
