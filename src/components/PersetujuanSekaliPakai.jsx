// src/components/PersetujuanSekaliPakai.jsx
// Komponen persetujuan dan riwayat alat sekali pakai (consumable) di Dashboard.
// Alur: Siswa tap RFID alat consumable -> masuk status 'menunggu' ->
// Petugas/Admin bisa input jumlah/cm yang diberikan -> setujui (potong stok) atau tolak.
// Petugas/Admin juga dapat membatalkan persetujuan di tab Riwayat (stok dikembalikan).

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  IconCheck,
  IconX,
  IconPackage,
  IconClock,
  IconHistory,
  IconRefresh,
} from '@tabler/icons-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { callFunction } from '../lib/api';
import { dbService } from '../services/store';
import { showFeedback, friendlyError } from '../lib/feedback';
import { isOnline, isNetworkError, registerOnlineSync } from '../lib/networkStatus';

function StatusPermintaan({ status }) {
  if (status === 'disetujui') {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
        Disetujui
      </span>
    );
  }
  if (status === 'ditolak') {
    return (
      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
        Ditolak
      </span>
    );
  }
  if (status === 'dibatalkan') {
    return (
      <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
        Dibatalkan
      </span>
    );
  }
  return <span className="text-xs text-gray-400">—</span>;
}

