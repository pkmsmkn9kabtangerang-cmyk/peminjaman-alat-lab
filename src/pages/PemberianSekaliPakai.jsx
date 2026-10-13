// src/pages/PemberianSekaliPakai.jsx
// Halaman manual untuk mencatat pemberian alat sekali pakai (consumable) ke kelas.
// Mirip dengan Peminjaman.jsx tapi khusus untuk alat bertipe 'habis_pakai'.

import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { dbService } from '../services/store';
import { showFeedback, friendlyError } from '../lib/feedback';
import Button from '../components/Button';
import PageHeader from '../components/PageHeader';
import PageNote from '../components/PageNote';
import FilterDropdown from '../components/FilterDropdown';
import {
  IconPlus, IconMinus, IconUsers, IconTools,
  IconRefresh, IconMail, IconPackage,
} from '@tabler/icons-react';

// ── Data fetching ──────────────────────────────────────────────
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

async function fetchAlatSekaliPakai() {
  if (isSupabaseConfigured) {
    // Fetch semua alat bertipe habis_pakai dengan stok > 0
    const { data, error } = await supabase
      .from('v_list_barang')
      .select('id, kode, nama, kategori, jumlah_total, jumlah_rusak, stok_tersedia, tipe, satuan')
      .eq('tipe', 'habis_pakai')
      .gt('stok_tersedia', 0)
      .order('nama');
    if (error) throw error;
    return data ?? [];
  }
  return dbService.getAlatWithStok().filter(
    (a) => a.tipe === 'habis_pakai' && a.stok_tersedia > 0
  );
}

