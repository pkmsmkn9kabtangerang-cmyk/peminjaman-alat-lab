// src/lib/tapCapture.js
// Penanda global saat pengguna sedang berada di dalam form yang membaca tap RFID.
// Selama penanda aktif, toast notifikasi tap global ditahan agar umpan balik
// hanya muncul di dalam form (mis. form daftar kartu / tambah alat).

let captureCount = 0;
const listeners = new Set();

function emit() {
  const active = captureCount > 0;
  listeners.forEach((listener) => {
    try {
      listener(active);
    } catch {
      // abaikan error listener agar tidak mengganggu alur tap
    }
  });
}

export function beginTapCapture() {
  captureCount += 1;
  emit();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    captureCount = Math.max(0, captureCount - 1);
    emit();
  };
}

export function isTapCaptureActive() {
  return captureCount > 0;
}

export function subscribeTapCapture(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
