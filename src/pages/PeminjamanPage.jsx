// src/pages/PeminjamanPage.jsx
// Form Peminjaman Manual: layout dua kolom di lg+, dropdown Alat pakai FilterDropdown

import { useState, useEffect } from 'react';
import { dbService } from '../services/store';
import Badge from '../components/Badge';
import Button from '../components/Button';
import FilterDropdown from '../components/FilterDropdown';
import { IconPlus, IconMinus, IconCheck, IconSearch, IconUsers, IconBox } from '@tabler/icons-react';

const FMT = (iso) => iso
  ? new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  : '—';

export default function PeminjamanPage() {
  const [kartuList, setKartuList]   = useState([]);
  const [alatList, setAlatList]     = useState([]);
  const [selectedKartu, setSelectedKartu] = useState(null);
  const [selectedAlatId, setSelectedAlatId] = useState('');
  const [jumlah, setJumlah]     = useState(1);
  const [success, setSuccess]   = useState('');
  const [error, setError]       = useState('');

  useEffect(() => {
    setKartuList(dbService.getKartu().filter((k) => k.aktif));
    setAlatList(dbService.getAlatWithStok().filter((a) => a.stok_tersedia > 0));
  }, []);

  const kartuOptions = kartuList.map((k) => ({
    value: k.uid_kartu,
    label: `${k.kelas} — ${k.nama_pemegang ?? k.uid_kartu}`,
  }));

  const selectedAlat = alatList.find((a) => a.id === selectedAlatId) ?? null;

  const alatOptions = alatList.map((a) => ({
    value: a.id,
    label: `${a.nama} — Stok: ${a.stok_tersedia}/${a.jumlah_total}`,
  }));

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (!selectedKartu || !selectedAlatId) {
      setError('Pilih kartu kelas dan alat terlebih dahulu.');
      return;
    }
    const user = dbService.getCurrentUser();
    const res  = dbService.processManual({
      uid_kartu:      selectedKartu.uid_kartu,
      alat_id:        selectedAlatId,
      jenis:          'pinjam',
      jumlah,
      kondisi_pinjam: 'baik',
      catatan:        null,
      petugas:        user?.nama ?? 'Petugas',
    });

    if (res.ok) {
      setSuccess(`✓ Peminjaman ${jumlah} unit "${selectedAlat?.nama}" untuk kelas ${selectedKartu.kelas} berhasil dicatat.`);
      setSelectedKartu(null);
      setSelectedAlatId('');
      setJumlah(1);
      setAlatList(dbService.getAlatWithStok().filter((a) => a.stok_tersedia > 0));
      setTimeout(() => setSuccess(''), 6000);
    } else {
      setError(res.error === 'stok_habis' ? 'Stok alat tidak mencukupi.' : 'Gagal mencatat peminjaman.');
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-main">Peminjaman Manual</h2>
          <p className="text-xs text-muted">Digunakan saat RFID scanner bermasalah atau peminjaman langsung oleh petugas.</p>
        </div>
      </div>

      {/* Alert Messages */}
      {success && (
        <div className="p-4 bg-green-50 border border-green-200 text-green-800 text-xs rounded-xl flex items-center gap-2">
          <IconCheck size={14} className="text-green-600 flex-shrink-0" /> {success}
        </div>
      )}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl">{error}</div>
      )}

      {/* Form Card */}
      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-5 border-b border-gray-100 bg-gray-50/50 rounded-t-xl">
          <h3 className="font-semibold text-sm text-gray-800">Form Peminjaman</h3>
          <p className="text-xs text-gray-500 mt-0.5">Semua kolom wajib di isi</p>
        </div>

        <div className="p-5 lg:p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* ── Kolom Kiri: Pilih Kartu ── */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                  <IconUsers size={14} className="text-blue-600" />
                </div>
                <span className="font-semibold text-sm text-gray-800">Pilih Kelas / Kartu RFID *</span>
              </div>

              <FilterDropdown
                icon={IconUsers}
                value={selectedKartu?.uid_kartu ?? ''}
                onChange={(uid) => {
                  const found = kartuList.find((k) => k.uid_kartu === uid);
                  setSelectedKartu(found ?? null);
                }}
                options={[{ value: '', label: '— Pilih Kelas Peminjam —' }, ...kartuOptions]}
                placeholder="— Pilih Kelas Peminjam —"
                className="w-full"
              />

              {/* Selected Kartu display */}
              {selectedKartu && (
                <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs flex items-center justify-between">
                  <div>
                    <p className="font-bold text-blue-800">{selectedKartu.kelas}</p>
                    <p className="text-blue-600 mt-0.5">{selectedKartu.nama_pemegang} · <span className="font-mono">{selectedKartu.uid_kartu}</span></p>
                  </div>
                  <button type="button" onClick={() => setSelectedKartu(null)} className="text-blue-600 hover:text-blue-800 text-[11px] font-semibold hover:underline">
                    Ganti
                  </button>
                </div>
              )}
            </div>

            {/* ── Kolom Kanan: Pilih Alat & Jumlah ── */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center">
                  <IconBox size={14} className="text-purple-600" />
                </div>
                <span className="font-semibold text-sm text-gray-800">Pilih Alat *</span>
              </div>

              {/* Dropdown Alat */}
              <FilterDropdown
                icon={IconBox}
                value={selectedAlatId}
                onChange={(v) => { setSelectedAlatId(v); setJumlah(1); }}
                options={[{ value: '', label: '— Pilih Alat Lab —' }, ...alatOptions]}
                placeholder="— Pilih Alat Lab —"
                className="w-full"
              />

              {/* Preview stok alat */}
              {selectedAlat && (
                <div className="p-3.5 bg-gray-50 border border-gray-200 rounded-xl text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600">Stok tersedia</span>
                    <span className={`font-bold text-base ${selectedAlat.stok_tersedia === 0 ? 'text-red-600' : 'text-gray-800'}`}>
                      {selectedAlat.stok_tersedia}/{selectedAlat.jumlah_total}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge status={selectedAlat.stok_tersedia > 0 ? 'tersedia' : 'habis'} />
                    {selectedAlat.jumlah_rusak > 0 && (
                      <span className="text-amber-600 font-medium">⚠ {selectedAlat.jumlah_rusak} unit rusak</span>
                    )}
                  </div>
                </div>
              )}

              {/* Stepper Jumlah */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">Jumlah Unit</label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setJumlah((j) => Math.max(1, j - 1))}
                    className="w-9 h-9 rounded-lg border border-gray-300 hover:bg-gray-100 flex items-center justify-center transition-colors"
                  >
                    <IconMinus size={14} className="text-gray-600" />
                  </button>
                  <span className="w-10 text-center font-bold text-gray-800 text-lg">{jumlah}</span>
                  <button
                    type="button"
                    onClick={() => setJumlah((j) => Math.min(selectedAlat?.stok_tersedia ?? 1, j + 1))}
                    className="w-9 h-9 rounded-lg border border-gray-300 hover:bg-gray-100 flex items-center justify-center transition-colors"
                    disabled={!selectedAlat}
                  >
                    <IconPlus size={14} className="text-gray-600" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Ringkasan Preview */}
          {selectedKartu && selectedAlat && (
            <div className="mt-5 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl text-xs">
              <p className="font-bold text-gray-700 text-sm mb-3">Ringkasan Peminjaman</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex gap-2">
                  <span className="text-gray-500">Kelas:</span>
                  <span className="font-semibold text-gray-800">{selectedKartu.kelas}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500">Pemegang:</span>
                  <span className="font-semibold text-gray-800">{selectedKartu.nama_pemegang}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500">Alat:</span>
                  <span className="font-semibold text-gray-800">{selectedAlat.nama}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-gray-500">Jumlah:</span>
                  <span className="font-semibold text-gray-800">{jumlah} unit</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 lg:px-6 pb-5 lg:pb-6">
          <Button type="submit" className="w-full lg:w-auto lg:min-w-[240px] justify-center py-2.5">
            Proses Peminjaman Manual
          </Button>
        </div>
      </form>
    </div>
  );
}
