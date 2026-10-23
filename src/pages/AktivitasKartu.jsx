// src/pages/AktivitasKartu.jsx
// Realtime tap log — hari ini saja, tanpa filter waktu

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { dbService } from '../services/store';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import Badge from '../components/Badge';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import Button from '../components/Button';
import PageHeader from '../components/PageHeader';
import PageNote from '../components/PageNote';
import { showFeedback, friendlyError } from '../lib/feedback';
import {
  IconAlertTriangle,
  IconTrash,
  IconX,
  IconCircleCheck,
  IconAlertCircle,
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

async function fetchTapLog() {
  if (isSupabaseConfigured) {
    const todayStr = TODAY_WIB();

    const { data, error } = await supabase
      .from('tap_log')
      .select('*')
      .or('jenis_terdeteksi.neq.manual,jenis_terdeteksi.is.null')
      .gte('waktu_tap', `${todayStr}T00:00:00+07:00`)
      .order('waktu_tap', { ascending: false });

    if (error) throw error;
    return (data ?? []).filter(d => d.jenis_terdeteksi !== 'manual' && d.sumber !== 'manual');
  }

  return dbService
    .getTapLog()
    .filter(d => {
      if (!d.waktu_tap) return false;
      if (d.jenis_terdeteksi === 'manual' || d.sumber === 'manual') return false;

      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(d.waktu_tap)) === TODAY_WIB();
    });
}

async function fetchKartuList() {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('kartu_rfid')
      .select('uid_kartu, nama_pemegang');
    if (error) return [];
    return data ?? [];
  }
  return dbService.getKartu();
}

