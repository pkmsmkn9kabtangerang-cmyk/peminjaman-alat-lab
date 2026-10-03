// src/lib/api.js
// Wrapper untuk memanggil Supabase Edge Functions dengan JWT user otomatis

import { supabase } from './supabase';

/**
 * Memanggil Supabase Edge Function.
 * JWT user dikirim otomatis oleh supabase-js.
 *
 * @param {string} name - Nama edge function (misal: "transaksi-manual")
 * @param {object} [body] - Body JSON yang dikirim ke function (untuk POST)
 * @param {object} [options] - Opsi tambahan: { method, params, body }
 * @returns {Promise<any>} Data dari response function
 * @throws Error JSON dari function (format: { ok, error, message, request_id })
 */
export async function callFunction(name, body, options = {}) {
  const { method, params } = options;

  // Jika ada query params, buat URL manual
  let functionOptions = { body: body ?? options.body };
  if (method) functionOptions.method = method;

  if (params && Object.keys(params).length > 0) {
    const searchParams = new URLSearchParams(params).toString();
    // supabase-js tidak support query param langsung, pakai fetch manual
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

    const res = await fetch(`${supabaseUrl}/functions/v1/${name}?${searchParams}`, {
      method: method ?? 'GET',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseAnon,
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });

    const json = await res.json();
    if (!res.ok) throw json;
    return json;
  }

  const { data, error } = await supabase.functions.invoke(name, functionOptions);

  if (error) {
    // FunctionsHttpError: ambil payload JSON error dari edge function kita
    const payload = await error.context?.json?.().catch(() => null);
    throw payload ?? error;
  }

  return data;
}

/**
 * Shortcut untuk POST ke edge function rfid-tap (dipakai oleh Simulasi IoT).
 * Di production, ini dilakukan oleh firmware ESP32 (bukan frontend).
 */
export async function callRfidTap(uid, deviceId = 'web-simulator', deviceKey = 'sim-key') {
  const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnon) {
    throw new Error('Supabase belum dikonfigurasi. Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY di file .env');
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/rfid-tap`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        supabaseAnon,
      'x-device-id':   deviceId,
      'x-device-key':  deviceKey,
    },
    body: JSON.stringify({ uid }),
  });

  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`HTTP ${res.status}: respons bukan JSON. Periksa URL edge function.`);
  }

  if (!res.ok || json?.ok === false) {
    const err = new Error(json?.message || `HTTP ${res.status}`);
    err.error = json?.error;
    err.type  = json?.type;
    throw err;
  }
  return json;
}

/**
 * Shortcut untuk memanggil edge function transaksi-manual.
 */
export async function callTransaksiManual(payload) {
  const { data, error } = await supabase.functions.invoke('transaksi-manual', { body: payload });
  if (error) {
    const p = await error.context?.json?.().catch(() => null);
    throw p ?? error;
  }
  return data;
}