export default function PersetujuanSekaliPakai({ user }) {
  const isDemo = !isSupabaseConfigured;

  const [activeTab, setActiveTab] = useState('menunggu'); // 'menunggu' | 'riwayat'
  const [menungguList, setMenungguList] = useState([]);
  const [riwayatList, setRiwayatList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal Setujui
  const [showSetujuModal, setShowSetujuModal] = useState(false);
  const [selectedReq, setSelectedReq] = useState(null);
  const [jumlahSetuju, setJumlahSetuju] = useState('3');
  const [catatanSetuju, setCatatanSetuju] = useState('');
  const [stokAlatInfo, setStokAlatInfo] = useState(null);

  // Modal Tolak
  const [showTolakModal, setShowTolakModal] = useState(false);
  const [alasanTolak, setAlasanTolak] = useState('');

  // Modal Batalkan Persetujuan (Revert)
  const [showBatalModal, setShowBatalModal] = useState(false);
  const [catatanBatal, setCatatanBatal] = useState('');
  const [processing, setProcessing] = useState(false);

  const isFetchingRef = useRef(false);

  // ── Fetch data ──────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!isOnline()) {
      setLoading(false);
      return;
    }
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    setLoading(true);
    try {
      if (isDemo) {
        const allReq = dbService.getPermintaan();
        const kartuList = dbService.getKartu();
        const alatList = dbService.getAlat();

        const enrich = (item) => {
          const k = kartuList.find((x) => x.uid_kartu === item.uid_kartu);
          const a = alatList.find((x) => x.id === item.alat_id);
          return {
            ...item,
            satuan: item.satuan || a?.satuan || 'unit',
            kartu_rfid: { nama_pemegang: k?.nama_pemegang ?? '' },
          };
        };

        const now = Date.now();
        const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

        const waiting = allReq.filter((p) => p.status === 'menunggu').map(enrich);
        const history = allReq
          .filter((p) => {
            if (p.status === 'menunggu') return false;
            const t = new Date(p.waktu_proses || p.waktu_tap || p.created_at || 0).getTime();
            return (now - t) <= TWENTY_FOUR_HOURS_MS;
          })
          .sort(
            (a, b) =>
              new Date(b.waktu_proses || b.waktu_tap || 0) -
              new Date(a.waktu_proses || a.waktu_tap || 0)
          )
          .map(enrich);

        setMenungguList(waiting);
        setRiwayatList(history);
      } else {
        // Mode Supabase
        const [resWaiting, resHistory] = await Promise.all([
          callFunction('manage-permintaan', undefined, {
            method: 'GET',
            params: { status: 'menunggu' },
          }).catch((err) => {
            if (isNetworkError(err)) return null;
            return { data: [] };
          }),
          callFunction('manage-permintaan', undefined, {
            method: 'GET',
          }).catch((err) => {
            if (isNetworkError(err)) return null;
            return { data: [] };
          }),
        ]);

        const now = Date.now();
        const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

        if (resWaiting?.data) setMenungguList(resWaiting.data);
        if (resHistory?.data) {
          const nonWaiting = resHistory.data.filter((p) => {
            if (p.status === 'menunggu') return false;
            const t = new Date(p.waktu_proses || p.waktu_tap || p.created_at || 0).getTime();
            return (now - t) <= TWENTY_FOUR_HOURS_MS;
          });
          setRiwayatList(nonWaiting);
        }
      }
    } catch (err) {
      if (!isNetworkError(err)) {
        console.error('[PersetujuanSekaliPakai] fetch error:', err);
        showFeedback({
          type: 'error',
          title: 'Gagal memuat data permintaan consumable.',
          message: friendlyError(err),
        });
      }
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [isDemo]);

  // ── Realtime listener ────────────────────────────────────────
  useEffect(() => {
    fetchData();

    if (!isDemo) {
      const ch = supabase
        .channel('dashboard_permintaan_realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'permintaan_habis_pakai' },
          () => fetchData()
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'alat' },
          () => fetchData()
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[Realtime permintaan_dashboard] status:', status);
          }
        });

      // Sinkronisasi otomatis SEKALI saat koneksi internet pulih
      const unregisterSync = registerOnlineSync(() => {
        fetchData();
      });

      return () => {
        supabase.removeChannel(ch);
        unregisterSync();
      };
    } else {
      const handler = () => fetchData();
      window.addEventListener('simlab_storage_updated', handler);
      return () => window.removeEventListener('simlab_storage_updated', handler);
    }
  }, [isDemo, fetchData]);

  // ── Helper ambil stok alat saat buka modal setujui ────────────
  const openSetujuModal = async (req) => {
    setSelectedReq(req);
    const s = (req.satuan || '').toLowerCase();
    setJumlahSetuju(s === 'cm' ? '10' : '1');
    setCatatanSetuju('');

    // Ambil info stok terkini
    if (isDemo) {
      const a = dbService.getAlatWithStok().find((x) => x.id === req.alat_id);
      setStokAlatInfo(a ?? null);
    } else {
      try {
        const { data } = await supabase
          .from('v_list_barang')
          .select('stok_tersedia, satuan')
          .eq('id', req.alat_id)
          .maybeSingle();
        setStokAlatInfo(data ?? null);
      } catch {
        setStokAlatInfo(null);
      }
    }

    setShowSetujuModal(true);
  };

  const openTolakModal = (req) => {
    setSelectedReq(req);
    setAlasanTolak('Stok tidak tersedia / belum memenuhi syarat');
    setShowTolakModal(true);
  };

  const openBatalModal = (req) => {
    setSelectedReq(req);
    setCatatanBatal('');
    setShowBatalModal(true);
  };

  const closeModals = () => {
    setShowSetujuModal(false);
    setShowTolakModal(false);
    setShowBatalModal(false);
    setSelectedReq(null);
    setStokAlatInfo(null);
    setCatatanSetuju('');
    setAlasanTolak('');
    setCatatanBatal('');
    setProcessing(false);
  };

  // ── Action: Setujui ──────────────────────────────────────────
  const handleSetujui = async () => {
    if (!selectedReq) return;
    const qty = parseInt(jumlahSetuju, 10);
    if (isNaN(qty) || qty <= 0) {
      showFeedback({ type: 'error', title: 'Jumlah tidak valid', message: 'Masukkan angka lebih dari 0.' });
      return;
    }

    setProcessing(true);
    const petugasNama = user?.nama || 'Petugas';

    try {
      if (isDemo) {
        const res = dbService.setujuiPermintaan({
          id: selectedReq.id,
          jumlah: qty,
          catatan: catatanSetuju.trim() || `Disetujui ${qty} ${selectedReq.satuan || 'unit'}`,
          petugas: petugasNama,
        });

        if (!res.ok) {
          const msg = res.error === 'stok_habis' ? 'Stok alat tidak mencukupi.' : 'Gagal menyetujui permintaan.';
          showFeedback({ type: 'error', title: msg });
          setProcessing(false);
          return;
        }
      } else {
        await callFunction(
          'manage-permintaan',
          {
            aksi: 'setujui',
            jumlah: qty,
            catatan: catatanSetuju.trim() || undefined,
          },
          {
            method: 'PUT',
            params: { id: selectedReq.id },
          }
        );
      }

      showFeedback({
        type: 'success',
        title: 'Permintaan Disetujui',
        message: `${qty} ${selectedReq.satuan || 'unit'} ${selectedReq.nama_alat} berhasil diserahkan ke ${selectedReq.kelas}.`,
      });
      closeModals();
      fetchData();
    } catch (err) {
      console.error('[PersetujuanSekaliPakai] error setujui:', err);
      showFeedback({
        type: 'error',
        title: 'Gagal menyetujui permintaan',
        message: friendlyError(err),
      });
    } finally {
      setProcessing(false);
    }
  };

  // ── Action: Tolak ────────────────────────────────────────────
  const handleTolak = async () => {
    if (!selectedReq) return;
    if (!alasanTolak.trim()) {
      showFeedback({ type: 'error', title: 'Alasan penolakan wajib diisi.' });
      return;
    }

    setProcessing(true);
    const petugasNama = user?.nama || 'Petugas';

    try {
      if (isDemo) {
        const res = dbService.tolakPermintaan({
          id: selectedReq.id,
          alasan: alasanTolak.trim(),
          petugas: petugasNama,
        });
        if (!res.ok) {
          showFeedback({ type: 'error', title: 'Gagal menolak permintaan.' });
          setProcessing(false);
          return;
        }
      } else {
        await callFunction(
          'manage-permintaan',
          {
            aksi: 'tolak',
            alasan: alasanTolak.trim(),
          },
          {
            method: 'PUT',
            params: { id: selectedReq.id },
          }
        );
      }

      showFeedback({
        type: 'success',
        title: 'Permintaan Ditolak',
        message: `Permintaan ${selectedReq.nama_alat} dari ${selectedReq.kelas} berhasil ditolak.`,
      });
      closeModals();
      fetchData();
    } catch (err) {
      console.error('[PersetujuanSekaliPakai] error tolak:', err);
      showFeedback({
        type: 'error',
        title: 'Gagal menolak permintaan',
        message: friendlyError(err),
      });
    } finally {
      setProcessing(false);
    }
  };

  // ── Action: Batalkan Persetujuan (Revert Stock) ──────────────
  const handleBatalkanPersetujuan = async () => {
    if (!selectedReq) return;
    setProcessing(true);
    const petugasNama = user?.nama || 'Petugas';

    try {
      if (isDemo) {
        const res = dbService.batalkanPermintaan({
          id: selectedReq.id,
          catatan: catatanBatal.trim() || 'Dibatalkan petugas',
          petugas: petugasNama,
        });
        if (!res.ok) {
          showFeedback({ type: 'error', title: 'Gagal membatalkan persetujuan.' });
          setProcessing(false);
          return;
        }
      } else {
        await callFunction(
          'manage-permintaan',
          {
            aksi: 'batalkan',
            catatan: catatanBatal.trim() || undefined,
          },
          {
            method: 'PUT',
            params: { id: selectedReq.id },
          }
        );
      }

      showFeedback({
        type: 'success',
        title: 'Persetujuan Dibatalkan',
        message: `Stok ${selectedReq.jumlah || 1} ${selectedReq.satuan || 'unit'} ${selectedReq.nama_alat} telah dikembalikan ke inventaris.`,
      });
      closeModals();
      fetchData();
    } catch (err) {
      console.error('[PersetujuanSekaliPakai] error batalkan:', err);
      showFeedback({
        type: 'error',
        title: 'Gagal membatalkan persetujuan',
        message: friendlyError(err),
      });
    } finally {
      setProcessing(false);
    }
  };

  const FMT = (iso) =>
    iso
      ? new Intl.DateTimeFormat('id-ID', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso))
      : '—';

  const pendingCount = menungguList.length;

  return (
    <div className="overflow-hidden rounded-xl border border-main bg-surface shadow-sm">
      {/* ── Header Section ── */}
      <div className="border-b border-main bg-amber-50/40 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 shrink-0 rounded-lg bg-amber-100 p-2 text-amber-800">
              <IconPackage size={22} />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-main sm:text-lg">
                  Persetujuan Alat Sekali Pakai
                </h2>
                {pendingCount > 0 ? (
                  <span className="inline-flex items-center rounded-full bg-amber-600 px-2 py-0.5 text-xs font-bold text-white">
                    {pendingCount} menunggu
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                    Tidak ada antrean
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-muted sm:text-sm">
                Setujui atau tolak permintaan consumable hasil tap kartu siswa.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={fetchData}
            disabled={loading}
            className="flex h-11 w-11 shrink-0 items-center justify-center self-end rounded-lg border border-transparent text-muted transition hover:border-gray-200 hover:bg-white hover:text-main disabled:opacity-60 sm:self-auto"
            title="Muat ulang"
            aria-label="Muat ulang data permintaan"
          >
            <IconRefresh size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* ── Tabs Navigation ── */}
        <div className="no-scrollbar mt-4 flex flex-nowrap items-center gap-2 overflow-x-auto border-t border-amber-200/60 pt-3">
          <button
            type="button"
            onClick={() => setActiveTab('menunggu')}
            className={`flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition sm:text-sm ${activeTab === 'menunggu'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-amber-900 hover:bg-amber-100/70'
              }`}
          >
            <IconClock size={16} />
            Menunggu
            {pendingCount > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${activeTab === 'menunggu' ? 'bg-white text-amber-700' : 'bg-amber-600 text-white'
                }`}>
                {pendingCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('riwayat')}
            className={`flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 text-xs font-semibold transition sm:text-sm ${activeTab === 'riwayat'
              ? 'bg-amber-600 text-white shadow-sm'
              : 'text-amber-900 hover:bg-amber-100/70'
              }`}
          >
            <IconHistory size={16} />
            Riwayat 24 jam
            <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${activeTab === 'riwayat' ? 'bg-white text-amber-700' : 'bg-amber-100 text-amber-800'
              }`}>
              {riwayatList.length}
            </span>
          </button>
        </div>
      </div>

      {/* ── TAB 1: Menunggu Persetujuan ── */}
      {activeTab === 'menunggu' && (
        <div>
          {menungguList.length === 0 ? (
            <div className="p-8 text-center bg-white">
              <div className="w-12 h-12 mx-auto rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                <IconCheck size={24} />
              </div>
              <h3 className="font-semibold text-main text-base">Tidak ada permintaan menunggu</h3>
              <p className="text-sm text-muted max-w-md mx-auto mt-1">
                Semua permintaan alat sekali pakai sudah disetujui atau ditolak, permintaan baru akan langsung muncul di sini
              </p>
            </div>
          ) : (
            <>
              {/* Tampilan kartu untuk layar kecil */}
              <div className="divide-y divide-gray-100 md:hidden">
                {menungguList.map((req) => (
                  <article key={req.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-main">{req.nama_alat}</p>
                        <p className="mt-0.5 text-xs text-muted">{FMT(req.waktu_tap)}</p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-900">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                        Menunggu
                      </span>
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm">
                      <div className="min-w-0">
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">Kelas</dt>
                        <dd className="mt-0.5 break-words font-semibold text-main">{req.kelas || '—'}</dd>
                        {req.kartu_rfid?.nama_pemegang && (
                          <dd className="text-xs text-muted">{req.kartu_rfid.nama_pemegang}</dd>
                        )}
                      </div>
                      <div>
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">Satuan</dt>
                        <dd className="mt-0.5 font-semibold text-main">{req.satuan || 'unit'}</dd>
                      </div>
                    </dl>

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => openSetujuModal(req)}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 active:bg-emerald-800"
                      >
                        <IconCheck size={16} />
                        Setujui
                      </button>
                      <button
                        type="button"
                        onClick={() => openTolakModal(req)}
                        className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-bold text-red-700 transition hover:bg-red-100 active:bg-red-200"
                      >
                        <IconX size={16} />
                        Tolak
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              {/* Tampilan tabel untuk layar sedang ke atas */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left">
                      <th className="px-4 py-3 font-semibold text-gray-700">Waktu Tap</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Kelas / Pemegang</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Alat Sekali Pakai</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Satuan</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Status</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700">Tindakan Petugas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {menungguList.map((req) => (
                      <tr key={req.id} className="transition-colors hover:bg-amber-50/30">
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-600">
                          {FMT(req.waktu_tap)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="block font-bold text-main">{req.kelas}</span>
                          {req.kartu_rfid?.nama_pemegang && (
                            <span className="block text-xs text-muted">{req.kartu_rfid.nama_pemegang}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-semibold text-amber-900">{req.nama_alat}</span>
                          <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
                            Consumable
                          </span>
                        </td>
                        <td className="px-4 py-3 font-medium text-gray-700">
                          {req.satuan || 'unit'}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900">
                            <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
                            Menunggu Persetujuan
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openSetujuModal(req)}
                              className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700"
                              title="Setujui dan tentukan berapa cm/unit yang diberikan"
                            >
                              <IconCheck size={15} />
                              Setujui
                            </button>
                            <button
                              type="button"
                              onClick={() => openTolakModal(req)}
                              className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-bold text-red-700 transition hover:bg-red-100"
                              title="Tolak atau batalkan permintaan ini"
                            >
                              <IconX size={15} />
                              Tolak
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TAB 2: Riwayat Selesai ── */}
      {activeTab === 'riwayat' && (
        <div>
          {riwayatList.length === 0 ? (
            <div className="p-8 text-center bg-white">
              <p className="text-muted text-sm">Belum ada riwayat persetujuan Alat sekali pakai dalam 24 jam terakhir.</p>
            </div>
          ) : (
            <>
              {/* Tampilan kartu untuk layar kecil */}
              <div className="divide-y divide-gray-100 md:hidden">
                {riwayatList.map((item) => (
                  <article key={item.id} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="break-words text-sm font-semibold text-main">{item.nama_alat}</p>
                        <p className="mt-0.5 text-xs text-muted">
                          {item.kelas || '—'} · {FMT(item.waktu_proses || item.waktu_tap)}
                        </p>
                      </div>
                      <span className="shrink-0">
                        <StatusPermintaan status={item.status} />
                      </span>
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm">
                      <div>
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">Diberikan</dt>
                        <dd className="mt-0.5 font-semibold text-main">
                          {item.status === 'disetujui' ? (
                            <>{item.jumlah ?? 1} <span className="text-xs font-medium text-emerald-700">{item.satuan || item.alat?.satuan || 'unit'}</span></>
                          ) : '—'}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-muted">Petugas</dt>
                        <dd className="mt-0.5 truncate font-semibold text-main">{item.petugas || '—'}</dd>
                      </div>
                    </dl>

                    <div className="mt-3">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                        {item.status === 'ditolak' ? 'Alasan penolakan' : 'Catatan'}
                      </p>
                      <p className="mt-0.5 break-words text-sm text-gray-700">
                        {item.status === 'ditolak' ? item.alasan_tolak || '—' : item.catatan || '—'}
                      </p>
                    </div>

                    {item.status === 'disetujui' && (
                      <button
                        type="button"
                        onClick={() => openBatalModal(item)}
                        className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 text-sm font-semibold text-red-700 transition hover:bg-red-100 active:bg-red-200"
                        title="Batalkan persetujuan dan kembalikan stok"
                      >
                        <IconHistory size={16} />
                        Batalkan &amp; kembalikan stok
                      </button>
                    )}
                  </article>
                ))}
              </div>

              {/* Tampilan tabel untuk layar sedang ke atas */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left">
                      <th className="px-4 py-3 font-semibold text-gray-700">Waktu</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Kelas</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Alat</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700">Diberikan</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Status</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Petugas</th>
                      <th className="px-4 py-3 font-semibold text-gray-700">Catatan / Alasan</th>
                      <th className="px-4 py-3 text-right font-semibold text-gray-700">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {riwayatList.map((item) => (
                      <tr key={item.id} className="transition-colors hover:bg-gray-50">
                        <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-gray-600">
                          {FMT(item.waktu_proses || item.waktu_tap)}
                        </td>
                        <td className="px-4 py-3 font-medium text-main">{item.kelas}</td>
                        <td className="px-4 py-3 text-gray-800">{item.nama_alat}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-bold text-main">
                          {item.status === 'disetujui' ? (
                            <span className="inline-flex items-center gap-1 font-bold text-main">
                              <span>{item.jumlah ?? 1}</span>
                              <span className="text-xs font-semibold text-emerald-700">{item.satuan || item.alat?.satuan || 'unit'}</span>
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <StatusPermintaan status={item.status} />
                        </td>
                        <td className="px-4 py-3 font-semibold text-main">{item.petugas || '—'}</td>
                        <td className="max-w-[200px] truncate px-4 py-3 font-medium text-main">
                          {item.status === 'ditolak' ? item.alasan_tolak : item.catatan || '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          {item.status === 'disetujui' ? (
                            <button
                              type="button"
                              onClick={() => openBatalModal(item)}
                              className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 hover:text-red-800"
                              title="Batalkan persetujuan dan kembalikan stok"
                            >
                              <IconHistory size={14} />
                              Batalkan
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── MODAL 1: SETUJUI (Input Jumlah / Berapa cm) ── */}
      {showSetujuModal && selectedReq && (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="animate-slideUp flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:animate-popIn sm:rounded-2xl">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50 px-4 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="shrink-0 rounded-xl bg-emerald-600 p-2 text-white">
                  <IconCheck size={20} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-emerald-950">Setujui Permintaan Consumable</h3>
                  <p className="text-xs text-emerald-700">Tentukan jumlah atau ukuran yang diberikan ke siswa</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModals}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-white hover:text-gray-600"
                aria-label="Tutup dialog"
              >
                <IconX size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:space-y-5 sm:p-6">
              {/* Info Card */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 sm:p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm">
                <div>
                  <span className="text-xs text-muted block">Alat Sekali Pakai</span>
                  <span className="font-bold text-main text-base block mt-0.5">{selectedReq.nama_alat}</span>
                  <span className="text-xs text-amber-800 font-medium mt-1 inline-block">
                    Satuan: {selectedReq.satuan || 'unit'}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-muted block">Kelas Peminta</span>
                  <span className="font-bold text-main text-base block mt-0.5">{selectedReq.kelas}</span>
                  <span className="text-xs text-muted block mt-1">
                    {selectedReq.kartu_rfid?.nama_pemegang || 'Pemegang kartu'}
                  </span>
                </div>
              </div>

              {/* Input Berapa cm / unit */}
              <div>
                <label className="block font-bold text-sm text-gray-800 mb-2">
                  Berapa <span className="text-emerald-700">{selectedReq.satuan || 'unit'}</span> yang diberikan? *
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max={stokAlatInfo?.stok_tersedia ?? 9999}
                    value={jumlahSetuju}
                    onChange={(e) => setJumlahSetuju(e.target.value)}
                    className="w-32 px-4 py-2.5 border-2 border-emerald-500 rounded-xl font-bold text-xl text-center focus:ring-2 focus:ring-emerald-400 focus:outline-none"
                    placeholder="3"
                    autoFocus
                  />
                  <span className="font-semibold text-lg text-gray-700">
                    {selectedReq.satuan || 'unit'}
                  </span>
                </div>

                {/* Sisa Stok Warning / Info */}
                {stokAlatInfo && (
                  <div className="mt-2 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-gray-600">
                    <span>Sisa stok saat ini: <b>{stokAlatInfo.stok_tersedia} {selectedReq.satuan || 'unit'}</b></span>
                    <span>
                      Stok setelah disetujui:{' '}
                      <b className={stokAlatInfo.stok_tersedia - (parseInt(jumlahSetuju, 10) || 0) < 0 ? 'text-red-600' : 'text-emerald-700'}>
                        {Math.max(0, stokAlatInfo.stok_tersedia - (parseInt(jumlahSetuju, 10) || 0))} {selectedReq.satuan || 'unit'}
                      </b>
                    </span>
                  </div>
                )}
              </div>

              {/* Catatan Petugas */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Catatan Persetujuan (Opsional)
                </label>
                <input
                  type="text"
                  value={catatanSetuju}
                  onChange={(e) => setCatatanSetuju(e.target.value)}
                  placeholder="Misal: Untuk praktikum elektronika solder"
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-emerald-400 focus:outline-none"
                />
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="safe-area-bottom flex shrink-0 flex-col-reverse gap-2.5 border-t border-gray-100 bg-gray-50 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-6 sm:py-4">
              <button
                type="button"
                onClick={closeModals}
                disabled={processing}
                className="min-h-11 w-full rounded-xl px-4 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 disabled:opacity-60 sm:w-auto"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSetujui}
                disabled={processing || !jumlahSetuju || parseInt(jumlahSetuju, 10) <= 0}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50 sm:w-auto"
              >
                <IconCheck size={18} />
                {processing ? 'Memproses...' : 'Setujui & Potong Stok'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: TOLAK (Reject) ── */}
      {showTolakModal && selectedReq && (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="animate-slideUp flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:animate-popIn sm:rounded-2xl">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-red-100 bg-red-50 px-4 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="shrink-0 rounded-xl bg-red-600 p-2 text-white">
                  <IconX size={20} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-red-950">Tolak Permintaan</h3>
                  <p className="text-xs text-red-700">Permintaan ini akan dibatalkan tanpa mengurangi stok</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModals}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-white hover:text-gray-600"
                aria-label="Tutup dialog"
              >
                <IconX size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
              <p className="text-sm text-gray-700">
                Apakah Anda yakin ingin menolak permintaan <b>{selectedReq.nama_alat}</b> untuk kelas <b>{selectedReq.kelas}</b>?
              </p>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Alasan Penolakan <span className="text-red-600">*</span>
                </label>
                <textarea
                  value={alasanTolak}
                  onChange={(e) => setAlasanTolak(e.target.value)}
                  rows="3"
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-red-400 focus:outline-none"
                  placeholder="Tulis alasan penolakan..."
                />
              </div>

              {/* Preset Alasan Cepat */}
              <div className="space-y-1.5">
                <span className="text-xs text-muted block">Pilihan cepat:</span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'Stok sedang habis',
                    'Bukan jadwal praktikum',
                    'Dibatalkan atas permintaan siswa',
                  ].map((reason) => (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => setAlasanTolak(reason)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition"
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="safe-area-bottom flex shrink-0 flex-col-reverse gap-2.5 border-t border-gray-100 bg-gray-50 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-6 sm:py-4">
              <button
                type="button"
                onClick={closeModals}
                disabled={processing}
                className="min-h-11 w-full rounded-xl px-4 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 disabled:opacity-60 sm:w-auto"
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={handleTolak}
                disabled={processing || !alasanTolak.trim()}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50 sm:w-auto"
              >
                <IconX size={18} />
                {processing ? 'Menolak...' : 'Tolak Permintaan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 3: BATALKAN PERSETUJUAN (Revert Stock) ── */}
      {showBatalModal && selectedReq && (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="animate-slideUp flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:animate-popIn sm:rounded-2xl">
            {/* Header */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-amber-100 bg-amber-50 px-4 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="shrink-0 rounded-xl bg-amber-600 p-2 text-white">
                  <IconHistory size={20} />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-bold text-amber-950">Batalkan Persetujuan</h3>
                  <p className="text-xs text-amber-800">Kembalikan stok alat yang telah disetujui</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeModals}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-white hover:text-gray-600"
                aria-label="Tutup dialog"
              >
                <IconX size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
              <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl text-sm text-amber-900 space-y-1">
                <p>
                  Permintaan: <b>{selectedReq.nama_alat}</b> ({selectedReq.kelas})
                </p>
                <p>
                  Jumlah yang sebelumnya diberikan: <b>{selectedReq.jumlah ?? 1} {selectedReq.satuan || 'unit'}</b>
                </p>
                <p className="text-xs text-amber-800 pt-1 border-t border-amber-200 mt-2 font-medium">
                  Stok sebanyak <b>{selectedReq.jumlah ?? 1} {selectedReq.satuan || 'unit'}</b> akan <b>otomatis dikembalikan</b> ke inventaris lab.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Alasan / Catatan Pembatalan (Opsional)
                </label>
                <input
                  type="text"
                  value={catatanBatal}
                  onChange={(e) => setCatatanBatal(e.target.value)}
                  placeholder="Misal: Salah input ukuran atau siswa batal mengambil"
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-amber-400 focus:outline-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="safe-area-bottom flex shrink-0 flex-col-reverse gap-2.5 border-t border-gray-100 bg-gray-50 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-6 sm:py-4">
              <button
                type="button"
                onClick={closeModals}
                disabled={processing}
                className="min-h-11 w-full rounded-xl px-4 text-sm font-semibold text-gray-600 transition hover:bg-gray-100 disabled:opacity-60 sm:w-auto"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={handleBatalkanPersetujuan}
                disabled={processing}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-amber-700 disabled:opacity-50 sm:w-auto"
              >
                <IconHistory size={18} />
                {processing ? 'Membatalkan...' : 'Ya, Batalkan & Kembalikan Stok'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
