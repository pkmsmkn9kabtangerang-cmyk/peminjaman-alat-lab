// src/pages/DashboardPage.jsx
// Dashboard: ringkasan stok, pinjaman aktif, dan aktivitas terbaru

import { useState, useEffect, useMemo, useCallback } from 'react';
import { dbService } from '../services/store';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import StatCard from '../components/StatCard';
import Badge from '../components/Badge';
import { IconArrowRight } from '@tabler/icons-react';

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

  const totalActiveItems = useMemo(
    () => activeCards.reduce((acc, c) => acc + c.items.length, 0),
    [activeCards]
  );

  const recentLoans = useMemo(() => transaksi.slice(0, 6), [transaksi]);
  const recentTaps = useMemo(() => tapLog.slice(0, 6), [tapLog]);

  const FMT = (iso) => iso
    ? new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
    : '—';

  return (
    <div className="space-y-6">
      <div>
        <p className="text-muted text-[15px]">{FORMAT_DATE.format(new Date())}</p>
        <h1 className="text-xl font-semibold text-main mt-0.5">
          Selamat datang, {user?.nama ?? 'Pengguna'}
        </h1>
        <p className="text-[15px] text-muted mt-1">
          {user?.role === 'admin' ? 'Admin' : 'Petugas lab'} · ringkasan peminjaman alat laboratorium hari ini.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard title="Total unit alat" value={totalAlat} />
        <StatCard title="Stok tersedia" value={totalTersedia} />
        <StatCard title="Sedang dipinjam" value={totalDipinjam} />
        <StatCard title="Peminjaman hari ini" value={totalHariIni} />
      </div>

      <div className="bg-surface border border-main">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-main">
          <div>
            <h2 className="text-lg font-semibold text-main">Alat yang sedang dipinjam</h2>
            <p className="text-[15px] text-muted mt-0.5">
              {activeCards.length === 0
                ? 'Tidak ada alat yang sedang dipinjam.'
                : `${activeCards.length} kelas · ${totalActiveItems} unit alat`}
            </p>
          </div>
          <button
            onClick={() => setCurrentTab('riwayat')}
            className="text-[15px] font-semibold text-[#1E5AAB] hover:underline inline-flex items-center gap-1 min-h-10"
          >
            Lihat riwayat <IconArrowRight size={16} />
          </button>
        </div>

        {activeCards.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-base font-semibold text-main">Belum ada peminjaman aktif</p>
            <p className="text-[15px] text-muted mt-1">Semua alat laboratorium sudah dikembalikan.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {activeCards.map((card) => (
              <div key={card.uid_kartu} className="px-4 sm:px-5 py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                  <div>
                    <p className="text-base font-semibold text-main">kelas : {card.kelas}</p>
                    {card.nama_pemegang && (
                      <p className="text-[15px] text-muted">pemegang : {card.nama_pemegang}</p>
                    )}
                  </div>
                  <p className="text-[15px] text-muted">{card.items.length} alat</p>
                </div>
                <ul className="space-y-1.5">
                  {card.items.map((item) => (
                    <li
                      key={item.transaksi_id || item.id}
                      className="flex items-center justify-between gap-3 text-[15px] py-1.5 border-b border-gray-100 last:border-0"
                    >
                      <span className="text-gray-800">{item.alat_nama}</span>
                      <span className="text-muted shrink-0">{formatDuration(item.waktu_pinjam)}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => setCurrentTab('pengembalian')}
                  className="mt-3 text-[15px] font-semibold text-[#1E5AAB] hover:underline min-h-10"
                >
                  Proses pengembalian
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-surface border border-main">
          <div className="px-4 sm:px-5 py-4 border-b border-main flex items-center justify-between">
            <h2 className="text-lg font-semibold text-main">Peminjaman terbaru</h2>
            <button
              onClick={() => setCurrentTab('riwayat')}
              className="text-[15px] font-semibold text-[#1E5AAB] hover:underline"
            >
              Lihat semua
            </button>
          </div>
          {recentLoans.length === 0 ? (
            <div className="px-5 py-8">
              <p className="font-semibold text-main">Belum ada peminjaman</p>
              <p className="text-[15px] text-muted mt-1">Data peminjaman akan muncul di sini.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {recentLoans.map((row) => (
                <li key={row.id} className="px-4 sm:px-5 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-medium text-main truncate">{row.nama_alat}</p>
                    <p className="text-sm text-muted mt-0.5">{row.kelas} · {FMT(row.waktu_pinjam)}</p>
                  </div>
                  <Badge status={row.status} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-surface border border-main">
          <div className="px-4 sm:px-5 py-4 border-b border-main flex items-center justify-between">
            <h2 className="text-lg font-semibold text-main">Aktivitas RFID</h2>
            <button
              onClick={() => setCurrentTab('realtime_card')}
              className="text-[15px] font-semibold text-[#1E5AAB] hover:underline"
            >
              Lihat semua
            </button>
          </div>
          {recentTaps.length === 0 ? (
            <div className="px-5 py-8">
              <p className="font-semibold text-main">Belum ada aktivitas RFID</p>
              <p className="text-[15px] text-muted mt-1">Aktivitas kartu yang masuk akan muncul di sini.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {recentTaps.map((row) => (
                <li key={row.id} className="px-4 sm:px-5 py-3">
                  <p className="text-[15px] font-medium text-main">
                    {row.kelas || 'Kartu tidak dikenal'}
                    {row.nama_alat ? ` · ${row.nama_alat}` : ''}
                  </p>
                  <p className="text-sm text-muted mt-0.5">
                    {row.status === 'ditolak' ? 'Ditolak' : 'Berhasil'} · {FMT(row.waktu_tap)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
