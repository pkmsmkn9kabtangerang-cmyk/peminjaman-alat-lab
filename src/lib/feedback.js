// src/lib/feedback.js
// Umpan balik UI: toast ringkas + pesan error yang ramah dan mudah dipahami pengguna

export function showFeedback({ type = 'success', title, message } = {}) {
  window.dispatchEvent(
    new CustomEvent('simlab_feedback', {
      detail: {
        type,
        title,
        message,
        id: 'fb-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      },
    })
  );
}

const TECHNICAL_PATTERNS = [
  /\b23505\b/i,
  /\b23503\b/i,
  /\b23502\b/i,
  /PGRST\d+/i,
  /duplicate key/i,
  /unique constraint/i,
  /foreign key/i,
  /null value/i,
  /not-null/i,
  /postgres/i,
  /supabase/i,
  /jwt/i,
  /rls/i,
  /failed to fetch/i,
  /typeerror/i,
  /referenceerror/i,
  /status code/i,
  /syntax error/i,
  /invalid syntax/i,
  /relation.*does not exist/i,
  /column.*does not exist/i,
  /networkerror/i,
];

export function friendlyError(error, fallback = 'Terjadi kendala saat memproses data. Silakan coba lagi.') {
  const raw = String(error?.message ?? error?.code ?? error ?? '');
  const lower = raw.toLowerCase();

  // 1. Masalah Jaringan / Offline
  if (/failed to fetch|fetch failed|load failed|network|timeout|offline|internet_disconnected|connection refused|aborterror/.test(lower)) {
    return 'Koneksi internet Anda terputus. Silakan periksa jaringan dan coba lagi.';
  }

  // 2. Kredensial / Login
  if (/invalid login credentials|invalid credentials|invalid_grant|email not confirmed|user not found/.test(lower)) {
    return 'Nama pengguna atau kata sandi salah. Silakan periksa kembali.';
  }

  // 3. Batas Percobaan (Rate Limit)
  if (/too many requests|rate limit/.test(lower)) {
    return 'Terlalu banyak percobaan. Tunggu beberapa menit, lalu coba lagi.';
  }

  // 4. Duplikasi Data (Postgres 23505)
  if (/23505|duplicate|already exists|unique/.test(lower)) {
    return 'Data tidak dapat disimpan karena sudah digunakan sebelumnya.';
  }

  // 5. Relasi Data Terpakai (Postgres 23503)
  if (/23503|foreign key/.test(lower)) {
    return 'Data tidak dapat dihapus karena masih dipakai pada catatan lain.';
  }

  // 6. Kolom Wajib Kosong (Postgres 23502)
  if (/23502|null value|not-null|required/.test(lower)) {
    return 'Mohon lengkapi seluruh kolom yang wajib diisi.';
  }

  // 7. Izin Akses / Sesi Kedaluwarsa
  if (/permission|rls|jwt|unauthorized|forbidden/.test(lower)) {
    return 'Sesi Anda telah kedaluwarsa atau Anda tidak memiliki akses untuk tindakan ini.';
  }

  // 8. Pola teknis lainnya yang membingungkan user -> kembalikan fallback ramah
  if (TECHNICAL_PATTERNS.some((p) => p.test(raw))) {
    return fallback;
  }

  // 9. Jika pesan error sudah dalam bahasa Indonesia yang pendek dan jelas
  if (raw && raw.length < 140 && !/\b\d{5}\b/.test(raw) && !/[a-zA-Z_]+\([a-zA-Z0-9_]+\)/.test(raw)) {
    return raw;
  }

  return fallback;
}

export const ERROR_MESSAGES = {
  kartu_nonaktif: 'Kartu ini sedang dinonaktifkan, sehingga belum bisa digunakan.',
  uid_tidak_dikenal: 'Kartu belum terdaftar. Silakan daftarkan kartu terlebih dahulu di menu Kelola Kartu.',
  sesi_tidak_ada: 'Belum ada kartu yang terdeteksi, atau waktu 20 detik telah habis. Tempelkan kartu kelas terlebih dahulu.',
  sesi_kartu_lain_aktif: 'Kartu kelas lain sedang aktif. Tunggu sesi tersebut selesai, lalu coba lagi.',
  stok_habis: 'Stok alat habis, tidak ada unit yang dapat dipinjam saat ini.',
  alat_rusak: 'Alat dalam kondisi rusak dan tidak dapat dipinjam.',
  payload_tidak_lengkap: 'Data yang dikirim belum lengkap. Silakan coba lagi.',
};

export function getErrorMessage(code) {
  if (!code) return 'Aktivitas tidak dapat diproses. Silakan coba lagi.';
  return ERROR_MESSAGES[code] ?? 'Aktivitas tidak dapat diproses. Silakan coba lagi.';
}
