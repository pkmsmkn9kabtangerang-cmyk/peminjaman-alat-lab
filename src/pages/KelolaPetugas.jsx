import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { dbService } from '../services/store';
import { callFunction } from '../lib/api';
import Modal from '../components/Modal';
import DataTable from '../components/DataTable';
import Button from '../components/Button';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import FormField, { inputClass } from '../components/FormField';
import { showFeedback, friendlyError } from '../lib/feedback';
import PageNote from '../components/PageNote';
import { IconPlus, IconShieldCheck, IconChevronDown, IconRefresh, IconMail, IconKey, IconCircleCheck, IconClockHour4, IconSend } from '@tabler/icons-react';

// Validasi email format
const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const EMPTY_FORM = {
  uid: '',
  nama: '',       // nama_lengkap di Supabase
  username: '',
  nip: '',
  email: '',
  role: 'petugas',
  // aktif: true,
};

// ── Data access: Supabase jika ada, localStorage jika tidak ──
async function fetchUsers(selfUid) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nama_lengkap, username, nip, email, role, is_verified, created_at')
      .eq('role', 'petugas')
      .order('created_at', { ascending: false });
    if (error) throw error;
    // Normalisasi field
    return (data ?? [])
      .filter((u) => u.id !== selfUid)
      .map((u) => ({
        uid: u.id,
        nama: u.nama_lengkap || u.email,
        username: u.username || u.email?.split('@')[0],
        nip: u.nip,
        email: u.email,
        role: u.role,
        // is_verified: false = belum set password (diset oleh create-petugas)
        // is_verified: true atau null = sudah aktif / akun lama sebelum fitur ini
        is_verified: u.is_verified === false ? false : true,
        created_at: u.created_at,
      }));
  }
  return dbService.getUsers().filter((u) => u.role === 'petugas' && u.uid !== selfUid);
}

