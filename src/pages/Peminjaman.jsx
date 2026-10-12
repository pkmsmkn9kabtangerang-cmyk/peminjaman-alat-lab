import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { dbService } from '../services/store';
import { callTransaksiManual } from '../lib/api';
import { showFeedback, friendlyError } from '../lib/feedback';
import Badge from '../components/Badge';
import Button from '../components/Button';
import PageHeader from '../components/PageHeader';
import PageNote from '../components/PageNote';
import FilterDropdown from '../components/FilterDropdown';
import { IconPlus, IconMinus, IconUsers, IconTools, IconRefresh, IconHandGrab, IconMail } from '@tabler/icons-react';

// ── Data fetching ──
async function fetchKartuAktif() {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('kartu_rfid')
      .select('uid_kartu, kelas, nama_pemegang, aktif')
      .eq('aktif', true)
      .order('kelas');
    if (error) throw error;
    return data ?? [];
  }
  return dbService.getKartu().filter((k) => k.aktif);
}

async function fetchAlatTersedia() {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('v_list_barang')
      .select('id, kode, nama, kategori, jumlah_total, jumlah_rusak, stok_tersedia, tipe, satuan')
      .neq('tipe', 'habis_pakai')   // Alat sekali pakai dikelola di halaman khusus
      .gt('stok_tersedia', 0)
      .order('nama');
    if (error) throw error;
    return data ?? [];
  }
  return dbService.getAlatWithStok().filter(
    (a) => a.tipe !== 'habis_pakai' && a.stok_tersedia > 0
  );
}

