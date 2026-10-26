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
  menunggu:       'badge-warning',
  disetujui:      'badge-success',
  dibatalkan:     'badge-gray',
  habis_pakai:    'badge-info',
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
  menunggu:       'Menunggu',
  disetujui:      'Disetujui',
  dibatalkan:     'Dibatalkan',
  habis_pakai:    'Sekali Pakai',
};

export default function Badge({ status, className = '', label }) {
  const key     = String(status ?? '').toLowerCase();
  const variant = VARIANTS[key] ?? 'badge-gray';
  const text    = label ?? LABELS[key] ?? status;

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11.5px] font-semibold shadow-sm ${variant} ${className}`}
    >
      <svg className="h-1.5 w-1.5 fill-current" viewBox="0 0 8 8" aria-hidden="true">
        <circle cx="4" cy="4" r="3" />
      </svg>
      {text}
    </span>
  );
}
