import { useState, useEffect } from 'react';
import { dbService } from '../services/store';
import Badge from '../components/Badge';
import Button from '../components/Button';
import FilterDropdown from '../components/FilterDropdown';
import PageHeader from '../components/PageHeader';
import { showFeedback } from '../lib/feedback';
import { IconPlus, IconMinus, IconUsers } from '@tabler/icons-react';

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
        title="Peminjaman"
        description="Catat peminjaman alat secara manual jika kartu Sedang bermasalah, rusak atau hilang."
      />

      <form onSubmit={handleSubmit} className="bg-white border border-main max-w-4xl lg:max-w-full">
        <div className="px-5 py-4 border-b border-main">
          <h2 className="font-semibold text-base text-main">Form peminjaman</h2>
          <p className="text-[15px] text-muted mt-0.5">Pilih kelas, alat, lalu jumlah unit yang akan dipinjam.</p>
        </div>

        <div className="p-5 space-y-6">
          {fieldError && (
            <p className="text-[15px] text-red-700 bg-red-50 border border-red-200 px-3 py-2">{fieldError}</p>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            <div className="space-y-3">
              <p className="font-medium text-[15px] text-main">Kelas peminjam *</p>
              <FilterDropdown
              icon={IconUsers}
                value={selectedKartu?.uid_kartu ?? ''}
                onChange={(uid) => {
                  const found = kartuList.find((k) => k.uid_kartu === uid);
                  setSelectedKartu(found ?? null);
                }}
                options={[{ value: '', label: 'Pilih kelas' }, ...kartuOptions]}
                placeholder="Pilih kelas"
                className="w-full"
              />
              {selectedKartu && (
                <div className="border border-gray-200 px-3 py-3 text-[15px]">
                  <p className="font-semibold">{selectedKartu.kelas}</p>
                  <p className="text-muted mt-0.5">{selectedKartu.nama_pemegang || 'Pemegang belum diisi'}</p>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <p className="font-medium text-[15px] text-main">Alat *</p>
              <FilterDropdown
                value={selectedAlatId}
                onChange={(v) => { setSelectedAlatId(v); setJumlah(1); }}
                options={[{ value: '', label: 'Pilih alat' }, ...alatOptions]}
                placeholder="Pilih alat"
                className="w-full"
              />
              {selectedAlat && (
                <div className="border border-gray-200 px-3 py-3 text-[15px] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Stok tersedia</span>
                    <span className={`font-semibold text-lg ${selectedAlat.stok_tersedia === 0 ? 'text-red-700' : 'text-main'}`}>
                      {selectedAlat.stok_tersedia} / {selectedAlat.jumlah_total}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge status={selectedAlat.stok_tersedia > 0 ? 'tersedia' : 'habis'} />
                    {selectedAlat.jumlah_rusak > 0 && (
                      <span className="text-orange-800">{selectedAlat.jumlah_rusak} unit rusak</span>
                    )}
                  </div>
                </div>
              )}

              <div>
                <p className="font-medium text-[15px] text-main mb-2">Jumlah unit</p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setJumlah((j) => Math.max(1, j - 1))}
                    className="w-11 h-11 border border-gray-300 hover:bg-gray-50 flex items-center justify-center"
                    aria-label="Kurangi"
                  >
                    <IconMinus size={16} />
                  </button>
                  <span className="w-10 text-center font-semibold text-lg">{jumlah}</span>
                  <button
                    type="button"
                    onClick={() => setJumlah((j) => Math.min(selectedAlat?.stok_tersedia ?? 1, j + 1))}
                    className="w-11 h-11 border border-gray-300 hover:bg-gray-50 flex items-center justify-center disabled:opacity-40"
                    disabled={!selectedAlat}
                    aria-label="Tambah"
                  >
                    <IconPlus size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {selectedKartu && selectedAlat && (
            <div className="border border-gray-200 px-4 py-3 text-[15px] bg-gray-50">
              <p className="font-semibold mb-2">Ringkasan</p>
              <p>{selectedKartu.kelas} meminjam {jumlah} unit {selectedAlat.nama}.</p>
            </div>
          )}
        </div>

        <div className="px-5 pb-5">
          <Button type="submit" disabled={saving} className="w-full lg:w-auto justify-center">
            {saving ? 'Menyimpan...' : 'Proses peminjaman'}
          </Button>
        </div>
      </form>
    </div>
  );
}
