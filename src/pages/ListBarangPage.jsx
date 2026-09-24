// src/pages/ListBarangPage.jsx
// List Barang: stok, status, kartu/kelas peminjam

import { useState, useEffect, useMemo } from 'react';
import { dbService } from '../services/store';
import Badge from '../components/Badge';
import DataTable from '../components/DataTable';
import FilterDropdown from '../components/FilterDropdown';
import { IconFilter } from '@tabler/icons-react';

const STATUS_OPTIONS = [
  { value: 'all',      label: 'Semua Status' },
  { value: 'tersedia', label: 'Tersedia' },
  { value: 'dipinjam', label: 'Dipinjam' },
  { value: 'habis',    label: 'Habis' },
];

export default function ListBarangPage() {
  const [data, setData]             = useState(() => dbService.getListBarang());
  const [statusFilter, setStatusFilter] = useState('all');

  const reload = () => setData(dbService.getListBarang());

  useEffect(() => {
    window.addEventListener('simlab_storage_updated', reload);
    const t = setInterval(reload, 3000);
    return () => { window.removeEventListener('simlab_storage_updated', reload); clearInterval(t); };
  }, []);

  const filteredData = useMemo(() => {
    if (statusFilter === 'all') return data;
    return data.filter(item => item.status === statusFilter);
  }, [data, statusFilter]);

  const columns = [
    {
      key: 'nama',
      label: 'Nama Alat',
      sortable: true,
      render: (row) => <p className="font-semibold text-main text-xs">{row.nama}</p>,
    },
    {
      key: 'kode',
      label: 'Kode Alat',
      sortable: true,
      render: (row) => <p className="text-[11px] text-muted font-mono">{row.kode}</p>,
    },
    {
      key: 'stok_tersedia',
      label: 'Stok',
      sortable: true,
      render: (row) => (
        <div>
          <span className={`text-sm font-bold ${row.stok_tersedia === 0 ? 'text-red-600' : 'text-main'}`}>
            {row.stok_tersedia}/{row.jumlah_total}
          </span>
          <p className="text-[10px] text-muted">tersedia</p>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => <Badge status={row.status} />,
    },
    {
      key: 'kategori',
      label: 'Kategori',
      sortable: true,
      render: (row) => <span className="text-xs capitalize text-muted">{row.kategori}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-main">List Barang</h2>
        <p className="text-xs text-muted">Pantau ketersediaan alat lab secara realtime.</p>
      </div>

      <DataTable
        columns={columns}
        data={filteredData}
        searchPlaceholder="Cari nama alat, kode, atau kategori..."
        searchKeys={['nama', 'kode', 'kategori', 'peminjam_kelas']}
        emptyMessage="Belum ada alat yang terdaftar atau sesuai filter."
        filters={
          <FilterDropdown
            icon={IconFilter}
            value={statusFilter}
            onChange={setStatusFilter}
            options={STATUS_OPTIONS}
          />
        }
      />
    </div>
  );
}
