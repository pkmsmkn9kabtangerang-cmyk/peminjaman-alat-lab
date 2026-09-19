import {
  IconLayoutDashboard,
  IconBox,
  IconListDetails,
  IconIdBadge2,
  IconClipboardCheck,
  IconHandStop,
  IconCornerDownLeft,
  IconHistory,
  IconUserPlus,
  IconLogout,
  IconCpu
} from '@tabler/icons-react';

export default function Sidebar({ currentTab, setCurrentTab, user, onLogout, pendingCount = 0 }) {
  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: IconLayoutDashboard, roles: ['admin', 'petugas'] },
    { id: 'inventaris', label: 'Inventaris Barang', icon: IconBox, roles: ['admin', 'petugas'] },
    { id: 'kartu_rfid', label: 'Tambah Kartu RFID', icon: IconIdBadge2, roles: ['admin'] },
    { id: 'tambah_petugas', label: 'Tambah Petugas', icon: IconUserPlus, roles: ['admin'] },
    { id: 'persetujuan', label: 'Persetujuan', icon: IconClipboardCheck, roles: ['admin', 'petugas'], badge: pendingCount },
    { id: 'peminjaman', label: 'Peminjaman Manual', icon: IconHandStop, roles: ['admin', 'petugas'] },
    { id: 'pengembalian', label: 'Pengembalian Manual', icon: IconCornerDownLeft, roles: ['admin', 'petugas'] },
    { id: 'riwayat', label: 'Riwayat Peminjaman', icon: IconHistory, roles: ['admin', 'petugas'] },
    { id: 'simulasi_iot', label: 'Simulasi IoT RFID', icon: IconCpu, roles: ['admin', 'petugas'] },
    // { id: 'list_barang', label: 'List Barang', icon: IconListDetails, roles: ['petugas'] },
  ];

  const filteredMenu = menuItems.filter(item => item.roles.includes(user?.role || 'petugas'));

  return (
    <aside className="w-60 bg-surface border-r border-main flex flex-col h-screen fixed left-0 top-0 z-30 select-none">
      {/* Logo Header */}
      <div className="p-5 border-b border-main flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center font-bold text-lg shadow-sm">
          SB
        </div>
        <div>
          <h1 className="font-semibold text-main text-sm leading-tight">SIMLAB SMK</h1>
          <p className="text-xs text-muted">Peminjaman Alat RFID</p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {filteredMenu.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-600 font-semibold'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon size={18} className={isActive ? 'text-blue-600' : 'text-gray-500'} />
                <span>{item.label}</span>
              </div>
              {item.badge > 0 && (
                <span className="bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* User Footer Profile */}
      <div className="p-4 border-t border-main flex items-center justify-between bg-gray-50">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs uppercase flex-shrink-0">
            {user?.nama ? user.nama.charAt(0) : 'U'}
          </div>
          <div className="overflow-hidden">
            <p className="text-xs font-semibold text-main truncate">{user?.nama || 'User'}</p>
            <p className="text-[11px] text-muted capitalize">{user?.role || 'Petugas'}</p>
          </div>
        </div>
        <button
          onClick={onLogout}
          title="Keluar"
          className="text-gray-400 hover:text-red-600 p-1.5 rounded-md hover:bg-red-50 transition"
        >
          <IconLogout size={18} />
        </button>
      </div>
    </aside>
  );
}
