// src/pages/KartuRfidPage.jsx
// CRUD Kartu RFID (Admin) dengan proteksi penghapusan kartu yang sedang meminjam alat

import { useState } from 'react';
import { dbService } from '../services/store';
import Modal from '../components/Modal';
import DataTable from '../components/DataTable';
import Button from '../components/Button';
import Badge from '../components/Badge';
import {
  IconPlus,
  IconTrash,
  IconEdit,
  IconCreditCard,
  IconX,
  IconCheck,
  IconLock,
  IconAlertTriangle,
  IconBox,
} from '@tabler/icons-react';

const EMPTY_FORM = { uid_kartu: '', kelas: '', nama_pemegang: '', aktif: true };

export default function KartuRfidPage() {
  const [kartu, setKartu]       = useState(() => dbService.getKartu());
  const [modal, setModal]       = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm]         = useState(EMPTY_FORM);

  // Modal peringatan jika user mencoba menghapus kartu yang masih meminjam
  const [lockedModal, setLockedModal] = useState({ isOpen: false, kartu: null, items: [] });
  // Modal konfirmasi hapus kartu yang aman
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, uid: null, kelas: '' });

  const reload = () => setKartu(dbService.getKartu());

  const openAdd = () => {
    setEditItem(null);
    setForm({
      ...EMPTY_FORM,
      uid_kartu: 'KARTU-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
      aktif: true,
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
    const current = dbService.getKartu();
    if (editItem) {
      const updated = current.map((k) => (k.uid_kartu === editItem.uid_kartu ? { ...form } : k));
      dbService.saveKartu(updated);
    } else {
      current.unshift({ ...form, aktif: true, created_at: new Date().toISOString() });
      dbService.saveKartu(current);
    }
    setModal(false);
    reload();
  };

  // Cek apakah kartu sedang meminjam sebelum hapus
  const handleAttemptDelete = (item) => {
    const activeLoans = dbService.getActiveLoansByCard(item.uid_kartu);
    if (activeLoans.length > 0) {
      // Tolak penghapusan & tampilkan modal peringatan
      setLockedModal({
        isOpen: true,
        kartu: item,
        items: activeLoans,
      });
      return;
    }

    // Aman dihapus
    setConfirmDelete({
      isOpen: true,
      uid: item.uid_kartu,
      kelas: item.kelas,
    });
  };

  const handleExecuteDelete = () => {
    if (!confirmDelete.uid) return;
    const res = dbService.deleteKartu(confirmDelete.uid);
    if (!res.ok) {
      alert(res.message);
      return;
    }
    setConfirmDelete({ isOpen: false, uid: null, kelas: '' });
    reload();
  };

  const toggleAktif = (item) => {
    const updated = dbService
      .getKartu()
      .map((k) => (k.uid_kartu === item.uid_kartu ? { ...k, aktif: !k.aktif } : k));
    dbService.saveKartu(updated);
    reload();
  };

  const columns = [
    {
      key: 'uid_kartu',
      label: 'UID Kartu',
      sortable: true,
      render: (row) => (
        <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded text-gray-700 font-semibold">
          {row.uid_kartu}
        </span>
      ),
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
      render: (row) => <span className="text-xs font-semibold text-main">{row.kelas}</span>,
    },
    {
      key: 'pinjaman_aktif',
      label: 'Pinjaman Aktif',
      sortable: false,
      render: (row) => {
        const activeLoans = dbService.getActiveLoansByCard(row.uid_kartu);
        if (activeLoans.length > 0) {
          return (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              {activeLoans.length} Alat Dipinjam
            </span>
          );
        }
        return <span className="text-[11px] text-gray-400">Tidak ada</span>;
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
      label: '',
      render: (row) => {
        const activeLoans = dbService.getActiveLoansByCard(row.uid_kartu);
        const isBorrowing = activeLoans.length > 0;

        return (
          <div className="flex items-center gap-1.5 justify-end">
            <button
              onClick={() => toggleAktif(row)}
              className={`text-[11px] font-semibold px-2 py-1 rounded transition ${
                row.aktif
                  ? 'bg-amber-50 text-amber-700 hover:bg-amber-100'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }`}
            >
              {row.aktif ? 'Blokir' : 'Aktifkan'}
            </button>

            <button
              onClick={() => openEdit(row)}
              className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition"
              title="Edit Data Kartu"
            >
              <IconEdit size={15} />
            </button>

            {/* Proteksi tombol hapus: Jika sedang meminjam, tampilkan icon lock & peringatan */}
            <button
              onClick={() => handleAttemptDelete(row)}
              className={`p-1.5 rounded transition ${
                isBorrowing
                  ? 'text-amber-600 hover:bg-amber-50'
                  : 'text-red-500 hover:bg-red-50'
              }`}
              title={
                isBorrowing
                  ? 'Terkunci: Kartu tidak dapat dihapus karena masih meminjam alat'
                  : 'Hapus Kartu'
              }
            >
              {isBorrowing ? <IconLock size={15} /> : <IconTrash size={15} />}
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4 sm:space-y-5">
      <div>
        <h2 className="text-lg sm:text-xl font-bold text-main flex items-center gap-2">
          <span>Kartu RFID</span>
        </h2>
        <p className="text-xs sm:text-sm text-muted mt-0.5">
          Kelola data kartu RFID perwakilan kelas. Kartu yang masih memiliki pinjaman aktif terkunci dan tidak dapat dihapus demi keamanan deteksi alat.
        </p>
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

      {/* Modal Form Tambah/Edit */}
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
            <input
              required
              value={form.uid_kartu}
              onChange={(e) => setForm({ ...form, uid_kartu: e.target.value })}
              disabled={!!editItem}
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm font-mono bg-gray-50 text-gray-700"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Kelas *</label>
            <input
              required
              value={form.kelas}
              onChange={(e) => setForm({ ...form, kelas: e.target.value })}
              placeholder="XI RPL 1"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted mb-1">Nama Perwakilan</label>
            <input
              value={form.nama_pemegang}
              onChange={(e) => setForm({ ...form, nama_pemegang: e.target.value })}
              placeholder="Ketua Kelas / Penanggung Jawab"
              className="w-full px-3 py-2.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
            />
          </div>

          {editItem && (
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="chk-aktif"
                checked={form.aktif}
                onChange={(e) => setForm({ ...form, aktif: e.target.checked })}
                className="w-4 h-4 text-blue-600 rounded cursor-pointer"
              />
              <label htmlFor="chk-aktif" className="text-xs sm:text-sm font-medium text-main cursor-pointer select-none">
                Kartu Aktif
              </label>
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

      {/* Modal Peringatan: Kartu Tidak Bisa Dihapus Karena Masih Meminjam */}
      <Modal
        isOpen={lockedModal.isOpen}
        onClose={() => setLockedModal({ isOpen: false, kartu: null, items: [] })}
        title="Kartu Tidak Dapat Dihapus"
        subtitle="Proteksi integritas data RFID aktif"
        icon={IconLock}
        iconVariant="danger"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <div className="p-3.5 bg-amber-50 border border-amber-200/90 rounded-xl text-xs sm:text-sm text-amber-900 leading-relaxed">
            <p className="font-bold flex items-center gap-2 text-amber-950 mb-1">
              <IconAlertTriangle size={16} className="text-amber-600" />
              Kartu {lockedModal.kartu?.kelas} ({lockedModal.kartu?.uid_kartu}) Masih Aktif Meminjam!
            </p>
            Kartu ini tidak boleh dihapus agar alur pengembalian RFID alat laboratorium tidak terjadi error atau inkonsistensi stok.
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-gray-700">
              Daftar alat yang belum dikembalikan ({lockedModal.items.length}):
            </p>
            <div className="max-h-40 overflow-y-auto space-y-1.5 p-2 bg-gray-50 rounded-lg border border-gray-200 text-xs">
              {lockedModal.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-1 px-2 bg-white rounded border border-gray-100">
                  <span className="font-medium text-gray-800 flex items-center gap-1.5 truncate">
                    <IconBox size={13} className="text-blue-600 shrink-0" />
                    {item.nama_alat}
                  </span>
                  <span className="text-[10px] text-muted font-mono shrink-0">
                    {new Date(item.waktu_pinjam).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted italic">
              Petunjuk: Masuk ke menu Pengembalian untuk mengembalikan alat-alat di atas terlebih dahulu sebelum menghapus kartu.
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <Button
              variant="secondary"
              onClick={() => setLockedModal({ isOpen: false, kartu: null, items: [] })}
              className="w-full sm:w-auto"
            >
              Saya Mengerti
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal Konfirmasi Hapus Kartu Aman */}
      <Modal
        isOpen={confirmDelete.isOpen}
        onClose={() => setConfirmDelete({ isOpen: false, uid: null, kelas: '' })}
        title="Konfirmasi Hapus Kartu RFID"
        subtitle="Tindakan ini akan menghapus kartu secara permanen"
        icon={IconTrash}
        iconVariant="danger"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-xs sm:text-sm text-gray-600 leading-relaxed">
            Apakah Anda yakin ingin menghapus kartu untuk kelas{' '}
            <strong className="text-gray-900">{confirmDelete.kelas}</strong> ({confirmDelete.uid})?
            Kartu ini sudah dipastikan tidak memiliki tanggungan peminjaman alat aktif.
          </p>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-2 border-t border-gray-100">
            <Button
              variant="secondary"
              icon={IconX}
              onClick={() => setConfirmDelete({ isOpen: false, uid: null, kelas: '' })}
              className="w-full sm:w-auto"
            >
              Batal
            </Button>
            <Button
              variant="danger"
              icon={IconTrash}
              onClick={handleExecuteDelete}
              className="w-full sm:w-auto"
            >
              Hapus Kartu
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
