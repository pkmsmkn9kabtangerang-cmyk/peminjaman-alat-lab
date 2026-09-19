import { useState } from 'react';
import { dbService } from '../services/store';
import Badge from '../components/Badge';
import Button from '../components/Button';
import Modal from '../components/Modal';
import { IconPlus } from '@tabler/icons-react';

export default function ListBarangPage() {
  const [alatList, setAlatList] = useState(() => dbService.getAlat());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    nama: '',
    kode: '',
    uid_rfid: '',
    kategori: 'elektronik',
    stok_total: 1
  });

  const loadAlat = () => setAlatList(dbService.getAlat());

  const handleAddTool = (e) => {
    e.preventDefault();
    const current = dbService.getAlat();
    const newTool = {
      id_alat: 'ALT-' + Math.floor(100 + Math.random() * 900),
      ...formData,
      status: 'tersedia',
      stok_tersedia: Number(formData.stok_total),
      createdAt: new Date().toISOString()
    };
    current.unshift(newTool);
    dbService.saveAlat(current);
    setIsModalOpen(false);
    setFormData({ nama: '', kode: '', uid_rfid: '', kategori: 'elektronik', stok_total: 1 });
    loadAlat();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-main">List Status Semua Alat (Petugas)</h2>
          <p className="text-xs text-muted">Pantau ketersediaan alat dan daftarkan alat baru saat stiker RFID baru ditempel.</p>
        </div>
        <Button
          icon={IconPlus}
          onClick={() => {
            setFormData({
              nama: '',
              kode: 'KODE-' + Math.floor(1000 + Math.random() * 9000),
              uid_rfid: 'STK-ALT-' + Math.floor(1000 + Math.random() * 9000),
              kategori: 'elektronik',
              stok_total: 1
            });
            setIsModalOpen(true);
          }}
        >
          Tambah Alat Baru (Stiker RFID)
        </Button>
      </div>

      <div className="bg-surface rounded-xl border border-main overflow-hidden shadow-xs">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-main bg-gray-50 text-xs text-muted">
              <th className="p-4 font-medium">Alat / Kode Inventaris</th>
              <th className="p-4 font-medium">UID Sticker RFID</th>
              <th className="p-4 font-medium">Kategori</th>
              <th className="p-4 font-medium">Stok Tersedia</th>
              <th className="p-4 font-medium">Status Alat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-main">
            {alatList.map((alat) => (
              <tr key={alat.id_alat} className="hover:bg-gray-50/50 transition">
                <td className="p-4">
                  <p className="font-semibold text-main">{alat.nama}</p>
                  <p className="text-xs text-muted">{alat.kode}</p>
                </td>
                <td className="p-4">
                  <span className="font-mono text-xs bg-gray-100 px-2 py-1 rounded text-gray-700">
                    {alat.uid_rfid}
                  </span>
                </td>
                <td className="p-4 text-xs capitalize text-muted">{alat.kategori}</td>
                <td className="p-4 text-xs font-semibold text-main">
                  {alat.stok_tersedia} dari {alat.stok_total} unit
                </td>
                <td className="p-4">
                  <Badge status={alat.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Tambah Alat Baru dengan Stiker RFID">
        <form onSubmit={handleAddTool} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Nama Alat</label>
            <input
              type="text"
              required
              value={formData.nama}
              onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-main text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Contoh: Power Supply DC"
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
                className="w-full px-3 py-2 rounded-lg border border-main text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">UID Sticker RFID</label>
              <input
                type="text"
                required
                value={formData.uid_rfid}
                onChange={(e) => setFormData({ ...formData, uid_rfid: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-main text-sm font-mono"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Kategori</label>
              <select
                value={formData.kategori}
                onChange={(e) => setFormData({ ...formData, kategori: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-main text-sm bg-white"
              >
                <option value="elektronik">Elektronik</option>
                <option value="mekanik">Mekanik</option>
                <option value="jaringan">Jaringan</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted mb-1">Jumlah Stok</label>
              <input
                type="number"
                min="1"
                required
                value={formData.stok_total}
                onChange={(e) => setFormData({ ...formData, stok_total: Number(e.target.value) })}
                className="w-full px-3 py-2 rounded-lg border border-main text-sm"
              />
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Batal</Button>
            <Button type="submit">Daftarkan Alat</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
