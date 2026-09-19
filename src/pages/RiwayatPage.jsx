import { useState } from 'react';
import { dbService } from '../services/store';
import Badge from '../components/Badge';

export default function RiwayatPage() {
  const [transaksiList] = useState(() => dbService.getTransaksi());
  const [filterKelas, setFilterKelas] = useState('');
  const [filterJenis, setFilterJenis] = useState('');

  const filtered = transaksiList.filter(t => {
    if (filterKelas && !t.kelas.toLowerCase().includes(filterKelas.toLowerCase())) return false;
    if (filterJenis && t.jenis !== filterJenis) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-main">Riwayat Histori Transaksi</h2>
          <p className="text-xs text-muted">Seluruh catatan peminjaman dan pengembalian alat lab.</p>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Filter kelas..."
            value={filterKelas}
            onChange={(e) => setFilterKelas(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-main text-xs bg-white"
          />
          <select
            value={filterJenis}
            onChange={(e) => setFilterJenis(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-main text-xs bg-white"
          >
            <option value="">Semua Jenis</option>
            <option value="pinjam">Pinjam</option>
            <option value="kembali">Kembali</option>
          </select>
        </div>
      </div>

      <div className="bg-surface rounded-xl border border-main overflow-hidden shadow-xs">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-main bg-gray-50 text-xs text-muted">
              <th className="p-4 font-medium">ID Transaksi</th>
              <th className="p-4 font-medium">Kelas</th>
              <th className="p-4 font-medium">Nama Alat</th>
              <th className="p-4 font-medium">Jenis</th>
              <th className="p-4 font-medium">Petugas Konfirmasi</th>
              <th className="p-4 font-medium">Waktu Tap</th>
              <th className="p-4 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-main">
            {filtered.map((trx) => (
              <tr key={trx.id_transaksi} className="hover:bg-gray-50/50 transition">
                <td className="p-4 font-mono text-xs text-muted">
                  {trx.id_transaksi}
                </td>
                <td className="p-4 font-semibold text-main">
                  {trx.kelas}
                </td>
                <td className="p-4 text-xs text-main">
                  {trx.nama_alat}
                </td>
                <td className="p-4">
                  <span className={`text-xs font-bold uppercase px-2 py-0.5 rounded ${trx.jenis === 'pinjam' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                    {trx.jenis}
                  </span>
                </td>
                <td className="p-4 text-xs text-muted">
                  {trx.petugas_konfirmasi || '-'}
                </td>
                <td className="p-4 text-xs text-muted">
                  {new Date(trx.waktu_tap).toLocaleString()}
                </td>
                <td className="p-4">
                  <Badge status={trx.status} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan="7" className="py-12 text-center text-muted text-xs">
                  Tidak ada histori transaksi yang sesuai filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
