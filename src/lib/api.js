// src/lib/api.js
// Wrapper untuk memanggil Supabase Edge Functions dengan JWT user otomatis

import { supabase } from './supabase';

/**
 * Memanggil Supabase Edge Function.
 * JWT user dikirim otomatis oleh supabase-js.
 *
 * @param {string} name - Nama edge function (misal: "transaksi-manual")
 * @param {object} body - Body JSON yang dikirim ke function
 * @returns {Promise<any>} Data dari response function
 * @throws Error JSON dari function (format: { ok, error, message, request_id })
 */
export async function callFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });

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

  const json = await res.json();
  if (!json.ok) throw json;
  return json;
}
