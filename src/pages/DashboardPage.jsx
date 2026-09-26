// src/pages/DashboardPage.jsx
// Dashboard: greeting, stat cards, Bar+Area chart Recharts, dan fitur "Sedang Dipinjam" realtime

import { useState, useEffect, useMemo, useCallback } from 'react';
import { dbService } from '../services/store';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import StatCard from '../components/StatCard';
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  IconBox, IconClock, IconCheck, IconArrowRight,
  IconIdBadge2, IconCircleCheck, IconLayersLinked,
} from '@tabler/icons-react';

const FORMAT_DATE = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

// Format durasi relatif yang dinamis ("12 menit lalu", "1 jam 5 mnt lalu", "Baru saja")
function formatDuration(waktu_pinjam) {
  if (!waktu_pinjam) return '—';
  const diffMs = Date.now() - new Date(waktu_pinjam).getTime();
  const minutes = Math.max(0, Math.floor(diffMs / 60000));
  if (minutes < 1) return 'Baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  if (hours < 24) {
    return remainingMins > 0 ? `${hours} jam ${remainingMins} mnt lalu` : `${hours} jam lalu`;
  }
  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}

// Helper untuk mengelompokkan baris v_pinjaman_aktif per kartu di client
function groupPinjamanByKartu(rows) {
  if (!Array.isArray(rows)) return [];
  const map = new Map();

  for (const r of rows) {
    if (r.status !== 'dipinjam') continue;
    const uid = r.uid_kartu;
    if (!uid) continue;

    if (!map.has(uid)) {
      map.set(uid, {
        uid_kartu: uid,
        kelas: r.kelas || '—',
        nama_pemegang: r.nama_pemegang || null,
        items: [],
      });
    }

    const group = map.get(uid);
    const trxId = r.transaksi_id || r.id;
    const exists = group.items.some((it) => (it.transaksi_id || it.id) === trxId);

    if (!exists) {
      group.items.push({
        id: trxId,
        transaksi_id: trxId,
        alat_id: r.alat_id,
        alat_nama: r.alat_nama || r.nama_alat || 'Alat Lab',
        waktu_pinjam: r.waktu_pinjam,
        kondisi_pinjam: r.kondisi_pinjam || 'baik',
      });
    }
  }

  // Filter HANYA kartu yang memiliki item aktif
  return Array.from(map.values()).filter((g) => g.items.length > 0);
}

// Module-level cache untuk retensi data saat berpindah tab agar langsung tampil 0ms
let activeCardsCache = null;

