// src/pages/RealtimeCardPage.jsx
// Menggantikan PersetujuanPage — Realtime tap log tanpa konfirmasi manual

import { useState, useEffect, useRef } from 'react';
import { dbService } from '../services/store';
import Badge from '../components/Badge';
import { IconRadioactive, IconAlertTriangle } from '@tabler/icons-react';

const FORMAT_WIB = (iso) => {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    timeZone: 'Asia/Jakarta',
  }).format(new Date(iso));
};

const ERROR_LABELS = {
  kartu_nonaktif:    'Kartu nonaktif',
  uid_tidak_dikenal: 'UID tidak dikenal',
  sesi_tidak_ada:    'Sesi habis / belum tap kartu',
  stok_habis:        'Stok habis',
};

export default function RealtimeCardPage() {
  const [taps, setTaps]     = useState(() => dbService.getTapLog());
  const [newIds, setNewIds] = useState(new Set());
  const prevLen             = useRef(taps.length);

  const reload = () => {
    const logs = dbService.getTapLog();
    setTaps(logs);
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
    // Tandai semua terbaca saat halaman dibuka
    dbService.markTapsRead();

    window.addEventListener('simlab_storage_updated', reload);
    const t = setInterval(reload, 1500);
    return () => {
      window.removeEventListener('simlab_storage_updated', reload);
      clearInterval(t);
    };
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-main flex items-center gap-2">
            <IconRadioactive size={20} className="text-blue-600" />
            Realtime Card
          </h2>
          <p className="text-xs text-muted">
            Log setiap tap RFID dari scanner ESP32. Transaksi masuk otomatis tanpa konfirmasi manual.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 text-xs text-emerald-600 font-semibold bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full self-start sm:self-auto">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping-slow inline-block" />
          Live
        </div>
      </div>

      {/* Tabel */}
      <div className="bg-surface rounded-xl border border-main overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-main bg-gray-50 text-xs text-muted">
                <th className="p-4 font-semibold">Waktu Tap</th>
                <th className="p-4 font-semibold">Kelas</th>
                <th className="p-4 font-semibold">Kartu ID</th>
                <th className="p-4 font-semibold">Jenis Tap</th>
                <th className="p-4 font-semibold">Alat</th>
                <th className="p-4 font-semibold">Jenis Deteksi</th>
                <th className="p-4 font-semibold">Hasil</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-main">
              {taps.map((log) => {
                const isNew     = newIds.has(log.id);
                const isDitolak = log.status === 'ditolak';
                return (
                  <tr
                    key={log.id}
                    className={`transition ${isNew ? 'animate-highlight' : 'hover:bg-gray-50/50'} ${isDitolak ? 'bg-red-50/40' : ''}`}
                  >
                    <td className="p-4 text-xs font-mono text-muted whitespace-nowrap">
                      {FORMAT_WIB(log.waktu_tap)}
                    </td>
                    <td className="p-4 text-xs font-semibold text-main">{log.kelas ?? '—'}</td>
                    <td className="p-4 text-xs font-mono text-muted">{log.uid_kartu ?? '—'}</td>
                    <td className="p-4">
                      <Badge status={log.jenis_tap} />
                    </td>
                    <td className="p-4 text-xs text-main">{log.nama_alat ?? '—'}</td>
                    <td className="p-4">
                      {log.jenis_terdeteksi
                        ? <Badge status={log.jenis_terdeteksi} />
                        : <span className="text-xs text-muted">—</span>
                      }
                    </td>
                    <td className="p-4">
                      {isDitolak ? (
                        <div className="flex items-center gap-1.5">
                          <IconAlertTriangle size={13} className="text-red-500 flex-shrink-0" />
                          <span className="text-xs text-red-600 font-medium">
                            {ERROR_LABELS[log.error_code] ?? log.error_code ?? 'Ditolak'}
                          </span>
                        </div>
                      ) : (
                        <Badge status="berhasil" />
                      )}
                    </td>
                  </tr>
                );
              })}
              {taps.length === 0 && (
                <tr>
                  <td colSpan="7" className="py-16 text-center text-muted text-sm">
                    Belum ada tap RFID. Lakukan tap kartu kelas dan sticker alat lab.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-center text-muted">
        Showing {taps.length} tap log terbaru · Diperbarui otomatis setiap 1,5 detik
      </p>
    </div>
  );
}
