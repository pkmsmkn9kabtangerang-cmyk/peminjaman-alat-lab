// Umpan balik UI: toast ringkas + pesan error yang bisa dibaca staf sekolah

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
];

export function friendlyError(error, fallback = 'Data gagal disimpan. Silakan coba lagi.') {
  const raw = String(error?.message ?? error?.code ?? error ?? '');
  const lower = raw.toLowerCase();

  if (/23505|duplicate|already exists|unique/.test(lower)) {
    return 'Data tidak dapat disimpan karena sudah digunakan.';
  }
  if (/23503|foreign key/.test(lower)) {
    return 'Data tidak dapat dihapus karena masih dipakai di catatan lain.';
  }
  if (/23502|null value|not-null|required/.test(lower)) {
    return 'Masih ada kolom wajib yang belum diisi.';
  }
  if (/permission|rls|jwt|unauthorized|forbidden/.test(lower)) {
    return 'Anda tidak memiliki izin untuk melakukan tindakan ini.';
  }
  if (/failed to fetch|network|timeout|offline/.test(lower)) {
    return 'Koneksi terputus. Periksa jaringan, lalu coba lagi.';
  }
  if (TECHNICAL_PATTERNS.some((p) => p.test(raw))) {
    return fallback;
  }
  if (raw && raw.length < 140 && !/\b\d{5}\b/.test(raw)) {
    return raw;
  }
  return fallback;
}

export const ERROR_MESSAGES = {
  kartu_nonaktif: 'Kartu ini sedang diblokir, jadi belum bisa dipakai.',
  uid_tidak_dikenal: 'Kartu belum terdaftar. Daftarkan kartu di menu Kartu RFID.',
  sesi_tidak_ada: 'Belum ada kartu yang dibaca, atau waktu 20 detik sudah habis. Tempelkan kartu kelas terlebih dahulu.',
  sesi_kartu_lain_aktif: 'Kartu kelas lain sedang dipakai. Tunggu sesi itu selesai, lalu coba lagi.',
  stok_habis: 'Stok alat habis, tidak ada unit yang bisa dipinjam.',
  alat_rusak: 'Alat dalam kondisi rusak dan tidak bisa dipinjam.',
  payload_tidak_lengkap: 'Data yang dikirim belum lengkap. Silakan coba lagi.',
};

export function getErrorMessage(code) {
  if (!code) return 'Aktivitas tidak dapat diproses. Silakan coba lagi.';
  return ERROR_MESSAGES[code] ?? 'Aktivitas tidak dapat diproses. Silakan coba lagi.';
}
