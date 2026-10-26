// src/lib/networkStatus.js
// Pengelola status koneksi jaringan dan sinkronisasi pemulihan data SISPAS.
//
// Prinsip:
// 1. Perubahan browser (online/offline) langsung diteruskan ke UI.
// 2. Saat offline, aplikasi melakukan probe ringan secara berkala agar bisa
//    pulih otomatis tanpa menunggu event browser.
// 3. Status tidak pernah "tersangkut" offline: setiap kegagalan request akan
//    diikuti probe dan setiap keberhasilan request akan memulihkan status.
// 4. Saat koneksi pulih, callback sinkronisasi dipanggil sekali.

const RETRY_INTERVAL_MS = 3000;
const HEARTBEAT_INTERVAL_MS = 30000;
const PROBE_TIMEOUT_MS = 3500;
const RECONNECT_DELAY_MS = 550;
const RECONNECT_DONE_DELAY_MS = 1500;

const listeners = new Set();
const reconnectCallbacks = new Set();

let status = typeof navigator !== 'undefined' && navigator.onLine === false
  ? 'offline'
  : 'online'; // 'online' | 'offline' | 'reconnecting'

let activeProbe = null;
let retryTimer = null;
let heartbeatTimer = null;
let reconnectTimer = null;
let reconnectDoneTimer = null;
let lastProbeAt = 0;

function hasWindow() {
  return typeof window !== 'undefined';
}

function isBrowserOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

function getProbeUrls() {
  const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL;

  if (typeof supabaseUrl === 'string' &&
    supabaseUrl.startsWith('https://')) {
    return [
      `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/health?_=${Date.now()}`
    ];
  }

  if (hasWindow()) {
    return [`${window.location.origin}/?netprobe=${Date.now()}`];
  }

  return [];
}

async function fetchProbe(url) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    PROBE_TIMEOUT_MS
  );

  try {
    const supabaseUrl = String(
      import.meta.env?.VITE_SUPABASE_URL ?? ''
    ).replace(/\/+$/, '');

    const anonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY;

    const isSupabaseProbe =
      supabaseUrl &&
      url.startsWith(`${supabaseUrl}/auth/v1/health`);

    if (isSupabaseProbe && !anonKey) {
      return false;
    }

    const response = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow',
      ...(isSupabaseProbe
        ? { headers: { apikey: anonKey } }
        : {}),
      signal: controller.signal,
    });

    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

// Cek koneksi lewat endpoint ringan. Jika endpoint utama gagal (mis. diblokir
// jaringan sekolah), endpoint cadangan (origin aplikasi) tetap dicoba.
async function runProbe() {
  const urls = getProbeUrls();
  if (urls.length === 0) return true;

  for (const url of urls) {
    // Abaikan hasil request lama bila browser sudah menyatakan offline.
    if (!isBrowserOnline()) return false;
    const ok = await fetchProbe(url);
    if (ok) return true;
  }

  return false;
}

function notifyListeners() {
  const online = status !== 'offline';
  const reconnecting = status === 'reconnecting';

  listeners.forEach((fn) => {
    try {
      fn(online, reconnecting, status);
    } catch {
      /* noop */
    }
  });
}

function clearRetryTimer() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function clearHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function clearReconnectTimers() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (reconnectDoneTimer) {
    clearTimeout(reconnectDoneTimer);
    reconnectDoneTimer = null;
  }
}

function startHeartbeat() {
  if (!hasWindow() || heartbeatTimer) return;

  heartbeatTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.hidden) return;
    probeNow();
  }, HEARTBEAT_INTERVAL_MS);
}

function scheduleRetry(delay = RETRY_INTERVAL_MS) {
  if (!hasWindow()) return;
  clearRetryTimer();
  clearHeartbeat();
  retryTimer = setTimeout(() => {
    retryTimer = null;
    probeNow();
  }, delay);
}

function setOffline({ notify = true } = {}) {
  clearRetryTimer();
  clearReconnectTimers();
  clearHeartbeat();

  const changed = status !== 'offline';
  status = 'offline';

  if (changed && notify) notifyListeners();
  scheduleRetry();
}

function finishReconnect() {
  if (status === 'offline') return;
  status = 'online';
  notifyListeners();
  startHeartbeat();
}

function markOnline() {
  clearRetryTimer();
  clearHeartbeat();

  if (status === 'offline') {
    status = 'reconnecting';
    notifyListeners();

    clearReconnectTimers();
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (status === 'offline') return;

      reconnectCallbacks.forEach((cb) => {
        try {
          cb();
        } catch (err) {
          console.warn('[NetworkSync] error executing reconnect callback:', err);
        }
      });

      reconnectDoneTimer = setTimeout(() => {
        reconnectDoneTimer = null;
        finishReconnect();
      }, RECONNECT_DONE_DELAY_MS);
    }, RECONNECT_DELAY_MS);
    return;
  }

  if (status === 'reconnecting') {
    // Sudah dalam proses sinkronisasi; biarkan timer yang menyelesaikan.
    return;
  }

  status = 'online';
  startHeartbeat();
}

