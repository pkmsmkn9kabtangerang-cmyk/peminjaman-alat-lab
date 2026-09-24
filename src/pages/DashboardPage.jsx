// src/pages/DashboardPage.jsx
// Dashboard: greeting, stat cards, Bar+Area chart Recharts, tabel histori terbaru

import { useState, useEffect, useMemo } from 'react';
import { dbService } from '../services/store';
import StatCard from '../components/StatCard';
import Badge from '../components/Badge';
import {
  BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  IconBox, IconClock, IconCheck, IconArrowRight, IconWifi,
} from '@tabler/icons-react';

const FORMAT_DATE = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

const FORMAT_TIME = new Intl.DateTimeFormat('id-ID', {
  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
});

export default function DashboardPage({ setCurrentTab, user }) {
  const [alat, setAlat]           = useState(() => dbService.getAlatWithStok());
  const [transaksi, setTransaksi] = useState(() => dbService.getTransaksi());
  const [tapLog, setTapLog]       = useState(() => dbService.getTapLog());
  const [chartDays, setChartDays] = useState(7);

  const reload = () => {
    setAlat(dbService.getAlatWithStok());
    setTransaksi(dbService.getTransaksi());
    setTapLog(dbService.getTapLog());
  };

  useEffect(() => {
    window.addEventListener('simlab_storage_updated', reload);
    const t = setInterval(reload, 3000);
    return () => { window.removeEventListener('simlab_storage_updated', reload); clearInterval(t); };
  }, []);

  // Stat Cards
  const totalAlat    = alat.reduce((s, a) => s + a.jumlah_total, 0);
  const totalTersedia = alat.reduce((s, a) => s + a.stok_tersedia, 0);
  const totalDipinjam = transaksi.filter((t) => t.status === 'dipinjam').length;
  const totalHariIni  = transaksi.filter((t) => {
    const today = new Date().toISOString().slice(0, 10);
    return t.waktu_pinjam?.startsWith(today);
  }).length;

  // Chart data
  const chartData = useMemo(() => dbService.getStatHarian(chartDays), [transaksi, chartDays]);

  // Format tanggal chart: "20 Sep"
  const fmtTgl = (s) => {
    const d = new Date(s);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  };

  // Riwayat terbaru
  const recent = transaksi.slice(0, 6);

  return (
    <div className="space-y-6">
      {/* ── Greeting ── */}
      <div>
        <p className="text-muted text-xs">{FORMAT_DATE.format(new Date())}</p>
        <h1 className="text-xl font-bold text-main">
          Selamat datang, <span className="text-blue-600">{user?.nama ?? 'Pengguna'}</span> 👋
        </h1>
        <p className="text-muted text-sm mt-0.5">
          <span className="inline-flex items-center gap-1 capitalize bg-blue-50 text-blue-700 text-xs font-semibold px-2 py-0.5 rounded-full">
            {user?.role}
          </span>
        </p>
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Total Unit Alat"    value={totalAlat}    icon={IconBox}       color="blue"   />
        <StatCard title="Stok Tersedia"      value={totalTersedia} icon={IconCheck}     color="green"  />
        <StatCard title="Sedang Dipinjam"    value={totalDipinjam} icon={IconClock}     color="amber"  />
        <StatCard title="Transaksi Hari Ini" value={totalHariIni}  icon={IconArrowRight} color="purple" />
      </div>

      {/* ── Charts ── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
        {/* Bar Chart */}
        <div className="bg-surface rounded-xl border border-main p-4 sm:p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-main text-sm">Peminjaman dan Pengembalian</h3>
              <p className="text-xs text-muted">Perbandingan transaksi per hari</p>
            </div>
            <div className="flex gap-1">
              {[7, 14, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setChartDays(d)}
                  className={`text-xs px-2 py-1 rounded font-medium transition ${
                    chartDays === d ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {d}H
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="tanggal" tickFormatter={fmtTgl} tick={{ fontSize: 10, fill: '#94A3B8' }} />
              <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} allowDecimals={false} />
              <Tooltip
                formatter={(v, n) => [v, n === 'jumlah_pinjam' ? 'Dipinjam' : 'Dikembalikan']}
                labelFormatter={fmtTgl}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}
              />
              <Legend formatter={(v) => (v === 'jumlah_pinjam' ? 'Dipinjam' : 'Dikembalikan')} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="jumlah_pinjam"  fill="#3B82F6" radius={[4, 4, 0, 0]} maxBarSize={32} />
              <Bar dataKey="jumlah_kembali" fill="#8B5CF6" radius={[4, 4, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Area Chart */}
        <div className="bg-surface rounded-xl border border-main p-4 sm:p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="font-semibold text-main text-sm">Tren Total Transaksi</h3>
            <p className="text-xs text-muted">Akumulasi aktivitas {chartDays} hari terakhir</p>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#2563EB" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
              <XAxis dataKey="tanggal" tickFormatter={fmtTgl} tick={{ fontSize: 10, fill: '#94A3B8' }} />
              <YAxis tick={{ fontSize: 10, fill: '#94A3B8' }} allowDecimals={false} />
              <Tooltip
                formatter={(v) => [v, 'Total Transaksi']}
                labelFormatter={fmtTgl}
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}
              />
              <Area type="monotone" dataKey="total" stroke="#2563EB" strokeWidth={2} fill="url(#colorTotal)" dot={{ r: 3, fill: '#2563EB' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Histori Terbaru + Status Sistem ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Tabel */}
        <div className="lg:col-span-2 bg-surface rounded-xl border border-main p-4 sm:p-5 shadow-sm flex flex-col min-w-0">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-main text-sm">Transaksi Terbaru</h3>
            <button onClick={() => setCurrentTab('riwayat')} className="text-xs font-medium text-blue-600 hover:underline">
              Lihat Semua →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-main text-xs text-muted">
                  <th className="pb-3 font-medium">Kelas / Alat</th>
                  <th className="pb-3 font-medium">Status</th>
                  <th className="pb-3 font-medium">Waktu</th>
                  <th className="pb-3 font-medium">Sumber</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-main">
                {recent.map((trx) => (
                  <tr key={trx.id} className="hover:bg-gray-50/50 transition">
                    <td className="py-3">
                      <p className="font-semibold text-main text-xs">{trx.kelas}</p>
                      <p className="text-[11px] text-muted">{trx.nama_alat}</p>
                    </td>
                    <td className="py-3"><Badge status={trx.status} /></td>
                    <td className="py-3 text-[11px] text-muted">{trx.waktu_pinjam ? FORMAT_TIME.format(new Date(trx.waktu_pinjam)) : '—'}</td>
                    <td className="py-3"><Badge status={trx.sumber ?? 'otomatis'} /></td>
                  </tr>
                ))}
                {recent.length === 0 && (
                  <tr><td colSpan="4" className="py-8 text-center text-xs text-muted">Belum ada transaksi.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
