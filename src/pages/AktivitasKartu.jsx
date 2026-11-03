// src/pages/AktivitasKartu.jsx
// Realtime tap log — hari ini saja, tanpa filter waktu
// Tiga tabel: transaksi kartu (semua tap), peminjaman/pengembalian (berhasil),
// dan transaksi alat sekali pakai (yang sudah disetujui).

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { dbService } from '../services/store';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { callFunction } from '../lib/api';
import Badge from '../components/Badge';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import Button from '../components/Button';
import PageHeader from '../components/PageHeader';
import PageNote from '../components/PageNote';
import { showFeedback, friendlyError } from '../lib/feedback';
import {
  IconTrash,
  IconRefresh,
  IconMail
} from '@tabler/icons-react';

const TODAY_WIB = () => {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
};

const dayWIB = (iso) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

const isTodayWIB = (iso) => dayWIB(iso) === TODAY_WIB();

const FORMAT_WIB = (iso) => {
  if (!iso) return '—';

  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return '—';

  return new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
};

import { isOnline, isNetworkError, registerOnlineSync } from '../lib/networkStatus';

const SHORT_ERROR_LABELS = {
  kartu_nonaktif: 'Kartu sedang diblokir',
  uid_tidak_dikenal: 'UID belum terdaftar',
  sesi_tidak_ada: 'Belum ada sesi kartu',
  sesi_kartu_lain_aktif: 'Sesi kartu lain sedang aktif',
  stok_habis: 'Stok alat habis',
  permintaan_sudah_ada: 'Sudah menunggu persetujuan',
  alat_habis_pakai_tidak_bisa_dikembalikan: 'Tidak bisa dikembalikan',
};

function getHasilTransaksi(row) {
  // Hasil untuk permintaan alat sekali pakai harus dicek lebih dulu karena
  // tap_log aslinya tetap berstatus "menunggu" meskipun sudah diproses.
  if (row.status_sekali_pakai === 'ditolak') {
    return {
      status: 'ditolak',
      label: 'Ditolak',
      detail: 'Permintaan alat sekali pakai ditolak',
      tone: 'danger',
    };
  }
  if (row.status_sekali_pakai === 'dibatalkan') {
    return {
      status: 'dibatalkan',
      label: 'Dibatalkan',
      detail: 'Persetujuan dibatalkan petugas',
      tone: 'muted',
    };
  }
  if (row.status === 'ditolak') {
    return {
      status: 'ditolak',
      label: 'Ditolak',
      detail:
        SHORT_ERROR_LABELS[row.error_code] ||
        row.error_code?.replace(/_/g, ' ') ||
        'Scan ditolak',
      tone: 'danger',
    };
  }
  if (row.status === 'menunggu' || row.status_sekali_pakai === 'menunggu') {
    return {
      status: 'menunggu',
      label: 'Menunggu',
      detail: 'Menunggu persetujuan petugas',
      tone: 'warning',
    };
  }
  if (row.status_sekali_pakai === 'disetujui') {
    return {
      status: 'berhasil',
      label: 'Berhasil',
      detail: row.nama_alat ? `${row.nama_alat} diberikan` : 'Alat sekali pakai diberikan',
      tone: 'success',
    };
  }
  if (row.jenis_tap === 'pinjam') {
    return {
      status: 'dipinjam',
      label: 'Berhasil',
      detail: row.nama_alat ? `${row.nama_alat} dipinjam` : 'Alat dipinjam',
      tone: 'success',
    };
  }
  if (row.jenis_tap === 'kembali') {
    return {
      status: 'dikembalikan',
      label: 'Berhasil',
      detail: row.nama_alat ? `${row.nama_alat} dikembalikan` : 'Alat dikembalikan',
      tone: 'success',
    };
  }
  if (row.jenis_tap === 'selesai') {
    return {
      status: 'berhasil',
      label: 'Berhasil',
      detail: 'Sesi kartu selesai',
      tone: 'success',
    };
  }
  return {
    status: 'berhasil',
    label: 'Berhasil',
    detail: 'Kartu berhasil dikenali',
    tone: 'success',
  };
}

