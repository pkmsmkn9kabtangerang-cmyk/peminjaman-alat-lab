import { useState, useEffect } from 'react';
import { dbService } from '../services/store';
import Button from '../components/Button';

export default function PengembalianPage() {
  const [alatDipinjam, setAlatDipinjam] = useState(() => dbService.getAlat().filter(a => a.status === 'dipinjam'));
  const [selectedAlat, setSelectedAlat] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    setAlatDipinjam(dbService.getAlat().filter(a => a.status === 'dipinjam'));
  }, []);

  const handleManualReturn = (e) => {
    e.preventDefault();
    if (!selectedAlat) {
      alert('Pilih alat yang akan dikembalikan.');
      return;
    }

    const alat = alatDipinjam.find(a => a.id_alat === selectedAlat);
    const transaksiList = dbService.getTransaksi();
    const activeTrx = transaksiList.find(t => t.id_alat === alat.id_alat && t.jenis === 'pinjam' && t.status !== 'selesai');
    const uid_kartu = activeTrx ? activeTrx.uid_kartu : 'KARTU-XI-RPL-1';

    const res = dbService.simulateEsp32Tap(uid_kartu, alat.uid_rfid);
    if (res.success) {
      const user = dbService.getCurrentUser();
      dbService.konfirmasiTransaksi(res.data.id_log, user?.nama || 'Petugas', 'kembali');
      setSuccessMsg(`Pengembalian berhasil dicatat untuk alat ${alat.nama}`);
      setSelectedAlat('');
      setAlatDipinjam(dbService.getAlat().filter(a => a.status === 'dipinjam'));
    } else {
      alert(res.message);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-bold text-main">Form Pengembalian Manual</h2>
        <p className="text-xs text-muted">Digunakan untuk mencatat pengembalian alat lab tanpa scan RFID.</p>
      </div>

      {successMsg && (
        <div className="p-4 bg-green-50 border border-green-200 text-green-700 text-xs rounded-lg">
          {successMsg}
        </div>
      )}

      <form onSubmit={handleManualReturn} className="bg-surface rounded-xl border border-main p-6 space-y-4 shadow-xs">
        <div>
          <label className="block text-xs font-medium text-muted mb-1">Pilih Alat yang Sedang Dipinjam</label>
          <select
            value={selectedAlat}
            onChange={(e) => setSelectedAlat(e.target.value)}
            required
            className="w-full px-3.5 py-2.5 rounded-lg border border-main text-sm bg-white"
          >
            <option value="">-- Pilih Alat --</option>
            {alatDipinjam.map(a => (
              <option key={a.id_alat} value={a.id_alat}>{a.nama} (Kode: {a.kode})</option>
            ))}
          </select>
        </div>

        <div className="pt-2">
          <Button type="submit" variant="success" className="w-full justify-center">
            Proses Pengembalian Manual
          </Button>
        </div>
      </form>
    </div>
  );
}
