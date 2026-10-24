import { useState } from 'react';
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
  IconCpu,
  IconPackage,
  IconKey,
  IconFlask,
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

  return (
    <>
      <div
        className={`fixed inset-0 bg-gray-900/40 z-30 md:hidden ${mobileMenuOpen ? '' : 'pointer-events-none hidden'}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      <aside
        className={`bg-surface border-r border-main flex flex-col h-screen fixed left-0 top-0 z-40 select-none overflow-x-hidden overflow-y-auto transition-all duration-300 ease-in-out group
          w-[260px] md:w-[68px] md:hover:w-[240px] md:hover:shadow-2xl
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <div className="px-4 py-3.5 border-b border-main flex items-center gap-3 min-h-14 shrink-0 overflow-hidden">
          <img src={logo} alt="Logo SMK" className="w-8 h-8 object-contain shrink-0" />
          <div className="min-w-0 transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100 whitespace-nowrap overflow-hidden">
            <h1 className="font-semibold text-main text-[15px] leading-tight">SISPAS</h1>
            <p className="text-sm text-muted leading-tight truncate">{SCHOOL_NAME}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2.5 md:px-2 md:group-hover:px-2.5 py-3 space-y-4">
          {MENU_SECTIONS.map((section, idx) => {
            const items = section.items.filter((item) => item.roles.includes(role));
            if (items.length === 0) return null;
            return (
              <div key={section.title || idx}>
                {section.title && (
                  <div className="h-4 my-1 overflow-hidden">
                    <p className="px-2 text-xs font-semibold uppercase tracking-wider text-muted transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100 whitespace-nowrap truncate">
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
                        className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded text-[15px] min-h-11 text-left relative overflow-hidden transition-colors ${active
                          ? 'bg-[#E8F1FB] text-[#1E5AAB] font-semibold border-l-[3px] border-[#1E5AAB]'
                          : 'text-gray-700 hover:bg-gray-100 border-l-[3px] border-transparent'
                          }`}
                      >
                        <div className="relative shrink-0 flex items-center justify-center w-5 h-5">
                          <Icon size={20} className={active ? 'text-[#1E5AAB]' : 'text-gray-500'} />
                          {badge > 0 && (
                            <span className="hidden md:inline-block md:group-hover:hidden absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-600 rounded-full ring-2 ring-white" />
                          )}
                        </div>
                        <span className="flex-1 truncate transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100 whitespace-nowrap">
                          {item.label}
                        </span>
                        {badge > 0 && (
                          <span className="inline-flex md:hidden md:group-hover:inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-xs font-semibold bg-red-700 text-white shrink-0 ml-auto">
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

        <div className="border-t border-main px-2.5 md:px-2 md:group-hover:px-2.5 py-3 shrink-0">
          <div className="flex items-center gap-3 px-1 mb-3 overflow-hidden">
            <div className="w-9 h-9 rounded-full bg-[#E8F1FB] text-[#1E5AAB] font-bold flex items-center justify-center text-sm shrink-0 uppercase shadow-xs">
              {user?.nama ? user.nama.charAt(0) : 'U'}
            </div>
            <div className="min-w-0 transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100 whitespace-nowrap overflow-hidden">
              <p className="text-[15px] font-medium text-main truncate">{user?.nama ?? 'Pengguna'}</p>
              <p className="text-xs text-muted truncate">
                {getRoleLabel(user?.role)}
              </p>
            </div>
          </div>
          <button
            id="btn-ganti-password"
            onClick={() => {
              setCurrentTab('ganti_password');
              setMobileMenuOpen(false);
            }}
            title="Ganti Password"
            className="w-full flex items-center gap-3 px-2.5 py-2.5 min-h-11 rounded text-[15px] font-medium text-gray-600 hover:bg-gray-100 border-l-[3px] border-transparent mb-1 overflow-hidden transition-colors"
          >
            <IconKey size={20} className="shrink-0 text-gray-500" />
            <span className="truncate transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100 whitespace-nowrap">
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
            className="w-full flex items-center gap-3 px-2.5 py-2.5 min-h-11 rounded text-[15px] font-semibold text-red-700 border border-red-200 hover:bg-red-50 transition-colors cursor-pointer overflow-hidden"
          >
            <IconLogout size={20} className="shrink-0" />
            <span className="truncate transition-opacity duration-200 md:opacity-0 md:group-hover:opacity-100 whitespace-nowrap">
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
        message={`Anda perlu login kembali untuk mengakses aplikasi SISPAS.`}
        confirmLabel="Ya, Keluar"
        confirmVariant="danger"
        icon={IconLogout}
      />
    </>
  );
}