function HasilCell({ row }) {
  const hasil = getHasilTransaksi(row);
  const toneClass =
    hasil.tone === 'danger'
      ? 'text-red-600'
      : hasil.tone === 'warning'
        ? 'text-amber-700'
        : hasil.tone === 'muted'
          ? 'text-gray-500'
          : 'text-gray-500';

  return (
    <div className="flex flex-col items-start gap-1 text-left">
      <Badge status={hasil.status} label={hasil.label} />
      {hasil.detail && (
        <span className={`text-[11.5px] font-medium leading-snug ${toneClass}`}>
          {hasil.detail}
        </span>
      )}
    </div>
  );
}

async function fetchTapLog() {
  if (isSupabaseConfigured) {
    if (!isOnline()) return null;
    try {
      const todayStr = TODAY_WIB();
      const { data, error } = await supabase
        .from('tap_log')
        .select('*')
        .or('jenis_terdeteksi.neq.manual,jenis_terdeteksi.is.null')
        .gte('waktu_tap', `${todayStr}T00:00:00+07:00`)
        .order('waktu_tap', { ascending: false });

      if (error) throw error;
      return (data ?? []).filter(d => d.jenis_terdeteksi !== 'manual' && d.sumber !== 'manual');
    } catch (err) {
      if (isNetworkError(err)) return null;
      console.warn('[AktivitasKartu] fetchTapLog error:', err?.message || err);
      return null;
    }
  }

  return dbService
    .getTapLog()
    .filter(d => {
      if (!d.waktu_tap) return false;
      if (d.jenis_terdeteksi === 'manual' || d.sumber === 'manual') return false;
      return isTodayWIB(d.waktu_tap);
    });
}

async function fetchKartuList() {
  if (isSupabaseConfigured) {
    if (!isOnline()) return null;
    try {
      const { data, error } = await supabase
        .from('kartu_rfid')
        .select('uid_kartu, nama_pemegang');
      if (error) throw error;
      return data ?? [];
    } catch (err) {
      if (isNetworkError(err)) return null;
      return null;
    }
  }
  return dbService.getKartu();
}

async function fetchSekaliPakaiHariIni() {
  if (isSupabaseConfigured) {
    if (!isOnline()) return null;
    try {
      const todayStr = TODAY_WIB();
      const { data, error } = await supabase
        .from('permintaan_habis_pakai')
        .select('*, kartu_rfid(nama_pemegang)')
        .gte('created_at', `${todayStr}T00:00:00+07:00`)
        .order('created_at', { ascending: false });

      if (error) {
        // HANYA jalankan fallback waktu_tap jika kolom created_at belum ada di schema database
        if (error.code === '42703') {
          const { data: fallback } = await supabase
            .from('permintaan_habis_pakai')
            .select('*, kartu_rfid(nama_pemegang)')
            .order('waktu_tap', { ascending: false })
            .limit(30);
          return (fallback || [])
            .filter(r => isTodayWIB(r.created_at || r.waktu_tap || r.waktu_proses))
            .map(r => ({
              ...r,
              pemegang: r.kartu_rfid?.nama_pemegang || '—',
            }));
        }
        if (isNetworkError(error)) return null;
        console.warn('[AktivitasKartu] fetchSekaliPakai error:', error.message);
        return null;
      }
      return (data || []).map(r => ({
        ...r,
        pemegang: r.kartu_rfid?.nama_pemegang || '—',
      }));
    } catch (err) {
      if (isNetworkError(err)) return null;
      console.warn('[AktivitasKartu] fetchSekaliPakaiHariIni error:', err?.message || err);
      return null;
    }
  }

  const all = dbService.getPermintaan();
  const kartu = dbService.getKartu();
  return all
    .filter(d => isTodayWIB(d.created_at || d.waktu_tap || d.waktu_proses))
    .sort((a, b) => new Date(b.created_at || b.waktu_tap || 0) - new Date(a.created_at || a.waktu_tap || 0))
    .map(r => {
      const k = kartu.find(x => x.uid_kartu === r.uid_kartu);
      return { ...r, pemegang: k?.nama_pemegang || '—' };
    });
}

