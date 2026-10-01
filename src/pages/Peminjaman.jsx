import { useState, useEffect } from 'react';
import { dbService } from '../services/store';
import Badge from '../components/Badge';
import Button from '../components/Button';
import PageHeader from '../components/PageHeader';
import FilterDropdown from '../components/FilterDropdown';
import { showFeedback } from '../lib/feedback';
import { IconPlus, IconMinus, IconUsers, IconTools } from '@tabler/icons-react';

export default function PeminjamanPage() {
  const [kartuList, setKartuList]   = useState([]);
  const [alatList, setAlatList]     = useState([]);
  const [selectedKartu, setSelectedKartu] = useState(null);
  const [selectedAlatId, setSelectedAlatId] = useState('');
  const [jumlah, setJumlah]     = useState(1);
  const [fieldError, setFieldError] = useState('');
  const [saving, setSaving]     = useState(false);

  useEffect(() => {
    setKartuList(dbService.getKartu().filter((k) => k.aktif));
    setAlatList(dbService.getAlatWithStok().filter((a) => a.stok_tersedia > 0));
  }, []);

  const kartuOptions = kartuList.map((k) => ({
    value: k.uid_kartu,
    label: `${k.kelas}${k.nama_pemegang ? ` — ${k.nama_pemegang}` : ''}`,
  }));

  const selectedAlat = alatList.find((a) => a.id === selectedAlatId) ?? null;

  const alatOptions = alatList.map((a) => ({
    value: a.id,
    label: `${a.nama} (tersedia ${a.stok_tersedia} dari ${a.jumlah_total})`,
  }));

  const handleSubmit = (e) => {
    e.preventDefault();
    setFieldError('');
    if (!selectedKartu || !selectedAlatId) {
      setFieldError('Pilih kelas dan alat terlebih dahulu.');
      showFeedback({ type: 'warning', title: 'Data tidak valid', message: 'Pilih kelas dan alat terlebih dahulu.' });
      return;
    }
    setSaving(true);
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
      showFeedback({
        type: 'success',
        title: 'Peminjaman berhasil dicatat.',
        message: `${jumlah} unit ${selectedAlat?.nama} untuk kelas ${selectedKartu.kelas}.`,
      });
      setSelectedKartu(null);
      setSelectedAlatId('');
      setJumlah(1);
      setAlatList(dbService.getAlatWithStok().filter((a) => a.stok_tersedia > 0));
    } else {
      showFeedback({
        type: 'error',
        title: 'Peminjaman gagal dicatat.',
        message: res.error === 'stok_habis' ? 'Stok alat tidak mencukupi.' : 'Silakan coba lagi.',
      });
    }
    setSaving(false);
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Peminjaman Manual"
        description="Catat peminjaman alat secara manual jika kartu Sedang bermasalah, rusak atau hilang."
      />

      <form onSubmit={handleSubmit} className="bg-white border border-main max-w-4xl lg:max-w-full">
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="font-bold text-lg text-gray-800">Form Peminjaman Manual</h2>
          <p className="text-sm text-gray-600 mt-1">Gunakan formulir ini jika kartu tidak bisa di-tap (bermasalah/hilang).</p>
        </div>

        <div className="p-5 space-y-6">
          {fieldError && (
            <p className="text-[15px] text-red-700 bg-red-50 border border-red-200 px-3 py-2">{fieldError}</p>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            <div className="space-y-3">
              <p className="font-bold text-base text-gray-800">1. Siapa yang meminjam? *</p>
              <FilterDropdown
                icon={IconUsers}
                value={selectedKartu?.uid_kartu ?? ''}
                onChange={(uid) => {
                  const found = kartuList.find((k) => k.uid_kartu === uid);
                  setSelectedKartu(found ?? null);
                }}
                options={kartuOptions}
                placeholder="Pilih Peminjam"
                size="lg"
                className="w-full"
                searchable={true}
              />

              {selectedKartu && (
                <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <p className="font-bold text-blue-900 text-lg">{selectedKartu.kelas}</p>
                  <p className="text-blue-700 mt-1">{selectedKartu.nama_pemegang || 'Nama pemegang belum diisi'}</p>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <p className="font-bold text-base text-gray-800">2. Alat apa yang dipinjam? *</p>
              <FilterDropdown
                icon={IconTools}
                value={selectedAlatId}
                onChange={(id) => {
                  setSelectedAlatId(id);
                  setJumlah(1);
                }}
                options={alatOptions}
                placeholder="Pilih Alat Laboratorium"
                size="lg"
                className="w-full"
                searchable={true}
              />

              {selectedAlat && (
                <div className="mt-3 p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 font-medium">Sisa stok saat ini</span>
                    <span className={`font-bold text-xl ${selectedAlat.stok_tersedia === 0 ? 'text-red-700' : 'text-gray-900'}`}>
                      {selectedAlat.stok_tersedia}
                    </span>
                  </div>
                </div>
              )}

              <div className="mt-4">
                <p className="font-bold text-base text-gray-800 mb-3">3. Berapa Jumlahnya?</p>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setJumlah((j) => Math.max(1, j - 1))}
                    className="w-12 h-12 rounded-xl border border-gray-300 hover:bg-gray-100 flex items-center justify-center bg-white"
                    aria-label="Kurangi"
                  >
                    <IconMinus size={20} />
                  </button>
                  <span className="w-12 text-center font-bold text-2xl">{jumlah}</span>
                  <button
                    type="button"
                    onClick={() => setJumlah((j) => Math.min(selectedAlat?.stok_tersedia ?? 1, j + 1))}
                    className="w-12 h-12 rounded-xl border border-gray-300 hover:bg-gray-100 flex items-center justify-center disabled:opacity-40 bg-white"
                    disabled={!selectedAlat}
                    aria-label="Tambah"
                  >
                    <IconPlus size={20} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {selectedKartu && selectedAlat && (
            <div className="border-2 border-blue-200 p-4 rounded-xl text-base bg-blue-50 mt-6">
              <p className="font-bold text-blue-900 mb-1">Cek Kembali Sebelum Simpan</p>
              <p className="text-blue-800">Kelas <b>{selectedKartu.kelas}</b> akan meminjam <b>{jumlah} unit {selectedAlat.nama}</b>.</p>
            </div>
          )}
        </div>

        <div className="px-5 pb-5">
          <Button type="submit" disabled={saving} className="w-full lg:w-auto justify-center h-12 text-base font-bold">
            {saving ? 'Menyimpan...' : 'Simpan Peminjaman Sekarang'}
          </Button>
        </div>
      </form>
    </div>
  );
}
