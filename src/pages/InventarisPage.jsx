// src/pages/InventarisPage.jsx
// Inventaris Barang (Admin): CRUD master alat lab — tanpa kolom status & stok 4/5

import { useState } from 'react';
import { dbService } from '../services/store';
import Modal from '../components/Modal';
import DataTable from '../components/DataTable';
import Button from '../components/Button';
import { IconPlus, IconTrash, IconEdit, IconTools, IconX, IconCheck } from '@tabler/icons-react';

const EMPTY_FORM = {
  id: '', kode: '', nama: '', kategori: 'elektronik', uid_rfid: '', jumlah_total: 1, jumlah_rusak: 0,
};

export default function InventarisPage() {
  const [alat, setAlat]         = useState(() => dbService.getAlat());
  const [modal, setModal]       = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm]         = useState(EMPTY_FORM);

  const reload = () => setAlat(dbService.getAlat());

  const openAdd = () => {
    setEditItem(null);
    setForm({
      ...EMPTY_FORM,
      id:       'ALT-' + Math.floor(100 + Math.random() * 900),
      kode:     'KD-' + Math.floor(1000 + Math.random() * 9000),
      uid_rfid: 'STK-' + Math.floor(1000 + Math.random() * 9000),
    });
    setModal(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({ ...item });
    setModal(true);
  };

  const handleSave = (e) => {
    e.preventDefault();
    const current = dbService.getAlat();
    if (editItem) {
      const updated = current.map((a) => a.id === editItem.id ? { ...a, ...form, jumlah_total: Number(form.jumlah_total), jumlah_rusak: Number(form.jumlah_rusak) } : a);
      dbService.saveAlat(updated);
    } else {
      const newItem = {
        ...form,
        jumlah_total: Number(form.jumlah_total),
        jumlah_rusak: Number(form.jumlah_rusak),
        stok_tersedia: Number(form.jumlah_total) - Number(form.jumlah_rusak),
        created_at: new Date().toISOString(),
      };
      current.unshift(newItem);
      dbService.saveAlat(current);
    }
    setModal(false);
    reload();
  };

  const handleDelete = (id) => {
    if (!confirm('Hapus alat ini dari inventaris?')) return;
    dbService.saveAlat(dbService.getAlat().filter((a) => a.id !== id));
    reload();
  };

  const columns = [
    {
      key: 'kode',
      label: 'Kode Alat',
      sortable: true,
      render: (row) => <p className="text-[11px] text-muted">{row.kode} · {row.id}</p>,
    },
    {
      key: 'uid_rfid',
      label: 'UID Sticker RFID',
      render: (row) => (
        <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded text-gray-700">{row.uid_rfid}</span>
      ),
    },
    {
      key: 'nama',
      label: 'Nama Alat',
      sortable: true,
      render: (row) => <p className="font-semibold text-main text-xs">{row.nama}</p>,
    },
    {
      key: 'kategori',
      label: 'Kategori',
      sortable: true,
      render: (row) => <span className="text-xs capitalize text-muted">{row.kategori}</span>,
    },
    {
      key: 'jumlah_total',
      label: 'Total Unit',
      sortable: true,
      render: (row) => <span className="text-xs font-semibold text-main">{row.jumlah_total} unit</span>,
    },
    {
      key: 'jumlah_rusak',
      label: 'Rusak',
      render: (row) => (
        <span className={`text-xs font-semibold ${row.jumlah_rusak > 0 ? 'text-amber-600' : 'text-muted'}`}>
          {row.jumlah_rusak} unit
        </span>
      ),
    },
    {
      key: 'aksi',
      label: '',
      render: (row) => (
        <div className="flex items-center gap-1 justify-end">
          <button onClick={() => openEdit(row)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition" title="Edit">
            <IconEdit size={15} />
          </button>
          <button onClick={() => handleDelete(row.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition" title="Hapus">
            <IconTrash size={15} />
          </button>
        </div>
      ),
    },
  ];

  const inputCls = 'w-full px-3 py-2 rounded-lg border border-main text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-main">Inventaris Alat</h2>
          <p className="text-xs text-muted">Kelola Semua Alat Lab </p>
        </div>
      </div>

      <DataTable
        columns={columns}
        data={alat}
        searchPlaceholder="Search"
        searchKeys={['nama', 'kode', 'uid_rfid', 'kategori']}
        emptyMessage="Belum ada alat terdaftar. Klik tombol Tambah Alat untuk memulai."
        actionButton={<Button icon={IconPlus} onClick={openAdd}>Tambah Alat</Button>}
      />

      <datalist id="kategori-list">
        {Array.from(new Set(alat.map(a => a.kategori))).map(kat => (
          <option key={kat} value={kat} />
        ))}
        <option value="elektronik" />
        <option value="mekanik" />
        <option value="jaringan" />
        <option value="umum" />
      </datalist>

      <Modal
        isOpen={modal}
        onClose={() => setModal(false)}
        title={editItem ? 'Edit Alat Lab' : 'Tambah Alat Lab Baru'}
        subtitle={editItem ? 'Perbarui data stok atau kondisi alat lab' : 'Daftarkan alat lab baru ke inventaris sistem'}
        icon={IconTools}
        iconVariant="primary"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Nama Alat *</label>
            <input required value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} className={inputCls} placeholder="Multimeter Digital" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Kode Inventaris *</label>
              <input required value={form.kode} onChange={(e) => setForm({ ...form, kode: e.target.value })} className={inputCls} placeholder="MM-001" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">UID Sticker RFID *</label>
              <input required value={form.uid_rfid} onChange={(e) => setForm({ ...form, uid_rfid: e.target.value })} className={`${inputCls} font-mono`} placeholder="STK-ALT-001" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Kategori *</label>
              <input 
                required 
                list="kategori-list"
                value={form.kategori} 
                onChange={(e) => setForm({ ...form, kategori: e.target.value })} 
                className={inputCls} 
                placeholder="Pilih atau ketik kategori..."
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Total Unit *</label>
              <input 
                type="text" 
                required 
                pattern="[0-9]+"
                title="Masukkan angka saja (contoh: 5)"
                value={form.jumlah_total} 
                onChange={(e) => setForm({ ...form, jumlah_total: e.target.value.replace(/\D/g, '') })} 
                className={inputCls} 
                placeholder="Contoh: 5"
              />
            </div>
          </div>
          
          {editItem && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
              <label className="block text-xs font-semibold text-red-700 mb-1">Rusak (Edit Saja)</label>
              <input 
                type="text" 
                pattern="[0-9]+"
                title="Masukkan angka saja"
                value={form.jumlah_rusak} 
                onChange={(e) => setForm({ ...form, jumlah_rusak: e.target.value.replace(/\D/g, '') })} 
                className={`${inputCls} border-red-300 bg-white`} 
                placeholder="Jumlah unit rusak"
              />
              <p className="text-[10px] text-red-600 mt-2 font-medium">
                * Kalo alat sudah diperbaiki jangan lupa untuk mengubah alat nya jadi 0 lagi supaya bisa digunakan.
              </p>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-3 border-t border-gray-100">
            <Button variant="secondary" icon={IconX} onClick={() => setModal(false)} className="w-full sm:w-auto justify-center">
              Batal
            </Button>
            <Button type="submit" icon={IconCheck} className="w-full sm:w-auto justify-center">
              Simpan Alat
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
