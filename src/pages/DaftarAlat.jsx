// src/pages/DaftarAlat.jsx
// List Barang: stok, status, kartu/kelas peminjam

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { dbService } from '../services/store';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import Badge from '../components/Badge';
import DataTable from '../components/DataTable';
import FilterDropdown from '../components/FilterDropdown';
import { IconFilter, IconRefresh, IconMail } from '@tabler/icons-react';
import PageHeader from '../components/PageHeader';
import PageNote from '../components/PageNote';
import { friendlyError } from '../lib/feedback';

import { isOnline, isNetworkError, registerOnlineSync } from '../lib/networkStatus';

const STATUS_OPTIONS = [
  { value: 'all', label: 'Semua Status' },
  { value: 'tersedia', label: 'Tersedia' },
  { value: 'dipinjam', label: 'Dipinjam' },
  { value: 'habis', label: 'Habis' },
];

async function fetchListBarang() {
  if (isSupabaseConfigured) {
    if (!isOnline()) return null;
    try {
      const { data, error } = await supabase
        .from('v_list_barang')
        .select('*')
        .order('nama');
      if (error) throw error;
      return data ?? [];
    } catch (err) {
      if (isNetworkError(err)) return null;
      console.warn('[DaftarAlat] fetch error:', err?.message || err);
      return null;
    }
  }
  return dbService.getListBarang();
}

export default function DaftarAlatPage() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const isReloadingRef = useRef(false);

  const reload = useCallback(async (isRealtimeEvent = false) => {
    if (!isOnline()) {
      setLoading(false);
      return;
    }
    if (isReloadingRef.current) return;
    isReloadingRef.current = true;

    if (!isRealtimeEvent) setLoading(true);
    try {
      const result = await fetchListBarang();
      if (result !== null) setData(result);
    } catch (err) {
      if (!isNetworkError(err)) {
        console.error('[DaftarAlat] fetch error:', err);
      }
    } finally {
      setLoading(false);
      isReloadingRef.current = false;
    }
  }, []);

  useEffect(() => {
    reload();

    if (!isSupabaseConfigured) {
      const handleStorage = () => reload(true);
      window.addEventListener('simlab_storage_updated', handleStorage);
      return () => {
        window.removeEventListener('simlab_storage_updated', handleStorage);
      };
    } else {
      // Subscribe realtime (jika alat diedit atau transaksi bertambah/berkurang)
      const chAlat = supabase.channel('alat-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'alat' }, () => reload(true))
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[Realtime alat-changes] status:', status);
          }
        });

      const chTrx = supabase.channel('trx-changes-listalat')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'transaksi' }, () => reload(true))
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('[Realtime trx-changes-listalat] status:', status);
          }
        });

      // Sinkronisasi otomatis SEKALI saat online pulih
      const unregisterSync = registerOnlineSync(() => {
        reload(true);
      });

      // Background safety check setiap 30 detik saat online & tab aktif
      const safetyTimer = setInterval(() => {
        if (isOnline() && typeof document !== 'undefined' && !document.hidden) {
          reload(true);
        }
      }, 30000);

      return () => {
        supabase.removeChannel(chAlat);
        supabase.removeChannel(chTrx);
        unregisterSync();
        clearInterval(safetyTimer);
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
      label: 'Stok Tersisa',
      sortable: true,
      render: (row) => (
        <span className={`font-semibold ${row.stok_tersedia === 0 ? 'text-red-600' : 'text-main'}`}>
          {row.stok_tersedia} {row.satuan || 'unit'}
        </span>
      ),
    },
    {
      key: 'satuan',
      label: 'Satuan',
      sortable: true,
      render: (row) => <span className="text-main font-semibold">{row.satuan || 'unit'}</span>,
    },
    {
      key: 'tipe',
      label: 'Tipe',
      sortable: true,
      render: (row) => (
        <span className="text-main capitalize font-medium">
          {row.tipe === 'habis_pakai' ? 'Sekali Pakai' : 'Pinjam'}
        </span>
      ),
    },
    {
      key: 'kategori',
      label: 'Kategori',
      sortable: true,
      render: (row) => <span className="text-main capitalize">{row.kategori}</span>,
    },
    {
      key: 'status',
      label: 'Status',
      sortable: true,
      render: (row) => <Badge status={row.status} />,
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
        searchKeys={['nama', 'kode', 'kategori', 'tipe', 'satuan', 'peminjam_kelas']}
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
