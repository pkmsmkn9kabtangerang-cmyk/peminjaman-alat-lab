// src/components/PersetujuanSekaliPakai.jsx
// Komponen persetujuan dan riwayat alat sekali pakai (consumable) di Dashboard.
// Alur: Siswa tap RFID alat consumable -> masuk status 'menunggu' ->
// Petugas/Admin bisa input jumlah/cm yang diberikan -> setujui (potong stok) atau tolak.
// Petugas/Admin juga dapat membatalkan persetujuan di tab Riwayat (stok dikembalikan).

import React, { useState, useEffect, useCallback } from 'react';
import {
  IconCheck,
  IconX,
  IconPackage,
  IconClock,
  IconHistory,
  IconRefresh,
  IconAlertCircle,
  IconInfoCircle,
} from '@tabler/icons-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { callFunction } from '../lib/api';
import { dbService } from '../services/store';
import Badge from './Badge';
import { showFeedback, friendlyError } from '../lib/feedback';

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

  // ── Fetch data ──────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (isDemo) {
        const allReq = dbService.getPermintaan();
        const kartuList = dbService.getKartu();

        const enrich = (item) => {
          const k = kartuList.find((x) => x.uid_kartu === item.uid_kartu);
          return {
            ...item,
            kartu_rfid: { nama_pemegang: k?.nama_pemegang ?? '' },
          };
        };

        const waiting = allReq.filter((p) => p.status === 'menunggu').map(enrich);
        const history = allReq
          .filter((p) => p.status !== 'menunggu')
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
          }).catch(() => ({ data: [] })),
          callFunction('manage-permintaan', undefined, {
            method: 'GET',
          }).catch(() => ({ data: [] })),
        ]);

        setMenungguList(resWaiting?.data ?? []);
        const nonWaiting = (resHistory?.data ?? []).filter((p) => p.status !== 'menunggu');
        setRiwayatList(nonWaiting);
      }
    } catch (err) {
      console.error('[PersetujuanSekaliPakai] fetch error:', err);
      showFeedback({
        type: 'error',
        title: 'Gagal memuat data permintaan consumable.',
        message: friendlyError(err),
      });
    } finally {
      setLoading(false);
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
        .subscribe();
      return () => supabase.removeChannel(ch);
    } else {
      const handler = () => fetchData();
      window.addEventListener('simlab_storage_updated', handler);
      return () => window.removeEventListener('simlab_storage_updated', handler);
    }
  }, [isDemo, fetchData]);

  // ── Helper ambil stok alat saat buka modal setujui ────────────
  const openSetujuModal = async (req) => {
    setSelectedReq(req);
    setJumlahSetuju('3'); // Default ramah pemakai misal 3 cm
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
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(iso))
      : '—';

  const pendingCount = menungguList.length;

  return (
    <div className="bg-surface border border-main overflow-hidden">
      {/* ── Header Section ── */}
      <div className="px-4 sm:px-5 py-4 border-b border-main bg-amber-50/40">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-amber-100 text-amber-800 shrink-0 mt-0.5">
              <IconPackage size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-main">
                  Persetujuan Alat Sekali Pakai (Consumable)
                </h2>
                {pendingCount > 0 ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-600 text-white animate-pulse">
                    {pendingCount} Menunggu
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                    Semua Beres
                  </span>
                )}
              </div>
              <p className="text-[14px] text-muted mt-0.5">
                Otomatis masuk saat siswa men-tap alat habis pakai (seperti timah solder, kabel, dll.). Petugas dapat menentukan ukuran/jumlah yang disetujui atau membatalkan.
              </p>
            </div>
          </div>

          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 text-muted hover:text-main hover:bg-white rounded-lg transition border border-transparent hover:border-gray-200 self-end sm:self-auto shrink-0"
            title="Muat ulang"
          >
            <IconRefresh size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        {/* ── Tabs Navigation ── */}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-amber-200/60">
          <button
            onClick={() => setActiveTab('menunggu')}
            className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center gap-2 ${
              activeTab === 'menunggu'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-amber-900 hover:bg-amber-100/70'
            }`}
          >
            <IconClock size={16} />
            Menunggu Persetujuan
            {pendingCount > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[11px] font-bold ${
                activeTab === 'menunggu' ? 'bg-white text-amber-700' : 'bg-amber-600 text-white'
              }`}>
                {pendingCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('riwayat')}
            className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center gap-2 ${
              activeTab === 'riwayat'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-amber-900 hover:bg-amber-100/70'
            }`}
          >
            <IconHistory size={16} />
            Riwayat Selesai ({riwayatList.length})
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
                Semua permintaan alat sekali pakai sudah disetujui atau ditolak. Saat siswa men-tap RFID di scanner IoT, permintaan baru akan langsung muncul di sini.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-left">
                    <th className="px-4 py-3 font-semibold text-gray-700">Waktu Tap</th>
                    <th className="px-4 py-3 font-semibold text-gray-700">Kelas / Pemegang</th>
                    <th className="px-4 py-3 font-semibold text-gray-700">Alat Sekali Pakai</th>
                    <th className="px-4 py-3 font-semibold text-gray-700">Satuan</th>
                    <th className="px-4 py-3 font-semibold text-gray-700">Status</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 text-right">Tindakan Petugas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {menungguList.map((req) => (
                    <tr key={req.id} className="hover:bg-amber-50/30 transition-colors">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap font-mono text-xs">
                        {FMT(req.waktu_tap)}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-main block">{req.kelas}</span>
                        {req.kartu_rfid?.nama_pemegang && (
                          <span className="text-xs text-muted block">{req.kartu_rfid.nama_pemegang}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-amber-900">{req.nama_alat}</span>
                        <span className="ml-2 text-[11px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
                          Consumable
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 font-medium">
                        {req.satuan || 'unit'}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-900 border border-amber-300">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                          Menunggu Persetujuan
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => openSetujuModal(req)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-2xs"
                            title="Setujui dan tentukan berapa cm/unit yang diberikan"
                          >
                            <IconCheck size={15} />
                            Setujui
                          </button>
                          <button
                            onClick={() => openTolakModal(req)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 transition"
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
          )}
        </div>
      )}

      {/* ── TAB 2: Riwayat Selesai ── */}
      {activeTab === 'riwayat' && (
        <div>
          {riwayatList.length === 0 ? (
            <div className="p-8 text-center bg-white">
              <p className="text-muted text-sm">Belum ada riwayat persetujuan consumable.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-left">
                    <th className="px-4 py-3 font-semibold text-gray-700">Waktu</th>
                    <th className="px-4 py-3 font-semibold text-gray-700">Kelas</th>
                    <th className="px-4 py-3 font-semibold text-gray-700">Alat</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 text-right">Diberikan</th>
                    <th className="px-4 py-3 font-semibold text-gray-700">Status</th>
                    <th className="px-4 py-3 font-semibold text-gray-700">Petugas</th>
                    <th className="px-4 py-3 font-semibold text-gray-700">Catatan / Alasan</th>
                    <th className="px-4 py-3 font-semibold text-gray-700 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {riwayatList.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-600 text-xs font-mono whitespace-nowrap">
                        {FMT(item.waktu_proses || item.waktu_tap)}
                      </td>
                      <td className="px-4 py-3 font-medium text-main">{item.kelas}</td>
                      <td className="px-4 py-3 text-gray-800">{item.nama_alat}</td>
                      <td className="px-4 py-3 text-right font-bold text-main whitespace-nowrap">
                        {item.status === 'disetujui' ? (
                          <span>
                            {item.jumlah ?? 1} <span className="font-normal text-muted text-xs">{item.satuan || 'unit'}</span>
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {item.status === 'disetujui' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800">
                            Disetujui
                          </span>
                        )}
                        {item.status === 'ditolak' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800">
                            Ditolak
                          </span>
                        )}
                        {item.status === 'dibatalkan' && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-700">
                            Dibatalkan
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 text-xs">{item.petugas || '—'}</td>
                      <td className="px-4 py-3 text-gray-600 text-xs max-w-[200px] truncate">
                        {item.status === 'ditolak' ? item.alasan_tolak : item.catatan || '—'}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {item.status === 'disetujui' ? (
                          <button
                            onClick={() => openBatalModal(item)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-800 hover:underline"
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
          )}
        </div>
      )}

      {/* ── MODAL 1: SETUJUI (Input Jumlah / Berapa cm) ── */}
      {showSetujuModal && selectedReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-600 text-white rounded-xl">
                  <IconCheck size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-emerald-950">Setujui Permintaan Consumable</h3>
                  <p className="text-xs text-emerald-700">Tentukan jumlah atau ukuran yang diberikan ke siswa</p>
                </div>
              </div>
              <button onClick={closeModals} className="text-gray-400 hover:text-gray-600 p-1">
                <IconX size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              {/* Info Card */}
              <div className="grid grid-cols-2 gap-3 p-4 bg-gray-50 border border-gray-200 rounded-xl text-sm">
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

                  {/* Preset Cepat */}
                  <div className="flex items-center gap-1.5 ml-auto">
                    {[1, 2, 3, 5, 10].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setJumlahSetuju(String(num))}
                        className={`px-2.5 py-1.5 text-xs font-bold rounded-lg border transition ${
                          String(num) === jumlahSetuju
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white hover:bg-gray-100 border-gray-300 text-gray-700'
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sisa Stok Warning / Info */}
                {stokAlatInfo && (
                  <div className="mt-2 text-xs flex items-center justify-between text-gray-600">
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
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeModals}
                disabled={processing}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl text-sm font-semibold transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSetujui}
                disabled={processing || !jumlahSetuju || parseInt(jumlahSetuju, 10) <= 0}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition flex items-center gap-2 shadow-xs"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 bg-red-50 border-b border-red-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-red-600 text-white rounded-xl">
                  <IconX size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-red-950">Tolak Permintaan</h3>
                  <p className="text-xs text-red-700">Permintaan ini akan dibatalkan tanpa mengurangi stok</p>
                </div>
              </div>
              <button onClick={closeModals} className="text-gray-400 hover:text-gray-600 p-1">
                <IconX size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
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
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeModals}
                disabled={processing}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl text-sm font-semibold transition"
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={handleTolak}
                disabled={processing || !alasanTolak.trim()}
                className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition flex items-center gap-2 shadow-xs"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-gray-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="px-6 py-4 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-600 text-white rounded-xl">
                  <IconHistory size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-base text-amber-950">Batalkan Persetujuan</h3>
                  <p className="text-xs text-amber-800">Kembalikan stok alat yang telah disetujui</p>
                </div>
              </div>
              <button onClick={closeModals} className="text-gray-400 hover:text-gray-600 p-1">
                <IconX size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
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
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={closeModals}
                disabled={processing}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl text-sm font-semibold transition"
              >
                Tutup
              </button>
              <button
                type="button"
                onClick={handleBatalkanPersetujuan}
                disabled={processing}
                className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition flex items-center gap-2 shadow-xs"
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