export default function AktivitasKartuPage() {
  const [taps, setTaps] = useState([]);
  const [kartuList, setKartuList] = useState([]);
  const [sekaliPakaiToday, setSekaliPakaiToday] = useState([]);
  const [activeTab, setActiveTab] = useState('kartu'); // 'kartu' | 'peminjaman' | 'sekali_pakai'
  const [loading, setLoading] = useState(true);
  const [newIds, setNewIds] = useState(new Set());
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearTarget, setClearTarget] = useState('rfid'); // 'rfid' | 'sekali_pakai'
  const [clearInput, setClearInput] = useState('');
  const CONFIRM_TEXT = 'hapus semua log';
  const prevLen = useRef(0);
  const isReloadingRef = useRef(false);
  const queuedReloadRef = useRef(false);
  const reloadRef = useRef(null);

  // Ambil user dari Supabase auth session, atau fallback
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
    if (isReloadingRef.current) {
      // Ada event baru saat fetch masih berjalan: jalankan sekali lagi
      // setelah fetch selesai agar data tap terbaru tidak terlewat.
      queuedReloadRef.current = true;
      return;
    }
    isReloadingRef.current = true;

    if (!isRealtimeEvent) setLoading(true);
    try {
      const [logsData, kartuData, sekaliData] = await Promise.all([
        fetchTapLog(),
        fetchKartuList(),
        fetchSekaliPakaiHariIni(),
      ]);

      // Pertahankan data sebelumnya jika terjadi gangguan koneksi (null)
      if (logsData !== null) setTaps(logsData);
      if (kartuData !== null) setKartuList(kartuData);
      if (sekaliData !== null) setSekaliPakaiToday(sekaliData);

      if (logsData && logsData.length > prevLen.current && prevLen.current > 0) {
        const added = logsData.slice(0, logsData.length - prevLen.current).map((l) => l.id);
        setNewIds((prev) => new Set([...prev, ...added]));
        setTimeout(() => {
          setNewIds((prev) => {
            const next = new Set(prev);
            added.forEach((id) => next.delete(id));
            return next;
          });
        }, 12000);
      }
      if (logsData) prevLen.current = logsData.length;
    } catch (err) {
      if (!isNetworkError(err)) {
        console.error('[AktivitasKartu] load error:', err);
      }
    } finally {
      setLoading(false);
      isReloadingRef.current = false;
      if (queuedReloadRef.current) {
        queuedReloadRef.current = false;
        setTimeout(() => reloadRef.current?.(true), 0);
      }
    }
  }, []);

  useEffect(() => {
    reloadRef.current = reloadData;
  }, [reloadData]);

  useEffect(() => {
    reloadData();

    // Mark as read jika online
    if (isSupabaseConfigured) {
      if (isOnline()) {
        supabase
          .rpc('mark_taps_read')
          .then(({ error }) => {
            if (error && !isNetworkError(error)) {
              console.error('[AktivitasKartu] mark taps read error:', error);
            }
          })
          .catch(() => { });
      }
    } else {
      dbService.markTapsRead();
    }

    if (!isSupabaseConfigured) {
      const handleStorage = () => reloadData(true);
      window.addEventListener('simlab_storage_updated', handleStorage);
      return () => {
        window.removeEventListener('simlab_storage_updated', handleStorage);
      };
    } else {
      // Supabase Realtime listeners
      const ch1 = supabase.channel('tap_log_changes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tap_log' }, (payload) => {
          if (payload.new?.jenis_terdeteksi === 'manual') return;
          reloadData(true);
        })
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[Realtime tap_log] channel status:', status);
          }
        });

      const ch2 = supabase.channel('permintaan_changes_aktivitaskartu')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'permintaan_habis_pakai' }, () => {
          reloadData(true);
        })
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[Realtime permintaan] channel status:', status);
          }
        });

      // Sinkronisasi otomatis SEKALI saat koneksi internet pulih kembali
      const unregisterSync = registerOnlineSync(() => {
        reloadData(true);
        if (isSupabaseConfigured) {
          supabase.rpc('mark_taps_read').catch(() => { });
        }
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
    return taps
      .filter(log => log.jenis_terdeteksi !== 'manual' && log.sumber !== 'manual')
      .map(log => {
        const kartu = kartuList.find(k => k.uid_kartu === log.uid_kartu);

        // Cari status terkini dari permintaan alat sekali pakai
        let statusSekaliPakai = null;
        if (log.status === 'menunggu' || log.nama_alat) {
          const matches = sekaliPakaiToday.filter(req =>
            req.uid_kartu === log.uid_kartu &&
            (req.nama_alat === log.nama_alat || req.alat_id === log.uid_alat)
          );

          if (matches.length > 0) {
            if (matches.length === 1) {
              statusSekaliPakai = matches[0].status;
            } else {
              const logTime = new Date(log.waktu_tap).getTime();
              let closest = matches[0];
              let minDiff = Math.abs(new Date(closest.waktu_tap || closest.created_at).getTime() - logTime);
              for (let i = 1; i < matches.length; i++) {
                const diff = Math.abs(new Date(matches[i].waktu_tap || matches[i].created_at).getTime() - logTime);
                if (diff < minDiff) {
                  minDiff = diff;
                  closest = matches[i];
                }
              }
              statusSekaliPakai = closest.status;
            }
          }
        }

        return {
          ...log,
          nama_pemegang: kartu?.nama_pemegang || log.nama_pemegang || null,
          kelas: log.kelas || kartu?.kelas || null,
          status_sekali_pakai: statusSekaliPakai,
          _isNew: newIds.has(log.id),
        };
      });
  }, [taps, kartuList, sekaliPakaiToday, newIds]);

  // Tabel peminjaman/pengembalian: hanya tap alat yang benar-benar berhasil.
  const peminjamanData = useMemo(
    () => filteredData.filter(
      (row) => row.status === 'berhasil' && (row.jenis_tap === 'pinjam' || row.jenis_tap === 'kembali')
    ),
    [filteredData]
  );

  // Tabel sekali pakai: hanya permintaan yang sudah disetujui.
  const sekaliPakaiBerhasil = useMemo(
    () => sekaliPakaiToday.filter((row) => row.status === 'disetujui'),
    [sekaliPakaiToday]
  );

  const handleClearAll = async () => {
    if (clearInput.toLowerCase() !== CONFIRM_TEXT) return;

    if (clearTarget === 'rfid') {
      if (isSupabaseConfigured) {
        try {
          let cleared = false;
          try {
            const res = await callFunction('manage-transaksi', null, {
              method: 'DELETE',
              params: { clear: 'taplog' },
            });
            if (res?.success) cleared = true;
          } catch (edgeErr) {
            console.warn('[AktivitasKartu] Edge function clear failed, trying direct delete:', edgeErr);
          }

          if (!cleared) {
            // Direct delete: id di tap_log bertipe text (misal "LOG-..."), gunakan neq('id', '') bukan neq('id', 0)
            const { error } = await supabase.from('tap_log').delete().neq('id', '');
            if (error) throw error;
          }

          showFeedback({ type: 'success', title: 'Semua log aktivitas tap RFID berhasil dibersihkan.' });
          setTaps([]);
          reloadData();
        } catch (err) {
          console.error('[AktivitasKartu] clear error:', err);
          showFeedback({ type: 'error', title: 'Gagal menghapus log RFID.', message: friendlyError(err) });
        }
      } else {
        dbService.saveTapLog([]);
        setTaps([]);
        reloadData();
        showFeedback({ type: 'success', title: 'Semua log aktivitas tap RFID hari ini berhasil dibersihkan.' });
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
            console.warn('[AktivitasKartu] Edge function clear sekali pakai failed, trying direct delete:', edgeErr);
          }

          if (!cleared) {
            const { error } = await supabase.from('permintaan_habis_pakai').delete().neq('status', 'menunggu');
            if (error) throw error;
          }

          showFeedback({ type: 'success', title: 'Semua log transaksi alat sekali pakai berhasil dibersihkan.' });
          setSekaliPakaiToday([]);
          reloadData();
        } catch (err) {
          console.error('[AktivitasKartu] clear sekali pakai error:', err);
          showFeedback({ type: 'error', title: 'Gagal menghapus log sekali pakai.', message: friendlyError(err) });
        }
      } else {
        const remaining = dbService.getPermintaan().filter((p) => p.status === 'menunggu');
        dbService.savePermintaan(remaining);
        setSekaliPakaiToday([]);
        reloadData();
        showFeedback({ type: 'success', title: 'Semua log transaksi alat sekali pakai hari ini berhasil dibersihkan.' });
      }
    }

    setShowClearModal(false);
    setClearInput('');
  };

  const renderIdKartu = (row) => (
    <div className="flex items-center gap-2">
      {row._isNew && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-600 text-white shadow-xs animate-pulse shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
          BARU
        </span>
      )}
      <span
        className={`font-medium text-[13px] lg:text-main px-2 py-0.5 rounded ${row._isNew
          ? 'bg-emerald-100 text-emerald-900 font-bold border border-emerald-300'
          : 'bg-gray-100 text-gray-700 font-medium'
          }`}
      >
        {row.uid_kartu ?? '—'}
      </span>
    </div>
  );

  // ── Tabel 1: semua transaksi kartu (termasuk ditolak/menunggu) ──
  const columnsKartu = [
    {
      key: 'uid_kartu',
      label: 'ID Kartu',
      render: renderIdKartu,
    },
    {
      key: 'nama_pemegang',
      label: 'Nama Perwakilan',
      sortable: true,
      render: (row) => <span className="font-semibold text-main">{row.nama_pemegang || '—'}</span>,
    },
    {
      key: 'kelas',
      label: 'Kelas/Angkatan',
      sortable: true,
      render: (row) => <span className="text-main">{row.kelas ?? '—'}</span>,
    },
    {
      key: 'waktu_tap',
      label: 'Waktu',
      sortable: true,
      render: (row) => <span className="font-medium text-[13px] lg:text-main">{FORMAT_WIB(row.waktu_tap)}</span>,
    },
    {
      key: 'hasil',
      label: 'Hasil',
      render: (row) => <HasilCell row={row} />,
    },
  ];

  // ── Tabel 2: transaksi peminjaman/pengembalian yang berhasil ──
  const columnsPeminjaman = [
    {
      key: 'uid_kartu',
      label: 'ID Kartu',
      render: renderIdKartu,
    },
    {
      key: 'nama_pemegang',
      label: 'Nama Perwakilan',
      sortable: true,
      render: (row) => <span className="font-semibold text-main">{row.nama_pemegang || '—'}</span>,
    },
    {
      key: 'kelas',
      label: 'Kelas/Angkatan',
      sortable: true,
      render: (row) => <span className="text-main">{row.kelas ?? '—'}</span>,
    },
    {
      key: 'nama_alat',
      label: 'Alat',
      sortable: true,
      render: (row) => <span className="font-semibold text-main">{row.nama_alat ?? '—'}</span>,
    },
    {
      key: 'waktu_tap',
      label: 'Waktu',
      sortable: true,
      render: (row) => <span className="font-medium text-[13px] lg:text-main">{FORMAT_WIB(row.waktu_tap)}</span>,
    },
    {
      key: 'jenis_tap',
      label: 'Hasil',
      render: (row) => (
        <Badge
          status={row.jenis_tap === 'pinjam' ? 'dipinjam' : 'dikembalikan'}
          label={row.jenis_tap === 'pinjam' ? 'Berhasil dipinjam' : 'Berhasil dikembalikan'}
        />
      ),
    },
  ];

  // ── Tabel 3: transaksi alat sekali pakai yang sudah berhasil ──
  const columnsSekaliPakai = [
    {
      key: 'waktu',
      label: 'Waktu',
      sortable: true,
      render: (row) => (
        <span className="font-medium text-[13px] lg:text-main">
          {FORMAT_WIB(row.waktu_proses || row.waktu_tap || row.created_at)}
        </span>
      ),
    },
    {
      key: 'uid_kartu',
      label: 'ID Kartu',
      render: (row) => (
        <span className="font-medium text-[13px] lg:text-main px-2 py-0.5 rounded bg-gray-100 text-gray-700">
          {row.uid_kartu ?? '—'}
        </span>
      ),
    },
    {
      key: 'pemegang',
      label: 'Nama Perwakilan',
      sortable: true,
      render: (row) => (
        <span className="font-semibold text-main">{row.pemegang || row.nama_pemegang || '—'}</span>
      ),
    },
    {
      key: 'kelas',
      label: 'Kelas/Angkatan',
      sortable: true,
      render: (row) => <span className="text-main">{row.kelas || '—'}</span>,
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

  const tabs = [
    { key: 'kartu', label: 'Transaksi Kartu', shortLabel: 'Kartu', count: filteredData.length },
    { key: 'peminjaman', label: 'Peminjaman/Pengembalian', shortLabel: 'Peminjaman', count: peminjamanData.length },
    { key: 'sekali_pakai', label: 'Sekali Pakai', shortLabel: 'Sekali Pakai', count: sekaliPakaiBerhasil.length },
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Aktivitas Kartu & Alat Sekali Pakai"
        description="Pantau transaksi kartu, peminjaman/pengembalian, dan pemberian alat sekali pakai hari ini"
      />

      <PageNote title="Tiga Tabel Aktivitas" icon={IconMail}>
        Data hari ini dipisahkan menjadi tiga tabel: <b>Transaksi Kartu</b> untuk semua tap (termasuk ditolak),
        <b> Peminjaman/Pengembalian</b> untuk tap yang berhasil, dan <b>Sekali Pakai</b> untuk pemberian yang sudah disetujui.
        Data akan hilang besok.
      </PageNote>

      {/* ── Tab Switcher Pilihan Tampilan ── */}
      <div
        role="tablist"
        aria-label="Tabel aktivitas"
        className="grid grid-cols-3 gap-1.5 border-b border-gray-200 pb-2 sm:flex sm:items-center sm:gap-2"
      >
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 rounded-lg px-1.5 py-1.5 text-[11px] font-semibold transition sm:flex-row sm:gap-1.5 sm:px-3 sm:text-sm ${activeTab === tab.key
              ? 'bg-blue-600 text-white shadow-xs'
              : 'text-gray-600 hover:bg-gray-100'
              }`}
          >
            <span className="text-center leading-tight sm:whitespace-nowrap">
              <span className="sm:hidden">{tab.shortLabel}</span>
              <span className="hidden sm:inline">{tab.label}</span>
            </span>
            <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* ── TABEL 1: Semua Transaksi Kartu ── */}
      {activeTab === 'kartu' && (
        <div className="space-y-3 bg-white p-4 sm:p-5 rounded-2xl border border-main shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-800">Tabel Transaksi Kartu</h2>
              <p className="text-xs text-muted">Semua tap kartu hari ini, termasuk yang ditolak, menunggu, dan berhasil.</p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-blue-50 text-blue-800 border border-blue-200 self-start sm:self-auto">
              {filteredData.length} Tap Log
            </span>
          </div>

          <DataTable
            columns={columnsKartu}
            data={filteredData}
            loading={loading}
            searchPlaceholder="Cari aktivitas tap..."
            searchKeys={['kelas', 'uid_kartu', 'nama_alat', 'jenis_terdeteksi', 'jenis_tap', 'nama_pemegang', 'status_sekali_pakai', 'error_code', 'status']}
            emptyMessage="Belum ada aktivitas Transaksi Kartu untuk hari ini"
            emptyDescription="Tap kartu atau alat pada reader RFID akan muncul di sini."
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
                      if (taps.length === 0) {
                        showFeedback({ type: 'warning', title: 'Tidak ada data log', message: 'Log RFID masih kosong.' });
                        return;
                      }
                      setClearTarget('rfid');
                      setShowClearModal(true);
                    }}
                    className="w-full justify-center whitespace-nowrap min-[420px]:flex-1 md:w-auto md:flex-none"
                  >
                    Hapus Log Kartu
                  </Button>
                )}
              </div>
            }
          />
        </div>
      )}

      {/* ── TABEL 2: Peminjaman/Pengembalian Berhasil ── */}
      {activeTab === 'peminjaman' && (
        <div className="space-y-3 bg-white p-4 sm:p-5 rounded-2xl border border-main shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-800">Tabel Transaksi Peminjaman &amp; Pengembalian</h2>
              <p className="text-xs text-muted">Hanya tap yang berhasil meminjam atau mengembalikan alat.</p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 self-start sm:self-auto">
              {peminjamanData.length} Transaksi
            </span>
          </div>

          <DataTable
            columns={columnsPeminjaman}
            data={peminjamanData}
            loading={loading}
            searchPlaceholder="Cari peminjaman/pengembalian..."
            searchKeys={['kelas', 'uid_kartu', 'nama_alat', 'nama_pemegang', 'jenis_tap']}
            emptyMessage="Belum ada peminjaman/pengembalian berhasil hari ini"
            emptyDescription="Tap alat yang berhasil akan langsung masuk ke tabel ini."
            actionButton={
              <button
                type="button"
                onClick={() => reloadData(false)}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white text-gray-600 transition hover:bg-gray-50 min-[420px]:w-11 min-[420px]:border-0 min-[420px]:bg-transparent"
                title="Refresh data"
              >
                <IconRefresh size={18} />
                <span className="text-sm font-semibold min-[420px]:sr-only">Muat ulang</span>
              </button>
            }
          />
        </div>
      )}

      {/* ── TABEL 3: Transaksi Alat Sekali Pakai Berhasil ── */}
      {activeTab === 'sekali_pakai' && (
        <div className="space-y-3 bg-white p-4 sm:p-5 rounded-2xl border border-main shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-800">Tabel Transaksi Alat Sekali Pakai</h2>
              <p className="text-xs text-muted">Hanya pemberian alat sekali pakai yang sudah disetujui hari ini.</p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 self-start sm:self-auto">
              {sekaliPakaiBerhasil.length} Transaksi
            </span>
          </div>

          <DataTable
            columns={columnsSekaliPakai}
            data={sekaliPakaiBerhasil}
            loading={loading}
            searchPlaceholder="Cari transaksi sekali pakai hari ini..."
            searchKeys={['kelas', 'nama_alat', 'uid_kartu', 'pemegang', 'petugas', 'catatan']}
            emptyMessage="Belum ada transaksi alat sekali pakai yang berhasil hari ini"
            emptyDescription="Permintaan yang disetujui petugas akan langsung masuk ke tabel ini."
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
                      if (sekaliPakaiToday.length === 0) {
                        showFeedback({ type: 'warning', title: 'Tidak ada data log', message: 'Log transaksi sekali pakai masih kosong.' });
                        return;
                      }
                      setClearTarget('sekali_pakai');
                      setShowClearModal(true);
                    }}
                    className="w-full justify-center whitespace-nowrap min-[420px]:flex-1 md:w-auto md:flex-none"
                  >
                    Hapus Log Sekali Pakai
                  </Button>
                )}
              </div>
            }
          />
        </div>
      )}

      {/* Modal Konfirmasi Hapus Semua */}
      <Modal
        isOpen={showClearModal}
        onClose={() => {
          setShowClearModal(false);
          setClearInput('');
        }}
        title={clearTarget === 'rfid' ? 'Hapus Semua Log Kartu' : 'Hapus Log Transaksi Sekali Pakai'}
        subtitle={
          clearTarget === 'rfid'
            ? 'Yakin ingin menghapus seluruh log aktivitas tap RFID?'
            : 'Yakin ingin menghapus riwayat transaksi alat sekali pakai hari ini?'
        }
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
            <h4 className="text-sm font-bold text-red-900 mb-1">
              Peringatan Penting
            </h4>
            <p className="text-xs text-red-700 leading-relaxed">
              {clearTarget === 'rfid'
                ? `Semua data aktivitas Kartu (${taps.length} log) akan dihapus selamanya dan tidak bisa dikembalikan.`
                : `Semua data transaksi alat sekali pakai (${sekaliPakaiToday.length} data) yang telah diproses akan dihapus selamanya.`}
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
            <Button
              variant="secondary"
              onClick={() => {
                setShowClearModal(false);
                setClearInput('');
              }}
              className="w-full sm:w-auto justify-center h-11"
            >
              Batal
            </Button>
            <Button
              variant="danger"
              disabled={clearInput.toLowerCase() !== CONFIRM_TEXT}
              onClick={handleClearAll}
              className="w-full sm:w-auto justify-center h-11"
            >
              {clearTarget === 'rfid' ? 'Hapus Log Kartu' : 'Hapus Log Sekali Pakai'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
