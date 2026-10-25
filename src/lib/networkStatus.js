// src/lib/networkStatus.js
// Pengelola status koneksi jaringan dan sinkronisasi pemulihan data SISPAS

let manualOffline = false;
let isReconnecting = false;
let isReconnectingTimeout = null;
const listeners = new Set();
const reconnectCallbacks = new Set();

// Cek apakah browser sedang memiliki koneksi internet
export function isOnline() {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return false;
  }
  return !manualOffline;
}

// Cek apakah suatu error disebabkan oleh koneksi jaringan yang terputus / offline
export function isNetworkError(err) {
  if (!err) return false;
  if (!isOnline()) return true;
  const str = String(err?.message ?? err?.code ?? err?.error_description ?? err ?? '').toLowerCase();
  return (
    str.includes('failed to fetch') ||
    str.includes('fetch failed') ||
    str.includes('load failed') ||
    str.includes('network') ||
    str.includes('internet') ||
    str.includes('aborterror') ||
    str.includes('timeout') ||
    str.includes('offline') ||
    str.includes('connection refused') ||
    str.includes('koneksi') ||
    str.includes('err_') ||
    str.includes('net::')
  );
}

// Lapor manual jika ada request yang gagal akibat masalah jaringan
export function reportNetworkError() {
  if (!manualOffline) {
    manualOffline = true;
    notifyListeners();
  }
}

// Lapor manual jika request jaringan berhasil kembali
export function reportNetworkSuccess() {
  if (manualOffline) {
    manualOffline = false;
    notifyListeners();
  }
}

function notifyListeners() {
  const online = isOnline();
  listeners.forEach((fn) => {
    try {
      fn(online, isReconnecting);
    } catch (_) { /* noop */ }
  });
}

// Trigger semua callback sinkronisasi saat koneksi pulih kembali
function triggerReconnectSync() {
  if (!isOnline()) return;
  isReconnecting = true;
  notifyListeners();

  // Berikan jeda 400ms agar socket & koneksi DNS stabil sebelum request
  if (isReconnectingTimeout) clearTimeout(isReconnectingTimeout);
  isReconnectingTimeout = setTimeout(() => {
    reconnectCallbacks.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.warn('[NetworkSync] error executing reconnect callback:', e);
      }
    });

    // Tandai sinkronisasi selesai setelah request dikirim
    setTimeout(() => {
      isReconnecting = false;
      notifyListeners();
    }, 1200);
  }, 400);
}

// Inisialisasi event listener browser global
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.info('[Network] Internet terhubung kembali.');
    manualOffline = false;
    triggerReconnectSync();
  });

  window.addEventListener('offline', () => {
    console.warn('[Network] Internet terputus. Beralih ke mode offline.');
    manualOffline = true;
    isReconnecting = false;
    notifyListeners();
  });
}

/**
 * Daftarkan fungsi sinkronisasi yang akan dipanggil SEKALI ketika koneksi pulih kembali.
 * Mengembalikan fungsi cleanup untuk unregister.
 */
export function registerOnlineSync(callback) {
  if (typeof callback !== 'function') return () => { };
  reconnectCallbacks.add(callback);
  return () => {
    reconnectCallbacks.delete(callback);
  };
}

/**
 * Hook atau subscription untuk mendengarkan perubahan status jaringan
 */
export function subscribeNetworkStatus(callback) {
  if (typeof callback !== 'function') return () => { };
  listeners.add(callback);
  // Panggil langsung status saat ini
  callback(isOnline(), isReconnecting);
  return () => {
    listeners.delete(callback);
  };
}

/**
 * Eksekutor fetch yang aman:
 * Jika offline, fungsi fetch tidak akan dijalankan sehingga menghindari log net::ERR_INTERNET_DISCONNECTED.
 */
export async function safeFetch(fetchFn, fallbackData = null) {
  if (!isOnline()) {
    return fallbackData;
  }
  try {
    const result = await fetchFn();
    reportNetworkSuccess();
    return result;
  } catch (err) {
    if (isNetworkError(err)) {
      reportNetworkError();
      return fallbackData;
    }
    throw err;
  }
}
