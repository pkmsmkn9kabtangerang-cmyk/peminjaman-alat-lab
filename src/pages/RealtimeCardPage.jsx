// src/pages/RealtimeCardPage.jsx
// Realtime tap log — hari ini saja, tanpa filter waktu

import { useState, useEffect, useMemo, useRef } from 'react';
import { dbService } from '../services/store';
import Badge from '../components/Badge';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import Button from '../components/Button';
import {
  IconAlertTriangle,
  IconAlertOctagon,
  IconShieldExclamation,
  IconTrash,
  IconCheck,
  IconCopy,
  IconX,
  IconCircleCheck,
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
  const [copied, setCopied]                 = useState(false);
  const [toastMessage, setToastMessage]     = useState('');
  const CONFIRM_TEXT = 'hapus semua log';
  const prevLen = useRef(taps.length);

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
    dbService.saveTapLog([]);
    setShowClearModal(false);
    setClearInput('');
    reload();
    setToastMessage('Semua log aktivitas tap RFID hari ini berhasil dibersihkan.');
    setTimeout(() => setToastMessage(''), 4500);
  };

  const columns = [
    {
      key: 'uid_kartu',
      label: 'Kartu ID',
      render: (row) => (
        <div className="flex items-center gap-2">
          {row._isNew && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-emerald-600 text-white shadow-xs animate-pulse shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
              BARU
            </span>
          )}
          <span
            className={`text-xs font-mono px-2 py-0.5 rounded ${
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
      render: (row) => <span className="font-semibold text-main text-xs">{row.nama_pemegang || '—'}</span>,
    },
    {
      key: 'kelas',
      label: 'Kelas',
      sortable: true,
      render: (row) => <span className="text-xs font-semibold text-main">{row.kelas ?? '—'}</span>,
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
      render: (row) => <span className="text-xs text-main">{row.nama_alat ?? '—'}</span>,
    },
    {
      key: 'waktu_tap',
      label: 'Waktu',
      sortable: true,
      render: (row) => <span className="text-xs font-mono text-muted whitespace-nowrap">{FORMAT_WIB(row.waktu_tap)}</span>,
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-main flex items-center gap-2">
            <span>Realtime Card</span>
          </h2>
          <p className="text-xs sm:text-sm text-muted mt-0.5">
            Melihat seluruh aktivitas peminjaman dan pengembalian alat secara realtime.
          </p>
        </div>
      </div>

      {/* Success Notification */}
      {toastMessage && (
        <div className="flex items-center justify-between p-3.5 bg-emerald-50 border border-emerald-200/90 rounded-xl text-emerald-800 text-xs sm:text-sm shadow-xs animate-fadeIn">
          <div className="flex items-center gap-2.5">
            <IconCircleCheck size={18} className="text-emerald-600 shrink-0" />
            <span className="font-medium">{toastMessage}</span>
          </div>
          <button
            onClick={() => setToastMessage('')}
            className="p-1 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-100 rounded-md transition"
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
        emptyMessage="Belum ada tap RFID hari ini."
        actionButton={
          <Button
            variant="danger-soft"
            icon={IconTrash}
            onClick={() => setShowClearModal(true)}
            className="w-full md:w-auto justify-center whitespace-nowrap"
          >
            Hapus Semua Aktivitas
          </Button>
        }
      />

      <p className="text-xs text-center text-muted font-medium">
        Menampilkan {filteredData.length} tap log hari ini
      </p>

      {/* Modal Konfirmasi Hapus Semua - SaaS Grade */}
      <Modal
        isOpen={showClearModal}
        onClose={() => {
          setShowClearModal(false);
          setClearInput('');
          setCopied(false);
        }}
        title="Hapus Semua Log Tap RFID"
        subtitle="Konfirmasi pembersihan seluruh catatan aktivitas tap kartu RFID hari ini"
        icon={IconAlertTriangle}
        iconVariant="danger"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          {/* Warning Banner */}
          <div className="flex items-start gap-3 p-3.5 bg-red-50/80 border border-red-200/90 rounded-xl">
            <div className="p-1.5 bg-red-100 text-red-600 rounded-lg shrink-0 mt-0.5">
              <IconAlertOctagon size={18} />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs sm:text-sm font-bold text-red-900">
                Peringatan: Tindakan Tidak Dapat Dibatalkan!
              </h4>
              <p className="text-[11px] sm:text-xs text-red-700 mt-0.5 leading-relaxed">
                Seluruh data riwayat tap RFID hari ini akan dibersihkan secara permanen dari penyimpanan.
              </p>
            </div>
          </div>

          {/* Confirmation Input Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label className="font-semibold text-gray-700">
                Ketik kalimat konfirmasi berikut:
              </label>
              <span className="text-[11px] text-gray-400 font-medium">Harus sama</span>
            </div>

            {/* Confirmation Key Codebox with Copy Button */}
            <div className="p-2.5 bg-gray-50 border border-gray-200/90 rounded-xl flex items-center justify-between gap-2">
              <code className="text-xs sm:text-sm font-mono font-bold text-red-600 select-all tracking-wide">
                {CONFIRM_TEXT}
              </code>
              <button
                type="button"
                onClick={() => {
                  setClearInput(CONFIRM_TEXT);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-blue-600 hover:text-blue-700 bg-white hover:bg-blue-50 px-2.5 py-1 rounded-lg border border-gray-200/90 shadow-2xs transition active:scale-95 shrink-0"
                title="Salin dan isi otomatis"
              >
                {copied ? <IconCheck size={13} className="text-emerald-600" /> : <IconCopy size={13} />}
                <span>{copied ? 'Tersalin' : 'Salin Teks'}</span>
              </button>
            </div>

            {/* Input with icon and feedback */}
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <IconShieldExclamation size={16} />
              </div>
              <input
                type="text"
                value={clearInput}
                onChange={(e) => setClearInput(e.target.value)}
                placeholder={`Ketik "${CONFIRM_TEXT}"`}
                className={`w-full pl-9 pr-9 h-10 rounded-xl border text-xs sm:text-sm transition-all focus:outline-none font-medium ${
                  clearInput.toLowerCase() === CONFIRM_TEXT
                    ? 'border-emerald-500 ring-2 ring-emerald-500/20 bg-emerald-50/20 text-emerald-900'
                    : clearInput.length > 0
                    ? 'border-red-400 ring-2 ring-red-500/10 bg-white text-gray-900'
                    : 'border-gray-300/90 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 bg-white text-gray-900'
                }`}
                autoComplete="off"
              />
              {clearInput.toLowerCase() === CONFIRM_TEXT && (
                <div className="absolute inset-y-0 right-0 pr-3 flex items-center text-emerald-600 pointer-events-none">
                  <IconCheck size={16} />
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons: Responsive 320px mobile to laptop */}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-3 border-t border-gray-100">
            <Button
              variant="secondary"
              icon={IconX}
              onClick={() => {
                setShowClearModal(false);
                setClearInput('');
                setCopied(false);
              }}
              className="w-full sm:w-auto justify-center"
            >
              Batal
            </Button>
            <Button
              variant="danger"
              icon={IconTrash}
              disabled={clearInput.toLowerCase() !== CONFIRM_TEXT}
              onClick={handleClearAll}
              className="w-full sm:w-auto justify-center shadow-xs shadow-red-500/20"
            >
              Hapus Semua Log
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

