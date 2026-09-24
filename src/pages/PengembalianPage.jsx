// src/pages/PengembalianPage.jsx
// Form Pengembalian Manual: layout dua kolom di lg+, kartu pakai FilterDropdown

import { useState, useEffect } from 'react';
import { dbService } from '../services/store';
import Button from '../components/Button';
import Badge from '../components/Badge';
import FilterDropdown from '../components/FilterDropdown';
import { IconCheck, IconCornerDownLeft, IconUsers, IconBox } from '@tabler/icons-react';

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
      {/* Header */}
      <div>
        <h2 className="text-lg font-bold text-main">Pengembalian Manual</h2>
        <p className="text-xs text-muted">Pencatatan pengembalian alat lab tanpa scan RFID.</p>
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
          <h3 className="font-semibold text-sm text-gray-800">Form Pengembalian</h3>
          <p className="text-xs text-gray-500 mt-0.5">Pilih kelas terlebih dahulu, lalu pilih alat yang dikembalikan</p>
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
                value={selectedKartuId}
                onChange={(v) => setSelectedKartuId(v)}
                options={[{ value: '', label: '— Pilih Kelas Peminjam —' }, ...kartuOptions]}
                placeholder="— Pilih Kelas Peminjam —"
                className="w-full"
              />

              {/* Info kartu terpilih */}
              {selectedKartuObj && (
                <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-xs">
                  <p className="font-bold text-blue-800">{selectedKartuObj.kelas}</p>
                  <p className="text-blue-600 mt-0.5">{selectedKartuObj.nama_pemegang} · <span className="font-mono">{selectedKartuObj.uid_kartu}</span></p>
                </div>
              )}
            </div>

            {/* ── Kolom Kanan: Daftar Pinjaman Aktif ── */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
                  <IconBox size={14} className="text-amber-600" />
                </div>
                <span className="font-semibold text-sm text-gray-800">
                  Pilih Alat yang Dikembalikan *
                  {selectedKartuId && (
                    <span className="ml-2 text-xs font-normal text-gray-500">({pinjamanAktif.length} alat dipinjam)</span>
                  )}
                </span>
              </div>

              {!selectedKartuId ? (
                <div className="p-6 bg-gray-50 border border-gray-200 border-dashed rounded-xl text-center text-xs text-gray-400">
                  Pilih kelas terlebih dahulu untuk melihat pinjaman aktif
                </div>
              ) : pinjamanAktif.length === 0 ? (
                <div className="p-6 bg-gray-50 border border-gray-200 rounded-xl text-center text-xs text-gray-400">
                  Tidak ada pinjaman aktif untuk kelas ini.
                </div>
              ) : (
                <div className="space-y-2">
                  {pinjamanAktif.map((t) => (
                    <button
                      key={t.alat_id}
                      type="button"
                      onClick={() => setSelectedAlat(selectedAlat === t.alat_id ? '' : t.alat_id)}
                      className={`w-full text-left px-4 py-3.5 rounded-xl border transition-all text-xs ${
                        selectedAlat === t.alat_id
                          ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                          : 'border-gray-200 bg-white hover:bg-gray-50 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-gray-800">{t.nama_alat}</p>
                          <p className="text-gray-400 text-[11px] mt-0.5">Dipinjam: {FMT(t.waktu_pinjam)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge status="dipinjam" />
                          {selectedAlat === t.alat_id && (
                            <div className="w-5 h-5 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                              <IconCheck size={11} className="text-white" />
                            </div>
                          )}
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
            icon={IconCornerDownLeft}
            className="w-full lg:w-auto lg:min-w-[240px] justify-center py-2.5"
            disabled={!selectedKartuId || !selectedAlat}
          >
            Proses Pengembalian Manual
          </Button>
        </div>
      </form>
    </div>
  );
}