export default function PeminjamanPage({ user }) {
  const [kartuList, setKartuList] = useState([]);
  const [alatList, setAlatList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedKartu, setSelectedKartu] = useState(null);
  const [selectedAlatId, setSelectedAlatId] = useState('');
  const [jumlah, setJumlah] = useState(1);
  const [kondisi, setKondisi] = useState('baik');
  const [catatan, setCatatan] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [kartu, alat] = await Promise.all([fetchKartuAktif(), fetchAlatTersedia()]);
      setKartuList(kartu);
      setAlatList(alat);
    } catch (err) {
      console.error('[Peminjaman] loadData error:', err);
      showFeedback({ type: 'error', title: 'Gagal memuat data.', message: friendlyError(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const kartuOptions = kartuList.map((k) => ({
    value: k.uid_kartu,
    label: `${k.kelas}${k.nama_pemegang ? ` — ${k.nama_pemegang}` : ''}`,
  }));

  const selectedAlat = alatList.find((a) => a.id === selectedAlatId) ?? null;

  const alatOptions = alatList.map((a) => ({
    value: a.id,
    label: `${a.nama} (tersedia ${a.stok_tersedia}${a.jumlah_total ? ` dari ${a.jumlah_total}` : ''})`,
  }));

  const resetForm = () => {
    setSelectedKartu(null);
    setSelectedAlatId('');
    setJumlah(1);
    setKondisi('baik');
    setCatatan('');
    setFieldError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldError('');

    // Validasi
    if (!selectedKartu) {
      setFieldError('Pilih kelas yang akan meminjam terlebih dahulu.');
      return;
    }
    if (!selectedAlatId) {
      setFieldError('Pilih alat yang akan dipinjam terlebih dahulu.');
      return;
    }
    if (jumlah < 1) {
      setFieldError('Jumlah harus minimal 1.');
      return;
    }
    if (selectedAlat && jumlah > selectedAlat.stok_tersedia) {
      setFieldError(`Stok tidak mencukupi. Tersedia: ${selectedAlat.stok_tersedia} unit.`);
      return;
    }

    setSaving(true);
    try {
      const petugasNama = user?.nama ?? 'Petugas';

      if (isSupabaseConfigured) {
        const res = await callTransaksiManual({
          uid_kartu: selectedKartu.uid_kartu,
          alat_id: selectedAlatId,
          jenis: 'pinjam',
          jumlah,
          kondisi_pinjam: kondisi,
          catatan: catatan.trim() || null,
          petugas_nama: petugasNama,
        });

        if (!res?.ok) {
          const errMsg =
            res?.error === 'stok_habis' ? 'Stok alat tidak mencukupi.' :
              res?.error === 'uid_tidak_dikenal' ? 'Kartu atau alat tidak ditemukan.' :
                res?.message ?? 'Peminjaman gagal. Silakan coba lagi.';
          setFieldError(errMsg);
          return;
        }
      } else {
        const res = dbService.processManual({
          uid_kartu: selectedKartu.uid_kartu,
          alat_id: selectedAlatId,
          jenis: 'pinjam',
          jumlah,
          kondisi_pinjam: kondisi,
          catatan: catatan.trim() || null,
          petugas: petugasNama,
        });

        if (!res.ok) {
          const errMsg =
            res.error === 'stok_habis' ? 'Stok alat tidak mencukupi.' :
              res.error === 'uid_tidak_dikenal' ? 'Kartu atau alat tidak ditemukan.' :
                'Peminjaman gagal. Silakan coba lagi.';
          setFieldError(errMsg);
          return;
        }
      }

      showFeedback({
        type: 'success',
        title: selectedAlat?.tipe === 'habis_pakai' ? 'Pemberian alat berhasil dicatat.' : 'Peminjaman berhasil dicatat.',
        message: `${jumlah} ${selectedAlat?.satuan || 'unit'} ${selectedAlat?.nama} untuk kelas ${selectedKartu.kelas}.`,
      });
      resetForm();
      loadData(); // refresh stok
    } catch (err) {
      console.error('[Peminjaman] submit error:', err);
      setFieldError(friendlyError(err, 'Peminjaman gagal dicatat. Silakan coba lagi.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Peminjaman Manual"
        description="Catat peminjaman alat secara manual jika kartu sedang bermasalah, rusak, atau hilang."
      />

      <PageNote title="Informasi Penting" icon={IconMail}>
        Fitur peminjaman manual ini di gunakan jika kartu atau alat stiker sedang bermasalah, rusak, atau hilang. anda bisa menggunakan fitur peminjaman secara manual ini. dan minjam secara manual
      </PageNote>

      <form onSubmit={handleSubmit} className="bg-white border border-main max-w-4xl lg:max-w-full">
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg text-gray-800">Form Peminjaman Manual</h2>
            <p className="text-sm text-gray-600 mt-1">Gunakan formulir ini jika kartu tidak bisa di-tap (bermasalah/hilang).</p>
          </div>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
            title="Refresh data"
          >
            <IconRefresh size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {fieldError && (
            <p className="text-[15px] text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">{fieldError}</p>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Kolom kiri: Pilih Kartu */}
            <div className="space-y-3">
              <p className="font-bold text-base text-gray-800">1. Siapa yang meminjam? *</p>
              <FilterDropdown
                icon={IconUsers}
                value={selectedKartu?.uid_kartu ?? ''}
                onChange={(uid) => {
                  const found = kartuList.find((k) => k.uid_kartu === uid);
                  setSelectedKartu(found ?? null);
                  setFieldError('');
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
                  <p className="mt-1">{selectedKartu.nama_pemegang || 'Nama pemegang belum diisi'}</p>
                  <p className="text-sm mt-1">{selectedKartu.uid_kartu}</p>
                </div>
              )}
            </div>

            {/* Kolom kanan: Pilih Alat & Jumlah */}
            <div className="space-y-3">
              <p className="font-bold text-base text-gray-800">2. Alat apa yang dipinjam? *</p>
              <FilterDropdown
                icon={IconTools}
                value={selectedAlatId}
                onChange={(id) => {
                  setSelectedAlatId(id);
                  setJumlah(1);
                  setFieldError('');
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
                    <span className="text-gray-600 font-medium">Stok tersedia</span>
                    <span className={`font-bold text-xl ${selectedAlat.stok_tersedia === 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                      {selectedAlat.stok_tersedia}
                      {selectedAlat.jumlah_total ? ` / ${selectedAlat.jumlah_total}` : ''}
                    </span>
                  </div>
                  {selectedAlat.tipe !== 'habis_pakai' && selectedAlat.jumlah_rusak > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-orange-700">Unit rusak</span>
                      <span className="font-medium text-orange-800">{selectedAlat.jumlah_rusak} {selectedAlat.satuan || 'unit'}</span>
                    </div>
                  )}
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
                    disabled={!selectedAlat || jumlah >= (selectedAlat?.stok_tersedia ?? 1)}
                    aria-label="Tambah"
                  >
                    <IconPlus size={20} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Kondisi & Catatan */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {selectedAlat?.tipe !== 'habis_pakai' && (
              <div>
                <label className="block font-bold text-sm text-gray-800 mb-2">Kondisi alat saat dipinjam</label>
                <div className="flex gap-2">
                  {['baik', 'rusak'].map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKondisi(k)}
                      className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition capitalize ${kondisi === k
                        ? k === 'baik'
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : 'bg-orange-500 border-orange-500 text-white'
                        : 'bg-white border-gray-300 text-gray-700 hover:border-gray-400'
                        }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div>
              <label htmlFor="catatan-pinjam" className="block font-bold text-sm text-gray-800 mb-2">Catatan (opsional)</label>
              <input
                id="catatan-pinjam"
                type="text"
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                placeholder="Catatan tambahan..."
              />
            </div>
          </div>

          {/* Ringkasan */}
          {selectedKartu && selectedAlat && (
            <div className="border-2 border-blue-200 p-4 rounded-xl text-base bg-blue-50 mt-2">
              <p className="font-bold text-blue-900 mb-1">Cek Kembali Sebelum Simpan</p>
              <p className="text-blue-800">
                Kelas <b>{selectedKartu.kelas}</b> akan {selectedAlat.tipe === 'habis_pakai' ? 'meminta' : 'meminjam'}{' '}
                <b>{jumlah} {selectedAlat.satuan || 'unit'} {selectedAlat.nama}</b> {selectedAlat.tipe !== 'habis_pakai' ? `kondisi ${kondisi}` : ''}.
              </p>
            </div>
          )}
        </div>

        <div className="px-5 pb-5 border-t border-gray-100 pt-4">
          <Button
            type="submit"
            disabled={saving || loading || !selectedKartu || !selectedAlatId}
            className="w-full lg:w-auto justify-center h-12 text-base font-bold"
          >
            {saving ? 'Menyimpan...' : (selectedAlat?.tipe === 'habis_pakai' ? 'Berikan Alat Sekarang' : 'Simpan Peminjaman Sekarang')}
          </Button>
        </div>
      </form>
    </div>
  );
}