export default function DashboardPage({ setCurrentTab, user }) {
  const [alat, setAlat]           = useState(() => dbService.getAlatWithStok());
  const [transaksi, setTransaksi] = useState(() => dbService.getTransaksi());
  const [tapLog, setTapLog]       = useState(() => dbService.getTapLog());
  const [chartDays, setChartDays] = useState(7);

  // State untuk fitur "Sedang Dipinjam":
  // Di-load INSTAN (0ms) secara sinkron dari cache memory / local store
  const [activeCards, setActiveCards] = useState(() => {
    if (activeCardsCache !== null) return activeCardsCache;
    const initial = groupPinjamanByKartu(dbService.getPinjamanAktif());
    activeCardsCache = initial;
    return initial;
  });
  const [tick, setTick] = useState(0); // Trigger re-render durasi tiap 30s

  const reload = () => {
    setAlat(dbService.getAlatWithStok());
    setTransaksi(dbService.getTransaksi());
    setTapLog(dbService.getTapLog());
  };

  // Muat data awal pinjaman aktif dari view v_pinjaman_aktif (Supabase / local fallback)
  const fetchActiveLoans = useCallback(async () => {
    // 1. Sinkronkan dengan local store langsung (0ms)
    const localGrouped = groupPinjamanByKartu(dbService.getPinjamanAktif());
    setActiveCards(localGrouped);
    activeCardsCache = localGrouped;

    // 2. Jika Supabase tidak dikonfigurasi nyata (placeholder URL), lewati fetch agar tidak menggantung
    if (!isSupabaseConfigured) return;

    try {
      // Pasang timeout 1000ms (1 detik) maksimal agar responsif
      const queryPromise = supabase.from('v_pinjaman_aktif').select('*');
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Supabase fetch timeout')), 1000)
      );

      const res = await Promise.race([queryPromise, timeoutPromise]);
      if (res && !res.error && Array.isArray(res.data)) {
        const grouped = groupPinjamanByKartu(res.data);
        setActiveCards(grouped);
        activeCardsCache = grouped;
      }
    } catch {
      // Jika timeout atau offline, data lokal sudah aktif dan tampil
    }
  }, []);

  // Realtime Handler: INSERT transaksi baru (status = 'dipinjam')
  const handleRealtimeInsert = useCallback((newTrx) => {
    if (newTrx.status !== 'dipinjam') return;
    const uid = newTrx.uid_kartu;
    if (!uid) return;

    setActiveCards((prevCards) => {
      const trxId = newTrx.id;

      // Cegah duplikasi jika event Realtime masuk lebih dari sekali
      const isAlreadyListed = prevCards.some((c) =>
        c.items.some((it) => (it.transaksi_id || it.id) === trxId)
      );
      if (isAlreadyListed) return prevCards;

      const kartuData = dbService.getKartu().find((k) => k.uid_kartu === uid);
      const alatData  = dbService.getAlat().find((a) => a.id === newTrx.alat_id);

      const newItem = {
        id: trxId,
        transaksi_id: trxId,
        alat_id: newTrx.alat_id,
        alat_nama: newTrx.nama_alat || alatData?.nama || 'Alat Lab',
        waktu_pinjam: newTrx.waktu_pinjam || new Date().toISOString(),
        kondisi_pinjam: newTrx.kondisi_pinjam || 'baik',
      };

      const cardIndex = prevCards.findIndex((c) => c.uid_kartu === uid);
      let nextCards;

      if (cardIndex >= 0) {
        const card = prevCards[cardIndex];
        nextCards = [...prevCards];
        nextCards[cardIndex] = {
          ...card,
          items: [newItem, ...card.items],
        };
      } else {
        // Buat card baru untuk kartu ini
        const newCard = {
          uid_kartu: uid,
          kelas: newTrx.kelas || kartuData?.kelas || '—',
          nama_pemegang: kartuData?.nama_pemegang || null,
          items: [newItem],
        };
        nextCards = [newCard, ...prevCards];
      }

      activeCardsCache = nextCards;
      return nextCards;
    });
  }, []);

  // Realtime Handler: UPDATE transaksi (misal status jadi 'dikembalikan')
  const handleRealtimeUpdate = useCallback((updatedTrx) => {
    const trxId = updatedTrx.id;

    setActiveCards((prevCards) => {
      let nextCards;

      if (updatedTrx.status === 'dikembalikan') {
        // Hapus item dari grup kartu terkait
        nextCards = prevCards
          .map((card) => {
            const hasItem = card.items.some((it) => (it.transaksi_id || it.id) === trxId);
            if (!hasItem) return card;
            return {
              ...card,
              items: card.items.filter((it) => (it.transaksi_id || it.id) !== trxId),
            };
          })
          // Hapus card kartu jika semua item pinjamannya sudah dikembalikan (items kosong)
          .filter((card) => card.items.length > 0);
      } else if (updatedTrx.status === 'dipinjam') {
        // Update informasi item jika masih berstatus dipinjam
        let itemUpdated = false;
        nextCards = prevCards.map((card) => {
          const hasItem = card.items.some((it) => (it.transaksi_id || it.id) === trxId);
          if (!hasItem) return card;
          itemUpdated = true;
          return {
            ...card,
            items: card.items.map((it) =>
              (it.transaksi_id || it.id) === trxId
                ? {
                    ...it,
                    alat_nama: updatedTrx.nama_alat || it.alat_nama,
                    waktu_pinjam: updatedTrx.waktu_pinjam || it.waktu_pinjam,
                    kondisi_pinjam: updatedTrx.kondisi_pinjam || it.kondisi_pinjam,
                  }
                : it
            ),
          };
        });

        if (!itemUpdated) {
          // Jika belum ada di card manapun, masukkan ke kartu terkait
          const uid = updatedTrx.uid_kartu;
          if (!uid) return prevCards;
          const kartuData = dbService.getKartu().find((k) => k.uid_kartu === uid);
          const alatData  = dbService.getAlat().find((a) => a.id === updatedTrx.alat_id);

          const newItem = {
            id: trxId,
            transaksi_id: trxId,
            alat_id: updatedTrx.alat_id,
            alat_nama: updatedTrx.nama_alat || alatData?.nama || 'Alat Lab',
            waktu_pinjam: updatedTrx.waktu_pinjam || new Date().toISOString(),
            kondisi_pinjam: updatedTrx.kondisi_pinjam || 'baik',
          };

          const cardIndex = prevCards.findIndex((c) => c.uid_kartu === uid);
          if (cardIndex >= 0) {
            nextCards = [...prevCards];
            nextCards[cardIndex] = {
              ...prevCards[cardIndex],
              items: [newItem, ...prevCards[cardIndex].items],
            };
          } else {
            nextCards = [
              {
                uid_kartu: uid,
                kelas: updatedTrx.kelas || kartuData?.kelas || '—',
                nama_pemegang: kartuData?.nama_pemegang || null,
                items: [newItem],
              },
              ...prevCards,
            ];
          }
        }
      } else {
        nextCards = prevCards;
      }

      activeCardsCache = nextCards;
      return nextCards;
    });
  }, []);

  useEffect(() => {
    reload();
    fetchActiveLoans();

    // 1. Subscribe Supabase Realtime ke tabel 'transaksi' (hanya jika Supabase terkonfigurasi)
    let channel = null;
    if (isSupabaseConfigured) {
      channel = supabase
        .channel('dashboard-realtime-transaksi')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'transaksi' },
          (payload) => {
            handleRealtimeInsert(payload.new);
            reload();
          }
        )
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'transaksi' },
          (payload) => {
            handleRealtimeUpdate(payload.new);
            reload();
          }
        )
        .subscribe();
    }

    // 2. Sinkronisasi dengan localStorage simlab_storage_updated (simulasi IoT / testing lokal)
    const onStorageUpdated = () => {
      reload();
      const updated = groupPinjamanByKartu(dbService.getPinjamanAktif());
      setActiveCards(updated);
      activeCardsCache = updated;
    };
    window.addEventListener('simlab_storage_updated', onStorageUpdated);

    // 3. Refresh durasi_menit tiap 30 detik secara berkala di client tanpa query ulang server
    const durationInterval = setInterval(() => {
      setTick((t) => t + 1);
    }, 30000);

    const polling = setInterval(reload, 3000);

    return () => {
      if (channel) supabase.removeChannel(channel);
      window.removeEventListener('simlab_storage_updated', onStorageUpdated);
      clearInterval(durationInterval);
      clearInterval(polling);
    };
  }, [fetchActiveLoans, handleRealtimeInsert, handleRealtimeUpdate]);

  // Stat Cards
  const totalAlat     = alat.reduce((s, a) => s + a.jumlah_total, 0);
  const totalTersedia = alat.reduce((s, a) => s + a.stok_tersedia, 0);
  const totalDipinjam = transaksi.filter((t) => t.status === 'dipinjam').length;
  const totalHariIni  = transaksi.filter((t) => {
    const today = new Date().toISOString().slice(0, 10);
    return t.waktu_pinjam?.startsWith(today);
  }).length;

  // Chart data
  const chartData = useMemo(() => dbService.getStatHarian(chartDays), [transaksi, chartDays]);

  // Format tanggal chart: "20 Sep"
  const fmtTgl = (s) => {
    const d = new Date(s);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  };

  const totalActiveItems = useMemo(
    () => activeCards.reduce((acc, c) => acc + c.items.length, 0),
    [activeCards]
  );

  return (
    <div className="space-y-6">
      {/* ── Greeting ── */}
      <div>
        <p className="text-muted text-xs">{FORMAT_DATE.format(new Date())}</p>
        <h1 className="text-xl font-bold text-main">
          Selamat datang, <span className="text-blue-600">{user?.nama ?? 'Pengguna'}</span> 👋
        </h1>
        <p className="text-muted text-sm mt-0.5">
          <span className="inline-flex items-center gap-1 capitalize bg-blue-50 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
            {user?.role}
          </span>
        </p>
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Total Unit Alat"    value={totalAlat}    icon={IconBox}       color="blue"   />
        <StatCard title="Stok Tersedia"      value={totalTersedia} icon={IconCheck}     color="green"  />
        <StatCard title="Sedang Dipinjam"    value={totalDipinjam} icon={IconClock}     color="amber"  />
        <StatCard title="Transaksi Hari Ini" value={totalHariIni}  icon={IconArrowRight} color="purple" />
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
        {/* Bar Chart */}
        <div className="bg-surface rounded-xl border border-main p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-main text-sm">Peminjaman dan Pengembalian</h3>
              <p className="text-xs text-muted">Perbandingan transaksi per hari</p>
            </div>
            <div className="flex gap-1">
              {[7, 14, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setChartDays(d)}
                  className={`text-xs px-2 py-1 rounded font-medium transition ${
                    chartDays === d ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {d}H
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="tanggal" tickFormatter={fmtTgl} tick={{ fontSize: 10, fill: '#94A3B8' }} />
              <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} allowDecimals={false} />
              <Tooltip
                formatter={(v, n) => [v, n === 'jumlah_pinjam' ? 'Dipinjam' : 'Dikembalikan']}
                labelFormatter={fmtTgl}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}
              />
              <Legend formatter={(v) => (v === 'jumlah_pinjam' ? 'Dipinjam' : 'Dikembalikan')} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="jumlah_pinjam"  fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={32} />
              <Bar dataKey="jumlah_kembali" fill="#8B5CF6" radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Area Chart */}
        <div className="bg-surface rounded-xl border border-main p-4 sm:p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="font-semibold text-main text-sm">Tren Total Transaksi</h3>
            <p className="text-xs text-muted">Akumulasi aktivitas {chartDays} hari terakhir</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563EB" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="tanggal" tickFormatter={fmtTgl} tick={{ fontSize: 10, fill: '#94A3B8' }} />
              <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} allowDecimals={false} />
              <Tooltip
                formatter={(v) => [v, 'Total Transaksi']}
                labelFormatter={fmtTgl}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}
              />
              <Area type="monotone" dataKey="total" stroke="#2563EB" strokeWidth={2} fill="url(#colorTotal)" dot={{ r: 3, fill: '#2563EB' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Fitur Baru: "Sedang Dipinjam" (Dikelompokkan Per Kartu RFID) ── */}
      <div className="bg-surface rounded-xl border border-main p-4 sm:p-6 shadow-xs space-y-4">
        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-base font-bold text-main flex items-center gap-2">
                <IconLayersLinked size={20} className="text-blue-600" />
                Sedang Dipinjam
              </h2>
              {activeCards.length > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-50 text-blue-700 border border-blue-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {activeCards.length} Kartu Aktif • {totalActiveItems} Unit Alat
                </span>
              )}
            </div>
            <p className="text-xs text-muted mt-0.5">
              Daftar kartu RFID yang memiliki pinjaman alat aktif di laboratorium, dikelompokkan per kelas.
            </p>
          </div>

          <button
            onClick={() => setCurrentTab('riwayat')}
            className="text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 self-start sm:self-auto"
          >
            Lihat Semua Riwayat <IconArrowRight size={14} />
          </button>
        </div>

        {/* Content: Empty State atau Cards Grid */}
        {activeCards.length === 0 ? (
          /* Empty State Ringan */
          <div className="py-10 text-center flex flex-col items-center justify-center bg-gray-50/70 rounded-xl border border-dashed border-gray-200">
            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-full mb-2.5 ring-8 ring-emerald-50/40">
              <IconCircleCheck size={28} />
            </div>
            <h3 className="text-sm font-bold text-main">Tidak ada pinjaman aktif saat ini</h3>
            <p className="text-xs text-muted mt-1 max-w-sm">
              Semua alat laboratorium telah dikembalikan. Kartu RFID kelas saat ini tidak memiliki tanggungan peminjaman.
            </p>
          </div>
        ) : (
          /* Grid Card per Kartu Aktif */
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-5">
            {activeCards.map((card) => (
              <div
                key={card.uid_kartu}
                className="bg-white rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all p-4 sm:p-5 flex flex-col justify-between space-y-4"
              >
                {/* Header Card */}
                <div>
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="min-w-0">
                      <span className="text-base font-extrabold text-main block leading-tight truncate">
                        {card.kelas}
                      </span>
                      {card.nama_pemegang && (
                        <span className="text-[11px] text-muted block mt-0.5 truncate">
                          Pemegang: <span className="font-semibold text-gray-700">{card.nama_pemegang}</span>
                        </span>
                      )}
                    </div>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200 shrink-0">
                      {card.items.length} Alat
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 mt-2">
                    <IconIdBadge2 size={13} className="text-gray-400" />
                    <span className="text-[10px] font-mono font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                      {card.uid_kartu}
                    </span>
                  </div>
                </div>

                {/* List Alat yang Sedang Dipinjam */}
                <div className="space-y-2 pt-3 border-t border-gray-100">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Daftar Alat Dipinjam:
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                    {card.items.map((item) => {
                      const durasiText = formatDuration(item.waktu_pinjam);
                      const durasiMenit = Math.max(0, Math.floor((Date.now() - new Date(item.waktu_pinjam).getTime()) / 60000));
                      const isLong = durasiMenit >= 90;

                      return (
                        <div
                          key={item.transaksi_id || item.id}
                          className="flex items-center justify-between gap-2 p-2 rounded-lg bg-gray-50/80 border border-gray-100 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0" />
                            <span className="font-semibold text-gray-800 truncate" title={item.alat_nama}>
                              {item.alat_nama}
                            </span>
                          </div>
                          <span
                            className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${
                              isLong
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-white text-gray-600 border-gray-200'
                            }`}
                            title={item.waktu_pinjam ? new Date(item.waktu_pinjam).toLocaleString('id-ID') : ''}
                          >
                            <IconClock size={11} className={isLong ? 'text-amber-600' : 'text-gray-400'} />
                            {durasiText}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Footer Card */}
                <div className="pt-2.5 border-t border-gray-100 flex items-center justify-between text-[11px] text-muted">
                  <span>
                    Total: <strong className="text-gray-800">{card.items.length} unit</strong>
                  </span>
                  <button
                    onClick={() => setCurrentTab('pengembalian')}
                    className="text-blue-600 hover:text-blue-700 font-semibold hover:underline"
                  >
                    Proses Kembali →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
