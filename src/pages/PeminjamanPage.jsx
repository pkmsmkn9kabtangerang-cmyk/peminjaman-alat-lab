// src/pages/PeminjamanPage.jsx
// Form Peminjaman Manual: searchable kartu, preview stok, stepper jumlah, kondisi, ringkasan

import { useState, useEffect } from 'react';
import { dbService } from '../services/store';
import Button from '../components/Button';
import Badge from '../components/Badge';
import { IconPlus, IconMinus, IconCheck } from '@tabler/icons-react';

export default function PeminjamanPage() {
  const [kartuList, setKartuList] = useState([]);
  const [alatList, setAlatList]   = useState([]);
  const [filterKartu, setFilterKartu] = useState('');
  const [selectedKartu, setSelectedKartu] = useState(null);
  const [selectedAlat, setSelectedAlat]   = useState(null);
  const [jumlah, setJumlah]     = useState(1);
  const [kondisi, setKondisi]   = useState('baik');
  const [catatan, setCatatan]   = useState('');
  const [success, setSuccess]   = useState('');
  const [error, setError]       = useState('');

  useEffect(() => {
    setKartuList(dbService.getKartu().filter((k) => k.aktif));
    setAlatList(dbService.getAlatWithStok().filter((a) => a.stok_tersedia > 0));
  }, []);

  const filteredKartu = kartuList.filter((k) =>
    `${k.kelas} ${k.nama_pemegang} ${k.uid_kartu}`.toLowerCase().includes(filterKartu.toLowerCase())
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (!selectedKartu || !selectedAlat) {
      setError('Pilih kartu kelas dan alat terlebih dahulu.');
      return;
    }
    const user = dbService.getCurrentUser();
    const res  = dbService.processManual({
      uid_kartu:     selectedKartu.uid_kartu,
      alat_id:       selectedAlat.id,
      jenis:         'pinjam',
      jumlah,
      kondisi_pinjam: kondisi,
      catatan,
      petugas: user?.nama ?? 'Petugas',
    });

    if (res.ok) {
      setSuccess(`✓ Peminjaman ${jumlah} unit "${selectedAlat.nama}" untuk kelas ${selectedKartu.kelas} berhasil dicatat.`);
      setSelectedKartu(null);
      setSelectedAlat(null);
      setJumlah(1);
      setCatatan('');
      setKondisi('baik');
      setAlatList(dbService.getAlatWithStok().filter((a) => a.stok_tersedia > 0));
      setTimeout(() => setSuccess(''), 6000);
    } else {
      setError(res.error === 'stok_habis' ? 'Stok alat tidak mencukupi.' : 'Gagal mencatat peminjaman.');
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-lg font-bold text-main">Peminjaman Manual</h2>
        <p className="text-xs text-muted">Digunakan saat RFID scanner bermasalah atau peminjaman langsung oleh petugas.</p>
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
          <input
            type="text"
            placeholder="Cari kelas atau nama perwakilan..."
            value={filterKartu}
            onChange={(e) => { setFilterKartu(e.target.value); setSelectedKartu(null); }}
            className="w-full px-3.5 py-2.5 rounded-lg border border-main text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
          />
          {filterKartu && !selectedKartu && (
            <div className="border border-main rounded-lg overflow-hidden max-h-40 overflow-y-auto">
              {filteredKartu.map((k) => (
                <button
                  key={k.uid_kartu}
                  type="button"
                  onClick={() => { setSelectedKartu(k); setFilterKartu(`${k.kelas} — ${k.nama_pemegang ?? k.uid_kartu}`); }}
                  className="w-full text-left px-4 py-2.5 text-xs hover:bg-blue-50 border-b border-main last:border-0 transition"
                >
                  <span className="font-semibold text-main">{k.kelas}</span>
                  <span className="text-muted ml-2">{k.nama_pemegang}</span>
                  <span className="text-[10px] font-mono text-muted ml-2">({k.uid_kartu})</span>
                </button>
              ))}
              {filteredKartu.length === 0 && <p className="px-4 py-3 text-xs text-muted">Tidak ditemukan.</p>}
            </div>
          )}
          {selectedKartu && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs flex items-center justify-between">
              <span className="font-semibold text-blue-800">{selectedKartu.kelas} — {selectedKartu.nama_pemegang}</span>
              <button type="button" onClick={() => { setSelectedKartu(null); setFilterKartu(''); }} className="text-blue-600 hover:underline text-[11px]">Ganti</button>
            </div>
          )}
        </div>

        {/* Pilih Alat */}
        <div>
          <label className="block text-xs font-semibold text-muted mb-2">Pilih Alat *</label>
          <select
            value={selectedAlat?.id ?? ''}
            onChange={(e) => {
              const a = alatList.find((x) => x.id === e.target.value) ?? null;
              setSelectedAlat(a);
              setJumlah(1);
            }}
            required
            className="w-full px-3.5 py-2.5 rounded-lg border border-main text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— Pilih Alat Lab —</option>
            {alatList.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nama} (Stok: {a.stok_tersedia}/{a.jumlah_total}) {a.jumlah_rusak > 0 ? `· Rusak: ${a.jumlah_rusak}` : ''}
              </option>
            ))}
          </select>
          {selectedAlat && (
            <div className="mt-2 p-3 bg-gray-50 rounded-lg text-xs flex items-center gap-4">
              <span>Stok tersedia: <strong className="text-main">{selectedAlat.stok_tersedia}/{selectedAlat.jumlah_total}</strong></span>
              <Badge status={selectedAlat.stok_tersedia > 0 ? 'tersedia' : 'habis'} />
              {selectedAlat.jumlah_rusak > 0 && <span className="text-amber-600">⚠ {selectedAlat.jumlah_rusak} unit rusak</span>}
            </div>
          )}
        </div>

        {/* Jumlah */}
        <div>
          <label className="block text-xs font-semibold text-muted mb-2">Jumlah Unit</label>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setJumlah((j) => Math.max(1, j - 1))}
              className="w-9 h-9 rounded-lg border border-main hover:bg-gray-100 flex items-center justify-center transition">
              <IconMinus size={14} />
            </button>
            <span className="w-10 text-center font-bold text-main text-sm">{jumlah}</span>
            <button type="button" onClick={() => setJumlah((j) => Math.min(selectedAlat?.stok_tersedia ?? 1, j + 1))}
              className="w-9 h-9 rounded-lg border border-main hover:bg-gray-100 flex items-center justify-center transition">
              <IconPlus size={14} />
            </button>
          </div>
        </div>

        {/* Kondisi */}
        <div>
          <label className="block text-xs font-semibold text-muted mb-2">Kondisi Saat Dipinjam</label>
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

        {/* Catatan */}
        <div>
          <label className="block text-xs font-semibold text-muted mb-1.5">Catatan (Opsional)</label>
          <textarea
            value={catatan}
            onChange={(e) => setCatatan(e.target.value)}
            rows={2}
            className="w-full px-3.5 py-2.5 rounded-lg border border-main text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Kondisi fisik, kelengkapan, catatan khusus..."
          />
        </div>

        {/* Ringkasan Preview */}
        {selectedKartu && selectedAlat && (
          <div className="p-4 bg-gray-50 border border-main rounded-xl text-xs space-y-1.5">
            <p className="font-semibold text-main text-sm mb-2">Ringkasan Peminjaman</p>
            <p>📋 Kelas: <strong>{selectedKartu.kelas}</strong></p>
            <p>🔧 Alat: <strong>{selectedAlat.nama}</strong> × {jumlah} unit</p>
            <p>📦 Kondisi: <strong className="capitalize">{kondisi}</strong></p>
            <p>🏷 Sumber: <strong>Manual</strong></p>
          </div>
        )}

        <Button type="submit" className="w-full justify-center py-3">
          Proses Peminjaman Manual
        </Button>
      </form>
    </div>
  );
}
