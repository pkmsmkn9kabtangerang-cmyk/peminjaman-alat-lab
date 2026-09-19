import { useState, useEffect } from 'react';
import { dbService } from '../services/store';
import Button from '../components/Button';

export default function PeminjamanPage() {
  const [alatList, setAlatList] = useState(() => dbService.getAlat().filter(a => a.status === 'tersedia'));
  const [kartuList, setKartuList] = useState(() => {
    const kartuData = dbService.getKartu();
    if (Array.isArray(kartuData)) {
      return kartuData.filter(k => k.status === 'aktif');
    }
    return Object.entries(kartuData).map(([uid_kartu, val]) => ({ uid_kartu, ...val })).filter(k => k.status === 'aktif');
  });

  const [selectedKartu, setSelectedKartu] = useState('');
  const [selectedAlat, setSelectedAlat] = useState('');
  const [catatan, setCatatan] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    setAlatList(dbService.getAlat().filter(a => a.status === 'tersedia'));
    const kartuData = dbService.getKartu();
    if (Array.isArray(kartuData)) {
      setKartuList(kartuData.filter(k => k.status === 'aktif'));
    } else {
      setKartuList(Object.entries(kartuData).map(([uid_kartu, val]) => ({ uid_kartu, ...val })).filter(k => k.status === 'aktif'));
    }
  }, []);

  const handleManualBorrow = (e) => {
    e.preventDefault();
    if (!selectedKartu || !selectedAlat) {
      alert('Pilih kartu kelas dan alat terlebih dahulu.');
      return;
    }

    const kartu = kartuList.find(k => k.uid_kartu === selectedKartu);
    const alat = alatList.find(a => a.id_alat === selectedAlat);

    const res = dbService.simulateEsp32Tap(kartu.uid_kartu, alat.uid_rfid);
    if (res.success) {
      const user = dbService.getCurrentUser();
      dbService.konfirmasiTransaksi(res.data.id_log, user?.nama || 'Petugas', 'pinjam');
      setSuccessMsg(`Peminjaman berhasil dicatat untuk kelas ${kartu.kelas} (${alat.nama})`);
      setSelectedKartu('');
      setSelectedAlat('');
      setCatatan('');
      setAlatList(dbService.getAlat().filter(a => a.status === 'tersedia'));
    } else {
      alert(res.message);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-bold text-main">Form Peminjaman Manual</h2>
        <p className="text-xs text-muted">Digunakan sebagai fallback jika scanner RFID atau kartu fisik bermasalah.</p>
      </div>

      {successMsg && (
        <div className="p-4 bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg">
          {successMsg}
        </div>
      )}

      <form onSubmit={handleManualBorrow} className="bg-surface rounded-xl border border-main p-6 space-y-4 shadow-xs">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Pilih Kelas / Kartu RFID</label>
          <select
            value={selectedKartu}
            onChange={(e) => setSelectedKartu(e.target.value)}
            required
            className="w-full px-3.5 py-2.5 rounded-lg border border-main text-sm bg-white"
          >
            <option value="">-- Pilih Kelas Peminjam --</option>
            {kartuList.map(k => (
              <option key={k.uid_kartu} value={k.uid_kartu}>{k.kelas} ({k.nama_pemegang || k.uid_kartu})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">Pilih Alat Tersedia</label>
          <select
            value={selectedAlat}
            onChange={(e) => setSelectedAlat(e.target.value)}
            required
            className="w-full px-3 py-2.5 rounded-lg border border-main text-sm bg-white"
          >
            <option value="">-- Pilih Alat Lab --</option>
            {alatList.map(a => (
              <option key={a.id_alat} value={a.id_alat}>{a.nama} (Stok: {a.stok_tersedia})</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted mb-1">Catatan Kondisi Alat (Opsional)</label>
          <textarea
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            className="w-full px-3.5 py-2 rounded-lg border border-main text-sm"
            placeholder="Contoh: Kondisi fisik normal, lengkap dengan probe."
            rows="3"
          />
        </div>

        <div className="pt-2">
          <Button type="submit" className="w-full justify-center">
            Proses Peminjaman Manual
          </Button>
        </div>
      </form>
    </div>
  );
}
