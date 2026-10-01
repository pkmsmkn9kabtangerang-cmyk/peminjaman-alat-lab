import { useState } from 'react';
import { dbService } from '../services/store';
import Modal from '../components/Modal';
import DataTable from '../components/DataTable';
import Button from '../components/Button';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import FormField, { inputClass } from '../components/FormField';
import { showFeedback, friendlyError } from '../lib/feedback';
import { IconPlus, IconShieldCheck, IconChevronDown } from '@tabler/icons-react';

const EMPTY_FORM = { uid: '', nama: '', username: '', nip: '', role: 'petugas', aktif: true };

export default function PenggunaPage() {
  const [users, setUsers]       = useState(() => dbService.getUsers().filter(u => u.role === 'petugas'));
  const [modal, setModal]       = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [errors, setErrors]     = useState({});
  const [saving, setSaving]     = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [blockSelf, setBlockSelf] = useState(false);

  const reload = () => setUsers(dbService.getUsers().filter(u => u.role === 'petugas'));

  const openAdd = () => {
    setEditItem(null);
    setErrors({});
    setForm({ ...EMPTY_FORM, uid: 'USR-' + Date.now() });
    setModal(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setErrors({});
    setForm({ ...item, username: item.username || item.email?.split('@')[0] || '' });
    setModal(true);
  };

  const handleSave = (e) => {
    e.preventDefault();
    const next = {};
    if (!form.nama?.trim()) next.nama = 'Nama lengkap wajib diisi.';
    if (!form.username?.trim()) next.username = 'Nama pengguna wajib diisi.';
    setErrors(next);
    if (Object.keys(next).length) {
      showFeedback({ type: 'warning', title: 'Data tidak valid', message: Object.values(next)[0] });
      return;
    }

    setSaving(true);
    try {
      const current = dbService.getUsers();
      const fakeEmail = `${form.username}@sekolah.internal`;

      if (editItem) {
        const updated = current.map((u) => u.uid === editItem.uid ? { ...u, ...form, email: fakeEmail } : u);
        dbService.saveUsers(updated);
        showFeedback({ type: 'success', title: 'Perubahan berhasil disimpan.' });
      } else {
        current.push({ ...form, email: fakeEmail, created_at: new Date().toISOString() });
        dbService.saveUsers(current);
        showFeedback({ type: 'success', title: 'Petugas berhasil ditambahkan.' });
      }
      setModal(false);
      reload();
    } catch (err) {
      console.error(err);
      showFeedback({
        type: 'error',
        title: 'Data gagal disimpan. Silakan coba lagi.',
        message: friendlyError(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (row) => {
    if (row.uid === dbService.getCurrentUser()?.uid) {
      setBlockSelf(true);
      return;
    }
    setDeleteTarget(row);
  };

  const handleExecuteDelete = () => {
    if (!deleteTarget) return;
    try {
      dbService.saveUsers(dbService.getUsers().filter((u) => u.uid !== deleteTarget.uid));
      showFeedback({ type: 'success', title: 'Petugas berhasil dihapus.' });
      setDeleteTarget(null);
      reload();
    } catch (err) {
      console.error(err);
      showFeedback({ type: 'error', title: 'Petugas gagal dihapus.', message: friendlyError(err) });
    }
  };

  const columns = [
    {
      key: 'nama',
      label: 'Nama lengkap',
      sortable: true,
      render: (row) => <p className="font-medium text-main">{row.nama}</p>,
    },
    {
      key: 'username',
      label: 'Nama pengguna',
      sortable: true,
      render: (row) => (
        <span className="text-muted">{row.username || row.email?.split('@')[0]}</span>
      ),
    },
    {
      key: 'nip',
      label: 'NIP',
      render: (row) => (
        row.nip ? <span>{row.nip}</span> : <span className="text-muted">—</span>
      ),
    },
    {
      key: 'role',
      label: 'Peran',
      sortable: true,
      render: (row) => <span>{row.role === 'admin' ? 'Admin' : 'Petugas lab'}</span>,
    },
    {
      key: 'aksi',
      label: 'Tindakan',
      render: (row) => (
        <div className="flex items-center gap-1 justify-end">
          <button type="button" onClick={() => openEdit(row)} className="table-action table-action-edit">Edit</button>
          <button type="button" onClick={() => requestDelete(row)} className="table-action table-action-danger">Hapus</button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pengguna"
        description="Tambah, Edit & Hapus akun petugas lab"
      />

      <DataTable
        columns={columns}
        data={users}
        searchKeys={['nama', 'username', 'nip']}
        searchPlaceholder="Cari nama atau NIP..."
        emptyMessage="Belum ada petugas"
        emptyDescription="Petugas yang ditambahkan akan muncul di sini."
        actionButton={
          <Button icon={IconPlus} onClick={openAdd} className="w-full md:w-auto justify-center">
            Tambah petugas
          </Button>
        }
      />

      <Modal
        isOpen={modal}
        onClose={() => !saving && setModal(false)}
        title={editItem ? 'Ubah petugas' : 'Tambah petugas'}
        subtitle="Kolom bertanda * wajib diisi."
      >
        <form onSubmit={handleSave} className="space-y-4">
          <FormField label="Nama lengkap" required error={errors.nama}>
            <input required value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} className={inputClass} placeholder="Budi Santoso" />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Nama pengguna" required error={errors.username} hint="Dipakai untuk masuk ke aplikasi.">
              <input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s+/g, '') })} className={inputClass} placeholder="budi_lab" />
            </FormField>
            <FormField label="NIP">
              <input value={form.nip || ''} onChange={(e) => setForm({ ...form, nip: e.target.value })} className={inputClass} placeholder="Nomor Induk Pegawai" />
            </FormField>
          </div>
          <FormField label="Peran" required>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <IconShieldCheck size={18} />
              </div>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className={`${inputClass} pl-9 pr-8 bg-white appearance-none cursor-pointer`}
              >
                <option value="petugas">Petugas lab</option>
              </select>
              <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center pointer-events-none text-gray-400">
                <IconChevronDown size={16} />
              </div>
            </div>
          </FormField>
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-3 border-t border-gray-200">
            <Button variant="secondary" onClick={() => setModal(false)} disabled={saving} className="w-full sm:w-auto justify-center">
              Batal
            </Button>
            <Button type="submit" disabled={saving} className="w-full sm:w-auto justify-center">
              {saving ? 'Menyimpan...' : (editItem ? 'Simpan perubahan' : 'Simpan petugas')}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleExecuteDelete}
        title="Hapus pengguna?"
        message={`Apakah Anda yakin ingin menghapus ${deleteTarget?.nama}?\n\nTindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus pengguna"
      />

      <ConfirmDialog
        isOpen={blockSelf}
        onClose={() => setBlockSelf(false)}
        onConfirm={() => setBlockSelf(false)}
        title="Tidak dapat menghapus akun sendiri"
        message="Anda sedang masuk dengan akun ini. Minta admin lain jika akun perlu dihapus."
        confirmLabel="Tutup"
        confirmVariant="primary"
      />
    </div>
  );
}
