// src/pages/Pengembalian.jsx
// Form Pengembalian Manual: layout dua kolom di lg+

import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { dbService } from '../services/store';
import { callTransaksiManual } from '../lib/api';
import { showFeedback, friendlyError } from '../lib/feedback';
import Button from '../components/Button';
import Badge from '../components/Badge';
import FilterDropdown from '../components/FilterDropdown';
import { IconCheck, IconUsers, IconRefresh, IconMail } from '@tabler/icons-react';
import PageHeader from '../components/PageHeader';
import PageNote from '../components/PageNote';

const FMT = (iso) =>
  iso
    ? new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
    : '—';

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

async function fetchPinjamanAktif(uid_kartu) {
  if (!uid_kartu) return [];
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('transaksi')
      .select('id, alat_id, nama_alat, waktu_pinjam, kondisi_pinjam, status')
      .eq('uid_kartu', uid_kartu)
      .eq('status', 'dipinjam')
      .order('waktu_pinjam', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }
  return dbService.getTransaksi().filter(
    (t) => t.uid_kartu === uid_kartu && t.status === 'dipinjam'
  );
}

export default function PengembalianPage({ user }) {
  const [kartuList, setKartuList] = useState([]);
  const [selectedKartuId, setSelectedKartuId] = useState('');
  const [pinjamanAktif, setPinjamanAktif] = useState([]);
  const [selectedAlatId, setSelectedAlatId] = useState('');
  const [kondisiKembali, setKondisiKembali] = useState('baik');
  const [catatan, setCatatan] = useState('');
  const [loadingKartu, setLoadingKartu] = useState(true);
  const [loadingPinjaman, setLoadingPinjaman] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadKartu = useCallback(async () => {
    setLoadingKartu(true);
    try {
      const data = await fetchKartuAktif();
      setKartuList(data);
    } catch (err) {
      console.error('[Pengembalian] loadKartu error:', err);
      showFeedback({ type: 'error', title: 'Gagal memuat daftar kartu.', message: friendlyError(err) });
    } finally {
      setLoadingKartu(false);
    }
  }, []);

  useEffect(() => {
    loadKartu();
  }, [loadKartu]);

  // Muat pinjaman aktif saat kartu dipilih
  useEffect(() => {
    if (!selectedKartuId) {
      setPinjamanAktif([]);
      return;
    }
    setLoadingPinjaman(true);
    fetchPinjamanAktif(selectedKartuId)
      .then(setPinjamanAktif)
      .catch((err) => {
        console.error('[Pengembalian] fetchPinjaman error:', err);
        showFeedback({ type: 'error', title: 'Gagal memuat pinjaman.', message: friendlyError(err) });
      })
      .finally(() => setLoadingPinjaman(false));

    setSelectedAlatId('');
    setError('');
  }, [selectedKartuId]);

  const kartuOptions = kartuList.map((k) => ({
    value: k.uid_kartu,
    label: `${k.kelas} — ${k.nama_pemegang ?? k.uid_kartu}`,
  }));

  const selectedKartuObj = kartuList.find((k) => k.uid_kartu === selectedKartuId);
  const selectedTrx = pinjamanAktif.find((t) => t.alat_id === selectedAlatId);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!selectedKartuId) {
      setError('Pilih kartu kelas yang akan mengembalikan alat.');
      return;
    }
    if (!selectedAlatId) {
      setError('Pilih alat yang akan dikembalikan.');
      return;
    }
    if (!selectedTrx) {
      setError('Data pinjaman tidak ditemukan. Muat ulang halaman dan coba lagi.');
      return;
    }

    setSaving(true);
    try {
      const petugasNama = user?.nama ?? 'Petugas';

      if (isSupabaseConfigured) {
        const res = await callTransaksiManual({
          uid_kartu: selectedKartuId,
          alat_id: selectedAlatId,
          jenis: 'kembali',
          jumlah: 1,
          kondisi_kembali: kondisiKembali,
          catatan: catatan.trim() || null,
          petugas_nama: petugasNama,
        });

        if (!res?.ok) {
          const errMsg =
            res?.error === 'uid_tidak_dikenal' ? 'Kartu atau alat tidak ditemukan di database.' :
              res?.message ?? 'Pengembalian gagal dicatat. Silakan coba lagi.';
          setError(errMsg);
          return;
        }
      } else {
        const res = dbService.processManual({
          uid_kartu: selectedKartuId,
          alat_id: selectedAlatId,
          jenis: 'kembali',
          jumlah: 1,
          kondisi_kembali: kondisiKembali,
          catatan: catatan.trim() || null,
          petugas: petugasNama,
        });
        if (!res.ok) {
          setError('Tidak ada pinjaman aktif yang sesuai untuk dikembalikan.');
          return;
        }
      }

      showFeedback({
        type: 'success',
        title: 'Pengembalian berhasil dicatat.',
        message: `"${selectedTrx?.nama_alat}" untuk kelas ${selectedKartuObj?.kelas} berhasil dikembalikan.`,
      });

      // Reset form & refresh pinjaman aktif
      setSelectedAlatId('');
      setKondisiKembali('baik');
      setCatatan('');

      // Reload pinjaman kartu yang sama
      const updated = await fetchPinjamanAktif(selectedKartuId);
      setPinjamanAktif(updated);

    } catch (err) {
      console.error('[Pengembalian] submit error:', err);
      setError(friendlyError(err, 'Pengembalian gagal dicatat. Silakan coba lagi.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pengembalian Manual"
        description="Catat pengembalian alat secara manual jika kartu sedang bermasalah, rusak, atau hilang."
      />

      <PageNote title="Informasi Penting" icon={IconMail}>
        Fitur pengembalian manual ini di gunakan jika kartu atau alat stiker sedang bermasalah, rusak, atau hilang. anda bisa menggunakan fitur pengembalian ini secara manual.
      </PageNote>

      <form onSubmit={handleSubmit} className="bg-white border border-main">
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg text-gray-800">Form Pengembalian Manual</h2>
            <p className="text-sm text-gray-600 mt-1">Gunakan formulir ini untuk mencatat pengembalian alat secara manual.</p>
          </div>
          <button
            type="button"
            onClick={() => {
              loadKartu();
              if (selectedKartuId) {
                setLoadingPinjaman(true);
                fetchPinjamanAktif(selectedKartuId).then(setPinjamanAktif).finally(() => setLoadingPinjaman(false));
              }
            }}
            disabled={loadingKartu}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
            title="Refresh data"
          >
            <IconRefresh size={18} className={loadingKartu ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Kolom Kiri: Pilih Kartu */}
            <div className="space-y-3">
              <p className="font-bold text-base text-gray-800">1. Kelas Siapa yang Mengembalikan? *</p>

              <FilterDropdown
                icon={IconUsers}
                value={selectedKartuId}
                onChange={(val) => {
                  setSelectedKartuId(val);
                  setError('');
                }}
                options={kartuOptions}
                placeholder="Pilih kelas pengembalian"
                size="lg"
                className="w-full"
                searchable={true}
              />

              {selectedKartuObj && (
                <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <p className="font-bold text-blue-900 text-lg">{selectedKartuObj.kelas}</p>
                  <p className="text-blue-700 mt-1">{selectedKartuObj.nama_pemegang || 'Tanpa nama'}</p>
                  <p className="text-blue-500 text-xs mt-1 font-mono">{selectedKartuObj.uid_kartu}</p>
                </div>
              )}
            </div>

            {/* Kolom Kanan: Daftar Pinjaman Aktif */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="font-bold text-base text-gray-800">
                  2. Pilih Alat yang Mau Dikembalikan
                  {selectedKartuId && !loadingPinjaman && (
                    <span className="ml-2 text-sm font-normal text-gray-500">
                      ({pinjamanAktif.length} dipinjam)
                    </span>
                  )}
                </span>
              </div>

              {!selectedKartuId ? (
                <div className="p-6 bg-gray-50 border border-gray-200 border-dashed rounded-xl text-center text-sm text-gray-500">
                  Silakan pilih kelas di sebelah kiri terlebih dahulu.
                </div>
              ) : loadingPinjaman ? (
                <div className="p-6 bg-gray-50 border border-gray-200 rounded-xl text-center text-sm text-gray-500">
                  Memuat data pinjaman...
                </div>
              ) : pinjamanAktif.length === 0 ? (
                <div className="p-6 bg-gray-50 border border-gray-200 rounded-xl text-center text-sm text-gray-500">
                  Kelas ini tidak sedang meminjam alat apa pun.
                </div>
              ) : (
                <div className="space-y-3">
                  {pinjamanAktif.map((t) => (
                    <button
                      key={t.alat_id || t.id}
                      type="button"
                      onClick={() => setSelectedAlatId(selectedAlatId === t.alat_id ? '' : t.alat_id)}
                      className={`w-full text-left px-4 py-4 rounded-xl border transition-all text-sm ${selectedAlatId === t.alat_id
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200 shadow-sm'
                        : 'border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400'
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-gray-900 text-base">{t.nama_alat}</p>
                          <p className="text-gray-500 text-xs mt-1">Dipinjam: {FMT(t.waktu_pinjam)}</p>
                          {t.kondisi_pinjam && (
                            <p className="text-gray-500 text-xs">Kondisi pinjam: <span className="capitalize">{t.kondisi_pinjam}</span></p>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge status="dipinjam" />
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${selectedAlatId === t.alat_id ? 'bg-blue-600' : 'bg-gray-200'}`}>
                            <IconCheck size={14} className={selectedAlatId === t.alat_id ? 'text-white' : 'text-gray-400'} />
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Kondisi kembali & catatan */}
          {selectedAlatId && selectedTrx && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
              <div>
                <label className="block font-bold text-sm text-gray-800 mb-2">Kondisi alat saat dikembalikan</label>
                <div className="flex gap-2">
                  {['baik', 'rusak'].map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKondisiKembali(k)}
                      className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition capitalize ${kondisiKembali === k
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
              <div>
                <label htmlFor="catatan-kembali" className="block font-bold text-sm text-gray-800 mb-2">Catatan (opsional)</label>
                <input
                  id="catatan-kembali"
                  type="text"
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  placeholder="Catatan kondisi saat kembali..."
                />
              </div>
            </div>
          )}
        </div>

        <div className="px-5 lg:px-6 pb-5 lg:pb-6 border-t border-gray-100 pt-4">
          <Button
            type="submit"
            variant="success"
            className="w-full lg:w-auto lg:min-w-[240px] justify-center h-12 text-base font-bold"
            disabled={saving || !selectedKartuId || !selectedAlatId}
          >
            {saving ? 'Menyimpan...' : 'Simpan Pengembalian Sekarang'}
          </Button>
        </div>
      </form>
    </div>
  );
}
