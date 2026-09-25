// src/pages/KartuRfidPage.jsx
// CRUD Kartu RFID (Admin)

import { useState } from 'react';
import { dbService } from '../services/store';
import Modal from '../components/Modal';
import DataTable from '../components/DataTable';
import Button from '../components/Button';
import Badge from '../components/Badge';
import { IconPlus, IconTrash, IconEdit, IconCreditCard, IconX, IconCheck } from '@tabler/icons-react';

const EMPTY_FORM = { uid_kartu: '', kelas: '', nama_pemegang: '', aktif: true };

export default function KartuRfidPage() {
  const [kartu, setKartu]       = useState(() => dbService.getKartu());
  const [modal, setModal]       = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm]         = useState(EMPTY_FORM);

  const reload = () => setKartu(dbService.getKartu());

  const openAdd = () => {
    setEditItem(null);
    setForm({ ...EMPTY_FORM, uid_kartu: 'KARTU-' + Math.random().toString(36).substring(2, 8).toUpperCase(), aktif: true });
    setModal(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setForm({ ...item });
    setModal(true);
  };

  const handleSave = (e) => {
    e.preventDefault();
    const current = dbService.getKartu();
    if (editItem) {
      const updated = current.map((k) => k.uid_kartu === editItem.uid_kartu ? { ...form } : k);
      dbService.saveKartu(updated);
    } else {
      current.unshift({ ...form, aktif: true, created_at: new Date().toISOString() });
      dbService.saveKartu(current);
    }
    setModal(false);
    reload();
  };

  const handleDelete = (uid) => {
    if (!confirm('Hapus kartu ini?')) return;
    dbService.saveKartu(dbService.getKartu().filter((k) => k.uid_kartu !== uid));
    reload();
  };

  const toggleAktif = (item) => {
    const updated = dbService.getKartu().map((k) => k.uid_kartu === item.uid_kartu ? { ...k, aktif: !k.aktif } : k);
    dbService.saveKartu(updated);
    reload();
  };

  const columns = [
    {
      key: 'uid_kartu',
      label: 'UID Kartu',
      sortable: true,
      render: (row) => <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded text-gray-700">{row.uid_kartu}</span>,
    },
    {
      key: 'pemegang',
      label: 'Pemegang',
      sortable: true,
      render: (row) => <span className="font-semibold text-main text-xs">{row.nama_pemegang || '—'}</span>,
    },
    {
      key: 'kelas',
      label: 'Kelas',
      sortable: true,
      render: (row) => <span className="text-[11px] text-muted">{row.kelas}</span>,
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
          <button onClick={() => toggleAktif(row)} className={`text-[11px] font-semibold px-2 py-1 rounded transition ${row.aktif ? 'bg-amber-50 text-amber-700 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}>
            {row.aktif ? 'Blokir' : 'Aktifkan'}
          </button>
          <button onClick={() => openEdit(row)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition" title="Edit"><IconEdit size={15} /></button>
          <button onClick={() => handleDelete(row.uid_kartu)} className="p-1.5 text-red-500 hover:bg-red-50 rounded transition" title="Hapus"><IconTrash size={15} /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-main flex items-center gap-2">          
          <span>Kartu RFID</span>
        </h2>
        <p className="text-xs sm:text-sm text-muted mt-0.5">Kelola kartu setiap perwakilan kelas</p>
      </div>

      <DataTable
        columns={columns}
        data={kartu}
        searchPlaceholder="Cari kelas, pemegang, UID..."
        searchKeys={['kelas', 'nama_pemegang', 'uid_kartu']}
        actionButton={
          <Button icon={IconPlus} onClick={openAdd} className="w-full md:w-auto justify-center">
            Daftar Kartu
          </Button>
        }
      />

      <Modal
        isOpen={modal}
        onClose={() => setModal(false)}
        title={editItem ? 'Edit Kartu RFID' : 'Daftar Kartu Baru'}
        subtitle={editItem ? 'Perbarui data kelas atau status kartu RFID' : 'Registrasikan kartu RFID baru ke dalam sistem'}
        icon={IconCreditCard}
        iconVariant="primary"
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">UID Kartu *</label>
            <input required value={form.uid_kartu} onChange={(e) => setForm({ ...form, uid_kartu: e.target.value })} disabled={!!editItem} className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm font-mono bg-gray-50 text-gray-700" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Kelas *</label>
            <input required value={form.kelas} onChange={(e) => setForm({ ...form, kelas: e.target.value })} placeholder="XI RPL 1" className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Nama Perwakilan</label>
            <input value={form.nama_pemegang} onChange={(e) => setForm({ ...form, nama_pemegang: e.target.value })} placeholder="Ketua Kelas / Penanggung Jawab" className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
          </div>
          
          {editItem && (
            <div className="flex items-center gap-2 pt-1">
              <input type="checkbox" id="chk-aktif" checked={form.aktif} onChange={(e) => setForm({ ...form, aktif: e.target.checked })} className="w-4 h-4 text-blue-600 rounded cursor-pointer" />
              <label htmlFor="chk-aktif" className="text-xs sm:text-sm font-medium text-main cursor-pointer select-none">Kartu Aktif</label>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-3 border-t border-gray-100">
            <Button variant="secondary" icon={IconX} onClick={() => setModal(false)} className="w-full sm:w-auto justify-center">
              Batal
            </Button>
            <Button type="submit" icon={IconCheck} className="w-full sm:w-auto justify-center">
              Simpan Kartu
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
