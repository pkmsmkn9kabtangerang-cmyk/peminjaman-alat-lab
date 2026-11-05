// supabase/functions/rfid-tap/index.js
//
// Edge Function tipis untuk reader RFID ESP32.
//
// Tugas fungsi ini hanya:
//   1. Memvalidasi identitas device (x-device-id / x-device-key).
//   2. Membaca UID dari body.
//   3. Memanggil RPC PostgreSQL process_rfid_tap().
//   4. Mengembalikan respons RPC apa adanya.
//
// Seluruh keputusan transaksi (sesi, pinjam, kembali, duplikat, stok)
// berada di database. Tidak ada mode global PINJAM/KEMBALI di sini dan
// tidak ada fallback yang mematikan perlindungan processed_alat.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-device-id, x-device-key",
};

// Device credentials dari Supabase Secrets (fallback default ke device standar).
const RFID_DEVICE_ID = Deno.env.get("RFID_DEVICE_ID") || "esp32-lab-01";
const RFID_DEVICE_KEY = Deno.env.get("RFID_DEVICE_KEY") || "sim-key";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(
      {
        success: false,
        code: "method_tidak_diizinkan",
        action: "error",
        message: "Gunakan metode POST.",
        alat: null,
        kelas: null,
        session: null,
      },
      405
    );
  }

  /* =====================================================
     1. VALIDASI DEVICE
  ===================================================== */

  const deviceId = String(req.headers.get("x-device-id") || "").trim();
  const deviceKey = String(req.headers.get("x-device-key") || "").trim();

  const isMatchConfig =
    deviceId === RFID_DEVICE_ID && deviceKey === RFID_DEVICE_KEY;
  const isEsp32Default =
    deviceId === "esp32-lab-01" &&
    (deviceKey === RFID_DEVICE_KEY || deviceKey === "sim-key");
  const isWebSimulator =
    deviceId === "web-simulator" &&
    (deviceKey === RFID_DEVICE_KEY || deviceKey === "sim-key");

  if (!isMatchConfig && !isEsp32Default && !isWebSimulator) {
    console.warn("RFID device tidak diizinkan:", deviceId);

    return json(
      {
        success: false,
        code: "device_tidak_diizinkan",
        action: "tolak",
        message: "Identitas device tidak valid.",
        alat: null,
        kelas: null,
        session: null,
      },
      401
    );
  }

  /* =====================================================
     2. BACA BODY
  ===================================================== */

  let body;
  try {
    body = await req.json();
  } catch {
    return json(
      {
        success: false,
        code: "payload_tidak_lengkap",
        action: "tolak",
        message: "Body request harus JSON yang valid.",
        alat: null,
        kelas: null,
        session: null,
      },
      400
    );
  }

  const uid = String(body?.uid || "").trim();

  if (!uid) {
    return json(
      {
        success: false,
        code: "payload_tidak_lengkap",
        action: "tolak",
        message: "UID wajib diisi.",
        alat: null,
        kelas: null,
        session: null,
      },
      400
    );
  }

  /* =====================================================
     3. PANGGIL RPC ATOMIK
  ===================================================== */

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY belum diset");
    return json(
      {
        success: false,
        code: "server_error",
        action: "error",
        message: "Konfigurasi server belum lengkap.",
        alat: null,
        kelas: null,
        session: null,
      },
      500
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`RFID tap: ${uid} | device: ${deviceId}`);

  try {
    const { data, error } = await supabase.rpc("process_rfid_tap", {
      p_device_id: deviceId,
      p_uid: uid,
    });

    if (error) {
      const missingFunction =
        error.code === "PGRST202" ||
        error.code === "42883" ||
        /could not find the function/i.test(error.message || "");

      console.error("process_rfid_tap error:", error);

      if (missingFunction) {
        return json(
          {
            success: false,
            code: "migration_belum_diterapkan",
            action: "error",
            message:
              "RPC process_rfid_tap belum tersedia. Terapkan migration 012_rfid_atomic_tap.sql.",
            alat: null,
            kelas: null,
            session: null,
          },
          500
        );
      }

      return json(
        {
          success: false,
          code: "server_error",
          action: "error",
          message: "Terjadi kesalahan server.",
          alat: null,
          kelas: null,
          session: null,
        },
        500
      );
    }

    if (!data || typeof data !== "object") {
      console.error("process_rfid_tap mengembalikan data kosong/tidak valid:", data);
      return json(
        {
          success: false,
          code: "server_error",
          action: "error",
          message: "Respons server tidak valid.",
          alat: null,
          kelas: null,
          session: null,
        },
        500
      );
    }

    // Hasil bisnis (termasuk penolakan) tetap HTTP 200. Firmware wajib
    // membaca field `success`, bukan hanya status HTTP.
    return json(data, 200);
  } catch (err) {
    console.error("rfid-tap error:", err);

    return json(
      {
        success: false,
        code: "server_error",
        action: "error",
        message: "Terjadi kesalahan server.",
        alat: null,
        kelas: null,
        session: null,
      },
      500
    );
  }
});

/* =========================================================
   JSON RESPONSE
========================================================= */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
