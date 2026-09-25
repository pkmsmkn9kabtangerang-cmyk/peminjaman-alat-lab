// src/pages/RiwayatPage.jsx
// Riwayat Peminjaman: Filter Waktu, Pemegang, Kelas, Status Pisah berstandar SaaS

import { useState, useEffect, useMemo } from 'react';
import { dbService } from '../services/store';
import Badge from '../components/Badge';
import Button from '../components/Button';
import DataTable from '../components/DataTable';
import FilterDropdown from '../components/FilterDropdown';
import {
  IconClock,
  IconCalendarEvent,
  IconTrash,
  IconHistory,
  IconAlertTriangle,
  IconAlertOctagon,
  IconShieldExclamation,
  IconCheck,
  IconCopy,
  IconX,
  IconCircleCheck,
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
  const [copied, setCopied]         = useState(false);
  const [toastMessage, setToastMessage] = useState('');

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
    setData([]);
    setShowClearModal(false);
    setClearInput('');
    setToastMessage('Semua riwayat transaksi peminjaman berhasil dihapus secara permanen.');
    setTimeout(() => setToastMessage(''), 4500);
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
      render: (row) => <span className="text-xs text-main font-medium">{row.kelas}</span>,
    },
    {
      key: 'uid_kartu',
      label: 'UID Kartu',
      sortable: true,
      render: (row) => <span className="text-[10px] font-mono bg-gray-100 px-2 py-1 rounded text-gray-700">{row.uid_kartu}</span>,
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
    <div className="space-y-4 sm:space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-main flex items-center gap-2">
            <span>Riwayat Peminjaman</span>
          </h2>
          <p className="text-xs sm:text-sm text-muted mt-0.5">
            Seluruh riwayat catatan peminjaman dan pengembalian alat lab.
          </p>
        </div>
      </div>

      {/* Success Notification */}
      {toastMessage && (
        <div className="flex items-center justify-between p-3.5 bg-emerald-50 border border-emerald-200/90 rounded-xl text-emerald-800 text-xs sm:text-sm shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <IconCircleCheck size={18} className="text-emerald-600 shrink-0" />
            <span className="font-medium">{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage('')}
            className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 rounded-md transition"
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
        emptyMessage="Belum ada riwayat transaksi."
        actionButton={
          <Button
            variant="danger-soft"
            icon={IconTrash}
            onClick={() => setShowClearModal(true)}
            className="w-full md:w-auto justify-center whitespace-nowrap"
          >
            Hapus Semua Riwayat
          </Button>
        }
        filters={
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <FilterDropdown
              icon={IconClock}
              value={timeFilter}
              onChange={(v) => { setTimeFilter(v); if (v !== 'custom') setCustomDate(''); }}
              options={TIME_OPTIONS}
              className="w-full sm:w-auto"
            />
            {timeFilter === 'custom' && (
              <div className="relative w-full sm:w-auto">
                <IconCalendarEvent size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-full sm:w-auto pl-9 pr-3 h-10 rounded-lg border border-gray-300/90 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white font-medium text-gray-700"
                />
              </div>
            )}
          </div>
        }
      />

      {/* Modal Hapus Semua - SaaS Grade */}
      <Modal
        isOpen={showClearModal}
        onClose={() => {
          setShowClearModal(false);
          setClearInput('');
          setCopied(false);
        }}
        title="Hapus Semua Riwayat"
        subtitle="Konfirmasi pembersihan permanen seluruh riwayat transaksi"
        icon={IconAlertTriangle}
        iconVariant="danger"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          {/* Warning Banner */}
          <div className="flex items-start gap-3 p-3.5 bg-red-50/80 border border-red-200/90 rounded-xl">
            <div className="p-1.5 bg-red-100 text-red-600 rounded-lg shrink-0 mt-0.5">
              <IconAlertOctagon size={18} />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs sm:text-sm font-bold text-red-900">
                Peringatan: Tindakan Tidak Dapat Dibatalkan!
              </h4>
              <p className="text-[11px] sm:text-xs text-red-700 mt-0.5 leading-relaxed">
                Seluruh data riwayat transaksi peminjaman dan pengembalian alat lab akan dihapus permanen dari basis data sistem.
              </p>
            </div>
          </div>

          {/* Confirmation Input Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-gray-700">
                Ketik kalimat konfirmasi berikut:
              </label>
              <span className="text-[11px] text-gray-400 font-medium">Harus sama</span>
            </div>

            {/* Confirmation Key Codebox with Copy Button */}
            <div className="p-2.5 bg-gray-50 border border-gray-200/90 rounded-xl flex items-center justify-between gap-2">
              <code className="text-xs sm:text-sm font-mono font-bold text-red-600 select-all tracking-wide">
                {CONFIRM_TEXT}
              </code>
              <button
                type="button"
                onClick={() => {
                  setClearInput(CONFIRM_TEXT);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 hover:text-blue-700 bg-white hover:bg-blue-50 px-2.5 py-1 rounded-lg border border-gray-200/90 shadow-2xs transition active:scale-95 shrink-0"
                title="Salin dan isi otomatis"
              >
                {copied ? <IconCheck size={13} className="text-emerald-600" /> : <IconCopy size={13} />}
                <span>{copied ? 'Tersalin' : 'Salin Teks'}</span>
              </button>
            </div>

            {/* Input with icon and feedback */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <IconShieldExclamation size={16} />
              </div>
              <input
                type="text"
                value={clearInput}
                onChange={(e) => setClearInput(e.target.value)}
                placeholder={`Ketik "${CONFIRM_TEXT}"`}
                className={`w-full pl-9 pr-9 h-10 rounded-xl border text-xs sm:text-sm transition-all focus:outline-none font-medium ${
                  clearInput.toLowerCase() === CONFIRM_TEXT
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/20 text-emerald-900'
                    : clearInput.length > 0
                    ? 'border-red-400 ring-2 ring-red-500/10 bg-white text-gray-900'
                    : 'border-gray-300/90 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 bg-white text-gray-900'
                }`}
                autoComplete="off"
              />
              {clearInput.toLowerCase() === CONFIRM_TEXT && (
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-emerald-600 pointer-events-none">
                  <IconCheck size={16} />
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons: Responsive 320px mobile to laptop */}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-3 border-t border-gray-100">
            <Button
              variant="secondary"
              icon={IconX}
              onClick={() => {
                setShowClearModal(false);
                setClearInput('');
                setCopied(false);
              }}
              className="w-full sm:w-auto justify-center"
            >
              Batal
            </Button>
            <Button
              variant="danger"
              icon={IconTrash}
              disabled={clearInput.toLowerCase() !== CONFIRM_TEXT}
              onClick={handleClearAll}
              className="w-full sm:w-auto justify-center shadow-xs shadow-red-500/20"
            >
              Hapus Semua Riwayat
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

