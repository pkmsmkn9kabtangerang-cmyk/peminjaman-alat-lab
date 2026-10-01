// src/pages/RealtimeCardPage.jsx
// Realtime tap log — hari ini saja, tanpa filter waktu

import { useState, useEffect, useMemo, useRef } from 'react';
import { dbService } from '../services/store';
import Badge from '../components/Badge';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import Button from '../components/Button';
import PageHeader from '../components/PageHeader';
import {
  IconAlertTriangle,
  IconTrash,
  IconX,
  IconCircleCheck,
  IconAlertCircle,
} from '@tabler/icons-react';

const FORMAT_WIB = (iso) => {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(iso));
};

const TODAY = () => new Date().toISOString().slice(0, 10);

export default function RealtimeCardPage() {
  const [taps, setTaps]           = useState(() => dbService.getTapLog());
  const [kartuList, setKartuList] = useState(() => dbService.getKartu());
  const [newIds, setNewIds]       = useState(new Set());
  const [showClearModal, setShowClearModal] = useState(false);
  const [clearInput, setClearInput]         = useState('');
  const [toast, setToast]                   = useState(null);
  const CONFIRM_TEXT = 'hapus semua log';
  const prevLen = useRef(taps.length);

  const user = dbService.getCurrentUser();
  const isAdmin = user?.role === 'admin';

  const reload = () => {
    const logs = dbService.getTapLog();
    setTaps(logs);
    setKartuList(dbService.getKartu());
    if (logs.length > prevLen.current) {
      const added = logs.slice(0, logs.length - prevLen.current).map((l) => l.id);
      setNewIds((prev) => new Set([...prev, ...added]));
      setTimeout(() => {
        setNewIds((prev) => {
          const next = new Set(prev);
          added.forEach((id) => next.delete(id));
          return next;
        });
      }, 12000); // Tanda 'BARU' aktif selama 12 detik agar jelas terlihat
    }
    prevLen.current = logs.length;
  };

  useEffect(() => {
    dbService.markTapsRead();
    window.addEventListener('simlab_storage_updated', reload);
    const t = setInterval(reload, 1500);
    return () => {
      window.removeEventListener('simlab_storage_updated', reload);
      clearInterval(t);
    };
  }, []);

  // Hanya tampilkan data hari ini, maks 50
  const filteredData = useMemo(() => {
    const today = TODAY();
    const todayLogs = taps
      .filter(d => d.waktu_tap?.startsWith(today))
      .slice(0, 50);

    return todayLogs.map(log => {
      const kartu = kartuList.find(k => k.uid_kartu === log.uid_kartu);
      return {
        ...log,
        nama_pemegang: kartu?.nama_pemegang || log.nama_pemegang || null,
        _isNew: newIds.has(log.id),
      };
    });
  }, [taps, kartuList, newIds]);

  const handleClearAll = () => {
    if (clearInput.toLowerCase() !== CONFIRM_TEXT) return;
    if (taps.length === 0) {
      setShowClearModal(false);
      setClearInput('');
      setToast({
        type: 'warning',
        message: 'Tidak ada data aktivitas tap RFID untuk dihapus (log sudah kosong).',
      });
      setTimeout(() => setToast(null), 4500);
      return;
    }
    dbService.saveTapLog([]);
    setShowClearModal(false);
    setClearInput('');
    reload();
    setToast({
      type: 'success',
      message: 'Semua log aktivitas tap RFID hari ini berhasil dibersihkan.',
    });
    setTimeout(() => setToast(null), 4500);
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
            className={`font-medium text-[13px] lg:text-main px-2 py-0.5 rounded ${
              row._isNew
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
      {/* Page Header */}
      <PageHeader
        title="Aktivitas Kartu Secara Realtime"
        description="Data aktivitas realtime ini hanya tampil dalam 24 jam terakhir"
      />

      {/* Notification Toast */}
      {toast && (
        <div
          className={`flex items-center justify-between p-3.5 rounded-xl border text-xs sm:text-sm shadow-xs animate-fadeIn ${
            toast.type === 'warning'
              ? 'bg-amber-50 border-amber-300 text-amber-900'
              : 'bg-emerald-50 border-emerald-200/90 text-emerald-800'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {toast.type === 'warning' ? (
              <IconAlertCircle size={18} className="text-amber-600 shrink-0" />
            ) : (
              <IconCircleCheck size={18} className="text-emerald-600 shrink-0" />
            )}
            <span className="font-medium">{toast.message}</span>
          </div>
          <button
            onClick={() => setToast(null)}
            className={`p-1 rounded-md transition ${
              toast.type === 'warning'
                ? 'text-amber-600 hover:text-amber-800 hover:bg-amber-100'
                : 'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100'
            }`}
            aria-label="Tutup notifikasi"
          >
            <IconX size={14} />
          </button>
        </div>
      )}

      {/* Main DataTable */}
      <DataTable
        columns={columns}
        data={filteredData}
        searchPlaceholder="Cari aktivitas tap..."
        searchKeys={['kelas', 'uid_kartu', 'nama_alat', 'jenis_terdeteksi', 'jenis_tap', 'nama_pemegang']}
        emptyMessage="Belum ada aktivitas tap RFID untuk hari ini"
        actionButton={
          isAdmin && (
            <Button
              variant="danger-soft"
              icon={IconTrash}
              onClick={() => {
                if (taps.length === 0) {
                  setToast({
                    type: 'warning',
                    message: 'Tidak ada data log aktivitas RFID untuk dihapus (log masih kosong).',
                  });
                  setTimeout(() => setToast(null), 4500);
                  return;
                }
                setShowClearModal(true);
              }}
              className="w-full md:w-auto justify-center whitespace-nowrap"
            >
              Hapus Semua Aktivitas
            </Button>
          )
        }
      />

      <p className="text-xs text-center text-muted font-medium">
        Menampilkan {filteredData.length} tap log hari ini
      </p>

      {/* Modal Konfirmasi Hapus Semua - Gaptek Friendly */}
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
          {taps.length === 0 ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs sm:text-sm">
              Saat ini data aktivitas log RFID kosong. Tidak ada data yang dapat dihapus.
            </div>
          ) : (
            <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
              <h4 className="text-sm font-bold text-red-900 mb-1">
                Peringatan Penting
              </h4>
              <p className="text-xs text-red-700 leading-relaxed">
                Semua data aktivitas RFID ({taps.length} log) akan dihapus selamanya dan tidak bisa dikembalikan.
              </p>
            </div>
          )}

          <div className="space-y-2 mt-4">
            <label className="text-sm font-semibold text-gray-700 block">
              Untuk melanjutkan, ketik tulisan ini: <span className="font-bold text-red-600 bg-gray-100 px-2 py-1 rounded select-all">{CONFIRM_TEXT}</span>
            </label>
            
            <input
              type="text"
              value={clearInput}
              onChange={(e) => setClearInput(e.target.value)}
              placeholder={`Ketik: ${CONFIRM_TEXT}`}
              disabled={taps.length === 0}
              className="w-full px-4 h-12 rounded-xl border border-gray-300 text-base focus:outline-none focus:border-red-500 focus:ring-2 focus:ring-red-500/20 bg-white text-gray-900 disabled:bg-gray-100 disabled:cursor-not-allowed"
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
              disabled={taps.length === 0 || clearInput.toLowerCase() !== CONFIRM_TEXT}
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

