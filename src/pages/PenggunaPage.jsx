// src/pages/PenggunaPage.jsx
// Manajemen User Petugas

import { useState } from 'react';
import { dbService } from '../services/store';
import Modal from '../components/Modal';
import DataTable from '../components/DataTable';
import Button from '../components/Button';
import { IconPlus, IconTrash, IconEdit, IconShieldLock } from '@tabler/icons-react';

const EMPTY_FORM = { uid: '', nama: '', username: '', nip: '', role: 'petugas', aktif: true };

export default function PenggunaPage() {
  const [users, setUsers]       = useState(() => dbService.getUsers().filter(u => u.role === 'petugas'));
  const [modal, setModal]       = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm]         = useState(EMPTY_FORM);

  const reload = () => setUsers(dbService.getUsers().filter(u => u.role === 'petugas'));

  const openAdd = () => {
    setEditItem(null);
    setForm({ ...EMPTY_FORM, uid: 'USR-' + Date.now() });
    setModal(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({ ...item, username: item.username || item.email?.split('@')[0] || '' });
    setModal(true);
  };

  const handleSave = (e) => {
    e.preventDefault();
    const current = dbService.getUsers();

    // Produksi: panggil Edge Function create-petugas
    // const res = await fetch('/api/create-petugas', { ... })
    // Fallback demo: simpan ke store lokal
    const fakeEmail = `${form.username}@sekolah.internal`;

    if (editItem) {
      const updated = current.map((u) => u.uid === editItem.uid ? { ...u, ...form, email: fakeEmail } : u);
      dbService.saveUsers(updated);
    } else {
      current.push({ ...form, email: fakeEmail, created_at: new Date().toISOString() });
      dbService.saveUsers(current);
    }
    setModal(false);
    reload();
  };

  const handleDelete = (uid) => {
    if (uid === dbService.getCurrentUser()?.uid) return alert('Tidak dapat menghapus diri sendiri.');
    if (!confirm('Hapus petugas ini?')) return;
    dbService.saveUsers(dbService.getUsers().filter((u) => u.uid !== uid));
    reload();
  };

  const columns = [
    {
      key: 'nama',
      label: 'Nama Lengkap',
      sortable: true,
      render: (row) => (
        <p className="font-semibold text-main text-xs">{row.nama}</p>
      ),
    },
    {
      key: 'username',
      label: 'Username',
      sortable: true,
      render: (row) => (
        <span className="text-[11px] text-blue-700 font-mono bg-blue-50 px-2 py-1 rounded">
          @{row.username || row.email?.split('@')[0]}
        </span>
      ),
    },
    {
      key: 'nip',
      label: 'NIP',
      render: (row) => (
        row.nip
          ? <span className="text-xs font-mono text-gray-600">{row.nip}</span>
          : <span className="text-xs text-gray-400">—</span>
      ),
    },
    {
      key: 'role',
      label: 'Role',
      sortable: true,
      render: (row) => (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize bg-blue-100 text-blue-700">
          <IconShieldLock size={12} />
          {row.role}
        </span>
      ),
    },
    {
      key: 'aksi',
      label: '',
      render: (row) => (
        <div className="flex items-center gap-1 justify-end">
          <button onClick={() => openEdit(row)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition" title="Edit"><IconEdit size={15} /></button>
          <button onClick={() => handleDelete(row.uid)} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition" title="Hapus"><IconTrash size={15} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-main">Pengguna Petugas</h2>
        <p className="text-xs text-muted">Kelola akun petugas lab.</p>
      </div>

      <DataTable
        columns={columns}
        data={users}
        searchKeys={[]}
        actionButton={<Button icon={IconPlus} onClick={openAdd}>Tambah Petugas</Button>}
      />

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editItem ? 'Edit Petugas' : 'Tambah Petugas Baru'}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Nama Lengkap *</label>
            <input required value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-main text-sm focus:ring-2 focus:ring-blue-500" placeholder="Budi Santoso" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Username *</label>
              <input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s+/g, '') })} className="w-full px-3 py-2 rounded-lg border border-main text-sm focus:ring-2 focus:ring-blue-500" placeholder="budi_lab" />
              <p className="text-[10px] text-muted mt-1">Akan menjadi: @{form.username || '...'}</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">NIP</label>
              <input value={form.nip || ''} onChange={(e) => setForm({ ...form, nip: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-main text-sm focus:ring-2 focus:ring-blue-500" placeholder="Nomor Induk Pegawai" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Role *</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-main text-sm bg-white focus:ring-2 focus:ring-blue-500">
              <option value="petugas">Petugas Lab</option>
            </select>
          </div>
          {!editItem && (
            <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200 font-medium">
              ℹ️ Setelah deploy ke Supabase, petugas akan menerima email undangan untuk membuat password sendiri.
            </p>
          )}
          <div className="flex justify-end gap-3 pt-3">
            <Button variant="secondary" onClick={() => setModal(false)}>Batal</Button>
            <Button type="submit">Simpan</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