// ── Komponen Utama ────────────────────────────────────────────
export default function PemberianSekaliPakai({ user }) {
  const [kartuList, setKartuList] = useState([]);
  const [alatList, setAlatList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedKartu, setSelectedKartu] = useState(null);
  const [selectedAlatId, setSelectedAlatId] = useState('');
  const [jumlah, setJumlah] = useState(1);
  const [catatan, setCatatan] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedAlat = alatList.find((a) => a.id === selectedAlatId) ?? null;

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [kartu, alat] = await Promise.all([
        fetchKartuAktif(),
        fetchAlatSekaliPakai(),
      ]);
      setKartuList(kartu);
      setAlatList(alat);
    } catch (err) {
      console.error('[PemberianSekaliPakai] loadData error:', err);
      showFeedback({ type: 'error', title: 'Gagal memuat data.', message: friendlyError(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const resetForm = () => {
    setSelectedKartu(null);
    setSelectedAlatId('');
    setJumlah(1);
    setCatatan('');
    setFieldError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldError('');

    if (!selectedKartu) {
      setFieldError('Pilih kelas penerima terlebih dahulu.');
      return;
    }
    if (!selectedAlatId) {
      setFieldError('Pilih alat yang akan diberikan terlebih dahulu.');
      return;
    }
    if (jumlah < 1) {
      setFieldError('Jumlah harus minimal 1.');
      return;
    }
    if (selectedAlat && jumlah > selectedAlat.stok_tersedia) {
      setFieldError(`Stok tidak mencukupi. Tersedia: ${selectedAlat.stok_tersedia} ${selectedAlat.satuan || 'unit'}.`);
      return;
    }

    setSaving(true);
    try {
      const petugasNama = user?.nama ?? 'Petugas';

      if (isSupabaseConfigured) {
        // Panggil edge function process-manual dengan jenis habis_pakai
        const { data, error } = await supabase.functions.invoke('process-manual', {
          body: {
            uid_kartu: selectedKartu.uid_kartu,
            alat_id: selectedAlatId,
            jenis: 'habis_pakai',
            jumlah,
            catatan: catatan.trim() || null,
            petugas_nama: petugasNama,
          },
        });
        if (error) {
          const p = await error.context?.json?.().catch(() => null);
          throw p ?? error;
        }
        if (!data?.ok && !data?.success) {
          const errMsg =
            data?.error === 'stok_habis' ? 'Stok alat tidak mencukupi.' :
              data?.error === 'uid_tidak_dikenal' ? 'Kartu atau alat tidak ditemukan.' :
                data?.message ?? 'Pemberian gagal. Silakan coba lagi.';
          setFieldError(errMsg);
          return;
        }
      } else {
        // Mode demo localStorage — langsung kurangi stok via processManual
        const res = dbService.processManual({
          uid_kartu: selectedKartu.uid_kartu,
          alat_id: selectedAlatId,
          jenis: 'habis_pakai',
          jumlah,
          catatan: catatan.trim() || 'Diproses manual oleh petugas',
          petugas: petugasNama,
        });
        if (!res.ok) {
          const errMsg =
            res.error === 'stok_habis' ? 'Stok alat tidak mencukupi.' :
              res.error === 'uid_tidak_dikenal' ? 'Kartu atau alat tidak ditemukan.' :
                'Pemberian gagal. Silakan coba lagi.';
          setFieldError(errMsg);
          return;
        }
      }

      showFeedback({
        type: 'success',
        title: 'Pemberian berhasil dicatat.',
        message: `${jumlah} ${selectedAlat?.satuan || 'unit'} ${selectedAlat?.nama} diberikan ke kelas ${selectedKartu.kelas}.`,
      });
      resetForm();
      loadData();
    } catch (err) {
      console.error('[PemberianSekaliPakai] submit error:', err);
      setFieldError(friendlyError(err, 'Pemberian gagal dicatat. Silakan coba lagi.'));
    } finally {
      setSaving(false);
    }
  };

  const kartuOptions = kartuList.map((k) => ({
    value: k.uid_kartu,
    label: `${k.kelas}${k.nama_pemegang ? ` — ${k.nama_pemegang}` : ''}`,
  }));

  const alatOptions = alatList.map((a) => ({
    value: a.id,
    label: `${a.nama} (sisa: ${a.stok_tersedia} ${a.satuan || 'unit'})`,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pemberian Alat Sekali Pakai Manual"
        description="Catat pemberian alat consumable (sekali pakai) ke kelas secara manual."
      />

      <PageNote title="Cara Penggunaan" icon={IconPackage}>
        <p>
          Halaman ini khusus untuk mencatat <b>pemberian alat sekali pakai</b> (consumable) bertipe satuan, stok akan langsung dikurangi saat dicatat.
        </p>
        <p className="mt-2 text-blue-800">
          <b>Catatan:</b> Alat sekali pakai <b>tidak perlu dikembalikan</b>. Pemberian ini hanya memotong stok inventaris
          secara permanen.
        </p>
      </PageNote>

      {/* ── Form Pemberian ── */}
      <form onSubmit={handleSubmit} className="bg-white border border-main max-w-4xl lg:max-w-full">
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg text-gray-800">Form Pemberian Manual</h2>
            <p className="text-sm text-gray-600 mt-1">
              Pilih kelas dan alat sekali pakai yang akan diberikan.
            </p>
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
            <p className="text-[15px] text-red-700 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
              {fieldError}
            </p>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Kolom kiri: Pilih Kelas */}
            <div className="space-y-3">
              <p className="font-bold text-base text-gray-800">1. Kelas penerima *</p>
              <FilterDropdown
                icon={IconUsers}
                value={selectedKartu?.uid_kartu ?? ''}
                onChange={(uid) => {
                  const found = kartuList.find((k) => k.uid_kartu === uid);
                  setSelectedKartu(found ?? null);
                  setFieldError('');
                }}
                options={kartuOptions}
                placeholder="Pilih Kelas"
                size="lg"
                className="w-full"
                searchable={true}
              />
              {selectedKartu && (
                <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <p className="font-bold text-blue-900 text-lg">{selectedKartu.kelas}</p>
                  <p className="mt-1 text-blue-800">{selectedKartu.nama_pemegang || 'Nama pemegang belum diisi'}</p>
                  <p className="text-xs mt-1 text-blue-600">{selectedKartu.uid_kartu}</p>
                </div>
              )}
            </div>

            {/* Kolom kanan: Pilih Alat & Jumlah */}
            <div className="space-y-3">
              <p className="font-bold text-base text-gray-800">2. Alat sekali pakai *</p>
              {alatList.length === 0 && !loading ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
                  Tidak ada alat sekali pakai yang tersedia. Tambahkan alat bertipe{' '}
                  <b>Sekali Pakai</b> di menu Kelola Alat.
                </div>
              ) : (
                <FilterDropdown
                  icon={IconTools}
                  value={selectedAlatId}
                  onChange={(id) => {
                    setSelectedAlatId(id);
                    setJumlah(1);
                    setFieldError('');
                  }}
                  options={alatOptions}
                  placeholder="Pilih Alat Sekali Pakai"
                  size="lg"
                  className="w-full"
                  searchable={true}
                />
              )}

              {selectedAlat && (
                <div className="mt-3 p-4 bg-gray-50 border border-gray-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-600 font-medium">Sisa stok</span>
                    <span className={`font-bold text-xl ${selectedAlat.stok_tersedia === 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                      {selectedAlat.stok_tersedia} {selectedAlat.satuan || 'unit'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-500">Kategori</span>
                    <span className="text-gray-700 capitalize">{selectedAlat.kategori || '—'}</span>
                  </div>
                </div>
              )}

              {/* Jumlah / Ukuran */}
              <div className="mt-4">
                <p className="font-bold text-base text-gray-800 mb-3">
                  3. Berapa {selectedAlat?.satuan || 'unit'} yang diberikan?
                </p>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => setJumlah((j) => Math.max(1, j - 1))}
                    className="w-12 h-12 rounded-xl border border-gray-300 hover:bg-gray-100 flex items-center justify-center bg-white"
                    aria-label="Kurangi"
                  >
                    <IconMinus size={20} />
                  </button>
                  <span className="w-16 text-center font-bold text-2xl">{jumlah}</span>
                  <button
                    type="button"
                    onClick={() => setJumlah((j) => Math.min(selectedAlat?.stok_tersedia ?? 1, j + 1))}
                    disabled={!selectedAlat || jumlah >= (selectedAlat?.stok_tersedia ?? 1)}
                    className="w-12 h-12 rounded-xl border border-gray-300 hover:bg-gray-100 flex items-center justify-center disabled:opacity-40 bg-white"
                    aria-label="Tambah"
                  >
                    <IconPlus size={20} />
                  </button>
                  {selectedAlat && (
                    <span className="text-sm text-gray-500">
                      maks. {selectedAlat.stok_tersedia} {selectedAlat.satuan || 'unit'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Catatan */}
          <div>
            <label htmlFor="catatan-sekali-pakai" className="block font-bold text-sm text-gray-800 mb-2">
              Catatan (opsional)
            </label>
            <input
              id="catatan-sekali-pakai"
              type="text"
              value={catatan}
              onChange={(e) => setCatatan(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              placeholder="Misal: Untuk praktikum titrasi asam basa..."
            />
          </div>

          {/* Ringkasan */}
          {selectedKartu && selectedAlat && (
            <div className="border-2 border-emerald-200 p-4 rounded-xl text-base bg-emerald-50 mt-2">
              <p className="font-bold text-emerald-900 mb-1">Ringkasan Pemberian</p>
              <p className="text-emerald-800">
                Kelas <b>{selectedKartu.kelas}</b> akan menerima{' '}
                <b>{jumlah} {selectedAlat.satuan || 'unit'} {selectedAlat.nama}</b>.
                Stok akan berkurang dari <b>{selectedAlat.stok_tersedia}</b> menjadi{' '}
                <b>{selectedAlat.stok_tersedia - jumlah}</b> {selectedAlat.satuan || 'unit'}.
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
            {saving ? 'Menyimpan...' : 'Catat Pemberian Sekarang'}
          </Button>
        </div>
      </form>
    </div>
  );
}
