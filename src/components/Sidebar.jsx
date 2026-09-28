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
  IconCreditCard,
  IconCpu,
} from '@tabler/icons-react';
import logoSmk from '../assets/logo-smk.svg';

const SCHOOL_NAME = import.meta.env.VITE_SCHOOL_NAME ?? 'SMK Negeri';

const MENU_SECTIONS = [
  {
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: IconLayoutDashboard, roles: ['admin', 'petugas'] },
    ],
  },
  {
    title: 'Peminjaman',
    items: [
      { id: 'peminjaman', label: 'Peminjaman', icon: IconHandStop, roles: ['admin', 'petugas'] },
      { id: 'pengembalian', label: 'Pengembalian', icon: IconCornerDownLeft, roles: ['admin', 'petugas'] },
      { id: 'riwayat', label: 'Riwayat', icon: IconHistory, roles: ['admin', 'petugas'] },
    ],
  },
  {
    title: 'Inventaris',
    items: [
      { id: 'list_alat', label: 'Daftar Alat', icon: IconListDetails, roles: ['admin', 'petugas'] },
      { id: 'inventaris', label: 'Inventaris', icon: IconBox, roles: ['admin'] },
    ],
  },
  {
    title: 'RFID',
    items: [
      { id: 'realtime_card', label: 'Aktivitas RFID', icon: IconCreditCard, roles: ['admin', 'petugas'] },
      { id: 'kartu_rfid', label: 'Kartu RFID', icon: IconIdBadge2, roles: ['admin'] },
      { id: 'simulasi_iot', label: 'Simulasi Kartu', icon: IconCpu, roles: ['admin', 'petugas'] },
    ],
  },
  {
    title: 'Pengguna',
    items: [
      { id: 'pengguna', label: 'Pengguna', icon: IconUsers, roles: ['admin'] },
    ],
  },
];

export default function Sidebar({ currentTab, setCurrentTab, user, onLogout, unreadCount = 0, mobileMenuOpen, setMobileMenuOpen }) {
  const role = user?.role ?? 'petugas';

  return (
    <>
      <div
        className={`fixed inset-0 bg-gray-900/40 z-30 md:hidden ${mobileMenuOpen ? '' : 'pointer-events-none hidden'}`}
        onClick={() => setMobileMenuOpen(false)}
      />

      <aside
        className={`bg-surface border-r border-main flex flex-col h-screen fixed left-0 top-0 z-40 select-none overflow-hidden w-[232px]
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        <div className="px-4 py-3.5 border-b border-main flex items-center gap-3 min-h-14 shrink-0">
          <img src={logoSmk} alt="Logo sekolah" className="w-8 h-8 object-contain shrink-0" />
          <div className="min-w-0">
            <h1 className="font-semibold text-main text-[15px] leading-tight">SIMLAB</h1>
            <p className="text-sm text-muted leading-tight truncate">{SCHOOL_NAME}</p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto overflow-x-hidden px-3 py-3 space-y-4">
          {MENU_SECTIONS.map((section, idx) => {
            const items = section.items.filter((item) => item.roles.includes(role));
            if (items.length === 0) return null;
            return (
              <div key={section.title || idx}>
                {section.title && (
                  <p className="px-2 mb-1.5 text-sm font-medium text-muted">{section.title}</p>
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
                        onClick={() => setCurrentTab(item.id)}
                        className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded text-[15px] min-h-11 text-left ${
                          active
                            ? 'bg-[#E8F1FB] text-[#1E5AAB] font-semibold border-l-[3px] border-[#1E5AAB]'
                            : 'text-gray-700 hover:bg-gray-100 border-l-[3px] border-transparent'
                        }`}
                      >
                        <Icon size={20} className={`shrink-0 ${active ? 'text-[#1E5AAB]' : 'text-gray-500'}`} />
                        <span className="flex-1 truncate">{item.label}</span>
                        {badge > 0 && (
                          <span className="inline-flex items-center justify-center min-w-6 h-6 px-1 rounded text-xs font-semibold bg-red-700 text-white">
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

        <div className="border-t border-main px-3 py-3 shrink-0">
          <div className="flex items-center gap-3 px-1 mb-3">
            <div className="w-9 h-9 rounded bg-[#E8F1FB] text-[#1E5AAB] font-semibold flex items-center justify-center text-[15px] shrink-0 uppercase">
              {user?.nama ? user.nama.charAt(0) : 'U'}
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-medium text-main truncate">{user?.nama ?? 'Pengguna'}</p>
              <p className="text-sm text-muted">
                {user?.role === 'admin' ? 'Admin' : 'Petugas lab'}
              </p>
            </div>
          </div>
          <button
            id="btn-logout"
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-2.5 py-2.5 min-h-11 rounded text-[15px] font-semibold text-red-700 border border-red-200 hover:bg-red-50"
          >
            <IconLogout size={20} className="shrink-0" />
            <span>Keluar</span>
          </button>
        </div>
      </aside>
    </>
  );
}
