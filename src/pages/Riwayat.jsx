// src/pages/RiwayatPage.jsx
// Riwayat Peminjaman: Filter Waktu, Pemegang, Kelas, Status Pisah berstandar SaaS

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { dbService } from '../services/store';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { callFunction } from '../lib/api';
import Badge from '../components/Badge';
import Button from '../components/Button';
import DataTable from '../components/DataTable';
import FilterDropdown from '../components/FilterDropdown';
import PageHeader from '../components/PageHeader';
import PageNote from '../components/PageNote';
import { friendlyError, showFeedback } from '../lib/feedback';
import {
  IconTrash,
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

import { isOnline, isNetworkError, registerOnlineSync } from '../lib/networkStatus';

const TIME_OPTIONS = [
  { value: '24h', label: '24 Jam Terakhir' },
  { value: 'all', label: 'Semua Waktu' },
  { value: 'custom', label: 'Pilih Tanggal' },
];

async function fetchRiwayat() {
  if (isSupabaseConfigured) {
    if (!isOnline()) return null;
    try {
      const { data, error } = await supabase
        .from('transaksi')
        .select(`
          *,
          kartu_rfid ( nama_pemegang )
        `)
        .order('waktu_pinjam', { ascending: false });

      if (error) throw error;
      return (data || []).map(row => ({
        ...row,
        pemegang: row.kartu_rfid?.nama_pemegang || row.pemegang || '—'
      }));
    } catch (err) {
      if (isNetworkError(err)) return null;
      console.warn('[Riwayat] fetchRiwayat error:', err?.message || err);
      return null;
    }
  }

  // Local fallback
  const trx = dbService.getTransaksi();
  const kartu = dbService.getKartu();
  return trx.map(row => {
    const k = kartu.find(k => k.uid_kartu === row.uid_kartu);
    return { ...row, pemegang: k?.nama_pemegang || row.pemegang || '—' };
  });
}

async function fetchRiwayatSekaliPakai() {
  if (isSupabaseConfigured) {
    if (!isOnline()) return null;
    try {
      const { data, error } = await supabase
        .from('permintaan_habis_pakai')
        .select('*, kartu_rfid(nama_pemegang)')
        .order('created_at', { ascending: false });

      if (error) {
        // HANYA jalankan fallback waktu_tap jika kolom created_at belum ada di schema database
        if (error.code === '42703') {
          const { data: fallback } = await supabase
            .from('permintaan_habis_pakai')
            .select('*, kartu_rfid(nama_pemegang)')
            .order('waktu_tap', { ascending: false });
          return (fallback || []).map(r => ({
            ...r,
            pemegang: r.kartu_rfid?.nama_pemegang || '—',
          }));
        }
        if (isNetworkError(error)) return null;
        console.warn('[Riwayat] fetchRiwayatSekaliPakai error:', error.message);
        return null;
      }
      return (data || []).map(r => ({
        ...r,
        pemegang: r.kartu_rfid?.nama_pemegang || '—',
      }));
    } catch (err) {
      if (isNetworkError(err)) return null;
      console.warn('[Riwayat] fetchRiwayatSekaliPakai error:', err?.message || err);
      return null;
    }
  }

  const req = dbService.getPermintaan();
  const kartu = dbService.getKartu();
  return req
    .sort((a, b) => new Date(b.created_at || b.waktu_proses || b.waktu_tap || 0) - new Date(a.created_at || a.waktu_proses || a.waktu_tap || 0))
    .map(r => {
      const k = kartu.find(x => x.uid_kartu === r.uid_kartu);
      return { ...r, pemegang: k?.nama_pemegang || '—' };
    });
}

export default function RiwayatPage() {
  const [data, setData] = useState([]);
  const [sekaliPakaiData, setSekaliPakaiData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState('24h');
  const [customDate, setCustomDate] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'pinjam_kembali' | 'sekali_pakai'
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearTarget, setClearTarget] = useState('pinjam'); // 'pinjam' | 'sekali_pakai'
  const [clearInput, setClearInput] = useState('');
  const isReloadingRef = useRef(false);

  const [user, setUser] = useState(null);

  useEffect(() => {
    if (isSupabaseConfigured) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          supabase.from('profiles').select('role').eq('id', session.user.id).single()
            .then(({ data }) => setUser({ role: data?.role }))
            .catch(() => { });
        }
      });
    } else {
      setUser(dbService.getCurrentUser());
    }
  }, []);

  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';

  const reloadData = useCallback(async (isRealtimeEvent = false) => {
    if (!isOnline()) {
      setLoading(false);
      return;
    }
    if (isReloadingRef.current) return;
    isReloadingRef.current = true;

    if (!isRealtimeEvent) setLoading(true);
    try {
      const [resTrx, resSekali] = await Promise.all([
        fetchRiwayat(),
        fetchRiwayatSekaliPakai(),
      ]);
      if (resTrx !== null) setData(resTrx);
      if (resSekali !== null) setSekaliPakaiData(resSekali);
    } catch (err) {
      if (!isNetworkError(err)) {
        console.error('[Riwayat] fetch error:', err);
      }
    } finally {
      setLoading(false);
      isReloadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    reloadData();

    if (!isSupabaseConfigured) {
      const handleStorage = () => reloadData(true);
      window.addEventListener('simlab_storage_updated', handleStorage);
      return () => {
        window.removeEventListener('simlab_storage_updated', handleStorage);
      };
    } else {
      const ch1 = supabase.channel('transaksi_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transaksi' }, () => reloadData(true))
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[Realtime transaksi] status:', status);
          }
        });

      const ch2 = supabase.channel('permintaan_changes_riwayat')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'permintaan_habis_pakai' }, () => reloadData(true))
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[Realtime permintaan_riwayat] status:', status);
          }
        });

      // Sinkronisasi otomatis SEKALI saat koneksi internet pulih kembali
      const unregisterSync = registerOnlineSync(() => {
        reloadData(true);
      });

      // Background safety catch-up: hanya berjalan jika online dan tab aktif (setiap 30 detik)
      const safetyTimer = setInterval(() => {
        if (isOnline() && typeof document !== 'undefined' && !document.hidden) {
          reloadData(true);
        }
      }, 30000);

      return () => {
        supabase.removeChannel(ch1);
        supabase.removeChannel(ch2);
        unregisterSync();
        clearInterval(safetyTimer);
      };
    }
  }, [reloadData]);

  const filteredData = useMemo(() => {
    let filtered = data;
    const now = new Date().getTime();

    if (timeFilter === '24h') {
      filtered = data.filter(d => (now - new Date(d.waktu_pinjam).getTime()) <= 86400000);
    } else if (timeFilter === 'custom' && customDate) {
      filtered = data.filter(d => d.waktu_pinjam?.startsWith(customDate));
    }
    // jika 'all', jangan filter waktu

    return filtered;
  }, [data, timeFilter, customDate]);

  const handleClearAll = async () => {
    if (clearInput.toLowerCase() !== CONFIRM_TEXT) return;

    if (clearTarget === 'pinjam') {
      if (isSupabaseConfigured) {
        try {
          let cleared = false;
          try {
            const res = await callFunction('manage-transaksi', null, {
              method: 'DELETE',
              params: { clear: 'pinjam' },
            });
            if (res?.success) cleared = true;
          } catch (edgeErr) {
            console.warn('[Riwayat] Edge function clear failed, trying direct delete:', edgeErr);
          }

          if (!cleared) {
            // Direct delete: id di tabel transaksi adalah teks, gunakan neq('id', '')
            const { error: trxErr } = await supabase.from('transaksi').delete().neq('id', '');
            if (trxErr) throw trxErr;
          }

          showFeedback({ type: 'success', title: 'Semua riwayat peminjaman & pengembalian berhasil dihapus.' });
          setData([]);
          reloadData();
        } catch (err) {
          console.error('[Riwayat] clear error:', err);
          showFeedback({ type: 'error', title: 'Gagal menghapus riwayat peminjaman.', message: friendlyError(err) });
        }
      } else {
        dbService.saveTransaksi([]);
        setData([]);
        reloadData();
        showFeedback({ type: 'success', title: 'Semua riwayat transaksi peminjaman berhasil dihapus.' });
      }
    } else {
      // clearTarget === 'sekali_pakai'
      if (isSupabaseConfigured) {
        try {
          let cleared = false;
          try {
            const res = await callFunction('manage-transaksi', null, {
              method: 'DELETE',
              params: { clear: 'sekalipakai' },
            });
            if (res?.success) cleared = true;
          } catch (edgeErr) {
            console.warn('[Riwayat] Edge function clear sekali pakai failed, trying direct delete:', edgeErr);
          }

          if (!cleared) {
            const { error: sekErr } = await supabase.from('permintaan_habis_pakai').delete().neq('status', 'menunggu');
            if (sekErr) throw sekErr;
          }

          showFeedback({ type: 'success', title: 'Semua riwayat transaksi alat sekali pakai berhasil dihapus.' });
          setSekaliPakaiData([]);
          reloadData();
        } catch (err) {
          console.error('[Riwayat] clear sekali pakai error:', err);
          showFeedback({ type: 'error', title: 'Gagal menghapus riwayat sekali pakai.', message: friendlyError(err) });
        }
      } else {
        const remaining = dbService.getPermintaan().filter((p) => p.status === 'menunggu');
        dbService.savePermintaan(remaining);
        setSekaliPakaiData([]);
        reloadData();
        showFeedback({ type: 'success', title: 'Semua riwayat alat sekali pakai berhasil dihapus.' });
      }
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
      render: (row) => <span className="font-semibold text-main">{row.pemegang || '—'}</span>,
    },
    {
      key: 'kelas',
      label: 'Kelas',
      sortable: true,
      render: (row) => (
        <div>
          <span className="text-[13px] lg:text-main font-medium block">{row.kelas}</span>
          <span className="text-[11px] text-gray-500">{row.uid_kartu}</span>
        </div>
      ),
    },
    {
      key: 'nama_alat',
      label: 'Alat',
      sortable: true,
      render: (row) => <span className="font-semibold text-main">{row.nama_alat}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => <Badge status={row.status} />,
    },
    {
      key: 'sumber',
      label: 'Sumber',
      sortable: true,
      render: (row) => {
        const isManual = row.sumber === 'manual' || row.jenis_terdeteksi === 'manual';
        return <Badge status={isManual ? 'manual' : 'realtime'} label={isManual ? 'Manual' : 'RFID'} />;
      },
    },
    {
      key: 'petugas',
      label: 'Petugas',
      sortable: true,
      render: (row) => <span className="text-[13px] text-gray-700">{row.petugas || '—'}</span>,
    },
    {
      key: 'kondisi',
      label: 'Kondisi',
      render: (row) => {
        const k = row.status === 'dikembalikan' ? (row.kondisi_kembali || 'baik') : (row.kondisi_pinjam || 'baik');
        return <span className="text-main text-gray-600 capitalize">{k}</span>;
      },
    },
  ];

  const columnsSekaliPakai = [
    {
      key: 'waktu',
      label: 'Waktu',
      sortable: true,
      render: (row) => (
        <span className="font-medium text-[13px] lg:text-main">
          {FMT(row.waktu_proses || row.waktu_tap || row.created_at)}
        </span>
      ),
    },
    {
      key: 'kelas',
      label: 'Kelas',
      sortable: true,
      render: (row) => (
        <div>
          <span className="text-[13px] lg:text-main font-bold block">{row.kelas || '—'}</span>
          <span className="text-[11px] text-gray-500">{row.pemegang || row.uid_kartu}</span>
        </div>
      ),
    },
    {
      key: 'nama_alat',
      label: 'Alat Sekali Pakai',
      sortable: true,
      render: (row) => <span className="font-semibold text-[13px] lg:text-main">{row.nama_alat}</span>,
    },
    {
      key: 'jumlah',
      label: 'Jumlah Diberikan',
      sortable: true,
      render: (row) => (
        <span className="font-bold text-main">
          {row.jumlah ?? 1} <span className="text-xs font-semibold text-emerald-700">{row.satuan || 'unit'}</span>
        </span>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => (
        <Badge
          status={row.status || 'disetujui'}
          label={
            row.status === 'disetujui' ? 'Diberikan' :
              row.status === 'menunggu' ? 'Menunggu' :
                row.status === 'ditolak' ? 'Ditolak' : 'Dibatalkan'
          }
        />
      ),
    },
    {
      key: 'petugas',
      label: 'Petugas',
      sortable: true,
      render: (row) => <span className="text-[13px] text-gray-700">{row.petugas || '—'}</span>,
    },
    {
      key: 'catatan',
      label: 'Catatan',
      render: (row) => (
        <span className="text-[12px] text-gray-600 max-w-[200px] truncate block" title={row.catatan || row.alasan_tolak || ''}>
          {row.catatan || row.alasan_tolak || '—'}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Riwayat Transaksi"
        description="Seluruh catatan transaksi peminjaman & pengembalian serta pemberian barang sekali pakai."
      />

      <PageNote title="Informasi Transaksi" icon={IconMail}>
        Halaman ini menampilkan riwayat transaksi kartu dan alat sekali pakai untuk bisa memfilter berdasarkan tanggal yang ingin di cek
      </PageNote>

      {/* ── Tab Switcher Pilihan Tampilan ── */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2 overflow-x-auto no-scrollbar scrollbar-none flex-nowrap">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`min-h-11 px-3 rounded-lg text-xs sm:text-sm font-semibold transition shrink-0 whitespace-nowrap ${activeTab === 'all'
            ? 'bg-blue-600 text-white shadow-xs'
            : 'text-gray-600 hover:bg-gray-100'
            }`}
        >
          Semua Tabel
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('pinjam_kembali')}
          className={`min-h-11 px-3 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 shrink-0 whitespace-nowrap ${activeTab === 'pinjam_kembali'
            ? 'bg-blue-600 text-white shadow-xs'
            : 'text-gray-600 hover:bg-gray-100'
            }`}
        >
          Riwayat Peminjaman & Pengembalian ({filteredData.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('sekali_pakai')}
          className={`min-h-11 px-3 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 shrink-0 whitespace-nowrap ${activeTab === 'sekali_pakai'
            ? 'bg-blue-600 text-white shadow-xs'
            : 'text-gray-600 hover:bg-gray-100'
            }`}
        >
          Riwayat Alat Sekali Pakai ({sekaliPakaiData.length})
        </button>
      </div>

      {/* ── TABEL 1: Peminjaman & Pengembalian ── */}
      {(activeTab === 'all' || activeTab === 'pinjam_kembali') && (
        <div className="space-y-3 bg-white p-4 sm:p-5 rounded-2xl border border-main shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-800">Tabel Transaksi Peminjaman & Pengembalian</h2>
              <p className="text-main text-muted">Khusus transaksi peminjaman dan pengembalian alat praktikum.</p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-blue-50 text-blue-800 border border-blue-200 self-start sm:self-auto">
              {filteredData.length} Transaksi
            </span>
          </div>

          <DataTable
            columns={columns}
            data={filteredData}
            loading={loading}
            searchPlaceholder="Cari riwayat pinjam/kembali..."
            searchKeys={['kelas', 'nama_alat', 'uid_kartu', 'pemegang', 'sumber']}
            emptyMessage="Belum ada riwayat Peminjaman Alat"
            actionButton={
              <div className="flex w-full flex-col gap-2 min-[420px]:flex-row min-[420px]:items-center md:w-auto">
                <button
                  type="button"
                  onClick={() => reloadData(false)}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white text-gray-600 transition hover:bg-gray-50 min-[420px]:w-11 min-[420px]:border-0 min-[420px]:bg-transparent"
                  title="Refresh data"
                >
                  <IconRefresh size={18} />
                  <span className="text-sm font-semibold min-[420px]:sr-only">Muat ulang</span>
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
                      setClearTarget('pinjam');
                      setShowClearModal(true);
                    }}
                    className="w-full justify-center whitespace-nowrap min-[420px]:flex-1 md:w-auto md:flex-none"
                  >
                    Hapus Riwayat Pinjam
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
                        className="h-11 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-xs font-medium text-gray-700 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 sm:w-auto sm:text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            }
          />
        </div>
      )}

      {/* ── TABEL 2: Alat Sekali Pakai (Consumable) ── */}
      {(activeTab === 'all' || activeTab === 'sekali_pakai') && (
        <div className="space-y-3 bg-white p-4 sm:p-5 rounded-2xl border border-main shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-800">Tabel Transaksi Alat Sekali Pakai</h2>
              <p className="text-xs lg:text-main text-muted">Khusus mencatat pemberian dan pengeluaran bahan praktikum consumable ke kelas.</p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 self-start sm:self-auto">
              {sekaliPakaiData.length} Pemberian
            </span>
          </div>

          <DataTable
            columns={columnsSekaliPakai}
            data={sekaliPakaiData}
            loading={loading}
            searchPlaceholder="Cari transaksi sekali pakai..."
            searchKeys={['kelas', 'nama_alat', 'petugas', 'catatan', 'pemegang', 'satuan']}
            emptyMessage="Belum ada riwayat transaksi alat sekali pakai."
            actionButton={
              <div className="flex w-full flex-col gap-2 min-[420px]:flex-row min-[420px]:items-center md:w-auto">
                <button
                  type="button"
                  onClick={() => reloadData(false)}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white text-gray-600 transition hover:bg-gray-50 min-[420px]:w-11 min-[420px]:border-0 min-[420px]:bg-transparent"
                  title="Refresh data"
                >
                  <IconRefresh size={18} />
                  <span className="text-sm font-semibold min-[420px]:sr-only">Muat ulang</span>
                </button>
                {isAdmin && (
                  <Button
                    variant="danger-soft"
                    icon={IconTrash}
                    onClick={() => {
                      if (sekaliPakaiData.length === 0) {
                        showFeedback({ type: 'warning', title: 'Data kosong', message: 'Tidak ada data riwayat sekali pakai untuk dihapus.' });
                        return;
                      }
                      setClearTarget('sekali_pakai');
                      setShowClearModal(true);
                    }}
                    className="w-full justify-center whitespace-nowrap min-[420px]:flex-1 md:w-auto md:flex-none"
                  >
                    Hapus Riwayat Sekali Pakai
                  </Button>
                )}
              </div>
            }
          />
        </div>
      )}

      <Modal
        isOpen={showClearModal}
        onClose={() => {
          setShowClearModal(false);
          setClearInput('');
        }}
        title={clearTarget === 'pinjam' ? 'Hapus Semua Riwayat Pinjam' : 'Hapus Riwayat Sekali Pakai'}
        subtitle={
          clearTarget === 'pinjam'
            ? 'Yakin ingin menghapus seluruh riwayat peminjaman & pengembalian?'
            : 'Yakin ingin menghapus riwayat transaksi alat sekali pakai?'
        }
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
            <h4 className="text-sm font-bold text-red-900 mb-1">Peringatan Penting</h4>
            <p className="text-xs text-red-700 leading-relaxed">
              {clearTarget === 'pinjam'
                ? `Semua data riwayat peminjaman dan pengembalian (${data.length} data) akan dihapus selamanya dan tidak bisa dikembalikan.`
                : `Semua data transaksi alat sekali pakai (${sekaliPakaiData.length} data) yang telah diproses akan dihapus selamanya.`}
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
              {clearTarget === 'pinjam' ? 'Hapus Riwayat Pinjam' : 'Hapus Riwayat Sekali Pakai'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
