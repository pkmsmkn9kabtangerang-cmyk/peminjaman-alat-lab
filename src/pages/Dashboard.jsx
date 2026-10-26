// src/pages/DashboardPage.jsx
// Dashboard: ringkasan stok, pinjaman aktif, dan aktivitas terbaru

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { dbService } from '../services/store';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { isOnline, registerOnlineSync } from '../lib/networkStatus';
import StatCard from '../components/StatCard';
import Badge from '../components/Badge';
import PageNote from '../components/PageNote';
import { IconArrowRight, IconBox, IconClockHour4, IconMail, IconPackage, IconScan } from '@tabler/icons-react';
import PersetujuanSekaliPakai from '../components/PersetujuanSekaliPakai';

const FORMAT_DATE = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

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

  return Array.from(map.values()).filter((g) => g.items.length > 0);
}

let activeCardsCache = null;

export default function DashboardPage({ setCurrentTab, user, isActive = true }) {
  const [alat, setAlat] = useState(() => dbService.getAlatWithStok());
  const [transaksi, setTransaksi] = useState(() => dbService.getTransaksi());
  const [tapLog, setTapLog] = useState(() => dbService.getTapLog());

  const [activeCards, setActiveCards] = useState(() => {
    if (activeCardsCache !== null) return activeCardsCache;
    const initial = groupPinjamanByKartu(dbService.getPinjamanAktif());
    activeCardsCache = initial;
    return initial;
  });

  const [, setTick] = useState(0);
  const isReloadingRef = useRef(false);

  const reloadData = useCallback(async () => {
    if (!isOnline()) return;
    if (isReloadingRef.current) return;
    isReloadingRef.current = true;

    if (!isSupabaseConfigured) {
      setAlat(dbService.getAlatWithStok());
      setTransaksi(dbService.getTransaksi());
      setTapLog(dbService.getTapLog());

      const localGrouped = groupPinjamanByKartu(dbService.getPinjamanAktif());
      setActiveCards(localGrouped);
      activeCardsCache = localGrouped;
      isReloadingRef.current = false;
      return;
    }

    try {
      const fetchPromise = Promise.all([
        supabase.from('v_list_barang').select('*'),
        supabase.from('transaksi').select('*, kartu_rfid(nama_pemegang)').order('waktu_pinjam', { ascending: false }).limit(200),
        supabase.from('tap_log').select('*').or('jenis_terdeteksi.neq.manual,jenis_terdeteksi.is.null').order('waktu_tap', { ascending: false }).limit(10),
        supabase.from('v_pinjaman_aktif').select('*'),
      ]);

      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));

      const [resAlat, resTrx, resTap, resPinjamanAktif] = await Promise.race([fetchPromise, timeoutPromise]);

      if (!resAlat.error && resAlat.data) setAlat(resAlat.data);
      if (!resTrx.error && resTrx.data) setTransaksi(resTrx.data.map(t => ({ ...t, pemegang: t.kartu_rfid?.nama_pemegang || t.pemegang })));
      if (!resTap.error && resTap.data) setTapLog(resTap.data);
      if (!resPinjamanAktif.error && resPinjamanAktif.data) {
        const grouped = groupPinjamanByKartu(resPinjamanAktif.data);
        setActiveCards(grouped);
        activeCardsCache = grouped;
      }
    } catch {
      // jika offline atau timeout, pertahankan data terakhir
    } finally {
      isReloadingRef.current = false;
    }
  }, []);

  const handleRealtimeInsert = useCallback((newTrx) => {
    if (newTrx.status !== 'dipinjam') return;
    const uid = newTrx.uid_kartu;
    if (!uid) return;

    setActiveCards((prevCards) => {
      const trxId = newTrx.id;
      const isAlreadyListed = prevCards.some((c) => c.items.some((it) => (it.transaksi_id || it.id) === trxId));
      if (isAlreadyListed) return prevCards;

      const newItem = {
        id: trxId,
        transaksi_id: trxId,
        alat_id: newTrx.alat_id,
        alat_nama: newTrx.nama_alat || 'Alat Lab',
        waktu_pinjam: newTrx.waktu_pinjam || new Date().toISOString(),
        kondisi_pinjam: newTrx.kondisi_pinjam || 'baik',
      };

      const cardIndex = prevCards.findIndex((c) => c.uid_kartu === uid);
      let nextCards;

      if (cardIndex >= 0) {
        nextCards = [...prevCards];
        nextCards[cardIndex] = { ...prevCards[cardIndex], items: [newItem, ...prevCards[cardIndex].items] };
      } else {
        nextCards = [{
          uid_kartu: uid,
          kelas: newTrx.kelas || '—',
          nama_pemegang: null,
          items: [newItem],
        }, ...prevCards];
      }
      activeCardsCache = nextCards;
      return nextCards;
    });
  }, []);

  const handleRealtimeUpdate = useCallback((updatedTrx) => {
    const trxId = updatedTrx.id;
    setActiveCards((prevCards) => {
      let nextCards;
      if (updatedTrx.status === 'dikembalikan') {
        nextCards = prevCards
          .map((card) => {
            const hasItem = card.items.some((it) => (it.transaksi_id || it.id) === trxId);
            if (!hasItem) return card;
            return { ...card, items: card.items.filter((it) => (it.transaksi_id || it.id) !== trxId) };
          })
          .filter((card) => card.items.length > 0);
      } else if (updatedTrx.status === 'dipinjam') {
        let itemUpdated = false;
        nextCards = prevCards.map((card) => {
          const hasItem = card.items.some((it) => (it.transaksi_id || it.id) === trxId);
          if (!hasItem) return card;
          itemUpdated = true;
          return {
            ...card,
            items: card.items.map((it) => (it.transaksi_id || it.id) === trxId ? {
              ...it,
              alat_nama: updatedTrx.nama_alat || it.alat_nama,
              waktu_pinjam: updatedTrx.waktu_pinjam || it.waktu_pinjam,
              kondisi_pinjam: updatedTrx.kondisi_pinjam || it.kondisi_pinjam,
            } : it),
          };
        });

        if (!itemUpdated && updatedTrx.uid_kartu) {
          const newItem = {
            id: trxId,
            transaksi_id: trxId,
            alat_id: updatedTrx.alat_id,
            alat_nama: updatedTrx.nama_alat || 'Alat Lab',
            waktu_pinjam: updatedTrx.waktu_pinjam || new Date().toISOString(),
            kondisi_pinjam: updatedTrx.kondisi_pinjam || 'baik',
          };
          const cardIndex = prevCards.findIndex((c) => c.uid_kartu === updatedTrx.uid_kartu);
          if (cardIndex >= 0) {
            nextCards = [...prevCards];
            nextCards[cardIndex] = { ...prevCards[cardIndex], items: [newItem, ...prevCards[cardIndex].items] };
          } else {
            nextCards = [{ uid_kartu: updatedTrx.uid_kartu, kelas: updatedTrx.kelas || '—', nama_pemegang: null, items: [newItem] }, ...prevCards];
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
    if (isActive) {
      reloadData();
    }

    let channel = null;
    let unregisterSync = () => {};

    if (isSupabaseConfigured) {
      channel = supabase.channel('dashboard-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transaksi' }, (payload) => {
          if (payload.eventType === 'INSERT') handleRealtimeInsert(payload.new);
          if (payload.eventType === 'UPDATE') handleRealtimeUpdate(payload.new);
          if (isActive) reloadData();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tap_log' }, () => {
          if (isActive) reloadData();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'alat' }, () => {
          if (isActive) reloadData();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'permintaan_habis_pakai' }, () => {
          if (isActive) reloadData();
        })
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[Realtime dashboard] channel status:', status);
          }
        });

      // Sinkronisasi otomatis SEKALI saat koneksi internet pulih kembali
      unregisterSync = registerOnlineSync(() => {
        if (isActive) reloadData();
      });
    } else {
      window.addEventListener('simlab_storage_updated', reloadData);
    }

    const durationInterval = setInterval(() => setTick((t) => t + 1), 30000);

    // Safety polling hanya setiap 30 detik saat online, tab visible, dan dashboard aktif
    const polling = setInterval(() => {
      if (isActive && isOnline() && typeof document !== 'undefined' && !document.hidden) {
        reloadData();
      }
    }, 30000);

    return () => {
      if (channel) supabase.removeChannel(channel);
      if (!isSupabaseConfigured) window.removeEventListener('simlab_storage_updated', reloadData);
      unregisterSync();
      clearInterval(durationInterval);
      clearInterval(polling);
    };
  }, [isActive, reloadData, handleRealtimeInsert, handleRealtimeUpdate]);

  const totalAlat = alat.length; // jumlah jenis alat yang terdaftar
  const totalTersedia = alat.reduce((s, a) => s + (a.stok_tersedia || 0), 0);
  const totalDipinjam = transaksi.filter((t) => t.status === 'dipinjam').length;
  const totalHariIni = transaksi.filter((t) => t.waktu_pinjam?.startsWith(new Date().toISOString().slice(0, 10))).length;

  const totalActiveItems = useMemo(() => activeCards.reduce((acc, c) => acc + c.items.length, 0), [activeCards]);
  const recentLoans = useMemo(() => transaksi.slice(0, 6), [transaksi]);
  const recentTaps = useMemo(() => tapLog.filter((t) => t.jenis_terdeteksi !== 'manual' && t.sumber !== 'manual').slice(0, 6), [tapLog]);

  const FMT = (iso) => iso ? new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)) : '—';

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <p className="text-muted text-sm sm:text-[15px]">{FORMAT_DATE.format(new Date())}</p>
        <h1 className="mt-0.5 text-xl font-semibold text-main sm:text-2xl">
          Selamat datang, {user?.nama ?? 'Pengguna'}
        </h1>
        <p className="mt-1 text-sm text-muted sm:text-[15px]">
          {user?.role === 'super_admin' ? 'Super Admin' : user?.role === 'admin' ? 'Admin' : 'Petugas lab'} · ringkasan peminjaman alat laboratorium hari ini.
        </p>
      </div>

      <PageNote title="Informasi Penting" icon={IconMail}>
        Ringkasan data lab diperbarui secara realtime. Jika ada perubahan stok, aktivitas kartu, atau status peminjaman, angka pada dashboard akan langsung menyesuaikan.
      </PageNote>

      <div className="grid grid-cols-1 gap-3 min-[380px]:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Alat terdaftar" value={totalAlat} icon={IconBox} tone="blue" />
        <StatCard title="Stok tersedia" value={totalTersedia} icon={IconPackage} tone="emerald" />
        <StatCard title="Sedang dipinjam" value={totalDipinjam} icon={IconScan} tone="amber" />
        <StatCard title="Peminjaman hari ini" value={totalHariIni} icon={IconClockHour4} tone="violet" />
      </div>

      {/* ── Persetujuan Alat Sekali Pakai ── */}
      <PersetujuanSekaliPakai user={user} />

      <section className="overflow-hidden rounded-xl border border-main bg-surface shadow-sm">
        <div className="flex flex-col gap-3 border-b border-main px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-main sm:text-lg">Alat yang sedang dipinjam</h2>
            <p className="mt-0.5 text-sm text-muted">
              {activeCards.length === 0
                ? 'Tidak ada alat yang sedang dipinjam.'
                : `${activeCards.length} kelas · ${totalActiveItems} unit alat`}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCurrentTab('riwayat')}
            className="inline-flex min-h-11 items-center gap-1 self-start rounded-lg px-2.5 text-sm font-semibold text-[#1E5AAB] transition hover:bg-blue-50 active:bg-blue-100 sm:self-auto"
          >
            Lihat riwayat <IconArrowRight size={16} />
          </button>
        </div>

        {activeCards.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400" aria-hidden="true">
              <IconScan size={22} />
            </span>
            <p className="text-base font-semibold text-main">Belum ada peminjaman aktif</p>
            <p className="mt-1 text-sm text-muted">Semua alat laboratorium sudah dikembalikan.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {activeCards.map((card) => (
              <div key={card.uid_kartu} className="px-4 py-4 sm:px-5">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-main">Kelas {card.kelas}</p>
                    {card.nama_pemegang && (
                      <p className="text-sm text-muted">Pemegang: {card.nama_pemegang}</p>
                    )}
                  </div>
                  <span className="inline-flex shrink-0 items-center rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-[#1E5AAB]">
                    {card.items.length} alat
                  </span>
                </div>
                <ul className="space-y-1">
                  {card.items.map((item) => (
                    <li
                      key={item.transaksi_id || item.id}
                      className="flex flex-col gap-0.5 border-b border-gray-100 py-2 text-sm last:border-0 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between min-[420px]:gap-3"
                    >
                      <span className="min-w-0 text-gray-800">{item.alat_nama}</span>
                      <span className="shrink-0 text-xs text-muted min-[420px]:text-sm">{formatDuration(item.waktu_pinjam)}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => setCurrentTab('pengembalian')}
                  className="mt-2 inline-flex min-h-11 items-center gap-1 rounded-lg text-sm font-semibold text-[#1E5AAB] transition hover:bg-blue-50 active:bg-blue-100 sm:px-2.5"
                >
                  Proses pengembalian <IconArrowRight size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="overflow-hidden rounded-xl border border-main bg-surface shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-main px-4 py-4 sm:px-5">
            <h2 className="text-base font-semibold text-main sm:text-lg">Peminjaman terbaru</h2>
            <button
              type="button"
              onClick={() => setCurrentTab('riwayat')}
              className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-sm font-semibold text-[#1E5AAB] transition hover:bg-blue-50 active:bg-blue-100"
            >
              Lihat semua
            </button>
          </div>
          {recentLoans.length === 0 ? (
            <div className="px-5 py-8">
              <p className="font-semibold text-main">Belum ada peminjaman</p>
              <p className="mt-1 text-sm text-muted">Data peminjaman akan muncul di sini.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {recentLoans.map((row) => (
                <li key={row.id} className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-main">{row.nama_alat}</p>
                    <p className="mt-0.5 text-xs text-muted sm:text-sm">{row.kelas} · {FMT(row.waktu_pinjam)}</p>
                  </div>
                  <span className="shrink-0">
                    <Badge status={row.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-main bg-surface shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-main px-4 py-4 sm:px-5">
            <h2 className="text-base font-semibold text-main sm:text-lg">Aktivitas Transaksi</h2>
            <button
              type="button"
              onClick={() => setCurrentTab('realtime_card')}
              className="inline-flex min-h-11 shrink-0 items-center rounded-lg px-2 text-sm font-semibold text-[#1E5AAB] transition hover:bg-blue-50 active:bg-blue-100"
            >
              Lihat semua
            </button>
          </div>
          {recentTaps.length === 0 ? (
            <div className="px-5 py-8">
              <p className="font-semibold text-main">Belum ada aktivitas kartu</p>
              <p className="mt-1 text-sm text-muted">Aktivitas kartu yang masuk akan muncul di sini.</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200">
              {recentTaps.map((row) => {
                const rejected = row.status === 'ditolak';
                return (
                  <li key={row.id} className="px-4 py-3 sm:px-5">
                    <p className="text-sm font-medium text-main">
                      {row.kelas || 'Kartu tidak dikenal'}
                      {row.nama_alat ? ` · ${row.nama_alat}` : ''}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted sm:text-sm">
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${rejected ? 'bg-red-500' : 'bg-emerald-500'}`}
                        aria-hidden="true"
                      />
                      {rejected ? 'Ditolak' : 'Berhasil'} · {FMT(row.waktu_tap)}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
