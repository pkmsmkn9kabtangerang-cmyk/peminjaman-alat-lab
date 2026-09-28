const VARIANTS = {
  dipinjam:       'badge-info',
  dikembalikan:   'badge-success',
  tersedia:       'badge-success',
  habis:          'badge-error',
  aktif:          'badge-success',
  nonaktif:       'badge-gray',
  baik:           'badge-success',
  rusak:          'badge-warning',
  realtime:       'badge-info',
  manual:         'badge-gray',
  berhasil:       'badge-success',
  ditolak:        'badge-error',
  pinjam:         'badge-info',
  kembali:        'badge-success',
  selesai:        'badge-success',
  kartu:          'badge-gray',
  alat:           'badge-info',
};

const LABELS = {
  dipinjam:       'Sedang dipinjam',
  dikembalikan:   'Sudah dikembalikan',
  tersedia:       'Tersedia',
  habis:          'Stok habis',
  aktif:          'Aktif',
  nonaktif:       'Diblokir',
  baik:           'Baik',
  rusak:          'Rusak',
  realtime:       'Kartu RFID',
  manual:         'Manual',
  berhasil:       'Berhasil',
  ditolak:        'Ditolak',
  pinjam:         'Peminjaman',
  kembali:        'Pengembalian',
  selesai:        'Selesai',
  kartu:          'Kartu',
  alat:           'Alat',
};

export default function Badge({ status, className = '' }) {
  const key     = String(status ?? '').toLowerCase();
  const variant = VARIANTS[key] ?? 'badge-gray';
  const label   = LABELS[key] ?? status;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-sm font-medium ${variant} ${className}`}
    >
      {label}
    </span>
  );
}
