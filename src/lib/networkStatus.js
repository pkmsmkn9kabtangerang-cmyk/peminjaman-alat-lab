// src/lib/networkStatus.js
// Pengelola status koneksi jaringan dan sinkronisasi pemulihan data SISPAS

let onlineListeners = new Set();
let offlineListeners = new Set();
let reconnectCallbacks = new Set();
let isReconnectingTimeout = null;
let isReconnecting = false;

// Cek apakah browser sedang memiliki koneksi internet
export function isOnline() {
  return typeof navigator !== 'undefined' ? Boolean(navigator.onLine) : true;
}

// Cek apakah suatu error disebabkan oleh koneksi jaringan yang terputus / offline
export function isNetworkError(err) {
  if (!err) return false;
  if (!isOnline()) return true;
  const str = String(err?.message ?? err?.code ?? err ?? '').toLowerCase();
  return (
    str.includes('Koneksi kamu bermasalah') ||
    str.includes('network') ||
    str.includes('internet_disconnected') ||
    str.includes('aborterror') ||
    str.includes('timeout') ||
    str.includes('offline') ||
    str.includes('connection refused')
  );
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

function notifyListeners() {
  const online = isOnline();
  const listeners = online ? onlineListeners : offlineListeners;
  listeners.forEach((fn) => {
    try {
      fn(online, isReconnecting);
    } catch (_) { /* noop */ }
  });
}

// Inisialisasi event listener browser global
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.info('[Network] Internet terhubung kembali.');
    triggerReconnectSync();
  });

  window.addEventListener('offline', () => {
    console.warn('[Network] Internet terputus. Beralih ke mode offline.');
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
  onlineListeners.add(callback);
  offlineListeners.add(callback);
  // Panggil langsung status saat ini
  callback(isOnline(), isReconnecting);
  return () => {
    onlineListeners.delete(callback);
    offlineListeners.delete(callback);
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
    return await fetchFn();
  } catch (err) {
    if (isNetworkError(err)) {
      // Tangani error jaringan secara senyap tanpa merusak state data
      return fallbackData;
    }
    throw err;
  }
}
