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

async function fetchTapLog() {
  if (isSupabaseConfigured) {
    const todayStr = TODAY_WIB();

    const { data, error } = await supabase
      .from('tap_log')
      .select('*')
      .gte('waktu_tap', `${todayStr}T00:00:00+07:00`)
      .order('waktu_tap', { ascending: false });

    if (error) throw error;
    return data ?? [];
  }

  return dbService
    .getTapLog()
    .filter(d => {
      if (!d.waktu_tap) return false;

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

export default function AktivitasKartuPage() {
  const [taps, setTaps] = useState([]);
  const [kartuList, setKartuList] = useState([]);
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
      const [logsData, kartuData] = await Promise.all([fetchTapLog(), fetchKartuList()]);
      setTaps(logsData);
      setKartuList(kartuData);

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
      const channel = supabase.channel('tap_log_changes')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tap_log' }, () => {
          reloadData(true);
        })
        .subscribe();
      return () => supabase.removeChannel(channel);
    }
  }, [reloadData]);

  const filteredData = useMemo(() => {
    return taps.map(log => {
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
      label: 'Jenis Deteksi',
      sortable: true,
      render: (row) => {
        const isManual = row.jenis_terdeteksi === 'manual' || row.sumber === 'manual';
        return <Badge status={isManual ? 'manual' : 'realtime'} />;
      },
    },
    {
      key: 'hasil',
      label: 'Hasil',
      render: (row) => {
        if (row.status === 'ditolak') {
          return (
            <div className="flex items-center gap-1.5">
              <IconAlertTriangle size={13} className="text-red-500 flex-shrink-0" />
              <span className="text-xs text-red-600 font-medium">Gagal</span>
            </div>
          );
        }
        return <Badge status="berhasil" />;
      },
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Aktivitas Kartu"
        description="Data aktivitas kartu yang masuk secara realtime hari ini"
      />

      <PageNote title="Informasi Penting" icon={IconMail}>
        Data aktivitas realtime ini hanya menampilkan log tap kartu yang terjadi pada hari ini. anda harus menunggu kartu dan alat di tap pada Scan reader agar dapat muncul di log realtime ini.
      </PageNote>

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
                Hapus Semua
              </Button>
            )}
          </div>
        }
      />

      <p className="text-xs text-center text-muted font-medium">
        Menampilkan {filteredData.length} tap log hari ini
      </p>

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
