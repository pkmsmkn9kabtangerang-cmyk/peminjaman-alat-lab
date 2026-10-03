// src/pages/SimulasiIotPage.jsx
// Simulator ESP32: kirim payload tap RFID
// Mode Supabase: tap → callRfidTap() ke edge function rfid-tap
// Mode local: tap → dbService.processTap() (localStorage)

import { useState, useEffect, useRef } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { callRfidTap } from '../lib/api';
import { dbService, SESSION_DURATION_SECONDS } from '../services/store';
import { getErrorMessage } from '../lib/handleError';
import Button from '../components/Button';
import Badge from '../components/Badge';
import {
  IconCpu,
  IconWifi,
  IconIdBadge2,
  IconBox,
  IconClock,
  IconLock,
  IconCircleCheck,
  IconAlertTriangle,
  IconPlayerStop,
} from '@tabler/icons-react';

export default function SimulasiIotPage() {
  const [kartuList, setKartuList] = useState([]);
  const [alatList, setAlatList]   = useState([]);
  const [logs, setLogs]           = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [loading, setLoading]     = useState(false);
  const [timeLeft, setTimeLeft]   = useState(0);

  const prevSessionUidRef = useRef(null);

  const loadData = () => {
    setKartuList(dbService.getKartu());
    setAlatList(dbService.getAlatWithStok());
    const sessions = dbService.getActiveSessions();
    const current = sessions.length > 0 ? sessions[0] : null;
    setActiveSession(current);
    return current;
  };

  const addLog = (msg, type = 'info') => {
    setLogs((prev) => [
      { id: Date.now() + Math.random(), time: new Date().toLocaleTimeString('id-ID'), msg, type },
      ...prev,
    ].slice(0, 25));
  };

  useEffect(() => {
    loadData();
    window.addEventListener('simlab_storage_updated', loadData);
    const t = setInterval(loadData, 1000);
    return () => {
      window.removeEventListener('simlab_storage_updated', loadData);
      clearInterval(t);
    };
  }, []);

  // Countdown timer untuk sesi aktif (20 detik)
  useEffect(() => {
    const updateCountdown = () => {
      if (!activeSession) {
        if (prevSessionUidRef.current) {
          addLog('[SYS] Waktu sesi habis (timeout 20s). Slot kartu kini bebas untuk kelas berikutnya.', 'system');
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
        // Otomatis bersihkan sesi ketika waktu habis
        const current = loadData();
        if (!current) {
          addLog('[SYS] Waktu sesi 20s telah berakhir. Slot kartu kembali bebas.', 'system');
          prevSessionUidRef.current = null;
        }
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
        // x-device-key di sini adalah sim-key, hanya untuk testing.
        // Di prod nyata, kunci ada di firmware ESP32 dan di tabel devices.
        res = await callRfidTap(uid, 'web-simulator', import.meta.env.VITE_SIM_DEVICE_KEY ?? 'sim-key');
      } else {
        // ── Mode local: proses via localStorage store ──
        await new Promise((r) => setTimeout(r, 450)); // simulasi latency
        res = dbService.processTap(uid, 'simulator-01');
      }

      if (res.ok) {
        if (res.action === 'selesai') {
          addLog(`[RX] OK Sesi Selesai: ${res.kelas} mengakhiri sesi. Slot kartu kini bebas!`, 'success');
        } else if (res.action === 'mulai') {
          addLog(`[RX] OK Sesi ${res.kelas} aktif (${res.jenis === 'pinjam' ? 'Mode Pinjam' : 'Mode Kembali'}) - Durasi 20 detik`, 'success');
        } else if (res.type === 'alat') {
          addLog(`[RX] OK ${res.jenis === 'pinjam' ? 'Pinjam' : 'Kembali'} "${res.alat}" (${res.kelas}) - Sesi di-reset ke 20s`, 'success');
        } else {
          addLog(`[RX] OK ${res.jenis ?? ''} ${res.alat || res.kelas || ''}`, 'success');
        }
      } else {
        if (res.error === 'sesi_kartu_lain_aktif') {
          const activeName = res.activeCard?.kelas || res.activeCard?.uid_kartu || 'lain';
          addLog(
            `[RX] TOLAK: Kartu ${label} tidak bisa tap! Sesi ${activeName} sedang aktif. Tunggu selesai atau habis (20s).`,
            'error'
          );
        } else if (res.error === 'kartu_nonaktif') {
          addLog(`[RX] TOLAK: Kartu ${label} tidak aktif / diblokir.`, 'error');
        } else if (res.error === 'sesi_tidak_ada') {
          addLog(`[RX] TOLAK: Belum ada kartu yang di-tap atau sesi sudah habis (20 detik).`, 'error');
        } else if (res.error === 'stok_habis') {
          addLog(`[RX] TOLAK: Stok alat "${label}" habis.`, 'error');
        } else if (res.error === 'uid_tidak_dikenal') {
          addLog(`[RX] TOLAK: UID "${uid}" belum terdaftar di sistem.`, 'error');
        } else {
          addLog(`[RX] TOLAK: ${res.message || getErrorMessage(res.error)}`, 'error');
        }
      }
    } catch (err) {
      console.error('[SimulasiKartu] handleTap error:', err);
      if (err?.error === 'sesi_tidak_ada') {
        addLog(`[RX] TOLAK: Belum ada sesi kartu aktif.`, 'error');
      } else if (err?.error === 'stok_habis') {
        addLog(`[RX] TOLAK: Stok alat habis.`, 'error');
      } else if (err?.error === 'kartu_nonaktif') {
        addLog(`[RX] TOLAK: Kartu diblokir.`, 'error');
      } else {
        addLog(`[RX] ERROR: ${err?.message || String(err)}`, 'error');
      }
    } finally {
      loadData();
      setLoading(false);
    }
  };

  const handleEndSessionDirectly = () => {
    if (!activeSession) return;
    handleTap(activeSession.uid_kartu, activeSession.kelas || activeSession.uid_kartu);
  };

  const maxDuration = SESSION_DURATION_SECONDS || 20;
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
            Uji coba alur tap kartu RFID dan stiker alat. Sesi dibatasi 20 detik dan mengunci akses untuk kelas lain selama sesi aktif.
          </p>
        </div>
        <div className={`inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full border self-start sm:self-auto shadow-xs ${
          isSupabaseConfigured
            ? 'bg-blue-50 text-blue-700 border-blue-200'
            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
        }`}>
          <IconWifi size={14} className="animate-pulse" />
          {isSupabaseConfigured ? 'ESP32 → Edge Function (Prod)' : 'ESP32 → Local Store (Demo)'}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel Kiri: Daftar Kartu & Alat untuk di-tap */}
        <div className="lg:col-span-2 space-y-5">
          {/* Section 1: Tap Kartu Kelas */}
          <div className="bg-surface rounded-xl border border-main p-5 shadow-xs">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-main text-sm flex items-center gap-2">
                <IconIdBadge2 size={18} className="text-blue-600" />
                1. Tap Kartu Kelas
              </h3>
              <span className="text-[11px] text-muted font-mono">
                {activeSession ? 'Status: 1 Sesi Aktif' : 'Status: Siap / Bebas'}
              </span>
            </div>
            <p className="text-xs text-muted mb-4">
              Tap kartu kelas untuk membuka sesi (20 detik). Jika User 1 sedang aktif, User 2 yang men-tap akan ditolak sampai User 1 selesai men-tap kembali atau waktu habis.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                          Tap untuk mulai (20s)
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section 2: Tap Sticker Alat Lab */}
          <div className="bg-surface rounded-xl border border-main p-5 shadow-xs">
            <div className="flex items-center justify-between mb-2">
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
                ? `Alat yang di-tap otomatis dipinjam/dikembalikan atas nama ${activeSession.kelas}. Setiap tap alat akan mereset waktu sesi kembali ke 20 detik.`
                : 'Tap alat saat sesi belum aktif akan ditolak sistem (membutuhkan otentikasi kartu terlebih dahulu).'}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {alatList.map((a) => (
                <button
                  key={a.uid_rfid}
                  disabled={loading}
                  onClick={() => handleTap(a.uid_rfid, a.nama, 'alat')}
                  className="text-left p-3.5 rounded-xl border border-main hover:bg-purple-50 hover:border-purple-300 transition group disabled:opacity-50 flex flex-col justify-between"
                >
                  <div>
                    <p className="font-semibold text-main text-xs group-hover:text-purple-700 leading-tight mb-1">
                      {a.nama}
                    </p>
                    <p className="text-[10px] font-mono text-muted">{a.uid_rfid}</p>
                  </div>
                  <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between text-[11px]">
                    <span className="font-medium text-muted">Stok:</span>
                    <span className={`font-bold ${a.stok_tersedia > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {a.stok_tersedia} / {a.jumlah_total}
                    </span>
                  </div>
                </button>
              ))}
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
                    <Badge status={activeSession.jenis} />
                  </div>
                  <p className="text-[11px] font-mono text-blue-700/80 mt-0.5">
                    UID: {activeSession.uid_kartu}
                  </p>
                </div>

                {/* Progress bar countdown 20s */}
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
                        timeLeft > 10 ? 'bg-emerald-500' : timeLeft > 5 ? 'bg-amber-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>

                <div className="bg-white/80 border border-blue-100 rounded-lg p-2.5 text-[11px] text-blue-900 leading-relaxed">
                  <p className="font-semibold text-blue-950 flex items-center gap-1 mb-1">
                    <IconLock size={12} className="text-blue-600" /> Akses Terkunci:
                  </p>
                  User lain tidak dapat men-tap kartu sampai sesi ini diakhiri atau waktu 20s habis.
                </div>

                <button
                  type="button"
                  onClick={handleEndSessionDirectly}
                  className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition"
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
                <p className="text-xs font-medium text-gray-700">Slot Kartu Bebas</p>
                <p className="text-[11px] text-muted mt-1 leading-relaxed">
                  Silakan tap salah satu kartu kelas di sebelah kiri untuk membuka sesi baru (durasi 20 detik).
                </p>
              </div>
            )}
          </div>

          {/* Serial Monitor ESP32 */}
          <div className="flex-1 bg-gray-900 rounded-xl border border-gray-800 p-4 shadow-sm flex flex-col min-h-[340px]">
            <div className="font-mono text-gray-400 text-xs mb-3 flex items-center justify-between pb-2 border-b border-gray-800">
              <span className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                ESP32_Serial_Monitor
              </span>
              <button
                onClick={() => setLogs([])}
                className="text-gray-400 hover:text-gray-200 text-[10px] px-2 py-0.5 rounded bg-gray-800 hover:bg-gray-700 transition"
              >
                Clear
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 font-mono text-[11px] max-h-[380px] pr-1">
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
