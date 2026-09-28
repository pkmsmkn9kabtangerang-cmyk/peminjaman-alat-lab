import { useState } from 'react';
import { dbService } from '../services/store';
import Modal from '../components/Modal';
import DataTable from '../components/DataTable';
import Button from '../components/Button';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import FormField, { inputClass } from '../components/FormField';
import { showFeedback, friendlyError } from '../lib/feedback';
import { IconPlus } from '@tabler/icons-react';

const EMPTY_FORM = {
  id: '', kode: '', nama: '', kategori: 'elektronik', uid_rfid: '', jumlah_total: 1, jumlah_rusak: 0,
};

export default function InventarisPage() {
  const [alat, setAlat]         = useState(() => dbService.getAlat());
  const [modal, setModal]       = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm]         = useState(EMPTY_FORM);
  const [errors, setErrors]     = useState({});
  const [saving, setSaving]     = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const reload = () => setAlat(dbService.getAlat());

  const openAdd = () => {
    setEditItem(null);
    setErrors({});
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
    setErrors({});
    setForm({ ...item });
    setModal(true);
  };

  const validate = () => {
    const next = {};
    if (!form.nama?.trim()) next.nama = 'Nama alat wajib diisi.';
    if (!form.kode?.trim()) next.kode = 'Kode barang wajib diisi.';
    if (!form.uid_rfid?.trim()) next.uid_rfid = 'Kode stiker kartu alat wajib diisi.';
    if (!form.kategori?.trim()) next.kategori = 'Kategori wajib diisi.';
    if (!String(form.jumlah_total).trim() || Number(form.jumlah_total) < 1) {
      next.jumlah_total = 'Jumlah unit minimal 1.';
    }
    const current = dbService.getAlat();
    const kodeUsed = current.some((a) => a.kode === form.kode.trim() && a.id !== editItem?.id);
    if (kodeUsed) next.kode = 'Kode barang tersebut sudah digunakan.';
    return next;
  };

  const handleSave = (e) => {
    e.preventDefault();
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length) return;

    setSaving(true);
    try {
      const current = dbService.getAlat();
      if (editItem) {
        const updated = current.map((a) => a.id === editItem.id ? { ...a, ...form, jumlah_total: Number(form.jumlah_total), jumlah_rusak: Number(form.jumlah_rusak) } : a);
        dbService.saveAlat(updated);
        showFeedback({ type: 'success', title: 'Perubahan berhasil disimpan.' });
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
        showFeedback({ type: 'success', title: 'Barang berhasil ditambahkan.' });
      }
      setModal(false);
      reload();
    } catch (err) {
      console.error(err);
      showFeedback({
        type: 'error',
        title: editItem ? 'Perubahan gagal disimpan.' : 'Barang gagal ditambahkan.',
        message: friendlyError(err, 'Silakan periksa data, lalu coba lagi.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleExecuteDelete = () => {
    if (!deleteTarget) return;
    try {
      dbService.saveAlat(dbService.getAlat().filter((a) => a.id !== deleteTarget.id));
      showFeedback({ type: 'success', title: 'Barang berhasil dihapus.' });
      setDeleteTarget(null);
      reload();
    } catch (err) {
      console.error(err);
      showFeedback({ type: 'error', title: 'Barang gagal dihapus.', message: friendlyError(err) });
    }
  };

  const columns = [
    {
      key: 'nama',
      label: 'Nama alat',
      sortable: true,
      render: (row) => <p className="font-medium text-main">{row.nama}</p>,
    },
    {
      key: 'kode',
      label: 'Kode barang',
      sortable: true,
      render: (row) => <p className="text-muted">{row.kode}</p>,
    },
    {
      key: 'kategori',
      label: 'Kategori',
      sortable: true,
      render: (row) => <span className="capitalize text-muted">{row.kategori}</span>,
    },
    {
      key: 'jumlah_total',
      label: 'Total unit',
      sortable: true,
      render: (row) => <span className="font-medium">{row.jumlah_total} unit</span>,
    },
    {
      key: 'jumlah_rusak',
      label: 'Rusak',
      render: (row) => (
        <span className={row.jumlah_rusak > 0 ? 'text-orange-800 font-medium' : 'text-muted'}>
          {row.jumlah_rusak} unit
        </span>
      ),
    },
    {
      key: 'aksi',
      label: 'Tindakan',
      render: (row) => (
        <div className="flex items-center gap-1 justify-end">
          <button type="button" onClick={() => openEdit(row)} className="table-action table-action-edit">
            Edit
          </button>
          <button type="button" onClick={() => setDeleteTarget(row)} className="table-action table-action-danger">
            Hapus
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Inventaris"
        description="Tambah, ubah, atau hapus data barang laboratorium."
      />

      <DataTable
        columns={columns}
        data={alat}
        searchPlaceholder="Cari nama atau kode barang..."
        searchKeys={['nama', 'kode', 'uid_rfid', 'kategori']}
        emptyMessage="Belum ada barang"
        emptyDescription="Barang yang ditambahkan akan muncul di sini."
        actionButton={<Button icon={IconPlus} onClick={openAdd}>Tambah barang</Button>}
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
        onClose={() => !saving && setModal(false)}
        title={editItem ? 'Ubah barang' : 'Tambah barang'}
        subtitle={editItem ? 'Perbarui data barang, lalu simpan.' : 'Isi data barang baru. Kolom bertanda * wajib diisi.'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <FormField label="Nama alat" required error={errors.nama}>
            <input required value={form.nama} onChange={(e) => setForm({ ...form, nama: e.target.value })} className={inputClass} placeholder="Contoh: Multimeter Digital" />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Kode barang" required error={errors.kode}>
              <input required value={form.kode} onChange={(e) => setForm({ ...form, kode: e.target.value })} className={inputClass} placeholder="MM-001" />
            </FormField>
            <FormField label="Kode stiker alat" required hint="Kode pada stiker yang menempel di alat." error={errors.uid_rfid}>
              <input required value={form.uid_rfid} onChange={(e) => setForm({ ...form, uid_rfid: e.target.value })} className={inputClass} placeholder="STK-ALT-001" />
            </FormField>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Kategori" required error={errors.kategori}>
              <input
                required
                list="kategori-list"
                value={form.kategori}
                onChange={(e) => setForm({ ...form, kategori: e.target.value })}
                className={inputClass}
                placeholder="Pilih atau ketik kategori"
              />
            </FormField>
            <FormField label="Total unit" required error={errors.jumlah_total}>
              <input
                type="text"
                inputMode="numeric"
                required
                value={form.jumlah_total}
                onChange={(e) => setForm({ ...form, jumlah_total: e.target.value.replace(/\D/g, '') })}
                className={inputClass}
                placeholder="Contoh: 5"
              />
            </FormField>
          </div>

          {editItem && (
            <FormField
              label="Unit rusak"
              hint="Jika alat sudah diperbaiki, isi 0 agar unit bisa dipinjam lagi."
            >
              <input
                type="text"
                inputMode="numeric"
                value={form.jumlah_rusak}
                onChange={(e) => setForm({ ...form, jumlah_rusak: e.target.value.replace(/\D/g, '') })}
                className={inputClass}
              />
            </FormField>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-3 border-t border-gray-200">
            <Button variant="secondary" onClick={() => setModal(false)} disabled={saving} className="w-full sm:w-auto justify-center">
              Batal
            </Button>
            <Button type="submit" disabled={saving} className="w-full sm:w-auto justify-center">
              {saving ? 'Menyimpan...' : (editItem ? 'Simpan perubahan' : 'Simpan barang')}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleExecuteDelete}
        title="Hapus barang?"
        message={`Apakah Anda yakin ingin menghapus ${deleteTarget?.nama}?\n\nTindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus barang"
      />
    </div>
  );
}
