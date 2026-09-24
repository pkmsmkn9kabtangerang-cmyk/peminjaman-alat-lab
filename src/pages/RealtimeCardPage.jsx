// src/pages/RealtimeCardPage.jsx
// Realtime tap log — hari ini saja, tanpa filter waktu

import { useState, useEffect, useMemo, useRef } from 'react';
import { dbService } from '../services/store';
import Badge from '../components/Badge';
import DataTable from '../components/DataTable';
import Modal from '../components/Modal';
import Button from '../components/Button';
import { IconRadioactive, IconAlertTriangle, IconTrash } from '@tabler/icons-react';

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
      }, 3000);
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
  };

  const columns = [
    {
      key: 'waktu_tap',
      label: 'Waktu',
      sortable: true,
      render: (row) => <span className="text-xs font-mono text-muted whitespace-nowrap">{FORMAT_WIB(row.waktu_tap)}</span>,
    },
    {
      key: 'kelas',
      label: 'Kelas',
      sortable: true,
      render: (row) => <span className="text-xs font-semibold text-main">{row.kelas ?? '—'}</span>,
    },
    {
      key: 'nama_pemegang',
      label: 'Pemegang',
      sortable: true,
      render: (row) => <span className="font-semibold text-main text-xs">{row.nama_pemegang || '—'}</span>,
    },
    {
      key: 'uid_kartu',
      label: 'Kartu ID',
      render: (row) => <span className="text-xs font-mono text-muted">{row.uid_kartu ?? '—'}</span>,
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
      key: 'jenis_terdeteksi',
      label: 'Jenis Deteksi',
      sortable: true,
      render: (row) => {
        const isManual = row.jenis_terdeteksi === 'manual' || row.sumber === 'manual';
        return <Badge status={isManual ? 'manual' : 'otomatis'} />;
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
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-main flex items-center gap-2">
            <IconRadioactive size={20} className="text-blue-600" />
            Realtime Card
          </h2>
          <p className="text-xs text-muted mt-0.5">Aktivitas tap RFID hari ini · Diperbarui otomatis setiap 1,5 detik</p>
        </div>
        <button
          onClick={() => setShowClearModal(true)}
          className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-2 rounded-lg border border-red-200 transition-colors font-medium"
        >
          <IconTrash size={14} />
          Hapus Semua Aktivitas
        </button>
      </div>

      <DataTable
        columns={columns}
        data={filteredData}
        searchPlaceholder="Cari kelas, kartu ID, alat..."
        searchKeys={['kelas', 'uid_kartu', 'nama_alat', 'jenis_terdeteksi', 'jenis_tap', 'nama_pemegang']}
        emptyMessage="Belum ada tap RFID hari ini."
      />

      <p className="text-xs text-center text-muted">
        Menampilkan {filteredData.length} tap log hari ini
      </p>

      {/* Modal Konfirmasi Hapus Semua */}
      <Modal isOpen={showClearModal} onClose={() => { setShowClearModal(false); setClearInput(''); }} title="Hapus Semua Log Tap RFID">
        <div className="space-y-4">
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm font-semibold text-red-700 mb-1">⚠ Tindakan ini tidak dapat dibatalkan!</p>
            <p className="text-xs text-red-600">Seluruh data log tap RFID akan dihapus secara permanen.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">
              Ketik <code className="bg-gray-100 px-1.5 py-0.5 rounded text-red-600 font-mono">{CONFIRM_TEXT}</code> untuk mengkonfirmasi:
            </label>
            <input
              type="text"
              value={clearInput}
              onChange={(e) => setClearInput(e.target.value)}
              placeholder={CONFIRM_TEXT}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
              autoComplete="off"
            />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="secondary" onClick={() => { setShowClearModal(false); setClearInput(''); }}>Batal</Button>
            <button
              onClick={handleClearAll}
              disabled={clearInput.toLowerCase() !== CONFIRM_TEXT}
              className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Hapus Semua Log
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
