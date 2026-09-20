// src/pages/ListBarangPage.jsx
// List Barang: stok "4/5", status, kondisi inline edit, kartu/kelas peminjam

import { useState, useEffect } from 'react';
import { dbService } from '../services/store';
import Badge from '../components/Badge';
import DataTable from '../components/DataTable';
import { IconPencil, IconCheck, IconX } from '@tabler/icons-react';

function KondisiCell({ alat, onUpdate }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(alat.jumlah_rusak);

  const save = () => {
    const n = Math.max(0, Math.min(Number(val), alat.jumlah_total));
    dbService.updateKondisiAlat(alat.id, n);
    onUpdate();
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number" min={0} max={alat.jumlah_total}
          value={val}
          onChange={(e) => setVal(e.target.value)}
          className="w-14 px-2 py-1 text-xs border border-main rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
          autoFocus
        />
        <span className="text-xs text-muted">rusak</span>
        <button onClick={save}  className="p-1 text-green-600 hover:bg-green-50 rounded transition"><IconCheck size={13} /></button>
        <button onClick={() => setEditing(false)} className="p-1 text-red-500 hover:bg-red-50 rounded transition"><IconX size={13} /></button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 group">
      {alat.jumlah_rusak > 0
        ? <Badge status="rusak" />
        : <Badge status="baik" />
      }
      {alat.jumlah_rusak > 0 && (
        <span className="text-xs text-muted">({alat.jumlah_rusak} unit)</span>
      )}
      <button
        onClick={() => { setVal(alat.jumlah_rusak); setEditing(true); }}
        className="p-0.5 text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition"
        title="Edit jumlah rusak"
      >
        <IconPencil size={12} />
      </button>
    </div>
  );
}

export default function ListBarangPage() {
  const [data, setData] = useState(() => dbService.getListBarang());

  const reload = () => setData(dbService.getListBarang());

  useEffect(() => {
    window.addEventListener('simlab_storage_updated', reload);
    const t = setInterval(reload, 3000);
    return () => { window.removeEventListener('simlab_storage_updated', reload); clearInterval(t); };
  }, []);

  const columns = [
    {
      key: 'nama',
      label: 'Alat / Kode',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-semibold text-main text-xs">{row.nama}</p>
          <p className="text-[11px] text-muted font-mono">{row.kode}</p>
        </div>
      ),
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
      key: 'kondisi',
      label: 'Kondisi',
      render: (row) => <KondisiCell alat={row} onUpdate={reload} />,
    },
    {
      key: 'peminjam_kelas',
      label: 'Peminjam',
      render: (row) => (
        row.peminjam_kartu
          ? (
            <div>
              <p className="text-xs font-semibold text-blue-700">{row.peminjam_kelas}</p>
              <p className="text-[10px] font-mono text-muted">{row.peminjam_kartu}</p>
            </div>
          )
          : <span className="text-xs text-muted">—</span>
      ),
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
        <p className="text-xs text-muted">Pantau ketersediaan dan kondisi alat lab secara realtime.</p>
      </div>

      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="Cari nama alat, kode, atau kategori..."
        searchKeys={['nama', 'kode', 'kategori', 'peminjam_kelas']}
        emptyMessage="Belum ada alat yang terdaftar."
      />
    </div>
  );
}