export default function PenggunaPage({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [blockSelf, setBlockSelf] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetting, setResetting] = useState(false);
  const [resendTarget, setResendTarget] = useState(null);
  const [resending, setResending] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const selfUid = currentUser?.uid || dbService.getCurrentUser()?.uid;
      const data = await fetchUsers(selfUid);
      setUsers(data);
    } catch (err) {
      console.error('[KelolaPetugas] reload error:', err);
      showFeedback({ type: 'error', title: 'Gagal memuat data pengguna.', message: friendlyError(err) });
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  useEffect(() => {
    reload();
  }, [reload]);

  const openAdd = () => {
    setEditItem(null);
    setErrors({});
    setForm({ ...EMPTY_FORM, uid: 'USR-' + Date.now() });
    setModal(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setErrors({});
    setForm({
      ...item,
      nama: item.nama || '',
      username: item.username || item.email?.split('@')[0] || '',
    });
    setModal(true);
  };

  const validate = () => {
    const next = {};
    if (!form.nama?.trim()) next.nama = 'Nama lengkap wajib diisi.';
    if (!form.username?.trim()) next.username = 'Nama pengguna wajib diisi.';
    else if (form.username.trim().length < 3) next.username = 'Username minimal 3 karakter.';
    else if (/\s/.test(form.username.trim())) next.username = 'Username tidak boleh mengandung spasi.';

    if (isSupabaseConfigured && !editItem) {
      // Hanya validasi email & NIP saat tambah baru di mode Supabase
      if (!form.email?.trim()) next.email = 'Email wajib diisi.';
      else if (!isValidEmail(form.email.trim())) next.email = 'Format email tidak valid.';
      if (!form.nip?.trim()) next.nip = 'NIP wajib diisi.';
    }

    return next;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length) {
      showFeedback({ type: 'warning', title: 'Data tidak valid', message: Object.values(next)[0] });
      return;
    }

    setSaving(true);
    try {
      if (isSupabaseConfigured) {
        if (editItem) {
          // Update profil via manage-pengguna edge function
          const res = await callFunction('manage-pengguna', undefined, {
            method: 'PUT',
            params: { id: editItem.uid },
            body: {
              nama_lengkap: form.nama.trim(),
              username: form.username.trim().toLowerCase(),
              nip: form.nip?.trim() || null,
              email: form.email?.trim() || undefined,
              role: form.role,
            },
          });
          if (!res?.success) throw new Error(res?.message || 'Gagal memperbarui profil.');
          showFeedback({ type: 'success', title: 'Perubahan berhasil disimpan.' });
        } else {
          // Tambah petugas baru via create-petugas edge function
          const res = await callFunction('create-petugas', {
            nama_lengkap: form.nama.trim(),
            username: form.username.trim().toLowerCase(),
            nip: form.nip.trim(),
            email: form.email.trim(),
          });
          if (!res?.success) throw new Error(res?.message || 'Gagal menambahkan petugas.');
          showFeedback({
            type: 'success',
            title: 'Petugas berhasil ditambahkan.',
            message: 'Email undangan telah dikirim ke petugas.',
          });
        }
      } else {
        // Mode demo localStorage
        const current = dbService.getUsers();
        const fakeEmail = `${form.username.trim().toLowerCase()}@sekolah.internal`;

        if (editItem) {
          const updated = current.map((u) =>
            u.uid === editItem.uid ? { ...u, ...form, email: fakeEmail } : u
          );
          dbService.saveUsers(updated);
          showFeedback({ type: 'success', title: 'Perubahan berhasil disimpan.' });
        } else {
          current.push({
            ...form,
            uid: form.uid,
            email: fakeEmail,
            role: 'petugas',
            is_verified: false, // Demo: petugas baru dianggap belum aktif
            // aktif: true,
            created_at: new Date().toISOString(),
          });
          dbService.saveUsers(current);
          showFeedback({ type: 'success', title: 'Petugas berhasil ditambahkan.' });
        }
      }

      setModal(false);
      reload();
    } catch (err) {
      console.error('[KelolaPetugas] save error:', err);
      showFeedback({
        type: 'error',
        title: 'Data gagal disimpan.',
        message: err?.message || friendlyError(err),
      });
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (row) => {
    setDeleteTarget(row);
  };

  const handleExecuteDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (isSupabaseConfigured) {
        const res = await callFunction('manage-pengguna', undefined, {
          method: 'DELETE',
          params: { id: deleteTarget.uid },
        });
        if (!res?.success) throw new Error(res?.message || 'Gagal menghapus pengguna.');
      } else {
        dbService.saveUsers(dbService.getUsers().filter((u) => u.uid !== deleteTarget.uid));
      }
      showFeedback({ type: 'success', title: 'Petugas berhasil dihapus.' });
      setDeleteTarget(null);
      reload();
    } catch (err) {
      console.error('[KelolaPetugas] delete error:', err);
      showFeedback({ type: 'error', title: 'Petugas gagal dihapus.', message: err?.message || friendlyError(err) });
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget) return;
    setResetting(true);
    try {
      if (isSupabaseConfigured) {
        const res = await callFunction('manage-pengguna', { aksi: 'reset-password', id: resetTarget.uid }, {
          method: 'POST',
        });
        if (!res?.success) throw new Error(res?.message || 'Gagal mereset password.');
        showFeedback({ type: 'success', title: 'Password direset.', message: `${resetTarget.nama} wajib ganti password saat login berikutnya.` });
      } else {
        showFeedback({ type: 'success', title: '[Demo] Password direset.', message: `Petugas ${resetTarget.nama} akan diminta ganti password.` });
      }
      setResetTarget(null);
    } catch (err) {
      showFeedback({ type: 'error', title: 'Gagal mereset password.', message: err?.message || friendlyError(err) });
    } finally {
      setResetting(false);
    }
  };

  const handleResendInvite = async () => {
    if (!resendTarget) return;
    setResending(true);
    try {
      if (isSupabaseConfigured) {
        const { error } = await supabase.auth.resetPasswordForEmail(resendTarget.email, {
          redirectTo: `${window.location.origin}/auth/set-password`,
        });
        if (error) throw error;
        showFeedback({ type: 'success', title: 'Undangan dikirim ulang.', message: `Link aktivasi dikirim ke ${resendTarget.email}.` });
      } else {
        showFeedback({ type: 'success', title: '[Demo] Undangan dikirim ulang.' });
      }
      setResendTarget(null);
    } catch (err) {
      showFeedback({ type: 'error', title: 'Gagal mengirim ulang undangan.', message: err?.message || friendlyError(err) });
    } finally {
      setResending(false);
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
      label: 'Username',
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
      key: 'email',
      label: 'Email',
      render: (row) => (
        row.email && !row.email.includes('@sekolah.internal')
          ? <span className="text-muted text-main">{row.email}</span>
          : <span className="text-muted">—</span>
      ),
    },
    {
      key: 'status_verifikasi',
      label: 'Status',
      render: (row) => {
        if (row.is_verified === false) {
          return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              <IconClockHour4 size={13} />
              Menunggu aktivasi
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
            <IconCircleCheck size={13} />
            Terverifikasi
          </span>
        );
      },
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
          {row.is_verified === false && (
            <button
              type="button"
              onClick={() => setResendTarget(row)}
              className="table-action"
              title="Kirim ulang undangan"
            >
              <IconSend size={13} className="inline mr-1" />
              Kirim ulang
            </button>
          )}
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

      {isSupabaseConfigured && (
        <PageNote title="Informasi Penting" icon={IconMail}>
          <p>Saat ingin menambahkan petugas baru, tolong masukkan email dengan benar. Nantinya email tersebut akan menerima undangan otomatis agar petugas dapat login dan mengatur kata sandinya sendiri.</p>
          <p className="mt-2 text-amber-800"> Petugas dengan status <span className="font-semibold">Menunggu aktivasi</span> belum membuka link undangan dan belum membuat password. Link undangan kedaluwarsa dalam <b>24 jam</b> gunakan tombol <b>Kirim ulang</b> untuk mengirim ulang undangan.</p>
        </PageNote>
      )}

      <DataTable
        columns={columns}
        data={users}
        loading={loading}
        searchKeys={['nama', 'username', 'nip', 'email']}
        searchPlaceholder="Cari nama atau NIP..."
        emptyMessage="Belum ada petugas"
        emptyDescription="Petugas yang ditambahkan akan muncul di sini."
        actionButton={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reload}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
              title="Refresh data"
            >
              <IconRefresh size={18} />
            </button>
            <Button icon={IconPlus} onClick={openAdd} className="w-full md:w-auto justify-center">
              Tambah petugas
            </Button>
          </div>
        }
      />

      <Modal
        isOpen={modal}
        onClose={() => !saving && setModal(false)}
        title={editItem ? 'Ubah petugas' : 'Tambah petugas'}
        subtitle={
          editItem
            ? 'Perbarui data petugas, lalu simpan.'
            : isSupabaseConfigured
              ? 'Kolom bertanda * wajib diisi. Email undangan akan dikirim otomatis.'
              : 'Kolom bertanda * wajib diisi.'
        }
      >
        <form onSubmit={handleSave} className="space-y-4">
          <FormField label="Nama lengkap" required error={errors.nama}>
            <input
              required
              value={form.nama}
              onChange={(e) => setForm({ ...form, nama: e.target.value })}
              className={inputClass}
              placeholder="Budi Santoso"
            />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Nama pengguna" required error={errors.username} hint="Dipakai untuk login ke aplikasi.">
              <input
                required
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase().replace(/\s+/g, '') })}
                className={inputClass}
                placeholder="budi_lab"
              />
            </FormField>
            <FormField label="NIP" required={isSupabaseConfigured && !editItem} error={errors.nip}>
              <input
                value={form.nip || ''}
                onChange={(e) => setForm({ ...form, nip: e.target.value })}
                className={inputClass}
                placeholder="Nomor Induk Pegawai"
              />
            </FormField>
          </div>

          {/* Email hanya untuk Supabase mode */}
          {isSupabaseConfigured && (
            <FormField
              label="Email"
              required={!editItem}
              error={errors.email}
              hint={!editItem ? 'Email undangan akan dikirim ke alamat ini.' : 'Kosongkan jika tidak ingin mengubah email.'}
            >
              <input
                type="email"
                value={form.email || ''}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputClass}
                placeholder="petugas@sekolah.sch.id"
                disabled={!!editItem} // Email tidak bisa diubah setelah dibuat
              />
            </FormField>
          )}

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
        isOpen={!!resetTarget}
        onClose={() => setResetTarget(null)}
        onConfirm={handleResetPassword}
        title="Reset Password?"
        message={`Reset password untuk ${resetTarget?.nama}?\n\nPetugas ini akan diwajibkan mengganti password saat login berikutnya.`}
        confirmLabel={resetting ? 'Mereset...' : 'Reset Password'}
      />

      <ConfirmDialog
        isOpen={!!resendTarget}
        onClose={() => setResendTarget(null)}
        onConfirm={handleResendInvite}
        title="Kirim Ulang Undangan?"
        message={`Kirim ulang link aktivasi ke ${resendTarget?.email}?\n\nLink sebelumnya akan digantikan dengan link baru yang berlaku 24 jam.`}
        confirmLabel={resending ? 'Mengirim...' : 'Kirim Undangan'}
      />

    </div>
  );
}
