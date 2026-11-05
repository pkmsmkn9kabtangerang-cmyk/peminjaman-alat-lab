// src/pages/SimulasiIotPage.jsx
// Simulator ESP32: kirim payload tap RFID
// Mode Supabase: tap → callRfidTap() ke edge function rfid-tap
// Mode local: tap → dbService.processTap() (localStorage)

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { callRfidTap } from '../lib/api';
import { dbService, SESSION_DURATION_SECONDS } from '../services/store';
import { getErrorMessage } from '../lib/handleError';
import Badge from '../components/Badge';
import {
  IconCpu,
  IconWifi,
  IconIdBadge2,
  IconBox,
  IconClock,
  IconLock,
  IconPlayerStop,
} from '@tabler/icons-react';

// Tampilkan durasi yang benar-benar dikirim backend. Konstanta lokal hanya
// dipakai sebagai fallback untuk mode demo atau respons lama.
const sessionSeconds = (res) => {
  const value = Number(res?.session?.expires_in_seconds);
  return Number.isFinite(value) && value > 0 ? value : SESSION_DURATION_SECONDS;
};

export default function SimulasiIotPage() {
  const [kartuList, setKartuList] = useState([]);
  const [alatList, setAlatList]   = useState([]);
  const [logs, setLogs]           = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [loading, setLoading]     = useState(false);
  const [timeLeft, setTimeLeft]   = useState(0);

  const prevSessionUidRef = useRef(null);

  const applySession = useCallback((session) => {
    if (!session?.uid_kartu) {
      setActiveSession(null);
      return null;
    }

    // Utamakan sisa detik dari database agar countdown tidak terpengaruh
    // jam perangkat pengguna. `expires_at` tetap dipakai sebagai fallback.
    const rawRemaining = session.expires_in_seconds;
    const hasRemaining =
      rawRemaining !== null &&
      rawRemaining !== undefined &&
      rawRemaining !== '' &&
      Number.isFinite(Number(rawRemaining));

    if (!hasRemaining) {
      // Respons lama hanya mengirim expires_at. Timer bisa terlihat lebih
      // pendek karena jam browser berbeda dengan jam database, jadi catat
      // penyebabnya agar deployment backend yang tertinggal mudah terlihat.
      console.warn(
        '[SimulasiKartu] session.expires_in_seconds tidak ada; memakai expires_at. ' +
          'Pastikan Edge Function rfid-tap dan migration RPC terbaru sudah diterapkan.'
      );
    }

    const expires = hasRemaining
      ? new Date(Date.now() + Math.max(0, Number(rawRemaining)) * 1000)
      : new Date(session.expires_at);

    if (Number.isNaN(expires.getTime()) || expires.getTime() <= Date.now()) {
      setActiveSession(null);
      return null;
    }
    const next = {
      uid_kartu: session.uid_kartu,
      kelas: session.kelas || '',
      nama_pemegang: session.nama_pemegang || null,
      expires,
    };
    setActiveSession(next);
    return next;
  }, []);

  // Sesi backend adalah sumber kebenaran. `session: null` dari respons
  // penolakan belum tentu berarti sesi berakhir (mis. tag tidak dikenal),
  // jadi hanya kode tertentu yang boleh membersihkan tampilan sesi.
  const syncSessionFromResponse = useCallback((res) => {
    if (res?.session?.uid_kartu) {
      applySession(res.session);
      return;
    }
    if (['sesi_selesai', 'sesi_tidak_aktif'].includes(res?.code)) {
      setActiveSession(null);
    }
  }, [applySession]);

  const loadData = useCallback(async () => {
    if (isSupabaseConfigured) {
      // Simulator web membaca katalog nyata dari database. Status sesi
      // diperbarui dari respons backend pada setiap tap.
      const [kartuRes, alatRes] = await Promise.all([
        supabase
          .from('kartu_rfid')
          .select('uid_kartu, kelas, nama_pemegang, aktif')
          .order('kelas'),
        supabase
          .from('v_list_barang')
          .select('id, kode, nama, tipe, jumlah_total, stok_tersedia, satuan')
          .order('nama'),
      ]);
      if (kartuRes.error) throw kartuRes.error;
      if (alatRes.error) throw alatRes.error;
      setKartuList(kartuRes.data ?? []);
      setAlatList(alatRes.data ?? []);
      return null;
    }

    setKartuList(dbService.getKartu());
    setAlatList(dbService.getAlatWithStok());
    const sessions = dbService.getActiveSessions();
    const current = sessions.length > 0 ? sessions[0] : null;
    setActiveSession(current);
    return current;
  }, []);

  const addLog = (msg, type = 'info') => {
    setLogs((prev) => [
      { id: Date.now() + Math.random(), time: new Date().toLocaleTimeString('id-ID'), msg, type },
      ...prev,
    ].slice(0, 25));
  };

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        await loadData();
      } catch (err) {
        if (!cancelled) {
          console.warn('[SimulasiKartu] gagal memuat data:', err?.message || err);
        }
      }
    };

    run();

    // Polling hanya untuk mode lokal (localStorage). Mode Supabase
    // memakai data dari database dan diperbarui setelah setiap tap.
    if (!isSupabaseConfigured) {
      window.addEventListener('simlab_storage_updated', run);
      const t = setInterval(run, 1000);
      return () => {
        cancelled = true;
        window.removeEventListener('simlab_storage_updated', run);
        clearInterval(t);
      };
    }

    return () => {
      cancelled = true;
    };
  }, [loadData]);

  // Countdown timer untuk sesi aktif (20 detik)
  useEffect(() => {
    const updateCountdown = () => {
      if (!activeSession) {
        if (prevSessionUidRef.current) {
          addLog(`[SYS] Waktu sesi habis (timeout ${SESSION_DURATION_SECONDS}s). Slot kartu kini bebas untuk kelas berikutnya.`, 'system');
          prevSessionUidRef.current = null;
        }
        setTimeLeft(0);
        return;
      }

      prevSessionUidRef.current = activeSession.uid_kartu;
      const exp = new Date(activeSession.expires).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.ceil((exp - now) / 1000));
      setTimeLeft(diff);

      if (diff === 0) {
        // Sesi backend sudah kedaluwarsa; jangan tampilkan sesi lama.
        setActiveSession(null);
        addLog(`[SYS] Waktu sesi ${SESSION_DURATION_SECONDS}s telah berakhir. Slot kartu kembali bebas.`, 'system');
        prevSessionUidRef.current = null;
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 250);
    return () => clearInterval(timer);
  }, [activeSession]);

  const handleTap = async (uid, label) => {
    if (loading) return;
    setLoading(true);
    const modeLabel = isSupabaseConfigured ? '[PROD→EdgeFn]' : '[LOCAL→Store]';
    addLog(`[TX] ${modeLabel} Mengirim UID: ${uid} (${label})`, 'tx');

    try {
      let res;

      if (isSupabaseConfigured) {
        // ── Mode Supabase: kirim ke edge function rfid-tap ──
        // Simulator memakai pasangan kredensial terpisah dari hardware.
        res = await callRfidTap(
          uid,
          import.meta.env.VITE_SIM_DEVICE_ID,
          import.meta.env.VITE_SIM_DEVICE_KEY
        );
      } else {
        // ── Mode local: proses via localStorage store ──
        await new Promise((r) => setTimeout(r, 450)); // simulasi latency
        res = dbService.processTap(uid);
      }

      // Kontrak backend: { success, code, action, message, alat, kelas, session }.
      // HTTP 200 tidak berarti berhasil; `success` yang menentukan.
      syncSessionFromResponse(res);

      // Kartu nonaktif: hapus tampilan sesi hanya jika kartu itu pemilik
      // sesi, atau jika penolakan berasal dari tap alat (backend sudah
      // menghapus sesi milik kartu tersebut).
      if (res.code === 'kartu_nonaktif' && (res.alat || activeSession?.uid_kartu === uid)) {
        setActiveSession(null);
      }

      const alatName = res.alat?.nama || label;

      if (res.success) {
        if (res.code === 'sesi_dimulai') {
          addLog(`[RX] OK Sesi ${res.kelas} aktif - Durasi ${sessionSeconds(res)} detik`, 'success');
        } else if (res.code === 'sesi_selesai') {
          addLog(`[RX] OK Sesi Selesai: ${res.kelas} mengakhiri sesi. Slot kartu kini bebas!`, 'success');
        } else if (res.code === 'dipinjam') {
          addLog(`[RX] OK Pinjam "${alatName}" (${res.kelas}) - Sesi di-reset ke ${sessionSeconds(res)}s`, 'success');
        } else if (res.code === 'dikembalikan') {
          addLog(`[RX] OK Kembali "${alatName}" (${res.kelas}) - Sesi di-reset ke ${sessionSeconds(res)}s`, 'success');
        } else if (res.code === 'menunggu_persetujuan') {
          addLog(
            `[RX] Consumable "${alatName}" (${res.kelas}) dicatat! Menunggu persetujuan petugas di Dashboard.`,
            'success'
          );
        } else {
          addLog(`[RX] OK ${res.message || alatName}`, 'success');
        }
      } else {
        if (res.code === 'permintaan_sudah_ada') {
          addLog(
            `[RX] PERINGATAN: Permintaan alat consumable "${alatName}" sudah tercatat dan sedang menunggu persetujuan di Dashboard.`,
            'error'
          );
        } else if (res.code === 'sesi_kartu_lain_aktif') {
          const activeName = res.session?.kelas || res.session?.nama_pemegang || res.session?.uid_kartu || 'lain';
          addLog(
            `[RX] TOLAK: Kartu ${label} tidak bisa tap! Sesi ${activeName} sedang aktif. Tunggu selesai atau habis (${sessionSeconds(res)}s).`,
            'error'
          );
        } else if (res.code === 'kartu_nonaktif') {
          addLog(`[RX] TOLAK: Kartu ${label} tidak aktif / diblokir.`, 'error');
        } else if (res.code === 'sesi_tidak_aktif') {
          addLog(`[RX] TOLAK: Belum ada kartu yang di-tap atau sesi sudah habis (${SESSION_DURATION_SECONDS} detik).`, 'error');
        } else if (res.code === 'stok_habis') {
          addLog(`[RX] TOLAK: Stok alat "${alatName}" habis.`, 'error');
        } else if (res.code === 'sedang_dipinjam') {
          const peminjam = res.peminjam_kelas ? ` oleh ${res.peminjam_kelas}` : '';
          addLog(`[RX] TOLAK: Alat "${alatName}" sedang dipinjam${peminjam}.`, 'error');
        } else if (res.code === 'tap_duplikat') {
          addLog(
            `[RX] TOLAK: "${alatName}" sudah diproses pada sesi ini. Akhiri sesi lalu mulai sesi baru.`,
            'error'
          );
        } else if (res.code === 'tag_tidak_dikenal') {
          addLog(`[RX] TOLAK: UID "${uid}" belum terdaftar di sistem.`, 'error');
        } else if (res.code === 'migration_belum_diterapkan') {
          addLog('[RX] ERROR: RPC process_rfid_tap belum ada. Terapkan migration 012.', 'error');
        } else {
          addLog(`[RX] TOLAK: ${res.message || getErrorMessage(res.code)}`, 'error');
        }
      }
    } catch (err) {
      console.error('[SimulasiKartu] handleTap error:', err);
      const code = err?.code;
      if (code === 'respons_invalid') {
        addLog(`[RX] ERROR: Respons server tidak valid. ${err?.message || ''}`.trim(), 'error');
      } else if (code === 'koneksi_gagal') {
        addLog(`[RX] ERROR: Koneksi ke server gagal. Periksa jaringan lalu coba lagi.`, 'error');
      } else if (code === 'migration_belum_diterapkan') {
        addLog('[RX] ERROR: RPC process_rfid_tap belum ada. Terapkan migration 012.', 'error');
      } else {
        addLog(`[RX] ERROR: ${err?.message || getErrorMessage(code)}`, 'error');
      }
    } finally {
      try {
        await loadData();
      } catch (err) {
        console.warn('[SimulasiKartu] gagal memuat katalog:', err?.message || err);
      }
      setLoading(false);
    }
  };

  const handleEndSessionDirectly = () => {
    if (!activeSession) return;
    handleTap(activeSession.uid_kartu, activeSession.kelas || activeSession.uid_kartu);
  };

  const maxDuration = SESSION_DURATION_SECONDS;
  const progressPercent = Math.min(100, Math.max(0, (timeLeft / maxDuration) * 100));

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header Halaman */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-main flex items-center gap-2">
            <IconCpu size={20} className="text-emerald-600" />
            Simulator Perangkat IoT (ESP32 RFID)
          </h2>
          <p className="text-xs text-muted">
            Uji coba alur tap kartu RFID dan stiker alat. Sesi dibatasi {SESSION_DURATION_SECONDS} detik dan mengunci akses untuk kelas lain selama sesi aktif.
          </p>
        </div>
        <div className={`inline-flex items-center gap-2 self-stretch rounded-full border px-3 py-1.5 text-xs font-semibold shadow-sm sm:self-auto ${
          isSupabaseConfigured
            ? 'border-blue-200 bg-blue-50 text-blue-700'
            : 'border-emerald-200 bg-emerald-50 text-emerald-700'
        }`}>
          <IconWifi size={14} className="animate-pulse" />
          {isSupabaseConfigured ? 'ESP32 → Edge Function (Prod)' : 'ESP32 → Local Store (Demo)'}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel Kiri: Daftar Kartu & Alat untuk di-tap */}
        <div className="lg:col-span-2 space-y-5">
          {/* Section 1: Tap Kartu Kelas */}
          <div className="bg-surface rounded-xl border border-main p-4 shadow-sm sm:p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-main text-sm flex items-center gap-2">
                <IconIdBadge2 size={18} className="text-blue-600" />
                1. Tap Kartu Kelas
              </h3>
              <span className="text-[11px] text-muted font-mono">
                {activeSession
                  ? 'Status: 1 Sesi Aktif'
                  : isSupabaseConfigured
                  ? 'Status: Menunggu Tap'
                  : 'Status: Siap / Bebas'}
              </span>
            </div>
            <p className="text-xs text-muted mb-4">
              Tap kartu kelas untuk membuka sesi ({SESSION_DURATION_SECONDS} detik). Jika User 1 sedang aktif, User 2 yang men-tap akan ditolak sampai User 1 selesai men-tap kembali atau waktu habis.
            </p>

            <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
              {kartuList.map((k) => {
                const isActive = activeSession && activeSession.uid_kartu === k.uid_kartu;
                const isBlocked = activeSession && activeSession.uid_kartu !== k.uid_kartu;

                return (
                  <button
                    key={k.uid_kartu}
                    disabled={loading}
                    onClick={() => handleTap(k.uid_kartu, k.kelas, 'kartu')}
                    className={`text-left p-3.5 rounded-xl border transition relative flex flex-col justify-between ${
                      isActive
                        ? 'border-blue-500 bg-blue-50/70 ring-2 ring-blue-400/40 shadow-xs'
                        : isBlocked
                        ? 'border-amber-200 bg-amber-50/30 hover:bg-amber-50 hover:border-amber-300'
                        : 'border-main hover:bg-blue-50/50 hover:border-blue-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1.5">
                        <span className={`font-semibold text-sm ${isActive ? 'text-blue-800' : 'text-main'}`}>
                          {k.kelas}
                        </span>
                        {isActive ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white animate-pulse">
                            <span className="w-1.5 h-1.5 rounded-full bg-white" />
                            Sesi Aktif ({timeLeft}s)
                          </span>
                        ) : isBlocked ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800 border border-amber-200">
                            <IconLock size={10} />
                            Terkunci
                          </span>
                        ) : (
                          <Badge status={k.aktif ? 'aktif' : 'nonaktif'} />
                        )}
                      </div>
                      <p className="text-[11px] font-mono text-muted">{k.uid_kartu}</p>
                    </div>

                    <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px]">
                      {isActive ? (
                        <span className="text-blue-700 font-semibold flex items-center gap-1">
                          <IconPlayerStop size={13} />
                          Tap lagi untuk selesai
                        </span>
                      ) : isBlocked ? (
                        <span className="text-amber-700 font-medium flex items-center gap-1">
                          <IconLock size={12} />
                          Tunggu {activeSession?.kelas || 'User 1'} selesai
                        </span>
                      ) : (
                        <span className="text-muted group-hover:text-blue-600">
                          Tap untuk mulai ({SESSION_DURATION_SECONDS}s)
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Tap Sticker Alat Lab */}
          <div className="bg-surface rounded-xl border border-main p-4 shadow-sm sm:p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold text-main text-sm flex items-center gap-2">
                <IconBox size={18} className="text-purple-600" />
                2. Tap Sticker Alat Lab
              </h3>
              {activeSession ? (
                <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                  Untuk: {activeSession.kelas}
                </span>
              ) : (
                <span className="text-xs text-muted">Perlu tap kartu dulu</span>
              )}
            </div>
            <p className="text-xs text-muted mb-4">
              {activeSession
                ? `Alat yang di-tap otomatis dipinjam/dikembalikan atas nama ${activeSession.kelas}. Setiap tap alat akan mereset waktu sesi kembali ke ${SESSION_DURATION_SECONDS} detik.`
                : 'Tap alat saat sesi belum aktif akan ditolak sistem (membutuhkan otentikasi kartu terlebih dahulu).'}
            </p>

            <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2">
              {alatList.map((a) => {
                const uid = a.kode;
                return (
                  <button
                    key={a.id || uid}
                    disabled={loading || !uid}
                    onClick={() => handleTap(uid, a.nama, 'alat')}
                    className="group flex flex-col justify-between rounded-xl border border-main p-3.5 text-left transition hover:border-purple-300 hover:bg-purple-50 disabled:opacity-50"
                  >
                    <div>
                      <div className="mb-1 flex items-start justify-between gap-1">
                        <p className="text-xs font-semibold leading-tight text-main group-hover:text-purple-700">
                          {a.nama}
                        </p>
                        {a.tipe === 'habis_pakai' && (
                          <span className="shrink-0 rounded border border-amber-200 bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-800">
                            Consumable
                          </span>
                        )}
                      </div>
                      <p className="break-all font-mono text-[10px] text-muted">{uid || 'UID belum tersedia'}</p>
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2 text-[11px]">
                      <span className="font-medium text-muted">Stok:</span>
                      <span className={`font-bold ${a.stok_tersedia > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {a.stok_tersedia} {a.satuan ? `${a.satuan}` : ''} / {a.jumlah_total}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Panel Kanan: Status Sesi & Serial Monitor */}
        <div className="space-y-4 flex flex-col">
          {/* Status Sesi Aktif */}
          <div
            className={`p-4 rounded-xl border shadow-xs transition-all ${
              activeSession
                ? 'bg-gradient-to-br from-blue-50/90 to-indigo-50/60 border-blue-300'
                : 'bg-surface border-main'
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-main text-xs uppercase tracking-wider flex items-center gap-1.5">
                <IconClock size={15} className={activeSession ? 'text-blue-600' : 'text-gray-400'} />
                Status Sesi Kartu
              </h3>
              {activeSession ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                  {timeLeft} detik
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
                  Standby
                </span>
              )}
            </div>

            {activeSession ? (
              <div className="space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <p className="text-base font-extrabold text-blue-900 leading-tight">
                      {activeSession.kelas || activeSession.uid_kartu}
                    </p>
                    <Badge status="aktif" />
                  </div>
                  <p className="text-[11px] font-mono text-blue-700/80 mt-0.5">
                    UID: {activeSession.uid_kartu}
                  </p>
                </div>

                {/* Progress bar countdown sesi */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-blue-800 font-semibold flex items-center gap-1">
                      <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                      Sesi berlangsung
                    </span>
                    <span className="font-mono font-bold text-blue-900">{timeLeft}s tersisa</span>
                  </div>
                  <div className="w-full bg-blue-200/60 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${
                        timeLeft > maxDuration / 2
                          ? 'bg-emerald-500'
                          : timeLeft > maxDuration / 4
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                <div className="bg-white/80 border border-blue-100 rounded-lg p-2.5 text-[11px] text-blue-900 leading-relaxed">
                  <p className="font-semibold text-blue-950 flex items-center gap-1 mb-1">
                    <IconLock size={12} className="text-blue-600" /> Akses Terkunci:
                  </p>
                  User lain tidak dapat men-tap kartu sampai sesi ini diakhiri atau waktu {SESSION_DURATION_SECONDS}s habis.
                </div>

                <button
                  type="button"
                  onClick={handleEndSessionDirectly}
                  className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-blue-700"
                >
                  <IconPlayerStop size={14} />
                  Akhiri Sesi (Buka Kunci)
                </button>
              </div>
            ) : (
              <div className="py-2 text-center text-muted">
                <div className="inline-flex p-2 rounded-full bg-gray-100 text-gray-400 mb-2">
                  <IconIdBadge2 size={24} />
                </div>
                <p className="text-xs font-medium text-gray-700">
                  {isSupabaseConfigured ? 'Belum Ada Tap / Sesi Tidak Aktif' : 'Slot Kartu Bebas'}
                </p>
                <p className="text-[11px] text-muted mt-1 leading-relaxed">
                  {isSupabaseConfigured
                    ? 'Status sesi diperbarui dari respons backend setiap kali tap. Tap kartu kelas untuk membuka sesi baru.'
                    : `Silakan tap salah satu kartu kelas di sebelah kiri untuk membuka sesi baru (durasi ${SESSION_DURATION_SECONDS} detik).`}
                </p>
              </div>
            )}
          </div>

          {/* Serial Monitor ESP32 */}
          <div className="flex min-h-[280px] flex-1 flex-col rounded-xl border border-gray-800 bg-gray-900 p-4 shadow-sm sm:min-h-[340px]">
            <div className="font-mono text-gray-400 text-xs mb-3 flex items-center justify-between pb-2 border-b border-gray-800">
              <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                ESP32_Serial_Monitor
              </span>
              <button
                type="button"
                onClick={() => setLogs([])}
                className="flex min-h-9 items-center rounded-md bg-gray-800 px-2.5 text-[10px] font-semibold text-gray-300 transition hover:bg-gray-700 hover:text-gray-100"
              >
                Clear
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 font-mono text-[11px] max-h-[45dvh] lg:max-h-[380px] pr-1">
              {logs.length === 0 && (
                <p className="text-gray-600 italic py-4 text-center">Menunggu aktivitas tap...</p>
              )}
              {logs.map((l) => (
                <div key={l.id} className="flex gap-2 items-start leading-relaxed">
                  <span className="text-gray-500 text-[10px] shrink-0 font-mono mt-0.5">[{l.time}]</span>
                  <span
                    className={`break-words ${
                      l.type === 'tx'
                        ? 'text-cyan-400'
                        : l.type === 'success'
                        ? 'text-emerald-400 font-medium'
                        : l.type === 'error'
                        ? 'text-rose-400 font-medium'
                        : l.type === 'system'
                        ? 'text-amber-400'
                        : 'text-gray-300'
                    }`}
                  >
                    {l.msg}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
