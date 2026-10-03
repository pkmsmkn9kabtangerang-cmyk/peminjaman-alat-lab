// src/pages/DaftarAlat.jsx
// List Barang: stok, status, kartu/kelas peminjam

import { useState, useEffect, useMemo, useCallback } from 'react';
import { dbService } from '../services/store';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import Badge from '../components/Badge';
import DataTable from '../components/DataTable';
import FilterDropdown from '../components/FilterDropdown';
import { IconFilter, IconRefresh, IconMail } from '@tabler/icons-react';
import PageHeader from '../components/PageHeader';
import PageNote from '../components/PageNote';
import { friendlyError } from '../lib/feedback';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Semua Status' },
  { value: 'tersedia', label: 'Tersedia' },
  { value: 'dipinjam', label: 'Dipinjam' },
  { value: 'habis', label: 'Habis' },
];

async function fetchListBarang() {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('v_list_barang')
      .select('*')
      .order('nama');
    if (error) throw error;
    return data ?? [];
  }
  return dbService.getListBarang();
}

export default function DaftarAlatPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  const reload = useCallback(async (isRealtimeEvent = false) => {
    if (!isRealtimeEvent) setLoading(true);
    try {
      const result = await fetchListBarang();
      setData(result);
    } catch (err) {
      console.error('[DaftarAlat] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();

    if (!isSupabaseConfigured) {
      const handleStorage = () => reload(true);
      window.addEventListener('simlab_storage_updated', handleStorage);
      const t = setInterval(() => reload(true), 3000);
      return () => {
        window.removeEventListener('simlab_storage_updated', handleStorage);
        clearInterval(t);
      };
    } else {
      // Subscribe realtime (jika alat diedit atau transaksi bertambah/berkurang)
      const chAlat = supabase.channel('alat-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'alat' }, () => reload(true))
        .subscribe();
      const chTrx = supabase.channel('trx-changes-listalat')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transaksi' }, () => reload(true))
        .subscribe();

      return () => {
        supabase.removeChannel(chAlat);
        supabase.removeChannel(chTrx);
      };
    }
  }, [reload]);

  const filteredData = useMemo(() => {
    if (statusFilter === 'all') return data;
    return data.filter(item => item.status === statusFilter);
  }, [data, statusFilter]);

  const columns = [
    {
      key: 'nama',
      label: 'Nama Alat',
      sortable: true,
      render: (row) => <p className="font-semibold text-main">{row.nama}</p>,
    },
    {
      key: 'kode',
      label: 'Kode Alat',
      sortable: true,
      render: (row) => <p className="">{row.kode || '—'}</p>,
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
      render: (row) => <span className="text-main capitalize">{row.kategori}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Daftar Alat"
        description="Pantau ketersediaan alat lab secara realtime."
      />

      <PageNote title="Informasi Penting" icon={IconMail}>
        Daftar alat di bawah ini selalu diperbarui secara realtime. Jika ada peminjaman atau pengembalian baru, stok akan otomatis berkurang atau bertambah, anda juga bisa melihat berdasarkan filter status alat.
      </PageNote>

      <DataTable
        columns={columns}
        data={filteredData}
        loading={loading}
        searchPlaceholder="Cari Alat..."
        searchKeys={['nama', 'kode', 'kategori', 'peminjam_kelas']}
        emptyMessage="Belum ada alat yang terdaftar."
        actionButton={
          <button
            type="button"
            onClick={() => reload(false)}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
            title="Refresh data"
          >
            <IconRefresh size={18} />
          </button>
        }
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