/**
 * Probe koneksi sekarang. Bisa dipanggil dari tombol "Coba lagi".
 */
export async function checkConnectionNow() {
  return probeNow();
}

async function probeNow() {
  if (!hasWindow()) return status !== 'offline';

  // Browser sudah pasti offline: tidak perlu request (menghindari log error).
  if (!isBrowserOnline()) {
    setOffline();
    return false;
  }

  if (activeProbe) return activeProbe;

  activeProbe = runProbe()
    .then((ok) => {
      lastProbeAt = Date.now();
      if (ok && isBrowserOnline()) {
        markOnline();
      } else {
        setOffline();
      }
      return ok && isBrowserOnline();
    })
    .catch(() => {
      setOffline();
      return false;
    })
    .finally(() => {
      activeProbe = null;
    });

  return activeProbe;
}

// Cek apakah browser sedang memiliki koneksi internet.
export function isOnline() {
  return status !== 'offline';
}

export function isReconnecting() {
  return status === 'reconnecting';
}

export function getNetworkState() {
  return status;
}

export function getLastProbeAt() {
  return lastProbeAt;
}

// Cek apakah suatu error disebabkan oleh koneksi jaringan yang terputus / offline.
export function isNetworkError(err) {
  if (!err) return false;
  if (!isBrowserOnline() || status === 'offline') return true;

  const str = String(
    err?.message ?? err?.code ?? err?.error_description ?? err ?? ''
  ).toLowerCase();

  return (
    str.includes('failed to fetch') ||
    str.includes('fetch failed') ||
    str.includes('load failed') ||
    str.includes('networkerror') ||
    str.includes('network error') ||
    str.includes('network request failed') ||
    str.includes('network-request-failed') ||
    str.includes('internet') ||
    str.includes('offline') ||
    str.includes('aborterror') ||
    str.includes('timeout') ||
    str.includes('timed out') ||
    str.includes('connection refused') ||
    str.includes('connection reset') ||
    str.includes('connection closed') ||
    str.includes('koneksi') ||
    str.includes('err_internet_disconnected') ||
    str.includes('err_name_not_resolved') ||
    str.includes('err_connection') ||
    str.includes('err_timed_out') ||
    str.includes('err_network') ||
    str.includes('net::') ||
    str.includes('econnrefused') ||
    str.includes('econnreset') ||
    str.includes('enotfound') ||
    str.includes('etimedout') ||
    str.includes('socket hang up')
  );
}

// Lapor bahwa ada request yang gagal akibat masalah jaringan.
// Banner langsung tampil, lalu probe otomatis menentukan apakah koneksi
// benar-benar pulih (tidak akan tersangkut offline).
export function reportNetworkError() {
  if (!hasWindow()) return;

  const changed = status !== 'offline';
  clearReconnectTimers();
  status = 'offline';

  if (changed) notifyListeners();
  scheduleRetry(700);
}

// Lapor bahwa request jaringan berhasil. Keberhasilan request adalah bukti
// koneksi hidup, jadi status langsung dipulihkan.
export function reportNetworkSuccess() {
  if (!hasWindow() || status === 'online') return;
  markOnline();
}

/**
 * Daftarkan fungsi sinkronisasi yang akan dipanggil SEKALI ketika koneksi
 * pulih kembali. Mengembalikan fungsi cleanup untuk unregister.
 */
export function registerOnlineSync(callback) {
  if (typeof callback !== 'function') return () => { };
  reconnectCallbacks.add(callback);
  return () => {
    reconnectCallbacks.delete(callback);
  };
}

/**
 * Subscription perubahan status jaringan.
 * callback(online, reconnecting, status)
 */
export function subscribeNetworkStatus(callback) {
  if (typeof callback !== 'function') return () => { };

  listeners.add(callback);
  callback(status !== 'offline', status === 'reconnecting', status);

  return () => {
    listeners.delete(callback);
  };
}

/**
 * Eksekutor fetch yang aman:
 * Jika offline, fetch tidak dijalankan sehingga menghindari log
 * net::ERR_INTERNET_DISCONNECTED.
 */
export async function safeFetch(fetchFn, fallbackData = null) {
  if (!isOnline()) return fallbackData;

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

// ── Inisialisasi listener browser global ──────────────────────
if (hasWindow()) {
  window.addEventListener('online', () => {
    console.info('[Network] Perangkat melaporkan internet tersambung. Memverifikasi...');
    probeNow();
  });

  window.addEventListener('offline', () => {
    console.warn('[Network] Internet terputus. Beralih ke mode offline.');
    setOffline();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;

    const stale = Date.now() - lastProbeAt > 15000;
    if (status === 'offline' || stale) probeNow();
  });

  if (status === 'offline') {
    scheduleRetry(1200);
  } else {
    startHeartbeat();
    // Verifikasi awal setelah aplikasi selesai dimuat. Ini menangani kasus
    // navigator.onLine bernilai true tetapi internet sebenarnya mati.
    setTimeout(() => probeNow(), 700);
  }
}
