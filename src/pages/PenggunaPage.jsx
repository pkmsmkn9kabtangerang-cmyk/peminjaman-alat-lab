// src/pages/PenggunaPage.jsx
// Manajemen User (Admin)

import { useState } from 'react';
import { dbService } from '../services/store';
import Modal from '../components/Modal';
import DataTable from '../components/DataTable';
import Button from '../components/Button';
import Badge from '../components/Badge';
import { IconPlus, IconTrash, IconEdit, IconShieldLock } from '@tabler/icons-react';

const EMPTY_FORM = { uid: '', nama: '', email: '', role: 'petugas', aktif: true };

export default function PenggunaPage() {
  const [users, setUsers]       = useState(() => dbService.getUsers());
  const [modal, setModal]       = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm]         = useState(EMPTY_FORM);

  const reload = () => setUsers(dbService.getUsers());

  const openAdd = () => {
    setEditItem(null);
    setForm({ ...EMPTY_FORM, uid: 'USR-' + Date.now() });
    setModal(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({ ...item });
    setModal(true);
  };

  const handleSave = (e) => {
    e.preventDefault();
    const current = dbService.getUsers();
    if (editItem) {
      const updated = current.map((u) => u.uid === editItem.uid ? { ...form } : u);
      dbService.saveUsers(updated);
    } else {
      current.push({ ...form, created_at: new Date().toISOString() });
      dbService.saveUsers(current);
    }
    setModal(false);
    reload();
  };

  const handleDelete = (uid) => {
    if (uid === dbService.getCurrentUser()?.uid) return alert('Tidak dapat menghapus diri sendiri.');
    if (!confirm('Hapus pengguna ini?')) return;
    dbService.saveUsers(dbService.getUsers().filter((u) => u.uid !== uid));
    reload();
  };

  const columns = [
    {
      key: 'nama',
      label: 'Pengguna',
      sortable: true,
      render: (row) => (
        <div>
          <p className="font-semibold text-main text-xs">{row.nama}</p>
          <p className="text-[11px] text-muted">{row.email}</p>
        </div>
      ),
    },
    {
      key: 'role',
      label: 'Role',
      sortable: true,
      render: (row) => (
        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${row.role === 'admin' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
          {row.role === 'admin' && <IconShieldLock size={12} />}
          {row.role}
        </span>
      ),
    },
    {
      key: 'aktif',
      label: 'Status',
      sortable: true,
      render: (row) => <Badge status={row.aktif ? 'aktif' : 'nonaktif'} />,
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-main">Pengguna Sistem</h2>
          <p className="text-xs text-muted">Kelola akun admin dan petugas lab.</p>
        </div>
        <Button icon={IconPlus} onClick={openAdd}>Tambah Pengguna</Button>
      </div>

      <DataTable
        columns={columns}
        data={users}
        searchPlaceholder="Cari nama atau email..."
        searchKeys={['nama', 'email']}
      />

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editItem ? 'Edit Pengguna' : 'Tambah Pengguna Baru'}>
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Nama Lengkap *</label>
            <input required value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-main text-sm focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Email *</label>
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-main text-sm focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-muted mb-1">Role *</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-main text-sm bg-white focus:ring-2 focus:ring-blue-500">
                <option value="petugas">Petugas Lab</option>
                <option value="admin">Administrator</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input type="checkbox" id="user-aktif" checked={form.aktif} onChange={(e) => setForm({ ...form, aktif: e.target.checked })} className="w-4 h-4 text-blue-600 rounded" />
              <label htmlFor="user-aktif" className="text-sm font-medium text-main">Akun Aktif</label>
            </div>
          </div>
          {!editItem && (
            <p className="text-xs text-muted pt-2 bg-gray-50 p-2 rounded border border-main">
              Password default untuk pengguna baru adalah: <strong>demo</strong>
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
