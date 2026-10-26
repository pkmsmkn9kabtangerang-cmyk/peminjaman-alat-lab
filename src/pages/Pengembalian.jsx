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
import { IconCheck, IconUsers, IconRefresh, IconMail, IconAlertCircle } from '@tabler/icons-react';
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
    try {
      const { data, error } = await supabase
        .from('transaksi')
        .select('id, alat_id, nama_alat, waktu_pinjam, kondisi_pinjam, status, alat!inner(tipe)')
        .eq('uid_kartu', uid_kartu)
        .eq('status', 'dipinjam')
        .neq('alat.tipe', 'habis_pakai')
        .order('waktu_pinjam', { ascending: false });
      if (!error && data) return data;
    } catch {
      // fallback jika foreign key join berbeda
    }

    const { data, error } = await supabase
      .from('transaksi')
      .select('id, alat_id, nama_alat, waktu_pinjam, kondisi_pinjam, status')
      .eq('uid_kartu', uid_kartu)
      .eq('status', 'dipinjam')
      .order('waktu_pinjam', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }

  const allAlat = dbService.getAlat();
  return dbService.getTransaksi().filter((t) => {
    if (t.uid_kartu !== uid_kartu || t.status !== 'dipinjam') return false;
    const item = allAlat.find((a) => a.id === t.alat_id);
    return item ? item.tipe !== 'habis_pakai' : true;
  });
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

      <form onSubmit={handleSubmit} className="overflow-hidden rounded-xl border border-main bg-white shadow-sm">
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-gray-800 sm:text-lg">Form Pengembalian Manual</h2>
            <p className="mt-1 text-sm text-gray-600">Gunakan formulir ini untuk mencatat pengembalian alat secara manual.</p>
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
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 disabled:opacity-50"
            title="Refresh data"
            aria-label="Muat ulang data pengembalian"
          >
            <IconRefresh size={18} className={loadingKartu ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="space-y-6 p-4 sm:p-5">
          {error && (
            <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <IconAlertCircle size={18} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Kolom Kiri: Pilih Kartu */}
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-base font-bold text-gray-800">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-[#1E5AAB]">1</span>
                Kelas siapa yang mengembalikan? <span className="text-red-500">*</span>
              </p>

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
                <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
                  <p className="text-lg font-bold text-blue-900">{selectedKartuObj.kelas}</p>
                  <p className="mt-1 text-sm text-blue-800">{selectedKartuObj.nama_pemegang || 'Tanpa nama'}</p>
                  <p className="mt-1 break-all font-mono text-xs text-blue-600">{selectedKartuObj.uid_kartu}</p>
                </div>
              )}
            </div>

            {/* Kolom Kanan: Daftar Pinjaman Aktif */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <p className="flex items-center gap-2 text-base font-bold text-gray-800">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-[#1E5AAB]">2</span>
                  Pilih alat yang mau dikembalikan
                </p>
                {selectedKartuId && !loadingPinjaman && (
                  <span className="text-sm font-normal text-gray-500">
                    ({pinjamanAktif.length} dipinjam)
                  </span>
                )}
              </div>

              {!selectedKartuId ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
                  Silakan pilih kelas di kolom sebelumnya terlebih dahulu.
                </div>
              ) : loadingPinjaman ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
                  Memuat data pinjaman...
                </div>
              ) : pinjamanAktif.length === 0 ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
                  Kelas ini tidak sedang meminjam alat apa pun.
                </div>
              ) : (
                <div className="space-y-3">
                  {pinjamanAktif.map((t) => (
                    <button
                      key={t.alat_id || t.id}
                      type="button"
                      onClick={() => setSelectedAlatId(selectedAlatId === t.alat_id ? '' : t.alat_id)}
                      aria-pressed={selectedAlatId === t.alat_id}
                      className={`w-full rounded-xl border px-4 py-4 text-left text-sm transition ${selectedAlatId === t.alat_id
                        ? 'border-blue-500 bg-blue-50 shadow-sm ring-2 ring-blue-200'
                        : 'border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50'
                        }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="break-words text-base font-bold text-gray-900">{t.nama_alat}</p>
                          <p className="mt-1 text-xs text-gray-500">Dipinjam: {FMT(t.waktu_pinjam)}</p>
                          {t.kondisi_pinjam && (
                            <p className="text-xs text-gray-500">Kondisi pinjam: <span className="capitalize">{t.kondisi_pinjam}</span></p>
                          )}
                        </div>
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${selectedAlatId === t.alat_id ? 'bg-blue-600' : 'bg-gray-200'}`}>
                          <IconCheck size={15} className={selectedAlatId === t.alat_id ? 'text-white' : 'text-gray-400'} />
                        </div>
                      </div>
                      <div className="mt-2">
                        <Badge status="dipinjam" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Kondisi kembali & catatan */}
          {selectedAlatId && selectedTrx && (
            <div className="grid grid-cols-1 gap-4 border-t border-gray-100 pt-4 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-bold text-gray-800">Kondisi alat saat dikembalikan</label>
                <div className="flex gap-2">
                  {['baik', 'rusak'].map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKondisiKembali(k)}
                      aria-pressed={kondisiKembali === k}
                      className={`min-h-11 flex-1 rounded-xl border text-sm font-semibold capitalize transition ${kondisiKembali === k
                        ? k === 'baik'
                          ? 'border-emerald-600 bg-emerald-600 text-white'
                          : 'border-orange-500 bg-orange-500 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
                        }`}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="catatan-kembali" className="mb-2 block text-sm font-bold text-gray-800">Catatan (opsional)</label>
                <input
                  id="catatan-kembali"
                  type="text"
                  value={catatan}
                  onChange={(e) => setCatatan(e.target.value)}
                  className="min-h-11 w-full rounded-xl border border-gray-300 bg-white px-4 text-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Catatan kondisi saat kembali..."
                />
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 bg-gray-50 px-4 pb-4 pt-4 sm:px-5 sm:pb-5">
          <Button
            type="submit"
            variant="success"
            className="h-12 w-full justify-center text-base font-bold lg:w-auto lg:min-w-[240px]"
            disabled={saving || !selectedKartuId || !selectedAlatId}
          >
            {saving ? 'Menyimpan...' : 'Simpan Pengembalian Sekarang'}
          </Button>
        </div>
      </form>
    </div>
  );
}
