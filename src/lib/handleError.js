// src/lib/handleError.js
// Error handler terpusat: lokal = log detail, production = pesan ringkas

const isProd = import.meta.env.PROD;

/**
 * Menangani error dan menampilkan toast.
 * @param {any} e - Error object (dari edge function atau Supabase client)
 * @param {string} fallback - Pesan default jika error tidak punya message
 * @param {function} toastFn - Optional toast function (misal: dari react-hot-toast)
 * @returns {string} Pesan error yang ditampilkan
 */
export function handleError(e, fallback = 'Terjadi kesalahan, coba lagi.', toastFn = null) {
  const err = e ?? {};

  if (!isProd) {
    console.error('[DEV ERROR]', e);
  }

  const msg = err?.message ?? fallback;
  const display = isProd && err?.request_id
    ? `${msg} (ref: ${String(err.request_id).slice(0, 8)})`
    : msg;

  if (toastFn) {
    toastFn(display);
  }

  return display;
}

/**
 * Map kode error dari edge function ke pesan bahasa Indonesia
 */
export const ERROR_MESSAGES = {
  kartu_nonaktif:        'Kartu RFID diblokir atau tidak aktif.',
  uid_tidak_dikenal:     'UID RFID belum terdaftar di sistem.',
  sesi_tidak_ada:        'Belum tap kartu atau sesi sudah habis (20 detik).',
  sesi_kartu_lain_aktif: 'Sesi kartu lain masih aktif. Harap tunggu hingga sesi selesai atau ditutup.',
  stok_habis:            'Stok alat habis — tidak ada unit tersedia.',
  alat_rusak:            'Alat dalam kondisi rusak dan tidak bisa dipinjam.',
  payload_tidak_lengkap: 'Data tidak lengkap dikirim ke server.',
};

export function getErrorMessage(code) {
  return ERROR_MESSAGES[code] ?? `Error: ${code}`;
}
