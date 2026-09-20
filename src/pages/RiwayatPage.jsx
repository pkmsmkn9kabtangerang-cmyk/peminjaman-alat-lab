// src/pages/RiwayatPage.jsx
// Riwayat Peminjaman: kolom Status, Terkirim, Kondisi, DataTable dengan sort+search

import { useState, useEffect } from 'react';
import { dbService } from '../services/store';
import Badge from '../components/Badge';
import DataTable from '../components/DataTable';

const FMT = (iso) => {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
};

export default function RiwayatPage() {
  const [data, setData] = useState(() => dbService.getTransaksi());

  useEffect(() => {
    const r = () => setData(dbService.getTransaksi());
    window.addEventListener('simlab_storage_updated', r);
    const t = setInterval(r, 3000);
    return () => { window.removeEventListener('simlab_storage_updated', r); clearInterval(t); };
  }, []);

  const columns = [
    {
      key: 'waktu_pinjam',
      label: 'Waktu Pinjam',
      sortable: true,
      render: (row) => <span className="text-xs text-muted whitespace-nowrap">{FMT(row.waktu_pinjam)}</span>,
    },
    {
      key: 'waktu_kembali',
      label: 'Waktu Kembali',
      sortable: true,
      render: (row) => <span className="text-xs text-muted whitespace-nowrap">{FMT(row.waktu_kembali)}</span>,
    },
    {
      key: 'kelas',
      label: 'Kelas',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-semibold text-main text-xs">{row.kelas}</p>
          <p className="text-[10px] font-mono text-muted">{row.uid_kartu}</p>
        </div>
      ),
    },
    {
      key: 'nama_alat',
      label: 'Alat',
      sortable: true,
      render: (row) => <span className="text-xs text-main">{row.nama_alat}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => <Badge status={row.status} />,
    },
    {
      key: 'kondisi_pinjam',
      label: 'Kondisi Pinjam',
      render: (row) => <Badge status={row.kondisi_pinjam ?? 'baik'} />,
    },
    {
      key: 'kondisi_kembali',
      label: 'Kondisi Kembali',
      render: (row) => row.kondisi_kembali
        ? <Badge status={row.kondisi_kembali} />
        : <span className="text-xs text-muted">—</span>,
    },
    {
      key: 'sumber',
      label: 'Terkirim',
      render: (row) => <Badge status={row.sumber ?? 'otomatis'} />,
    },
    {
      key: 'petugas',
      label: 'Petugas',
      render: (row) => <span className="text-xs text-muted">{row.petugas ?? '—'}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-main">Riwayat Peminjaman</h2>
        <p className="text-xs text-muted">Seluruh catatan peminjaman dan pengembalian alat lab.</p>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="Cari kelas, nama alat, status..."
        searchKeys={['kelas', 'nama_alat', 'uid_kartu', 'status', 'sumber']}
        pageSize={15}
        emptyMessage="Belum ada riwayat transaksi."
      />
    </div>
  );
}
