// src/components/Sidebar.jsx
// Sidebar dengan logo SMK, menu sesuai PLAN.md, hr separator, tombol Keluar merah

import {
  IconLayoutDashboard,
  IconBox,
  IconListDetails,
  IconIdBadge2,
  IconHandStop,
  IconCornerDownLeft,
  IconHistory,
  IconUsers,
  IconLogout,
  IconRadioactive,
  IconBell,
  IconCpu,
} from '@tabler/icons-react';
import logoSmk from '../assets/logo-smk.svg';

const SCHOOL_NAME = import.meta.env.VITE_SCHOOL_NAME ?? 'SMK Negeri';

export default function Sidebar({ currentTab, setCurrentTab, user, onLogout, unreadCount = 0, mobileMenuOpen, setMobileMenuOpen }) {
  const menuItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: IconLayoutDashboard,
      roles: ['admin', 'petugas'],
    },
    {
      id: 'realtime_card',
      label: 'Realtime Card',
      icon: IconRadioactive,
      roles: ['admin', 'petugas'],
      badge: unreadCount,
    },
    {
      id: 'peminjaman',
      label: 'Peminjaman Manual',
      icon: IconHandStop,
      roles: ['admin', 'petugas'],
    },
    {
      id: 'pengembalian',
      label: 'Pengembalian Manual',
      icon: IconCornerDownLeft,
      roles: ['admin', 'petugas'],
    },
    {
      id: 'riwayat',
      label: 'Riwayat Peminjaman',
      icon: IconHistory,
      roles: ['admin', 'petugas'],
    },
    {
      id: 'list_barang',
      label: 'List Barang',
      icon: IconListDetails,
      roles: ['admin', 'petugas'],
    },
    {
      id: 'inventaris',
      label: 'Inventaris Barang',
      icon: IconBox,
      roles: ['admin'],
    },
    {
      id: 'kartu_rfid',
      label: 'Kartu RFID',
      icon: IconIdBadge2,
      roles: ['admin'],
    },
    {
      id: 'pengguna',
      label: 'Pengguna',
      icon: IconUsers,
      roles: ['admin'],
    },
    {
      id: 'simulasi_iot',
      label: 'Simulasi IoT',
      icon: IconCpu,
      roles: ['admin', 'petugas'],
    },
  ];

  const filtered = menuItems.filter((item) => item.roles.includes(user?.role ?? 'petugas'));

  return (
    <>
      {/* Mobile Overlay */}
      <div 
        className={`fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-30 transition-opacity md:hidden ${mobileMenuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={() => setMobileMenuOpen(false)}
      />
      
      {/* Sidebar Container */}
      <aside 
        className={`bg-surface border-r border-main flex flex-col h-screen fixed left-0 top-0 z-40 select-none transition-all duration-300 overflow-hidden group
          ${mobileMenuOpen ? 'translate-x-0 w-60' : '-translate-x-full w-60 md:translate-x-0 md:w-16 md:hover:w-60'}
        `}
      >
        {/* ── Logo & Nama Sekolah ── */}
        <div className="p-3.5 border-b border-main flex items-center gap-3 h-14 shrink-0">
          <img src={logoSmk} alt="Logo SMK" className="w-8 h-8 object-contain shrink-0" />
          <div className="overflow-hidden transition-opacity duration-300 md:opacity-0 md:group-hover:opacity-100">
            <h1 className="font-bold text-main text-sm leading-tight whitespace-nowrap">SIMLAB</h1>
            <p className="text-[11px] text-muted leading-tight whitespace-nowrap">{SCHOOL_NAME}</p>
          </div>
        </div>

        {/* ── Navigation ── */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-1">
          {filtered.map((item) => {
            const Icon   = item.icon;
            const active = currentTab === item.id;
            return (
              <button
                key={item.id}
                id={`nav-${item.id}`}
                onClick={() => setCurrentTab(item.id)}
                className={`w-full flex items-center justify-between px-2.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 relative ${
                  active
                    ? 'bg-blue-50 text-blue-700 font-semibold'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
                title={item.label} // For tooltip when collapsed
              >
                <div className="flex items-center gap-3 w-full">
                  <Icon size={18} className={`shrink-0 ${active ? 'text-blue-600' : 'text-gray-400'}`} />
                  <span className="whitespace-nowrap transition-opacity duration-300 md:opacity-0 md:group-hover:opacity-100">
                    {item.label}
                  </span>
                </div>
                {item.badge > 0 && (
                  <span className="bg-red-500 text-white text-[11px] px-1.5 py-0.5 rounded-full font-bold min-w-[20px] text-center animate-ping-slow shrink-0 absolute right-3 md:opacity-0 md:group-hover:opacity-100 transition-opacity duration-300">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
                {/* Badge for collapsed mode */}
                {item.badge > 0 && (
                  <span className="md:block hidden md:group-hover:hidden absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full animate-ping-slow" />
                )}
              </button>
            );
          })}
        </nav>

        {/* ── Divider ── */}
        <div className="px-3 shrink-0">
          <hr className="border-main transition-opacity duration-300 md:opacity-0 md:group-hover:opacity-100" />
        </div>

        {/* ── User Info ── */}
        <div className="p-3 flex items-center gap-3 shrink-0">
          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-sm shrink-0 uppercase">
            {user?.nama ? user.nama.charAt(0) : 'U'}
          </div>
          <div className="overflow-hidden flex-1 transition-opacity duration-300 md:opacity-0 md:group-hover:opacity-100">
            <p className="text-xs font-semibold text-main truncate">{user?.nama ?? 'User'}</p>
            <p className="text-[11px] text-muted capitalize">{user?.role ?? 'petugas'}</p>
          </div>
        </div>

        {/* ── Tombol Keluar Merah ── */}
        <div className="px-3 pb-4 shrink-0">
          <button
            id="btn-logout"
            onClick={onLogout}
            title="Keluar"
            className="w-full flex items-center justify-center gap-2 px-2.5 py-2.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-lg text-sm font-semibold transition-colors shadow-sm overflow-hidden"
          >
            <IconLogout size={18} className="shrink-0" />
            <span className="whitespace-nowrap transition-opacity duration-300 md:opacity-0 md:group-hover:opacity-100">
              Keluar
            </span>
          </button>
        </div>
      </aside>
    </>
  );
}
