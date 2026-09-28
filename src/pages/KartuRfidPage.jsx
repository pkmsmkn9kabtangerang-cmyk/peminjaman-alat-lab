import { useState } from 'react';
import { dbService } from '../services/store';
import Modal from '../components/Modal';
import DataTable from '../components/DataTable';
import Button from '../components/Button';
import Badge from '../components/Badge';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import FormField, { inputClass } from '../components/FormField';
import { showFeedback, friendlyError } from '../lib/feedback';
import { IconPlus } from '@tabler/icons-react';

const EMPTY_FORM = { uid_kartu: '', kelas: '', nama_pemegang: '', aktif: true };

export default function KartuRfidPage() {
  const [kartu, setKartu]       = useState(() => dbService.getKartu());
  const [modal, setModal]       = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [errors, setErrors]     = useState({});
  const [saving, setSaving]     = useState(false);
  const [lockedModal, setLockedModal] = useState({ isOpen: false, kartu: null, items: [] });
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, item: null });

  const reload = () => setKartu(dbService.getKartu());

  const openAdd = () => {
    setEditItem(null);
    setErrors({});
    setForm({
      ...EMPTY_FORM,
      uid_kartu: 'KARTU-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      aktif: true,
    });
    setModal(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setErrors({});
    setForm({ ...item });
    setModal(true);
  };

  const handleSave = (e) => {
    e.preventDefault();
    const next = {};
    if (!form.uid_kartu?.trim()) next.uid_kartu = 'Nomor kartu wajib diisi.';
    if (!form.kelas?.trim()) next.kelas = 'Kelas wajib diisi.';
    const current = dbService.getKartu();
    const used = current.some((k) => k.uid_kartu === form.uid_kartu.trim() && k.uid_kartu !== editItem?.uid_kartu);
    if (used) next.uid_kartu = 'Nomor kartu tersebut sudah digunakan.';
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      if (editItem) {
        const updated = current.map((k) => (k.uid_kartu === editItem.uid_kartu ? { ...form } : k));
        dbService.saveKartu(updated);
        showFeedback({ type: 'success', title: 'Perubahan berhasil disimpan.' });
      } else {
        current.unshift({ ...form, aktif: true, created_at: new Date().toISOString() });
        dbService.saveKartu(current);
        showFeedback({ type: 'success', title: 'Kartu berhasil didaftarkan.' });
      }
      setModal(false);
      reload();
    } catch (err) {
      console.error(err);
      showFeedback({ type: 'error', title: 'Kartu gagal disimpan.', message: friendlyError(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleAttemptDelete = (item) => {
    const activeLoans = dbService.getActiveLoansByCard(item.uid_kartu);
    if (activeLoans.length > 0) {
      setLockedModal({ isOpen: true, kartu: item, items: activeLoans });
      return;
    }
    setConfirmDelete({ isOpen: true, item });
  };

  const handleExecuteDelete = () => {
    const uid = confirmDelete.item?.uid_kartu;
    if (!uid) return;
    const res = dbService.deleteKartu(uid);
    if (!res.ok) {
      console.error(res.message);
      showFeedback({
        type: 'error',
        title: 'Kartu gagal dihapus.',
        message: 'Kartu masih memiliki pinjaman aktif atau tidak dapat dihapus saat ini.',
      });
      return;
    }
    showFeedback({ type: 'success', title: 'Kartu berhasil dihapus.' });
    setConfirmDelete({ isOpen: false, item: null });
    reload();
  };

  const toggleAktif = (item) => {
    const updated = dbService
      .getKartu()
      .map((k) => (k.uid_kartu === item.uid_kartu ? { ...k, aktif: !k.aktif } : k));
    dbService.saveKartu(updated);
    showFeedback({
      type: 'success',
      title: item.aktif ? 'Kartu diblokir.' : 'Kartu diaktifkan kembali.',
    });
    reload();
  };

  const columns = [
    {
      key: 'kelas',
      label: 'Kelas',
      sortable: true,
      render: (row) => <span className="font-medium text-main">{row.kelas}</span>,
    },
    {
      key: 'pemegang',
      label: 'Pemegang',
      sortable: true,
      render: (row) => <span>{row.nama_pemegang || '—'}</span>,
    },
    {
      key: 'pinjaman_aktif',
      label: 'Pinjaman aktif',
      sortable: false,
      render: (row) => {
        const activeLoans = dbService.getActiveLoansByCard(row.uid_kartu);
        if (activeLoans.length > 0) {
          return <span className="text-orange-800 font-medium">{activeLoans.length} alat dipinjam</span>;
        }
        return <span className="text-muted">Tidak ada</span>;
      },
    },
    {
      key: 'aktif',
      label: 'Status',
      sortable: true,
      render: (row) => <Badge status={row.aktif ? 'aktif' : 'nonaktif'} />,
    },
    {
      key: 'aksi',
      label: 'Tindakan',
      render: (row) => {
        const isBorrowing = dbService.getActiveLoansByCard(row.uid_kartu).length > 0;
        return (
          <div className="flex items-center gap-1 justify-end flex-wrap">
            <button
              type="button"
              onClick={() => toggleAktif(row)}
              className="table-action table-action-edit"
            >
              {row.aktif ? 'Blokir' : 'Aktifkan'}
            </button>
            <button type="button" onClick={() => openEdit(row)} className="table-action table-action-edit">
              Edit
            </button>
            <button
              type="button"
              onClick={() => handleAttemptDelete(row)}
              className="table-action table-action-danger"
              title={isBorrowing ? 'Kartu tidak dapat dihapus karena masih meminjam alat' : 'Hapus kartu'}
            >
              Hapus
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Kartu RFID"
        description="Daftarkan kartu kelas. Kartu yang masih meminjam alat tidak dapat dihapus."
      />

      <DataTable
        columns={columns}
        data={kartu}
        searchPlaceholder="Cari kelas atau nama pemegang..."
        searchKeys={['kelas', 'nama_pemegang', 'uid_kartu']}
        emptyMessage="Belum ada kartu RFID"
        emptyDescription="Kartu yang didaftarkan akan muncul di sini."
        actionButton={
          <Button icon={IconPlus} onClick={openAdd} className="w-full md:w-auto justify-center">
            Daftar kartu
          </Button>
        }
      />

      <Modal
        isOpen={modal}
        onClose={() => !saving && setModal(false)}
        title={editItem ? 'Ubah kartu' : 'Daftar kartu baru'}
        subtitle="Kolom bertanda * wajib diisi."
      >
        <form onSubmit={handleSave} className="space-y-4">
          <FormField
            label="Nomor kartu"
            required
            error={errors.uid_kartu}
            hint="Nomor teknis kartu. Biasanya sudah terisi otomatis."
          >
            <input
              required
              value={form.uid_kartu}
              onChange={(e) => setForm({ ...form, uid_kartu: e.target.value })}
              disabled={!!editItem}
              className={inputClass}
            />
          </FormField>
          <FormField label="Kelas" required error={errors.kelas}>
            <input
              required
              value={form.kelas}
              onChange={(e) => setForm({ ...form, kelas: e.target.value })}
              placeholder="XI RPL 1"
              className={inputClass}
            />
          </FormField>
          <FormField label="Nama perwakilan">
            <input
              value={form.nama_pemegang}
              onChange={(e) => setForm({ ...form, nama_pemegang: e.target.value })}
              placeholder="Ketua kelas / penanggung jawab"
              className={inputClass}
            />
          </FormField>

          {editItem && (
            <label className="flex items-center gap-2 pt-1 text-[15px]">
              <input
                type="checkbox"
                checked={form.aktif}
                onChange={(e) => setForm({ ...form, aktif: e.target.checked })}
                className="w-4 h-4"
              />
              Kartu aktif (boleh dipakai meminjam)
            </label>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-3 border-t border-gray-200">
            <Button variant="secondary" onClick={() => setModal(false)} disabled={saving} className="w-full sm:w-auto justify-center">
              Batal
            </Button>
            <Button type="submit" disabled={saving} className="w-full sm:w-auto justify-center">
              {saving ? 'Menyimpan...' : (editItem ? 'Simpan perubahan' : 'Simpan kartu')}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={lockedModal.isOpen}
        onClose={() => setLockedModal({ isOpen: false, kartu: null, items: [] })}
        title="Kartu tidak dapat dihapus"
        subtitle="Kartu masih memiliki alat yang belum dikembalikan."
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-[15px] text-gray-700 leading-relaxed">
            Kelas {lockedModal.kartu?.kelas} masih meminjam alat. Kembalikan alat terlebih dahulu, lalu hapus kartu.
          </p>
          <div className="border border-gray-200 divide-y divide-gray-200">
            {lockedModal.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-2 px-3 text-[15px]">
                <span>{item.nama_alat}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button
              variant="secondary"
              onClick={() => setLockedModal({ isOpen: false, kartu: null, items: [] })}
            >
              Tutup
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        onClose={() => setConfirmDelete({ isOpen: false, item: null })}
        onConfirm={handleExecuteDelete}
        title="Hapus kartu?"
        message={`Apakah Anda yakin ingin menghapus kartu kelas ${confirmDelete.item?.kelas}?\n\nTindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus kartu"
      />
    </div>
  );
}
