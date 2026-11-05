// src/pages/RiwayatPage.jsx
// Riwayat Peminjaman: Filter Waktu, Pemegang, Kelas, Status Pisah berstandar SaaS

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { dbService } from '../services/store';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { callFunction } from '../lib/api';
import Badge from '../components/Badge';
import Button from '../components/Button';
import DataTable from '../components/DataTable';
import PageHeader from '../components/PageHeader';
import PageNote from '../components/PageNote';
import { friendlyError, showFeedback } from '../lib/feedback';
import { dateFilterValue, matchesTimeRange } from '../lib/timeRange';
import TimeRangeFilter from '../components/TimeRangeFilter';
import {
  IconAlertTriangle,
  IconCheck,
  IconTrash,
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
  const [timeFilter, setTimeFilter] = useState('all');
  const [specificDate, setSpecificDate] = useState('');
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

  // Tanggal tertentu (jika dipilih) menggantikan pilihan rentang waktu.
  const activeTimeFilter = specificDate ? dateFilterValue(specificDate) : timeFilter;

  const filteredData = useMemo(
    () => data.filter((d) => matchesTimeRange(d.waktu_pinjam, activeTimeFilter)),
    [data, activeTimeFilter]
  );

  const filteredSekaliPakai = useMemo(
    () => sekaliPakaiData.filter((d) =>
      matchesTimeRange(d.waktu_proses || d.waktu_tap || d.created_at, activeTimeFilter)
    ),
    [sekaliPakaiData, activeTimeFilter]
  );

  const activePinjamCount = useMemo(
    () => data.filter((d) => d.status === 'dipinjam').length,
    [data]
  );
  const returnedPinjamCount = data.length - activePinjamCount;

  const processedSekaliPakaiCount = useMemo(
    () => sekaliPakaiData.filter((d) => d.status !== 'menunggu').length,
    [sekaliPakaiData]
  );
  const pendingSekaliPakaiCount = sekaliPakaiData.length - processedSekaliPakaiCount;

  const isClearConfirmed = clearInput.trim().toLowerCase() === CONFIRM_TEXT;

  const handleClearAll = async () => {
    if (!isClearConfirmed) return;

    // Riwayat pinjam tidak boleh dihapus selama masih ada unit yang belum
    // dikembalikan. Pemeriksaan server tetap menjadi penentu utama.
    if (clearTarget === 'pinjam' && activePinjamCount > 0) {
      showFeedback({
        type: 'warning',
        title: 'Masih ada peminjaman aktif',
        message: `${activePinjamCount} alat belum dikembalikan. Kembalikan semua alat terlebih dahulu sebelum menghapus riwayat.`,
      });
      setShowClearModal(false);
      setClearInput('');
      return;
    }

    if (clearTarget === 'pinjam') {
      if (isSupabaseConfigured) {
        try {
          await callFunction('manage-transaksi', null, {
            method: 'DELETE',
            params: { clear: 'pinjam' },
          });

          showFeedback({ type: 'success', title: 'Semua riwayat peminjaman & pengembalian berhasil dihapus.' });
          setData([]);
          reloadData();
        } catch (err) {
          console.error('[Riwayat] clear error:', err);
          if (err?.code === 'masih_ada_pinjam') {
            showFeedback({
              type: 'warning',
              title: 'Riwayat tidak dihapus',
              message: err.message || 'Masih ada alat yang dipinjam. Kembalikan semua alat terlebih dahulu.',
            });
            reloadData();
          } else {
            showFeedback({ type: 'error', title: 'Gagal menghapus riwayat peminjaman.', message: friendlyError(err) });
          }
        }
      } else {
        const result = dbService.clearTransaksi();
        if (!result.ok) {
          showFeedback({
            type: 'warning',
            title: 'Riwayat tidak dihapus',
            message: `Masih ada ${result.active_count} peminjaman aktif. Kembalikan semua alat terlebih dahulu.`,
          });
        } else {
          setData([]);
          reloadData();
          showFeedback({ type: 'success', title: 'Semua riwayat transaksi peminjaman berhasil dihapus.' });
        }
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
      key: 'status',
      label: 'Status Peminjaman',
      sortable: true,
      render: (row) => {
        const sudahKembali = row.status === 'dikembalikan';
        return (
          <div className="flex min-w-[190px] flex-col gap-1.5">
            <Badge status={row.status} />
            <div className="space-y-0.5 text-[12px] leading-snug">
              <p className="text-gray-700">
                <span className="font-semibold">Dipinjam:</span> {FMT(row.waktu_pinjam)}
              </p>
              <p className={sudahKembali ? 'text-gray-700' : 'font-medium text-amber-700'}>
                <span className="font-semibold">Dikembalikan:</span>{' '}
                {sudahKembali ? FMT(row.waktu_kembali) : 'Belum dikembalikan'}
              </p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'pemegang',
      label: 'Pemegang',
      sortable: true,
      render: (row) => <span className="font-semibold text-main">{row.pemegang || '—'}</span>,
    },
    {
      key: 'uid_kartu',
      label: 'ID Kartu',
      sortable: true,
      render: (row) => (
        <span className="rounded bg-gray-100 px-2 py-0.5 text-[13px] font-medium text-gray-700 lg:text-main">
          {row.uid_kartu || '—'}
        </span>
      ),
    },
    {
      key: 'kelas',
      label: 'Kelas',
      sortable: true,
      render: (row) => <span className="text-[13px] font-medium text-main lg:text-main">{row.kelas || '—'}</span>,
    },
    {
      key: 'nama_alat',
      label: 'Alat',
      sortable: true,
      render: (row) => <span className="font-semibold text-main">{row.nama_alat}</span>,
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
        Pilih rentang waktu lewat menu dropdown di atas tabel. Filter berlaku untuk kedua tabel, dan setiap halaman
        menampilkan 10 transaksi. Gunakan tombol panah di bawah tabel untuk pindah halaman.
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
          Riwayat Alat Sekali Pakai ({filteredSekaliPakai.length})
        </button>
      </div>

      {/* ── FILTER WAKTU (berlaku untuk kedua tabel) ── */}
      <TimeRangeFilter
        value={timeFilter}
        onChange={(nextFilter) => {
          setTimeFilter(nextFilter);
          setSpecificDate('');
        }}
        dateValue={specificDate}
        onDateChange={setSpecificDate}
        description="Berlaku untuk tabel peminjaman dan tabel alat sekali pakai. Pilih tanggal tertentu untuk mengecek data yang lebih lama."
      />

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
            defaultPageSize={10}
            showPageSize={false}
            searchPlaceholder="Cari riwayat pinjam/kembali..."
            searchKeys={['kelas', 'nama_alat', 'uid_kartu', 'pemegang', 'sumber', 'status']}
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
                      if (activePinjamCount > 0) {
                        showFeedback({
                          type: 'warning',
                          title: 'Masih ada peminjaman aktif',
                          message: `${activePinjamCount} alat belum dikembalikan. Kembalikan semua alat terlebih dahulu sebelum menghapus riwayat.`,
                        });
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
              {filteredSekaliPakai.length} Pemberian
            </span>
          </div>

          <DataTable
            columns={columnsSekaliPakai}
            data={filteredSekaliPakai}
            loading={loading}
            defaultPageSize={10}
            showPageSize={false}
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
                      if (processedSekaliPakaiCount === 0) {
                        showFeedback({ type: 'warning', title: 'Belum ada riwayat', message: 'Belum ada riwayat sekali pakai yang sudah diproses untuk dihapus.' });
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
        title={clearTarget === 'pinjam' ? 'Hapus Riwayat Peminjaman' : 'Hapus Riwayat Sekali Pakai'}
        subtitle={
          clearTarget === 'pinjam'
            ? 'Hanya riwayat yang sudah dikembalikan yang dapat dihapus. Kembalikan semua alat terlebih dahulu.'
            : 'Riwayat pemberian alat sekali pakai yang sudah diproses akan dihapus permanen.'
        }
        icon={IconAlertTriangle}
        iconVariant="danger"
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-700">
                <IconTrash size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-red-900">Tindakan ini tidak bisa dibatalkan</p>
                <p className="mt-1 text-sm leading-relaxed text-red-800">
                  {clearTarget === 'pinjam'
                    ? 'Seluruh catatan peminjaman yang sudah dikembalikan akan dihapus permanen. Riwayat pinjaman yang masih aktif tidak dapat dihapus.'
                    : 'Hanya riwayat yang sudah disetujui, ditolak, atau dibatalkan yang akan dihapus.'}
                </p>
              </div>
            </div>

            <dl className="mt-3 grid grid-cols-3 gap-2">
              {clearTarget === 'pinjam' ? (
                <>
                  <div className="rounded-lg border border-red-200 bg-white/80 p-2.5 text-center">
                    <dt className="text-[11px] font-medium text-red-700">Total data</dt>
                    <dd className="mt-0.5 text-xl font-bold text-red-900">{data.length}</dd>
                  </div>
                  <div className="rounded-lg border border-red-200 bg-white/80 p-2.5 text-center">
                    <dt className="text-[11px] font-medium text-red-700">Masih aktif</dt>
                    <dd className="mt-0.5 text-xl font-bold text-red-900">{activePinjamCount}</dd>
                  </div>
                  <div className="rounded-lg border border-red-200 bg-white/80 p-2.5 text-center">
                    <dt className="text-[11px] font-medium text-red-700">Sudah kembali</dt>
                    <dd className="mt-0.5 text-xl font-bold text-red-900">{returnedPinjamCount}</dd>
                  </div>
                </>
              ) : (
                <>
                  <div className="rounded-lg border border-red-200 bg-white/80 p-2.5 text-center">
                    <dt className="text-[11px] font-medium text-red-700">Akan dihapus</dt>
                    <dd className="mt-0.5 text-xl font-bold text-red-900">{processedSekaliPakaiCount}</dd>
                  </div>
                  <div className="rounded-lg border border-red-200 bg-white/80 p-2.5 text-center">
                    <dt className="text-[11px] font-medium text-red-700">Masih menunggu</dt>
                    <dd className="mt-0.5 text-xl font-bold text-red-900">{pendingSekaliPakaiCount}</dd>
                  </div>
                  <div className="rounded-lg border border-red-200 bg-white/80 p-2.5 text-center">
                    <dt className="text-[11px] font-medium text-red-700">Total data</dt>
                    <dd className="mt-0.5 text-xl font-bold text-red-900">{sekaliPakaiData.length}</dd>
                  </div>
                </>
              )}
            </dl>
          </div>

          {clearTarget === 'pinjam' && activePinjamCount > 0 && (
            <div className="rounded-xl border border-red-300 bg-red-50 p-3.5 text-sm text-red-900">
              <p className="font-bold">Penghapusan diblokir</p>
              <p className="mt-1 leading-relaxed">
                Masih ada {activePinjamCount} peminjaman yang belum dikembalikan.
                Kembalikan semua alat terlebih dahulu; setelah itu riwayat baru bisa dihapus.
              </p>
            </div>
          )}

          {clearTarget === 'sekali_pakai' && pendingSekaliPakaiCount > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-sm text-amber-900">
              <p className="font-bold">Permintaan yang masih menunggu tetap disimpan</p>
              <p className="mt-1 leading-relaxed">
                {pendingSekaliPakaiCount} permintaan yang belum diproses tidak akan dihapus.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-bold text-gray-800">Konfirmasi penghapusan</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-gray-600">
              <li>Periksa kembali jumlah data pada kotak merah di atas.</li>
              <li>Ketik frasa konfirmasi di bawah ini dengan huruf kecil.</li>
              <li>Tombol hapus akan aktif setelah tulisan sama persis.</li>
            </ol>

            <div className="mt-3 space-y-2">
              <label htmlFor="konfirmasi-hapus" className="block text-sm font-semibold text-gray-800">
                Ketik:{' '}
                <span className="select-all rounded bg-gray-100 px-2 py-1 font-bold text-red-700">
                  {CONFIRM_TEXT}
                </span>
              </label>
              <input
                id="konfirmasi-hapus"
                type="text"
                value={clearInput}
                onChange={(e) => setClearInput(e.target.value)}
                placeholder={`Ketik: ${CONFIRM_TEXT}`}
                className="h-12 w-full rounded-xl border border-gray-300 bg-white px-4 text-base text-gray-900 focus:border-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/20"
                autoComplete="off"
                aria-describedby="konfirmasi-status"
              />
              <p
                id="konfirmasi-status"
                aria-live="polite"
                className={`flex items-start gap-1.5 text-xs leading-relaxed ${isClearConfirmed ? 'font-semibold text-emerald-700' : 'text-gray-500'}`}
              >
                {isClearConfirmed ? (
                  <>
                    <IconCheck size={14} className="mt-0.5 shrink-0" />
                    Tulisan sudah cocok. Tombol hapus sudah aktif.
                  </>
                ) : (
                  'Tulisan harus sama persis, termasuk spasinya.'
                )}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-col-reverse gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              onClick={() => { setShowClearModal(false); setClearInput(''); }}
              className="h-11 w-full justify-center sm:w-auto"
            >
              Batal
            </Button>
            <Button
              variant="danger"
              icon={IconTrash}
              disabled={!isClearConfirmed || (clearTarget === 'pinjam' ? data.length === 0 || activePinjamCount > 0 : processedSekaliPakaiCount === 0)}
              onClick={handleClearAll}
              className="h-11 w-full justify-center sm:w-auto"
            >
              {clearTarget === 'pinjam' ? 'Hapus Semua Riwayat' : 'Hapus Riwayat Sekali Pakai'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
