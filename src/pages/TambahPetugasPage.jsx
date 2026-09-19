import { useState } from 'react';
import { dbService } from '../services/store';
import Button from '../components/Button';
import Modal from '../components/Modal';
import { IconUserPlus } from '@tabler/icons-react';

export default function TambahPetugasPage() {
  const [users, setUsers] = useState(() => dbService.getUsers());
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    nama: '',
    email: '',
    role: 'petugas'
  });

  const loadUsers = () => setUsers(dbService.getUsers());

  const handleSave = (e) => {
    e.preventDefault();
    const current = dbService.getUsers();
    const newUser = {
      uid: 'usr-' + Math.random().toString(36).substring(2, 8),
      ...formData,
      createdAt: new Date().toISOString()
    };
    current.push(newUser);
    dbService.saveUsers(current);
    setIsModalOpen(false);
    setFormData({ nama: '', email: '', role: 'petugas' });
    loadUsers();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-main">Kelola Akun Petugas Lab (Admin)</h2>
          <p className="text-xs text-muted">Daftar akun admin dan petugas yang memiliki akses ke dashboard web.</p>
        </div>
        <Button icon={IconUserPlus} onClick={() => setIsModalOpen(true)}>
          Tambah Akun Baru
        </Button>
      </div>

      <div className="bg-surface rounded-xl border border-main overflow-hidden shadow-xs">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-main bg-gray-50 text-xs text-muted">
              <th className="p-4 font-medium">Nama Pengguna</th>
              <th className="p-4 font-medium">Email</th>
              <th className="p-4 font-medium">Role / Hak Akses</th>
              <th className="p-4 font-medium">Tanggal Dibuat</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-main">
            {users.map((u) => (
              <tr key={u.uid} className="hover:bg-gray-50/50 transition">
                <td className="p-4 font-semibold text-main">{u.nama}</td>
                <td className="p-4 text-xs text-muted">{u.email}</td>
                <td className="p-4">
                  <span className={`text-xs font-bold uppercase px-2.5 py-1 rounded ${u.role === 'admin' ? 'bg-indigo-50 text-indigo-700' : 'bg-blue-50 text-blue-700'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="p-4 text-xs text-muted">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Tambah Akun Petugas / Admin">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Nama Lengkap</label>
            <input
              type="text"
              required
              value={formData.nama}
              onChange={(e) => setFormData({ ...formData, nama: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-main text-sm"
              placeholder="Contoh: Ahmad Petugas"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Email</label>
            <input
              type="email"
              required
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-main text-sm"
              placeholder="petugas@smk.sch.id"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted mb-1">Role Akses</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-main text-sm bg-white"
            >
              <option value="petugas">Petugas Lab</option>
              <option value="admin">Administrator</option>
            </select>
          </div>
          <div className="pt-4 flex justify-end gap-3">
            <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Batal</Button>
            <Button type="submit">Simpan Akun</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
