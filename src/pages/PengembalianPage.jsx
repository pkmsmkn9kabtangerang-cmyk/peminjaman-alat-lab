// src/pages/PengembalianPage.jsx
// Form Pengembalian Manual: pilih kelas, daftar pinjaman aktif, kondisi kembali, catatan

import { useState, useEffect } from 'react';
import { dbService } from '../services/store';
import Button from '../components/Button';
import Badge from '../components/Badge';
import { IconCheck, IconCornerDownLeft } from '@tabler/icons-react';

export default function PengembalianPage() {
  const [kartuList, setKartuList]       = useState([]);
  const [selectedKartu, setSelectedKartu] = useState('');
  const [pinjamanAktif, setPinjamanAktif] = useState([]);
  const [selectedAlat, setSelectedAlat]   = useState('');
  const [kondisi, setKondisi]             = useState('baik');
  const [catatan, setCatatan]             = useState('');
  const [success, setSuccess]             = useState('');
  const [error, setError]                 = useState('');

  useEffect(() => {
    setKartuList(dbService.getKartu().filter((k) => k.aktif));
  }, []);

  // Muat pinjaman aktif saat kartu dipilih
  useEffect(() => {
    if (!selectedKartu) { setPinjamanAktif([]); return; }
    const trx = dbService.getTransaksi().filter((t) => t.uid_kartu === selectedKartu && t.status === 'dipinjam');
    setPinjamanAktif(trx);
    setSelectedAlat('');
  }, [selectedKartu]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (!selectedKartu || !selectedAlat) {
      setError('Pilih kartu kelas dan alat yang akan dikembalikan.');
      return;
    }

    const trx   = pinjamanAktif.find((t) => t.alat_id === selectedAlat);
    const user  = dbService.getCurrentUser();
    const res   = dbService.processManual({
      uid_kartu:        selectedKartu,
      alat_id:          selectedAlat,
      jenis:            'kembali',
      jumlah:           1,
      kondisi_kembali:  kondisi,
      catatan,
      petugas: user?.nama ?? 'Petugas',
    });

    if (res.ok) {
      setSuccess(`✓ Pengembalian "${trx?.nama_alat}" untuk kelas ${kartuList.find((k) => k.uid_kartu === selectedKartu)?.kelas} berhasil dicatat.`);
      setSelectedKartu('');
      setSelectedAlat('');
      setCatatan('');
      setKondisi('baik');
      setPinjamanAktif([]);
      setTimeout(() => setSuccess(''), 6000);
    } else {
      setError('Tidak ada pinjaman aktif yang sesuai untuk dikembalikan.');
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-bold text-main">Pengembalian Manual</h2>
        <p className="text-xs text-muted">Pencatatan pengembalian alat lab tanpa scan RFID.</p>
      </div>

      {success && (
        <div className="p-4 bg-green-50 border border-green-200 text-green-800 text-xs rounded-xl flex items-center gap-2">
          <IconCheck size={14} className="text-green-600 flex-shrink-0" /> {success}
        </div>
      )}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="bg-surface rounded-xl border border-main p-6 space-y-5 shadow-sm">
        {/* Pilih Kartu */}
        <div>
          <label className="block text-xs font-semibold text-muted mb-2">Pilih Kelas / Kartu RFID *</label>
          <select
            value={selectedKartu}
            onChange={(e) => setSelectedKartu(e.target.value)}
            required
            className="w-full px-3.5 py-2.5 rounded-lg border border-main text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— Pilih Kelas Peminjam —</option>
            {kartuList.map((k) => (
              <option key={k.uid_kartu} value={k.uid_kartu}>{k.kelas} — {k.nama_pemegang ?? k.uid_kartu}</option>
            ))}
          </select>
        </div>

        {/* Panel Pinjaman Aktif */}
        {selectedKartu && (
          <div>
            <label className="block text-xs font-semibold text-muted mb-2">
              Pinjaman Aktif Kelas Ini ({pinjamanAktif.length} alat)
            </label>
            {pinjamanAktif.length === 0 ? (
              <div className="p-4 bg-gray-50 border border-main rounded-lg text-xs text-muted text-center">
                Tidak ada pinjaman aktif untuk kelas ini.
              </div>
            ) : (
              <div className="space-y-2">
                {pinjamanAktif.map((t) => (
                  <button
                    key={t.alat_id}
                    type="button"
                    onClick={() => setSelectedAlat(selectedAlat === t.alat_id ? '' : t.alat_id)}
                    className={`w-full text-left px-4 py-3 rounded-lg border transition text-xs ${
                      selectedAlat === t.alat_id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-main bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-main">{t.nama_alat}</p>
                        <p className="text-muted text-[11px]">Dipinjam: {t.waktu_pinjam ? new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(t.waktu_pinjam)) : '—'}</p>
                      </div>
                      <Badge status="dipinjam" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Kondisi Kembali */}
        {selectedAlat && (
          <>
            <div>
              <label className="block text-xs font-semibold text-muted mb-2">Kondisi Saat Dikembalikan *</label>
              <div className="flex gap-3">
                {['baik', 'rusak'].map((k) => (
                  <button
                    key={k} type="button"
                    onClick={() => setKondisi(k)}
                    className={`flex-1 py-2.5 rounded-lg border text-xs font-semibold capitalize transition ${
                      kondisi === k ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-main text-muted hover:bg-gray-50'
                    }`}
                  >
                    {k === 'baik' ? '✓ Baik' : '⚠ Rusak'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-muted mb-1.5">Catatan (Opsional)</label>
              <textarea
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                rows={2}
                className="w-full px-3.5 py-2.5 rounded-lg border border-main text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Kondisi fisik saat dikembalikan..."
              />
            </div>
          </>
        )}

        <Button
          type="submit"
          variant="success"
          icon={IconCornerDownLeft}
          className="w-full justify-center py-3"
          disabled={!selectedKartu || !selectedAlat}
        >
          Proses Pengembalian Manual
        </Button>
      </form>
    </div>
  );
}
