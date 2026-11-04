// src/lib/manual.js
// Helper bersama untuk transaksi manual agar notifikasi sukses selalu konsisten.

import { showFeedback } from './feedback';

export const MANUAL_SUCCESS_TITLE = 'Transaksi berhasil dicatat';

export function isManualSuccess(result) {
  return result?.ok === true || result?.success === true;
}

export function showManualSuccess(message) {
  showFeedback({
    type: 'success',
    title: MANUAL_SUCCESS_TITLE,
    message: `${message} Data sudah masuk ke Riwayat Transaksi.`,
    actionLabel: 'Lihat Riwayat',
    actionPath: '/riwayat',
    duration: 6500,
  });
}

// Navigasi SPA ke Riwayat Transaksi tanpa reload halaman.
export function openRiwayat() {
  try {
    window.history.pushState(null, '', '/riwayat');
    window.dispatchEvent(new PopStateEvent('popstate'));
  } catch {
    window.location.href = '/riwayat';
  }
}
