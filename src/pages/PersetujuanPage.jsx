import { useState, useEffect } from 'react';
import { dbService } from '../services/store';
import Button from '../components/Button';
import { IconCheck, IconClock } from '@tabler/icons-react';

export default function PersetujuanPage() {
  const [tapLogs, setTapLogs] = useState(() => dbService.getTapLog().filter(l => l.status === 'pending'));
  const [koreksiJenisMap, setKoreksiJenisMap] = useState({});

  const loadLogs = () => {
    const logs = dbService.getTapLog();
    setTapLogs(logs.filter(l => l.status === 'pending'));
  };

  useEffect(() => {
    const interval = setInterval(loadLogs, 2000);
    return () => clearInterval(interval);
  }, []);

  const handleConfirm = (logId) => {
    const user = dbService.getCurrentUser();
    const koreksi = koreksiJenisMap[logId];
    const res = dbService.konfirmasiTransaksi(logId, user?.nama || 'Petugas Lab', koreksi);
    if (res.success) {
      loadLogs();
    } else {
      alert(res.message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-main">Antrian Persetujuan Tap RFID</h2>
        <p className="text-xs text-muted">Daftar transaksi masuk dari scanner ESP32 yang menunggu konfirmasi petugas.</p>
      </div>

      <div className="bg-surface rounded-xl border border-main overflow-hidden shadow-xs">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-main bg-gray-50 text-xs text-muted">
              <th className="p-4 font-medium">Kelas / Perwakilan</th>
              <th className="p-4 font-medium">Alat Dipilih</th>
              <th className="p-4 font-medium">Jenis Deteksi Otomatis</th>
              <th className="p-4 font-medium">Waktu Tap</th>
              <th className="p-4 font-medium text-right">Aksi Konfirmasi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-main">
            {tapLogs.map((log) => {
              const selectedJenis = koreksiJenisMap[log.id_log] || log.jenis_terdeteksi;
              return (
                <tr key={log.id_log} className="hover:bg-gray-50/50 transition">
                  <td className="p-4">
                    <p className="font-semibold text-main">{log.kelas}</p>
                    <p className="text-xs font-mono text-muted">{log.uid_kartu}</p>
                  </td>
                  <td className="p-4">
                    <p className="font-semibold text-main">{log.nama_alat}</p>
                    <p className="text-xs font-mono text-muted">{log.uid_alat}</p>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <select
                        value={selectedJenis}
                        onChange={(e) => setKoreksiJenisMap({ ...koreksiJenisMap, [log.id_log]: e.target.value })}
                        className="text-xs px-2 py-1.5 rounded border border-main bg-white font-bold uppercase text-blue-700"
                      >
                        <option value="pinjam">Pinjam</option>
                        <option value="kembali">Kembali</option>
                      </select>
                      <span className="text-[11px] text-muted">(Bisa dikoreksi)</span>
                    </div>
                  </td>
                  <td className="p-4 text-xs text-muted flex items-center gap-1">
                    <IconClock size={14} />
                    {new Date(log.waktu_tap).toLocaleTimeString()}
                  </td>
                  <td className="p-4 text-right">
                    <Button
                      variant="success"
                      className="text-xs py-1.5 px-3"
                      icon={IconCheck}
                      onClick={() => handleConfirm(log.id_log)}
                    >
                      Konfirmasi
                    </Button>
                  </td>
                </tr>
              );
            })}
            {tapLogs.length === 0 && (
              <tr>
                <td colSpan="5" className="py-12 text-center text-muted text-sm">
                  Tidak ada antrian tap RFID yang menunggu persetujuan. Sistem siap menerima tap baru.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
