// src/pages/RiwayatPage.jsx
// Riwayat Peminjaman: Filter Waktu, Pemegang, Kelas, Status Pisah berstandar SaaS

import { useState, useEffect, useMemo } from 'react';
import { dbService } from '../services/store';
import Badge from '../components/Badge';
import Button from '../components/Button';
import DataTable from '../components/DataTable';
import FilterDropdown from '../components/FilterDropdown';
import PageHeader from '../components/PageHeader';
import {
  IconTrash,
  IconX,
  IconCircleCheck,
  IconClock,
  IconCalendar,
  IconAlertCircle,
} from '@tabler/icons-react';
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
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearInput, setClearInput] = useState('');
  const [toast, setToast]           = useState(null);
  
  const user = dbService.getCurrentUser();
  const isAdmin = user?.role === 'admin';

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
    if (data.length === 0) {
      setShowClearModal(false);
      setClearInput('');
      setToast({
        type: 'warning',
        message: 'Tidak ada data riwayat untuk dihapus (data riwayat sudah kosong).',
      });
      setTimeout(() => setToast(null), 4500);
      return;
    }
    dbService.saveTransaksi([]);
    setData([]);
    setShowClearModal(false);
    setClearInput('');
    setToast({
      type: 'success',
      message: 'Semua riwayat transaksi peminjaman berhasil dihapus secara permanen.',
    });
    setTimeout(() => setToast(null), 4500);
  };

  const columns = [
    {
      key: 'waktu_pinjam',
      label: 'Waktu Pinjam',
      sortable: true,
      render: (row) => <span className="font-medium text-[13px] lg:text-main">{FMT(row.waktu_pinjam)}</span>,
    },
    {
      key: 'waktu_kembali',
      label: 'Waktu Kembali',
      sortable: true,
      render: (row) => <span className="font-medium text-[13px] lg:text-main">{FMT(row.waktu_kembali)}</span>,
    },
    {
      key: 'pemegang',
      label: 'Pemegang',
      sortable: true,
      render: (row) => <span className="font-medium text-[13px] lg:text-main">{row.pemegang}</span>,
    },
    {
      key: 'kelas',
      label: 'Kelas',
      sortable: true,
      render: (row) => <span className="text-[13px] lg:text-main font-medium">{row.kelas}</span>,
    },
    {
      key: 'uid_kartu',
      label: 'UID Kartu',
      sortable: true,
      render: (row) => <span className="text-[13px] lg:text-main text-gray-700">{row.uid_kartu}</span>,
    },
    {
      key: 'nama_alat',
      label: 'Alat',
      sortable: true,
      render: (row) => <span className="font-medium text-[13px] lg:text-main">{row.nama_alat}</span>,
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
          key: 'jenis_terdeteksi',
          label: 'Jenis Deteksi',
          sortable: true,
          render: (row) => {
            const isManual = row.jenis_terdeteksi === 'manual' || row.sumber === 'manual';
            return <Badge status={isManual ? 'manual' : 'realtime'} />;
          },
        },
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Riwayat Peminjaman"
        description="Seluruh riwayat catatan peminjaman dan pengembalian alat lab."
      />

      {/* Notification Toast */}
      {toast && (
        <div
          className={`flex items-center justify-between p-3.5 rounded-xl border text-xs sm:text-sm shadow-xs animate-fadeIn ${
            toast.type === 'warning'
              ? 'bg-amber-50 border-amber-300 text-amber-900'
              : 'bg-emerald-50 border-emerald-200/90 text-emerald-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {toast.type === 'warning' ? (
              <IconAlertCircle size={18} className="text-amber-600 shrink-0" />
            ) : (
              <IconCircleCheck size={18} className="text-emerald-600 shrink-0" />
            )}
            <span className="font-medium">{toast.message}</span>
          </div>
          <button
            onClick={() => setToast(null)}
            className={`p-1 rounded-md transition ${
              toast.type === 'warning'
                ? 'text-amber-600 hover:text-amber-800 hover:bg-amber-100'
                : 'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100'
            }`}
            aria-label="Tutup notifikasi"
          >
            <IconX size={14} />
          </button>
        </div>
      )}

      {/* Main DataTable */}
      <DataTable
        columns={columns}
        data={filteredData}
        searchPlaceholder="Cari riwayat..."
        searchKeys={['kelas', 'nama_alat', 'uid_kartu', 'pemegang', 'sumber']}
        emptyMessage="Belum ada riwayat Peminjaman Alat"
        actionButton={
          isAdmin && (
            <Button
              variant="danger-soft"
              icon={IconTrash}
              onClick={() => {
                if (data.length === 0) {
                  setToast({
                    type: 'warning',
                    message: 'Tidak ada data riwayat peminjaman untuk dihapus (data sudah kosong).',
                  });
                  setTimeout(() => setToast(null), 4500);
                  return;
                }
                setShowClearModal(true);
              }}
              className="w-full md:w-auto justify-center whitespace-nowrap"
            >
              Hapus Semua Riwayat
            </Button>
          )
        }
        filters={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <FilterDropdown
              icon={IconClock}
              value={timeFilter}
              onChange={(val) => {
                setTimeFilter(val);
                if (val !== 'custom') setCustomDate('');
              }}
              options={TIME_OPTIONS}
              className="w-full sm:w-auto"
            />
            
            {timeFilter === 'custom' && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                <span className="text-sm font-medium text-gray-600 sm:ml-2">Pilih Tanggal:</span>
                <div className="relative w-full sm:w-auto">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <IconCalendar size={16} />
                  </div>
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    className="w-full sm:w-auto pl-9 pr-3 h-10 rounded-lg border border-gray-300 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-medium text-gray-700"
                  />
                </div>
              </div>
            )}
          </div>
        }
      />

      {/* Modal Hapus Semua - Gaptek Friendly */}
      <Modal
        isOpen={showClearModal}
        onClose={() => {
          setShowClearModal(false);
          setClearInput('');
        }}
        title="Hapus Semua Riwayat"
        subtitle="Yakin ingin menghapus semua data?"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          {data.length === 0 ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs sm:text-sm">
              Saat ini data riwayat peminjaman kosong. Tidak ada data yang dapat dihapus.
            </div>
          ) : (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
              <h4 className="text-sm font-bold text-red-900 mb-1">
                Peringatan Penting
              </h4>
              <p className="text-xs text-red-700 leading-relaxed">
                Semua data riwayat peminjaman dan pengembalian ({data.length} data) akan dihapus selamanya dan tidak bisa dikembalikan.
              </p>
            </div>
          )}

          <div className="space-y-2 mt-4">
            <label className="text-sm font-semibold text-gray-700 block">
              Untuk melanjutkan, ketik tulisan ini: <span className="font-bold text-red-600 bg-gray-100 px-2 py-1 rounded select-all">{CONFIRM_TEXT}</span>
            </label>
            
            <input
              type="text"
              value={clearInput}
              onChange={(e) => setClearInput(e.target.value)}
              placeholder={`Ketik: ${CONFIRM_TEXT}`}
              disabled={data.length === 0}
              className="w-full px-4 h-12 rounded-xl border border-gray-300 text-base focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 bg-white text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-5 border-t border-gray-100 mt-5">
            <Button
              variant="secondary"
              onClick={() => {
                setShowClearModal(false);
                setClearInput('');
              }}
              className="w-full sm:w-auto justify-center h-11"
            >
              Batal
            </Button>
            <Button
              variant="danger"
              disabled={data.length === 0 || clearInput.toLowerCase() !== CONFIRM_TEXT}
              onClick={handleClearAll}
              className="w-full sm:w-auto justify-center h-11"
            >
              Hapus Semua Riwayat
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

