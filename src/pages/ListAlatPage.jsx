// src/pages/ListBarangPage.jsx
// List Barang: stok, status, kartu/kelas peminjam

import { useState, useEffect, useMemo } from 'react';
import { dbService } from '../services/store';
import Badge from '../components/Badge';
import DataTable from '../components/DataTable';
import FilterDropdown from '../components/FilterDropdown';
import { IconFilter } from '@tabler/icons-react';
import PageHeader from '../components/PageHeader';

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
      render: (row) => <p className="font-medium text-[13px] lg:text-main">{row.nama}</p>,
    },
    {
      key: 'kode',
      label: 'Kode Alat',
      sortable: true,
      render: (row) => <p className="text-[13px] lg:text-main">{row.kode}</p>,
    },
    {
      key: 'stok_tersedia',
      label: 'Stok',
      sortable: true,
      render: (row) => (
        <div>
          <span className={`text-[13px] lg:text-main font-bold ${row.stok_tersedia === 0 ? 'text-red-600' : 'text-main'}`}>
            {row.stok_tersedia}/{row.jumlah_total}
          </span>
          <p className="text-[13px] lg:text-main">tersedia</p>
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
      render: (row) => <span className="text-[14px] lg:text-main capitalize">{row.kategori}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="List Alat"
        description="Pantau ketersediaan alat lab secara realtime."
      />

      <DataTable
        columns={columns}
        data={filteredData}
        searchPlaceholder="Cari Alat..."
        searchKeys={['nama', 'kode', 'kategori', 'peminjam_kelas']}
        emptyMessage="Belum ada alat yang terdaftar."
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
