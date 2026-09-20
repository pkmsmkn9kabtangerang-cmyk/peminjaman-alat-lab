// src/pages/SimulasiIotPage.jsx
// Simulator ESP32: kirim payload tap RFID

import { useState, useEffect } from 'react';
import { dbService } from '../services/store';
import Button from '../components/Button';
import Badge from '../components/Badge';
import { IconCpu, IconWifi, IconIdBadge2, IconBox } from '@tabler/icons-react';

export default function SimulasiIotPage() {
  const [kartuList, setKartuList] = useState([]);
  const [alatList, setAlatList]   = useState([]);
  const [logs, setLogs]           = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [loading, setLoading]     = useState(false);

  const loadData = () => {
    setKartuList(dbService.getKartu());
    setAlatList(dbService.getAlatWithStok());
    const sessions = dbService.getActiveSessions();
    setActiveSession(sessions.length > 0 ? sessions[0] : null);
  };

  useEffect(() => {
    loadData();
    window.addEventListener('simlab_storage_updated', loadData);
    const t = setInterval(loadData, 2000);
    return () => { window.removeEventListener('simlab_storage_updated', loadData); clearInterval(t); };
  }, []);

  const addLog = (msg, type = 'info') => {
    setLogs((prev) => [{ id: Date.now(), time: new Date().toLocaleTimeString('id-ID'), msg, type }, ...prev].slice(0, 10));
  };

  const handleTap = async (uid, label, type) => {
    setLoading(true);
    addLog(`[TX] Mengirim UID: ${uid} (${label})`, 'tx');

    setTimeout(() => {
      try {
        const res = dbService.processTap(uid, 'simulator-01');
        if (res.ok) {
          addLog(`[RX] Berhasil: ${res.jenis} ${res.type === 'kartu' ? 'sesi 60s' : res.alat}`, 'success');
        } else {
          addLog(`[RX] Ditolak: ${res.error}`, 'error');
        }
      } catch (err) {
        addLog(`[RX] Error: ${err.message}`, 'error');
      } finally {
        loadData();
        setLoading(false);
      }
    }, 600); // simulasi latency jaringan
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-main flex items-center gap-2">
            <IconCpu size={20} className="text-emerald-600" />
            Simulator Perangkat IoT
          </h2>
          <p className="text-xs text-muted">Panel simulasi untuk menguji alur tap RFID (seolah-olah alat ESP32).</p>
        </div>
        <div className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 self-start sm:self-auto">
          <IconWifi size={14} className="animate-pulse" />
          Simulator Aktif
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel Kiri: Daftar UID untuk di-tap */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-surface rounded-xl border border-main p-5 shadow-sm">
            <h3 className="font-semibold text-main text-sm mb-4 flex items-center gap-2">
              <IconIdBadge2 size={16} className="text-blue-600" /> 1. Tap Kartu Kelas
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {kartuList.map((k) => (
                <button
                  key={k.uid_kartu}
                  disabled={loading}
                  onClick={() => handleTap(k.uid_kartu, k.kelas, 'kartu')}
                  className="text-left p-3 rounded-lg border border-main hover:bg-blue-50 hover:border-blue-300 transition group disabled:opacity-50"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-main text-sm group-hover:text-blue-700">{k.kelas}</span>
                    <Badge status={k.aktif ? 'aktif' : 'nonaktif'} />
                  </div>
                  <p className="text-[10px] font-mono text-muted">{k.uid_kartu}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-surface rounded-xl border border-main p-5 shadow-sm">
            <h3 className="font-semibold text-main text-sm mb-4 flex items-center gap-2">
              <IconBox size={16} className="text-purple-600" /> 2. Tap Sticker Alat Lab
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {alatList.map((a) => (
                <button
                  key={a.uid_rfid}
                  disabled={loading}
                  onClick={() => handleTap(a.uid_rfid, a.nama, 'alat')}
                  className="text-left p-3 rounded-lg border border-main hover:bg-purple-50 hover:border-purple-300 transition group disabled:opacity-50 flex flex-col justify-between"
                >
                  <div>
                    <p className="font-semibold text-main text-xs group-hover:text-purple-700 leading-tight mb-1">{a.nama}</p>
                    <p className="text-[10px] font-mono text-muted">{a.uid_rfid}</p>
                  </div>
                  <div className="mt-2 text-[10px] font-semibold">
                    Stok: <span className={a.stok_tersedia > 0 ? 'text-emerald-600' : 'text-red-600'}>{a.stok_tersedia}/{a.jumlah_total}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Panel Kanan: Console & Sesi */}
        <div className="space-y-4 flex flex-col">
          {/* Status Sesi Aktif */}
          <div className={`p-4 rounded-xl border ${activeSession ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'} shadow-sm transition-colors`}>
            <h3 className="font-semibold text-main text-xs mb-2 uppercase tracking-wide">Status Sesi Kartu</h3>
            {activeSession ? (
              <div>
                <p className="text-sm font-bold text-blue-800">{activeSession.uid_kartu}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping-slow" />
                  <span className="text-xs text-blue-700 font-medium">Sesi aktif (menunggu tap alat)</span>
                </div>
                <p className="text-[10px] text-muted mt-2">
                  Exp: {new Date(activeSession.expires).toLocaleTimeString('id-ID')}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted">Belum ada sesi kartu aktif. Silakan tap kartu terlebih dahulu.</p>
            )}
          </div>

          {/* Serial Monitor */}
          <div className="flex-1 bg-gray-900 rounded-xl border border-gray-800 p-4 shadow-sm flex flex-col min-h-[300px]">
            <h3 className="font-mono text-gray-400 text-xs mb-3 flex items-center justify-between">
              <span>&gt;_ ESP32_Serial_Monitor</span>
              <button onClick={() => setLogs([])} className="text-gray-500 hover:text-gray-300">Clear</button>
            </h3>
            <div className="flex-1 overflow-y-auto space-y-1.5 font-mono text-[11px]">
              {logs.length === 0 && <p className="text-gray-600 italic">Menunggu input...</p>}
              {logs.map((l) => (
                <div key={l.id} className="flex gap-2">
                  <span className="text-gray-500 flex-shrink-0">[{l.time}]</span>
                  <span className={`break-words ${
                    l.type === 'tx' ? 'text-blue-400' :
                    l.type === 'success' ? 'text-emerald-400' :
                    l.type === 'error' ? 'text-red-400' : 'text-gray-300'
                  }`}>
                    {l.msg}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
