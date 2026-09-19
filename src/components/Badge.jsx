export default function Badge({ status }) {
  let badgeClass = 'badge-info';
  let label = status;

  const st = String(status).toLowerCase();

  if (st === 'tersedia' || st === 'aktif' || st === 'selesai' || st === 'dikonfirmasi' || st === 'processed') {
    badgeClass = 'badge-success';
    if (st === 'tersedia') label = 'Tersedia';
    if (st === 'aktif') label = 'Aktif';
    if (st === 'selesai') label = 'Selesai';
    if (st === 'dikonfirmasi') label = 'Dikonfirmasi';
    if (st === 'processed') label = 'Diproses';
  } else if (st === 'dipinjam' || st === 'pending' || st === 'menunggu_konfirmasi') {
    badgeClass = 'badge-warning';
    if (st === 'dipinjam') label = 'Dipinjam';
    if (st === 'pending' || st === 'menunggu_konfirmasi') label = 'Menunggu Konfirmasi';
  } else if (st === 'nonaktif' || st === 'maintenance' || st === 'invalid' || st === 'error') {
    badgeClass = 'badge-error';
    if (st === 'nonaktif') label = 'Nonaktif';
    if (st === 'maintenance') label = 'Maintenance';
    if (st === 'invalid') label = 'Invalid';
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium ${badgeClass}`}>
      {label}
    </span>
  );
}
