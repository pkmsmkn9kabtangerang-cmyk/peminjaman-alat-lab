import { useState } from 'react';
import { dbService } from '../services/store';
import Button from '../components/Button';
import Badge from '../components/Badge';
import Modal from '../components/Modal';
import { IconPlus } from '@tabler/icons-react';

export default function KartuRfidPage() {
  const [kartuList, setKartuList] = useState(() => {
    const data = dbService.getKartu();
    if (Array.isArray(data)) return data;
    return Object.entries(data).map(([uid_kartu, val]) => ({ uid_kartu, ...val }));
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    uid_kartu: '',
    kelas: '',
    nama_pemegang: '',
    status: 'aktif'
  });

  const loadKartu = () => {
    const data = dbService.getKartu();
    if (Array.isArray(data)) {
      setKartuList(data);
    } else {
      setKartuList(Object.entries(data).map(([uid_kartu, val]) => ({ uid_kartu, ...val })));
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    let current = dbService.getKartu();
    if (!Array.isArray(current)) {
      current = Object.entries(current).map(([uid_kartu, val]) => ({ uid_kartu, ...val }));
    }

    const newCard = {
      ...formData,
      createdAt: new Date().toISOString()
    };
    current.unshift(newCard);
    dbService.saveKartu(current);
    setIsModalOpen(false);
    loadKartu();
  };

  const handleToggleStatus = (uid_kartu) => {
    let current = dbService.getKartu();
    if (!Array.isArray(current)) {
      current = Object.entries(current).map(([uid_kartu, val]) => ({ uid_kartu, ...val }));
    }
    current = current.map(k => {
      if (k.uid_kartu === uid_kartu) {
        k.status = k.status === 'aktif' ? 'nonaktif' : 'aktif';
      }
      return k;
    });
    dbService.saveKartu(current);
    loadKartu();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-main">Kelola Kartu RFID Kelas (Admin)</h2>
          <p className="text-xs text-muted">Daftar kartu RFID perwakilan kelas untuk proses peminjaman otomatis.</p>
        </div>
        <Button
          icon={IconPlus}
          onClick={() => {
            setFormData({
              uid_kartu: 'KARTU-' + Math.random().toString(36).substring(2, 8).toUpperCase(),
              kelas: 'XI ',
              nama_pemegang: '',
              status: 'aktif'
            });
            setIsModalOpen(true);
          }}
        >
          Daftarkan Kartu Baru
        </Button>
      </div>

      <div className="bg-surface rounded-xl border border-main overflow-hidden shadow-xs">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-main bg-gray-50 text-xs text-muted">
              <th className="p-4 font-medium">UID Kartu Fisik</th>
              <th className="p-4 font-medium">Kelas</th>
              <th className="p-4 font-medium">Nama Perwakilan</th>
              <th className="p-4 font-medium">Status Kartu</th>
              <th className="p-4 font-medium text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-main">
            {kartuList.map((kartu) => (
              <tr key={kartu.uid_kartu} className="hover:bg-gray-50/50 transition">
                <td className="p-4 font-mono text-xs font-semibold text-main">
                  {kartu.uid_kartu}
                </td>
                <td className="p-4 font-medium text-main">
                  {kartu.kelas}
                </td>
                <td className="p-4 text-xs text-muted">
                  {kartu.nama_pemegang || '-'}
                </td>
                <td className="p-4">
                  <Badge status={kartu.status} />
                </td>
                <td className="p-4 text-right">
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(kartu.uid_kartu)}
                    className={`text-xs px-3 py-1 rounded border font-medium transition ${
                      kartu.status === 'aktif'
                        ? 'border-red-200 text-red-600 hover:bg-red-50'
                        : 'border-green-200 text-green-600 hover:bg-green-50'
                    }`}
                  >
                    {kartu.status === 'aktif' ? 'Nonaktifkan' : 'Aktifkan'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Daftarkan Kartu RFID Kelas">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">UID Kartu RFID Fisik</label>
            <input
              type="text"
              required
              value={formData.uid_kartu}
              onChange={(e) => setFormData({ ...formData, uid_kartu: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-main text-sm font-mono"
              placeholder="A1B2C3D4"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Nama Kelas</label>
            <input
              type="text"
              required
              value={formData.kelas}
              onChange={(e) => setFormData({ ...formData, kelas: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-main text-sm"
              placeholder="Contoh: XII RPL 1"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Nama Perwakilan (Opsional)</label>
            <input
              type="text"
              value={formData.nama_pemegang}
              onChange={(e) => setFormData({ ...formData, nama_pemegang: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-main text-sm"
              placeholder="Nama siswa perwakilan kelas"
            />
          </div>
          <div className="pt-4 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Batal</Button>
            <Button type="submit">Simpan Kartu</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
