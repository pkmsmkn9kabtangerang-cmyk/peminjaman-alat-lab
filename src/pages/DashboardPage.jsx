import { useState, useEffect } from 'react';
import { dbService } from '../services/store';
import StatCard from '../components/StatCard';
import Badge from '../components/Badge';
import Button from '../components/Button';
import {
  IconBox,
  IconClock,
  IconCheck,
  IconArrowRight,
  IconAlertCircle,
  IconCpu
} from '@tabler/icons-react';

export default function DashboardPage({ setCurrentTab }) {
  const [alatList, setAlatList] = useState(() => dbService.getAlat());
  const [tapLogs, setTapLogs] = useState(() => dbService.getTapLog());
  const [transaksiList, setTransaksiList] = useState(() => dbService.getTransaksi());

  const loadData = () => {
    setAlatList(dbService.getAlat());
    setTapLogs(dbService.getTapLog());
    setTransaksiList(dbService.getTransaksi());
  };

  useEffect(() => {
    const handleStorage = () => loadData();
    window.addEventListener('simlab_storage_updated', handleStorage);
    const interval = setInterval(loadData, 2000);
    return () => {
      window.removeEventListener('simlab_storage_updated', handleStorage);
      clearInterval(interval);
    };
  }, []);

  const pendingLogs = tapLogs.filter(l => l.status === 'pending');
  const totalAlat = alatList.reduce((acc, curr) => acc + (curr.stok_total || 1), 0);
  const totalDipinjam = alatList.filter(a => a.status === 'dipinjam').length;
  const totalTersedia = alatList.filter(a => a.status === 'tersedia').length;
  const transaksiHariIni = transaksiList.length;

  const handleProcessLog = (logId) => {
    const currentUser = dbService.getCurrentUser();
    const res = dbService.konfirmasiTransaksi(logId, currentUser?.nama || 'Petugas Lab');
    if (res.success) {
      loadData();
    } else {
      alert(res.message);
    }
  };

  return (
    <div className="space-y-6">
      {pendingLogs.length > 0 && (
        <div className="bg-emerald-600 text-white p-4 rounded-xl shadow-md flex items-center justify-between animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/20 rounded-lg animate-pulse">
              <IconAlertCircle size={22} />
            </div>
            <div>
              <h4 className="font-semibold text-sm">Aktivitas RFID Masuk ({pendingLogs.length} Menunggu Konfirmasi)</h4>
              <p className="text-xs text-emerald-100">
                Kelas <span className="font-bold underline">{pendingLogs[0].kelas}</span> melakukan tap untuk <span className="font-bold uppercase">{pendingLogs[0].jenis_terdeteksi}</span> alat <span className="font-bold">{pendingLogs[0].nama_alat}</span>.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="success"
              className="bg-white text-emerald-700 hover:bg-emerald-50 border-0 text-xs py-1.5"
              onClick={() => handleProcessLog(pendingLogs[0].id_log)}
            >
              Konfirmasi Cepat
            </Button>
            <Button
              variant="secondary"
              className="bg-transparent text-white border-white/40 hover:bg-white/10 text-xs py-1.5"
              onClick={() => setCurrentTab('persetujuan')}
            >
              Lihat Semua Antrian
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Alat Lab" value={totalAlat} icon={IconBox} color="blue" />
        <StatCard title="Alat Tersedia" value={totalTersedia} icon={IconCheck} color="green" />
        <StatCard title="Sedang Dipinjam" value={totalDipinjam} icon={IconClock} color="amber" />
        <StatCard title="Transaksi Masuk" value={transaksiHariIni} icon={IconArrowRight} color="purple" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-surface rounded-xl border border-main p-5 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-main text-base">Histori Transaksi Terbaru</h3>
            <button
              onClick={() => setCurrentTab('riwayat')}
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              Lihat Semua →
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-main text-xs text-muted">
                  <th className="pb-3 font-medium">Kelas / Alat</th>
                  <th className="pb-3 font-medium">Jenis</th>
                  <th className="pb-3 font-medium">Waktu</th>
                  <th className="pb-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-main">
                {transaksiList.slice(0, 5).map((trx) => (
                  <tr key={trx.id_transaksi} className="hover:bg-gray-50/50 transition">
                    <td className="py-3">
                      <p className="font-semibold text-main">{trx.kelas}</p>
                      <p className="text-xs text-muted">{trx.nama_alat}</p>
                    </td>
                    <td className="py-3">
                      <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${trx.jenis === 'pinjam' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                        {trx.jenis}
                      </span>
                    </td>
                    <td className="py-3 text-xs text-muted">
                      {new Date(trx.waktu_tap).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3">
                      <Badge status={trx.status} />
                    </td>
                  </tr>
                ))}
                {transaksiList.length === 0 && (
                  <tr>
                    <td colSpan="4" className="py-8 text-center text-xs text-muted">
                      Belum ada transaksi tercatat.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-surface rounded-xl border border-main p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-main text-base mb-3">Status Sistem IoT RFID</h3>
            <div className="space-y-3">
              <div className="p-3 bg-gray-50 rounded-lg border border-main flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                  <span className="text-xs font-medium text-main">ESP32 & Scanner RC522</span>
                </div>
                <span className="text-xs font-bold text-emerald-600">Online</span>
              </div>

              <div className="p-3 bg-gray-50 rounded-lg border border-main flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                  <span className="text-xs font-medium text-main">Firestore Cloud Database</span>
                </div>
                <span className="text-xs font-bold text-blue-600">Connected</span>
              </div>
            </div>

            <div className="mt-5 p-4 bg-blue-50 rounded-xl border border-blue-100">
              <h4 className="text-xs font-bold text-blue-900 mb-1">Simulasi Tap RFID</h4>
              <p className="text-xs text-blue-700 mb-3">
                Uji coba alur tap kartu perwakilan kelas & sticker alat lab tanpa perangkat fisik.
              </p>
              <Button
                variant="primary"
                icon={IconCpu}
                className="w-full justify-center text-xs"
                onClick={() => setCurrentTab('simulasi_iot')}
              >
                Buka Simulator IoT
              </Button>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-main text-center">
            <p className="text-[11px] text-muted">SIMLAB v1.0.0 — PKM 2026</p>
          </div>
        </div>
      </div>
    </div>
  );
}
