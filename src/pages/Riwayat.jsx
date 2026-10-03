// src/pages/RiwayatPage.jsx
// Riwayat Peminjaman: Filter Waktu, Pemegang, Kelas, Status Pisah berstandar SaaS

import { useState, useEffect, useMemo, useCallback } from 'react';
import { dbService } from '../services/store';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import Badge from '../components/Badge';
import Button from '../components/Button';
import DataTable from '../components/DataTable';
import FilterDropdown from '../components/FilterDropdown';
import PageHeader from '../components/PageHeader';
import PageNote from '../components/PageNote';
import { friendlyError, showFeedback } from '../lib/feedback';
import {
  IconTrash,
  IconX,
  IconClock,
  IconCalendar,
  IconRefresh,
  IconMail
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
  { value: '1h', label: '1 Jam Terakhir' },
  { value: '5h', label: '5 Jam Terakhir' },
  { value: '24h', label: '24 Jam Terakhir' },
  { value: 'all', label: 'Semua Waktu' },
  { value: 'custom', label: 'Pilih Tanggal' },
];

async function fetchRiwayat() {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('transaksi')
      .select(`
        *,
        kartu_rfid ( nama_pemegang )
      `)
      .order('waktu_pinjam', { ascending: false });

    if (error) throw error;
    // Map to include pemegang field
    return (data || []).map(row => ({
      ...row,
      pemegang: row.kartu_rfid?.nama_pemegang || row.pemegang || '—'
    }));
  }

  // Local fallback
  const trx = dbService.getTransaksi();
  const kartu = dbService.getKartu();
  return trx.map(row => {
    const k = kartu.find(k => k.uid_kartu === row.uid_kartu);
    return { ...row, pemegang: k?.nama_pemegang || row.pemegang || '—' };
  });
}

export default function RiwayatPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('24h');
  const [customDate, setCustomDate] = useState('');
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearInput, setClearInput] = useState('');

  const [user, setUser] = useState(null);

  useEffect(() => {
    if (isSupabaseConfigured) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          supabase.from('profiles').select('role').eq('id', session.user.id).single()
            .then(({ data }) => setUser({ role: data?.role }));
        }
      });
    } else {
      setUser(dbService.getCurrentUser());
    }
  }, []);

  const isAdmin = user?.role === 'admin';

  const reloadData = useCallback(async (isRealtimeEvent = false) => {
    if (!isRealtimeEvent) setLoading(true);
    try {
      const res = await fetchRiwayat();
      setData(res);
    } catch (err) {
      console.error('[Riwayat] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadData();

    if (!isSupabaseConfigured) {
      const handleStorage = () => reloadData(true);
      window.addEventListener('simlab_storage_updated', handleStorage);
      const t = setInterval(() => reloadData(true), 3000);
      return () => {
        window.removeEventListener('simlab_storage_updated', handleStorage);
        clearInterval(t);
      };
    } else {
      const channel = supabase.channel('transaksi_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transaksi' }, () => reloadData(true))
        .subscribe();
      return () => supabase.removeChannel(channel);
    }
  }, [reloadData]);

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
    // jika 'all', jangan filter waktu

    return filtered;
  }, [data, timeFilter, customDate]);

  const handleClearAll = async () => {
    if (clearInput.toLowerCase() !== CONFIRM_TEXT) return;

    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase.from('transaksi').delete().neq('id', 0);
        if (error) throw error;
        showFeedback({ type: 'success', title: 'Semua riwayat transaksi berhasil dihapus permanen.' });
        reloadData();
      } catch (err) {
        showFeedback({ type: 'error', title: 'Gagal menghapus riwayat.', message: friendlyError(err) });
      }
    } else {
      dbService.saveTransaksi([]);
      reloadData();
      showFeedback({ type: 'success', title: 'Semua riwayat transaksi peminjaman berhasil dihapus.' });
    }

    setShowClearModal(false);
    setClearInput('');
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

      <PageNote title="Informasi Penting" icon={IconMail}>
        Halaman ini mencatat semua transaksi peminjaman dan pengembalian. Gunakan filter waktu atau tanggal untuk mencari riwayat spesifik dengan lebih mudah.
      </PageNote>

      <DataTable
        columns={columns}
        data={filteredData}
        loading={loading}
        searchPlaceholder="Cari riwayat..."
        searchKeys={['kelas', 'nama_alat', 'uid_kartu', 'pemegang', 'sumber']}
        emptyMessage="Belum ada riwayat Peminjaman Alat"
        actionButton={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => reloadData(false)}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
              title="Refresh data"
            >
              <IconRefresh size={18} />
            </button>
            {isAdmin && (
              <Button
                variant="danger-soft"
                icon={IconTrash}
                onClick={() => {
                  if (data.length === 0) {
                    showFeedback({ type: 'warning', title: 'Data kosong', message: 'Tidak ada data riwayat peminjaman untuk dihapus.' });
                    return;
                  }
                  setShowClearModal(true);
                }}
                className="w-full md:w-auto justify-center whitespace-nowrap"
              >
                Hapus Semua Riwayat
              </Button>
            )}
          </div>
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
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
            <h4 className="text-sm font-bold text-red-900 mb-1">Peringatan Penting</h4>
            <p className="text-xs text-red-700 leading-relaxed">
              Semua data riwayat peminjaman dan pengembalian ({data.length} data) akan dihapus selamanya dan tidak bisa dikembalikan.
            </p>
          </div>

          <div className="space-y-2 mt-4">
            <label className="text-sm font-semibold text-gray-700 block">
              Untuk melanjutkan, ketik tulisan ini: <span className="font-bold text-red-600 bg-gray-100 px-2 py-1 rounded select-all">{CONFIRM_TEXT}</span>
            </label>

            <input
              type="text"
              value={clearInput}
              onChange={(e) => setClearInput(e.target.value)}
              placeholder={`Ketik: ${CONFIRM_TEXT}`}
              className="w-full px-4 h-12 rounded-xl border border-gray-300 text-base focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 bg-white text-gray-900"
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-5 border-t border-gray-100 mt-5">
            <Button variant="secondary" onClick={() => { setShowClearModal(false); setClearInput(''); }} className="w-full sm:w-auto justify-center h-11">
              Batal
            </Button>
            <Button variant="danger" disabled={clearInput.toLowerCase() !== CONFIRM_TEXT} onClick={handleClearAll} className="w-full sm:w-auto justify-center h-11">
              Hapus Semua Riwayat
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
