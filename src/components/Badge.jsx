// src/components/Badge.jsx
// Komponen badge/chip yang menangani semua status di aplikasi

const VARIANTS = {
  // Status transaksi
  dipinjam:       'badge-info',
  dikembalikan:   'badge-success',
  // Status alat / stok
  tersedia:       'badge-success',
  habis:          'badge-error',
  // Status kartu
  aktif:          'badge-success',
  nonaktif:       'badge-gray',
  // Kondisi barang
  baik:           'badge-success',
  rusak:          'badge-warning',
  // Sumber transaksi
  otomatis:       'badge-info',
  manual:         'badge-purple',
  // Tap status
  berhasil:       'badge-success',
  ditolak:        'badge-error',
  // Jenis deteksi
  pinjam:         'badge-info',
  kembali:        'badge-purple',
  // Jenis tap
  kartu:          'badge-gray',
  alat:           'badge-info',
};

const LABELS = {
  dipinjam:       'Dipinjam',
  dikembalikan:   'Dikembalikan',
  tersedia:       'Tersedia',
  habis:          'Stok Habis',
  aktif:          'Aktif',
  nonaktif:       'Nonaktif',
  baik:           'Baik',
  rusak:          'Rusak',
  otomatis:       'Otomatis',
  manual:         'Manual',
  berhasil:       'Berhasil',
  ditolak:        'Ditolak',
  pinjam:         'Dipinjam',
  kembali:        'Dikembalikan',
  kartu:          'Kartu',
  alat:           'Alat',
};

export default function Badge({ status, className = '' }) {
  const key     = String(status ?? '').toLowerCase();
  const variant = VARIANTS[key] ?? 'badge-gray';
  const label   = LABELS[key] ?? status;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${variant} ${className}`}
    >
      {label}
    </span>
  );
}