async function fetchSekaliPakaiHariIni() {
  if (isSupabaseConfigured) {
    const todayStr = TODAY_WIB();
    const { data, error } = await supabase
      .from('permintaan_habis_pakai')
      .select('*, kartu_rfid(nama_pemegang)')
      .gte('created_at', `${todayStr}T00:00:00+07:00`)
      .order('created_at', { ascending: false });
    if (error) {
      const { data: fallback } = await supabase
        .from('permintaan_habis_pakai')
        .select('*, kartu_rfid(nama_pemegang)')
        .order('waktu_tap', { ascending: false })
        .limit(30);
      return (fallback || []).map(r => ({
        ...r,
        pemegang: r.kartu_rfid?.nama_pemegang || '—',
      }));
    }
    return (data || []).map(r => ({
      ...r,
      pemegang: r.kartu_rfid?.nama_pemegang || '—',
    }));
  }

  const all = dbService.getPermintaan();
  const kartu = dbService.getKartu();
  const todayStr = TODAY_WIB();
  return all
    .filter(d => {
      const t = d.created_at || d.waktu_tap || d.waktu_proses;
      if (!t) return false;
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jakarta',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date(t)) === todayStr;
    })
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
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'rfid' | 'sekali_pakai'
  const [loading, setLoading] = useState(true);
  const [newIds, setNewIds] = useState(new Set());
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearInput, setClearInput] = useState('');
  const CONFIRM_TEXT = 'hapus semua log';
  const prevLen = useRef(0);

  // Ambil user dari Supabase auth session, atau fallback
  const [user, setUser] = useState(null);
  useEffect(() => {
    if (isSupabaseConfigured) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.user) {
          supabase.from('profiles').select('role').eq('id', session.user.id).single()
            .then(({ data }) => setUser({ role: data?.role }));
        }
      });
    } else {
      setUser(dbService.getCurrentUser());
    }
  }, []);

  const isAdmin = user?.role === 'admin';

  const reloadData = useCallback(async (isRealtimeEvent = false) => {
    if (!isRealtimeEvent) setLoading(true);
    try {
      const [logsData, kartuData, sekaliData] = await Promise.all([
        fetchTapLog(),
        fetchKartuList(),
        fetchSekaliPakaiHariIni(),
      ]);
      setTaps(logsData);
      setKartuList(kartuData);
      setSekaliPakaiToday(sekaliData);

      if (logsData.length > prevLen.current && prevLen.current > 0) {
        // Asumsi data baru selalu di awal (karena descending)
        const added = logsData.slice(0, logsData.length - prevLen.current).map((l) => l.id);
        setNewIds((prev) => new Set([...prev, ...added]));
        setTimeout(() => {
          setNewIds((prev) => {
            const next = new Set(prev);
            added.forEach((id) => next.delete(id));
            return next;
          });
        }, 12000); // Tanda 'BARU' aktif 12 detik
      }
      prevLen.current = logsData.length;
    } catch (err) {
      console.error('[AktivitasKartu] load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reloadData();

    // Mark as read (update UI flag)
    if (isSupabaseConfigured) {
      supabase
        .rpc('mark_taps_read')
        .then(({ error }) => {
          if (error) console.error('[AktivitasKartu] mark taps read error:', error);
        });
    } else {
      dbService.markTapsRead();
    }

    if (!isSupabaseConfigured) {
      const handleStorage = () => reloadData(true);
      window.addEventListener('simlab_storage_updated', handleStorage);
      const t = setInterval(() => reloadData(true), 3000);
      return () => {
        window.removeEventListener('simlab_storage_updated', handleStorage);
        clearInterval(t);
      };
    } else {
      // Supabase realtime
      const ch1 = supabase.channel('tap_log_changes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tap_log' }, (payload) => {
          if (payload.new?.jenis_terdeteksi === 'manual') return;
          reloadData(true);
        })
        .subscribe();
      const ch2 = supabase.channel('permintaan_changes_aktivitaskartu')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'permintaan_habis_pakai' }, () => {
          reloadData(true);
        })
        .subscribe();
      return () => {
        supabase.removeChannel(ch1);
        supabase.removeChannel(ch2);
      };
    }
  }, [reloadData]);

  const filteredData = useMemo(() => {
    return taps
      .filter(log => log.jenis_terdeteksi !== 'manual' && log.sumber !== 'manual')
      .map(log => {
        const kartu = kartuList.find(k => k.uid_kartu === log.uid_kartu);
        return {
          ...log,
          nama_pemegang: kartu?.nama_pemegang || log.nama_pemegang || null,
          _isNew: newIds.has(log.id),
        };
      });
  }, [taps, kartuList, newIds]);

  const handleClearAll = async () => {
    if (clearInput.toLowerCase() !== CONFIRM_TEXT) return;

    if (isSupabaseConfigured) {
      try {
        const { error } = await supabase.from('tap_log').delete().neq('id', 0); // Hapus semua
        if (error) throw error;
        showFeedback({ type: 'success', title: 'Semua log aktivitas tap RFID berhasil dibersihkan.' });
        reloadData();
      } catch (err) {
        showFeedback({ type: 'error', title: 'Gagal menghapus log.', message: friendlyError(err) });
      }
    } else {
      dbService.saveTapLog([]);
      reloadData();
      showFeedback({ type: 'success', title: 'Semua log aktivitas tap RFID hari ini berhasil dibersihkan.' });
    }

    setShowClearModal(false);
    setClearInput('');
  };

  const columns = [
    {
      key: 'uid_kartu',
      label: 'ID Kartu',
      render: (row) => (
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
      ),
    },
    {
      key: 'nama_pemegang',
      label: 'Pemegang',
      sortable: true,
      render: (row) => <span className="font-semibold text-main">{row.nama_pemegang || '—'}</span>,
    },
    {
      key: 'kelas',
      label: 'Kelas',
      sortable: true,
      render: (row) => <span className="text-main">{row.kelas ?? '—'}</span>,
    },
    {
      key: 'jenis_tap',
      label: 'Jenis Tap',
      render: (row) => <Badge status={row.jenis_tap} />,
    },
    {
      key: 'nama_alat',
      label: 'Alat',
      sortable: true,
      render: (row) => <span className="font-semibold text-main">{row.nama_alat ?? '—'}</span>,
    },
    {
      key: 'status_alat',
      label: 'Status Alat',
      render: (row) => {
        if (row.status === 'menunggu') {
          return <Badge status="menunggu" label="Menunggu" />;
        }
        let st = '';
        if (row.status === 'berhasil') {
          if (row.jenis_tap === 'pinjam') st = 'dipinjam';
          if (row.jenis_tap === 'kembali') st = 'dikembalikan';
        }
        return st ? <Badge status={st} /> : <span className="text-[11px] text-gray-400">—</span>;
      },
    },
    {
      key: 'waktu_tap',
      label: 'Waktu',
      sortable: true,
      render: (row) => <span className="font-medium text-[13px] lg:text-main">{FORMAT_WIB(row.waktu_tap)}</span>,
    },
    {
      key: 'jenis_terdeteksi',
      label: 'Sumber Tap',
      sortable: true,
      render: () => <Badge status="realtime" label="RFID Reader" />,
    },
    {
      key: 'hasil',
      label: 'Hasil',
      render: (row) => {
        if (row.status === 'ditolak') {
          const detail = row.error_code ? ` (${row.error_code.replace(/_/g, ' ')})` : '';
          return (
            <div className="flex items-center gap-1.5" title={row.error_code || 'Scan ditolak'}>
              <IconAlertTriangle size={13} className="text-red-500 flex-shrink-0" />
              <span className="text-xs text-red-600 font-medium">Ditolak{detail}</span>
            </div>
          );
        }
        if (row.status === 'menunggu') {
          return <Badge status="menunggu" label="Menunggu" />;
        }
        return <Badge status="berhasil" />;
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
          {FORMAT_WIB(row.waktu_proses || row.waktu_tap || row.created_at)}
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
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Aktivitas Kartu RFID & Alat"
        description="Data aktivitas tap kartu RFID realtime hari ini serta transaksi alat sekali pakai."
      />

      <PageNote title="Informasi Pemisahan Aktivitas" icon={IconMail}>
        Aktivitas harian dipisahkan menjadi dua tabel khusus: log scan dari reader RFID / ESP32 dan catatan transaksi pemberian alat sekali pakai hari ini.
      </PageNote>

      {/* ── Tab Switcher Pilihan Tampilan ── */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition ${activeTab === 'all'
            ? 'bg-blue-600 text-white shadow-xs'
            : 'text-gray-600 hover:bg-gray-100'
            }`}
        >
          Semua Aktivitas
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('rfid')}
          className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 ${activeTab === 'rfid'
            ? 'bg-blue-600 text-white shadow-xs'
            : 'text-gray-600 hover:bg-gray-100'
            }`}
        >
          Aktivitas RFID Reader ({filteredData.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('sekali_pakai')}
          className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 ${activeTab === 'sekali_pakai'
            ? 'bg-blue-600 text-white shadow-xs'
            : 'text-gray-600 hover:bg-gray-100'
            }`}
        >
          Transaksi Sekali Pakai Hari Ini ({sekaliPakaiToday.length})
        </button>
      </div>

      {/* ── TABEL 1: Aktivitas Tap Kartu RFID (Reader ESP32) ── */}
      {(activeTab === 'all' || activeTab === 'rfid') && (
        <div className="space-y-3 bg-white p-4 sm:p-5 rounded-2xl border border-main shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-800">Tabel Aktivitas Tap Kartu RFID </h2>
              <p className="text-xs text-muted">Khusus log scan kartu dan alat dari reader RFID hari ini.</p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-blue-50 text-blue-800 border border-blue-200 self-start sm:self-auto">
              {filteredData.length} Tap Log
            </span>
          </div>

          <DataTable
            columns={columns}
            data={filteredData}
            loading={loading}
            searchPlaceholder="Cari aktivitas tap..."
            searchKeys={['kelas', 'uid_kartu', 'nama_alat', 'jenis_terdeteksi', 'jenis_tap', 'nama_pemegang']}
            emptyMessage="Belum ada aktivitas tap RFID untuk hari ini"
            actionButton={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => reloadData(false)}
                  className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
                  title="Refresh data"
                >
                  <IconRefresh size={18} />
                </button>
                {isAdmin && (
                  <Button
                    variant="danger-soft"
                    icon={IconTrash}
                    onClick={() => {
                      if (taps.length === 0) {
                        showFeedback({ type: 'warning', title: 'Tidak ada data log', message: 'Log masih kosong.' });
                        return;
                      }
                      setShowClearModal(true);
                    }}
                    className="w-full md:w-auto justify-center whitespace-nowrap"
                  >
                    Hapus Log RFID
                  </Button>
                )}
              </div>
            }
          />
        </div>
      )}

      {/* ── TABEL 2: Transaksi Alat Sekali Pakai (Hari Ini) ── */}
      {(activeTab === 'all' || activeTab === 'sekali_pakai') && (
        <div className="space-y-3 bg-white p-4 sm:p-5 rounded-2xl border border-main shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-gray-100">
            <div>
              <h2 className="text-base font-bold text-gray-800">Tabel Transaksi Alat Sekali Pakai (Hari Ini)</h2>
              <p className="text-xs text-muted">Khusus catatan pemberian alat consumable kepada kelas yang diproses hari ini.</p>
            </div>
            <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 self-start sm:self-auto">
              {sekaliPakaiToday.length} Transaksi
            </span>
          </div>

          <DataTable
            columns={columnsSekaliPakai}
            data={sekaliPakaiToday}
            loading={loading}
            searchPlaceholder="Cari transaksi sekali pakai hari ini..."
            searchKeys={['kelas', 'nama_alat', 'uid_kartu', 'pemegang', 'petugas', 'catatan']}
            emptyMessage="Belum ada transaksi alat sekali pakai untuk hari ini"
            actionButton={
              <button
                type="button"
                onClick={() => reloadData(false)}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
                title="Refresh data"
              >
                <IconRefresh size={18} />
              </button>
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
        title="Hapus Semua Log"
        subtitle="Yakin ingin menghapus semua data?"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
            <h4 className="text-sm font-bold text-red-900 mb-1">
              Peringatan Penting
            </h4>
            <p className="text-xs text-red-700 leading-relaxed">
              Semua data aktivitas RFID ({taps.length} log) akan dihapus selamanya dan tidak bisa dikembalikan.
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
              Hapus Semua Log
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
