import { useState } from 'react';
import { dbService } from '../services/store';
import Button from '../components/Button';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import { IconPlus, IconTrash, IconEdit } from '@tabler/icons-react';

export default function InventarisPage() {
  const [alatList, setAlatList] = useState(() => dbService.getAlat());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const [formData, setFormData] = useState({
    id_alat: '',
    nama: '',
    kode: '',
    uid_rfid: '',
    kategori: 'elektronik',
    stok_total: 1
  });

  const loadAlat = () => setAlatList(dbService.getAlat());

  const handleOpenAdd = () => {
    setEditItem(null);
    setFormData({
      id_alat: 'ALT-' + Math.floor(100 + Math.random() * 900),
      nama: '',
      kode: 'KODE-' + Math.floor(1000 + Math.random() * 9000),
      uid_rfid: 'STK-ALT-' + Math.floor(1000 + Math.random() * 9000),
      kategori: 'elektronik',
      stok_total: 1
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (item) => {
    setEditItem(item);
    setFormData({ ...item });
    setIsModalOpen(true);
  };

  const handleSave = (e) => {
    e.preventDefault();
    let current = dbService.getAlat();

    if (editItem) {
      current = current.map(a => a.id_alat === editItem.id_alat ? { ...a, ...formData } : a);
    } else {
      const newItem = {
        ...formData,
        status: 'tersedia',
        stok_tersedia: Number(formData.stok_total),
        createdAt: new Date().toISOString()
      };
      current.unshift(newItem);
    }

    dbService.saveAlat(current);
    setIsModalOpen(false);
    loadAlat();
  };

  const handleDelete = (id_alat) => {
    if (confirm('Yakin ingin menghapus alat ini dari inventaris?')) {
      const current = dbService.getAlat().filter(a => a.id_alat !== id_alat);
      dbService.saveAlat(current);
      loadAlat();
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-main">Inventaris Alat Lab (Admin)</h2>
          <p className="text-xs text-muted">Kelola daftar alat lab, stiker RFID unik, kategori, dan stok.</p>
        </div>
        <Button icon={IconPlus} onClick={handleOpenAdd}>
          Tambah Alat Baru
        </Button>
      </div>

      <div className="bg-surface rounded-xl border border-main overflow-hidden shadow-xs">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-main bg-gray-50 text-xs text-muted">
              <th className="p-4 font-medium">Alat / Kode</th>
              <th className="p-4 font-medium">UID Sticker RFID</th>
              <th className="p-4 font-medium">Kategori</th>
              <th className="p-4 font-medium">Stok</th>
              <th className="p-4 font-medium">Status</th>
              <th className="p-4 font-medium text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-main">
            {alatList.map((alat) => (
              <tr key={alat.id_alat} className="hover:bg-gray-50/50 transition">
                <td className="p-4">
                  <p className="font-semibold text-main">{alat.nama}</p>
                  <p className="text-xs text-muted">{alat.kode} ({alat.id_alat})</p>
                </td>
                <td className="p-4">
                  <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded text-gray-700">
                    {alat.uid_rfid}
                  </span>
                </td>
                <td className="p-4 text-xs capitalize text-muted">
                  {alat.kategori}
                </td>
                <td className="p-4 text-xs font-semibold text-main">
                  {alat.stok_tersedia} / {alat.stok_total}
                </td>
                <td className="p-4">
                  <Badge status={alat.status} />
                </td>
                <td className="p-4 text-right space-x-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit(alat)}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 rounded transition"
                    title="Edit"
                  >
                    <IconEdit size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(alat.id_alat)}
                    className="p-1.5 text-red-600 hover:bg-red-50 rounded transition"
                    title="Hapus"
                  >
                    <IconTrash size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editItem ? "Edit Alat Lab" : "Tambah Alat Lab Baru"}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Nama Alat</label>
            <input
              type="text"
              required
              value={formData.nama}
              onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-main text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Contoh: Multimeter Digital"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Kode Inventaris</label>
              <input
                type="text"
                required
                value={formData.kode}
                onChange={(e) => setFormData({ ...formData, kode: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-main text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="MM-001"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">UID Sticker RFID</label>
              <input
                type="text"
                required
                value={formData.uid_rfid}
                onChange={(e) => setFormData({ ...formData, uid_rfid: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-main text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                placeholder="STK-ALT-001"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Kategori</label>
              <select
                value={formData.kategori}
                onChange={(e) => setFormData({ ...formData, kategori: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-main text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="elektronik">Elektronik</option>
                <option value="mekanik">Mekanik</option>
                <option value="jaringan">Jaringan</option>
                <option value="umum">Umum</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Total Stok</label>
              <input
                type="number"
                min="1"
                required
                value={formData.stok_total}
                onChange={(e) => setFormData({ ...formData, stok_total: Number(e.target.value), stok_tersedia: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-main text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
              Batal
            </Button>
            <Button type="submit">
              Simpan Alat
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
