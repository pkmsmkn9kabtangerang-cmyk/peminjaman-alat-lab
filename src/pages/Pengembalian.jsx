// src/pages/PengembalianPage.jsx
// Form Pengembalian Manual: layout dua kolom di lg+, kartu pakai FilterDropdown

import { useState, useEffect } from 'react';
import { dbService } from '../services/store';
import Button from '../components/Button';
import Badge from '../components/Badge';
import FilterDropdown from '../components/FilterDropdown';
import { IconCheck, IconUser, IconUsers } from '@tabler/icons-react';
import PageHeader from '../components/PageHeader';

const FMT = (iso) => iso
  ? new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  : '—';

export default function PengembalianPage() {
  const [kartuList, setKartuList]         = useState([]);
  const [selectedKartuId, setSelectedKartuId] = useState('');
  const [pinjamanAktif, setPinjamanAktif] = useState([]);
  const [selectedAlat, setSelectedAlat]   = useState('');
  const [success, setSuccess]             = useState('');
  const [error, setError]                 = useState('');

  useEffect(() => {
    setKartuList(dbService.getKartu().filter((k) => k.aktif));
  }, []);

  // Muat pinjaman aktif saat kartu dipilih
  useEffect(() => {
    if (!selectedKartuId) { setPinjamanAktif([]); return; }
    const trx = dbService.getTransaksi().filter((t) => t.uid_kartu === selectedKartuId && t.status === 'dipinjam');
    setPinjamanAktif(trx);
    setSelectedAlat('');
  }, [selectedKartuId]);

  const kartuOptions = kartuList.map((k) => ({
    value: k.uid_kartu,
    label: `${k.kelas} — ${k.nama_pemegang ?? k.uid_kartu}`,
  }));

  const selectedKartuObj = kartuList.find((k) => k.uid_kartu === selectedKartuId);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (!selectedKartuId || !selectedAlat) {
      setError('Pilih kartu kelas dan alat yang akan dikembalikan.');
      showFeedback({ type: 'warning', title: 'Data tidak valid', message: 'Pilih kartu kelas dan alat yang akan dikembalikan.' });
      return;
    }

    const trx  = pinjamanAktif.find((t) => t.alat_id === selectedAlat);
    const user = dbService.getCurrentUser();
    const res  = dbService.processManual({
      uid_kartu:       selectedKartuId,
      alat_id:         selectedAlat,
      jenis:           'kembali',
      jumlah:          1,
      kondisi_kembali: 'baik',
      catatan:         null,
      petugas:         user?.nama ?? 'Petugas',
    });

    if (res.ok) {
      setSuccess(`✓ Pengembalian "${trx?.nama_alat}" untuk kelas ${selectedKartuObj?.kelas} berhasil dicatat.`);
      setSelectedKartuId('');
      setSelectedAlat('');
      setPinjamanAktif([]);
      setTimeout(() => setSuccess(''), 6000);
    } else {
      setError('Tidak ada pinjaman aktif yang sesuai untuk dikembalikan.');
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pengembalian Manual"
        description="Catat pengembalian alat secara manual jika kartu Sedang bermasalah, rusak atau hilang."
      />

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
      <form onSubmit={handleSubmit} className="bg-white border border-main">
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
  <h2 className="font-bold text-lg text-gray-800">Form Pengembalian Manual</h2>
  <p className="text-sm text-gray-600 mt-1">
    Gunakan formulir ini untuk mencatat pengembalian alat secara manual.
  </p>
</div>

        <div className="p-5 space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* ── Kolom Kiri: Pilih Kartu ── */}
            <div className="space-y-3">
              <p className="font-bold text-base text-gray-800">1. Kelas Siapa yang Mengembalikan? *</p>
              
              <FilterDropdown
                icon={IconUsers}
                value={selectedKartuId}
                onChange={(val) => setSelectedKartuId(val)}
                options={kartuOptions}
                placeholder="Pilih Pengembalian"
                size="lg"
                className="w-full"
                searchable={true}
              />

              {/* Info kartu terpilih */}
              {selectedKartuObj && (
                <div className="mt-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                  <p className="font-bold text-blue-900 text-lg">{selectedKartuObj.kelas}</p>
                  <p className="text-blue-700 mt-1">{selectedKartuObj.nama_pemegang || 'Tanpa nama'}</p>
                </div>
              )}
            </div>

            {/* ── Kolom Kanan: Daftar Pinjaman Aktif ── */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="font-bold text-base text-gray-800">
                  2. Pilih Alat yang Mau Dikembalikan
                  {selectedKartuId && (
                    <span className="ml-2 text-sm font-normal text-gray-500">({pinjamanAktif.length} dipinjam)</span>
                  )}
                </span>
              </div>

              {!selectedKartuId ? (
                <div className="p-6 bg-gray-50 border border-gray-200 border-dashed rounded-xl text-center text-sm text-gray-500">
                  Silakan pilih kelas di sebelah kiri terlebih dahulu.
                </div>
              ) : pinjamanAktif.length === 0 ? (
                <div className="p-6 bg-gray-50 border border-gray-200 rounded-xl text-center text-sm text-gray-500">
                  Kelas ini tidak meminjam alat apa-apa.
                </div>
              ) : (
                <div className="space-y-3">
                  {pinjamanAktif.map((t) => (
                    <button
                      key={t.alat_id}
                      type="button"
                      onClick={() => setSelectedAlat(selectedAlat === t.alat_id ? '' : t.alat_id)}
                      className={`w-full text-left px-4 py-4 rounded-xl border transition-all text-sm ${
                        selectedAlat === t.alat_id
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200 shadow-sm'
                          : 'border-gray-300 bg-white hover:bg-gray-50 hover:border-gray-400'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-gray-900 text-base">{t.nama_alat}</p>
                          <p className="text-gray-500 text-xs mt-1">Waktu Pinjam: {FMT(t.waktu_pinjam)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge status="dipinjam" />
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors ${selectedAlat === t.alat_id ? 'bg-blue-600' : 'bg-gray-200'}`}>
                            <IconCheck size={14} className={selectedAlat === t.alat_id ? 'text-white' : 'text-gray-400'} />
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="px-5 lg:px-6 pb-5 lg:pb-6 border-t border-gray-100 pt-4">
          <Button
            type="submit"
            variant="success"
            className="w-full lg:w-auto lg:min-w-[240px] justify-center h-12 text-base font-bold"
            disabled={!selectedKartuId || !selectedAlat}
          >
            Simpan Pengembalian Sekarang
          </Button>
        </div>
      </form>
    </div>
  );
}
