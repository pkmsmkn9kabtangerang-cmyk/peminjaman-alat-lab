// src/pages/RiwayatPage.jsx
// Riwayat Peminjaman: Filter Waktu, Pemegang, Kelas, Status Pisah

import { useState, useEffect, useMemo } from 'react';
import { dbService } from '../services/store';
import Badge from '../components/Badge';
import Button from '../components/Button';
import DataTable from '../components/DataTable';
import FilterDropdown from '../components/FilterDropdown';
import { IconClock, IconCalendarEvent,IconTrash } from '@tabler/icons-react';
import Modal from '../components/Modal';

const FMT = (iso) => {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
};

const CONFIRM_TEXT = 'hapus semua riwayat';

const TIME_OPTIONS = [
  { value: '1h',     label: '1 Jam Terakhir' },
  { value: '5h',     label: '5 Jam Terakhir' },
  { value: '24h',    label: '24 Jam Terakhir' },
  { value: 'custom', label: 'Pilih Tanggal' },
];

export default function RiwayatPage() {
  const [data, setData]             = useState(() => dbService.getTransaksi());
  const [kartuList, setKartuList]   = useState(() => dbService.getKartu());
  const [timeFilter, setTimeFilter] = useState('24h');
  const [customDate, setCustomDate] = useState('');
  const [showClearModal, setShowClearModal]= useState(false);
  const [clearInput, setClearInput]= useState('');

  const reload = () => {
    setData(dbService.getTransaksi());
    setKartuList(dbService.getKartu());
  };

  useEffect(() => {
    window.addEventListener('simlab_storage_updated', reload);
    const t = setInterval(reload, 3000);
    return () => { window.removeEventListener('simlab_storage_updated', reload); clearInterval(t); };
  }, []);

  const filteredData = useMemo(() => {
    let filtered = data;
    const now = new Date().getTime();

    if (timeFilter === '1h') {
      filtered = data.filter(d => (now - new Date(d.waktu_pinjam).getTime()) <= 3600000);
    } else if (timeFilter === '5h') {
      filtered = data.filter(d => (now - new Date(d.waktu_pinjam).getTime()) <= 18000000);
    } else if (timeFilter === '24h') {
      filtered = data.filter(d => (now - new Date(d.waktu_pinjam).getTime()) <= 86400000);
    } else if (timeFilter === 'custom' && customDate) {
      filtered = data.filter(d => d.waktu_pinjam?.startsWith(customDate));
    }

    return filtered.map(row => {
      const k = kartuList.find(k => k.uid_kartu === row.uid_kartu);
      return { ...row, pemegang: k?.nama_pemegang || row.pemegang || '—' };
    });
  }, [data, timeFilter, customDate, kartuList]);

  const handleClearAll = () => {
    if (clearInput.toLowerCase() !== CONFIRM_TEXT) return;
    dbService.saveTransaksi([]);
    setShowClearModal(false);
    setClearInput('');
    setAlatList(dbService.getAlatWithStok().filter((a) => a.stok_tersedia > 0));
    setSuccess('Semua riwayat peminjaman berhasil dihapus.');
    setTimeout(() => setSuccess(''), 4000);
  };

  const columns = [
    {
      key: 'waktu_pinjam',
      label: 'Waktu Pinjam',
      sortable: true,
      render: (row) => <span className="text-xs text-muted whitespace-nowrap">{FMT(row.waktu_pinjam)}</span>,
    },
    {
      key: 'waktu_kembali',
      label: 'Waktu Kembali',
      sortable: true,
      render: (row) => <span className="text-xs text-muted whitespace-nowrap">{FMT(row.waktu_kembali)}</span>,
    },
    {
      key: 'pemegang',
      label: 'Pemegang',
      sortable: true,
      render: (row) => <span className="text-xs font-semibold text-main">{row.pemegang}</span>,
    },
    {
      key: 'kelas',
      label: 'Kelas',
      sortable: true,
      render: (row) => <span className="text-xs text-main">{row.kelas}</span>,
    },
    {
      key: 'uid_kartu',
      label: 'UID Kartu',
      sortable: true,
      render: (row) => <span className="text-[10px] font-mono bg-gray-100 px-2 py-1 rounded">{row.uid_kartu}</span>,
    },
    {
      key: 'nama_alat',
      label: 'Alat',
      sortable: true,
      render: (row) => <span className="text-xs font-medium text-main">{row.nama_alat}</span>,
    },
    {
      key: 'status_pinjam',
      label: 'Status Pinjam',
      render: () => <Badge status="dipinjam" />,
    },
    {
      key: 'status_kembali',
      label: 'Status Kembali',
      render: (row) => row.status === 'dikembalikan' ? <Badge status="dikembalikan" /> : <span className="text-muted">—</span>,
    },
    {
      key: 'sumber',
      label: 'Terkirim',
      render: (row) => <Badge status={row.sumber ?? 'otomatis'} />,
    },
    {
      key: 'petugas',
      label: 'Petugas',
      render: (row) => <span className="text-xs text-muted">{row.petugas ?? '—'}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-main">Riwayat Peminjaman</h2>
          <p className="text-xs text-muted">Seluruh Riwayat Catatan Peminjaman/pengembalian Alat lab.</p>
        </div>
        <button
          onClick={() => setShowClearModal(true)}
          className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-lg border border-red-200 transition-colors font-medium"
        >
          <IconTrash size={14} />
          Hapus Semua Riwayat
        </button>
      </div>

      <DataTable
        columns={columns}
        data={filteredData}
        searchPlaceholder="Cari kelas, nama alat, pemegang..."
        searchKeys={['kelas', 'nama_alat', 'uid_kartu', 'pemegang', 'sumber']}
        emptyMessage="Belum ada riwayat transaksi."
        filters={
          <div className="flex items-center gap-2 flex-wrap">
            <FilterDropdown
              icon={IconClock}
              value={timeFilter}
              onChange={(v) => { setTimeFilter(v); if (v !== 'custom') setCustomDate(''); }}
              options={TIME_OPTIONS}
            />
            {timeFilter === 'custom' && (
              <div className="relative">
                <IconCalendarEvent size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="pl-9 pr-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                />
              </div>
            )}
          </div>
        }
      />

      {/* Modal Hapus Semua */}
      <Modal isOpen={showClearModal} onClose={() => { setShowClearModal(false); setClearInput(''); }} title="Hapus Semua Riwayat Peminjaman">
        <div className="space-y-4">
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm font-semibold text-red-700 mb-1">⚠ Tindakan ini tidak dapat dibatalkan!</p>
            <p className="text-xs text-red-600">Seluruh riwayat transaksi peminjaman akan dihapus secara permanen.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">
              Ketik <code className="bg-gray-100 px-1.5 py-0.5 rounded text-red-600 font-mono">{CONFIRM_TEXT}</code> untuk mengkonfirmasi:
            </label>
            <input
              type="text"
              value={clearInput}
              onChange={(e) => setClearInput(e.target.value)}
              placeholder={CONFIRM_TEXT}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
              autoComplete="off"
            />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={() => { setShowClearModal(false); setClearInput(''); }}>Batal</Button>
            <button
              onClick={handleClearAll}
              disabled={clearInput.toLowerCase() !== CONFIRM_TEXT}
              className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Hapus Semua
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
