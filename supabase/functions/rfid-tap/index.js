// supabase/functions/rfid-tap/index.js

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-device-id, x-device-key",
};

const SESSION_DURATION_MS = 20 * 1000;

// Device credentials dari Supabase Secrets
const RFID_DEVICE_ID = Deno.env.get("RFID_DEVICE_ID");
const RFID_DEVICE_KEY = Deno.env.get("RFID_DEVICE_KEY");

// Session sementara RFID
const kartuSessions = new Map();

/* =========================================================
   SESSION
========================================================= */

function getSession(uid) {
  const session = kartuSessions.get(uid);

  if (!session) return null;

  if (new Date() > new Date(session.expires)) {
    kartuSessions.delete(uid);
    return null;
  }

  return session;
}

function setSession(uid, jenis, kelas = "") {
  const expires = new Date(Date.now() + SESSION_DURATION_MS);

  kartuSessions.set(uid, {
    uid_kartu: uid,
    jenis,
    kelas,
    expires,
  });
}

function extendSession(uid) {
  const session = kartuSessions.get(uid);

  if (session) {
    session.expires = new Date(Date.now() + SESSION_DURATION_MS);
  }
}

function clearSession(uid) {
  kartuSessions.delete(uid);
}

function getActiveSessions() {
  const now = new Date();

  for (const [uid, session] of kartuSessions.entries()) {
    if (new Date(session.expires) <= now) {
      kartuSessions.delete(uid);
    }
  }

  return [...kartuSessions.values()];
}

/* =========================================================
   MAIN
========================================================= */

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    /* =====================================================
       1. VALIDASI DEVICE ESP32
    ===================================================== */

    const deviceId = req.headers.get("x-device-id");
    const deviceKey = req.headers.get("x-device-key");

    if (!RFID_DEVICE_ID || !RFID_DEVICE_KEY) {
      console.error("RFID_DEVICE_ID / RFID_DEVICE_KEY belum dikonfigurasi");

      return json(
        {
          ok: false,
          error: "device_config_error",
        },
        500
      );
    }

    if (
      deviceId !== RFID_DEVICE_ID ||
      deviceKey !== RFID_DEVICE_KEY
    ) {
      console.warn("RFID device tidak diizinkan:", deviceId);

      return json(
        {
          ok: false,
          error: "device_tidak_diizinkan",
        },
        401
      );
    }

    /* =====================================================
       2. SUPABASE ADMIN CLIENT
    ===================================================== */

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    );

    /* =====================================================
       3. BACA BODY
    ===================================================== */

    const body = await req.json();
    const uid = String(body?.uid || "").trim();

    if (!uid) {
      return json(
        {
          ok: false,
          error: "payload_tidak_lengkap",
        },
        400
      );
    }

    console.log(`RFID tap: ${uid} | device: ${deviceId}`);

    /* =====================================================
       4. CEK APAKAH UID ADALAH KARTU
    ===================================================== */

    const { data: kartu, error: kartuError } = await supabase
      .from("kartu_rfid")
      .select("*")
      .eq("uid_kartu", uid)
      .maybeSingle();

    if (kartuError) {
      throw kartuError;
    }

    /* =====================================================
       5. JIKA UID = KARTU
    ===================================================== */

    if (kartu) {
      // Kartu nonaktif
      if (!kartu.aktif) {
        await addTapLog(
          supabase,
          uid,
          null,
          "kartu",
          "otomatis",
          "ditolak",
          "kartu_nonaktif",
          kartu.kelas,
          null
        );

        return json({
          ok: false,
          error: "kartu_nonaktif",
          type: "kartu",
        });
      }

      const activeSessions = getActiveSessions();

      const currentSession =
        activeSessions.length > 0
          ? activeSessions[0]
          : null;

      /* ===================================================
         KARTU YANG SAMA → SELESAIKAN SESSION
      =================================================== */

      if (currentSession) {
        if (currentSession.uid_kartu === uid) {
          clearSession(uid);

          await addTapLog(
            supabase,
            uid,
            null,
            "kartu",
            "otomatis",
            "berhasil",
            null,
            kartu.kelas,
            null
          );

          return json({
            ok: true,
            type: "kartu",
            action: "selesai",
            jenis: "selesai",
            kelas: kartu.kelas,
            message: `Sesi ${kartu.kelas} selesai.`,
          });
        }

        /* ===============================================
           KARTU LAIN SAAT SESSION MASIH AKTIF
        =============================================== */

        await addTapLog(
          supabase,
          uid,
          null,
          "kartu",
          "otomatis",
          "ditolak",
          "sesi_kartu_lain_aktif",
          kartu.kelas,
          null
        );

        return json({
          ok: false,
          error: "sesi_kartu_lain_aktif",
          type: "kartu",
          activeCard: currentSession,
          message:
            `Sesi ${currentSession.kelas || currentSession.uid_kartu} sedang aktif!`,
        });
      }

      /* ===================================================
         CEK APAKAH KARTU PUNYA TRANSAKSI AKTIF
      =================================================== */

      const {
        data: transaksiAktif,
        error: transaksiError,
      } = await supabase
        .from("transaksi")
        .select("id")
        .eq("uid_kartu", uid)
        .eq("status", "dipinjam")
        .limit(1);

      if (transaksiError) {
        throw transaksiError;
      }

      const jenis =
        transaksiAktif && transaksiAktif.length > 0
          ? "kembali"
          : "pinjam";

      setSession(uid, jenis, kartu.kelas);

      await addTapLog(
        supabase,
        uid,
        null,
        "kartu",
        "otomatis",
        "berhasil",
        null,
        kartu.kelas,
        null
      );

      return json({
        ok: true,
        type: "kartu",
        action: "mulai",
        jenis,
        kelas: kartu.kelas,
      });
    }

    /* =====================================================
       6. UID BUKAN KARTU → CEK ALAT
       
       IMPORTANT:
       alat.kode = UID RFID alat
       
       Tidak menggunakan uid_rfid.
    ===================================================== */

    const {
      data: alat,
      error: alatError,
    } = await supabase
      .from("v_list_barang")
      .select("*")
      .eq("kode", uid)
      .maybeSingle();

    if (alatError) {
      throw alatError;
    }

    /* =====================================================
       7. UID TIDAK DIKENAL
    ===================================================== */

    if (!alat) {
      await addTapLog(
        supabase,
        null,
        uid,
        "alat",
        "otomatis",
        "ditolak",
        "uid_tidak_dikenal",
        null,
        null
      );

      return json({
        ok: false,
        error: "uid_tidak_dikenal",
        type: "alat",
      });
    }

    /* =====================================================
       8. CEK SESSION KARTU
    ===================================================== */

    const activeSessions = getActiveSessions();

    if (activeSessions.length === 0) {
      await addTapLog(
        supabase,
        null,
        uid,
        "alat",
        "otomatis",
        "ditolak",
        "sesi_tidak_ada",
        null,
        alat.nama
      );

      return json({
        ok: false,
        error: "sesi_tidak_ada",
        type: "alat",
      });
    }

    const sess = activeSessions[0];

    /* =====================================================
       9. AMBIL KELAS KARTU
    ===================================================== */

    const {
      data: kartuData,
      error: kartuDataError,
    } = await supabase
      .from("kartu_rfid")
      .select("kelas")
      .eq("uid_kartu", sess.uid_kartu)
      .maybeSingle();

    if (kartuDataError) {
      throw kartuDataError;
    }

    const kelas =
      kartuData?.kelas ??
      sess.kelas ??
      "";

    /* =====================================================
       10. CEK TRANSAKSI ALAT + KARTU
    ===================================================== */

    const {
      data: activeTrx,
      error: activeTrxError,
    } = await supabase
      .from("transaksi")
      .select("id")
      .eq("uid_kartu", sess.uid_kartu)
      .eq("alat_id", alat.id)
      .eq("status", "dipinjam")
      .maybeSingle();

    if (activeTrxError) {
      throw activeTrxError;
    }

    /* =====================================================
       11. JIKA SUDAH DIPINJAM → KEMBALIKAN
    ===================================================== */

    if (activeTrx) {
      const {
        error: updateError,
      } = await supabase
        .from("transaksi")
        .update({
          status: "dikembalikan",
          waktu_kembali: new Date().toISOString(),
        })
        .eq("id", activeTrx.id);

      if (updateError) {
        throw updateError;
      }

      extendSession(sess.uid_kartu);

      await addTapLog(
        supabase,
        sess.uid_kartu,
        uid,
        "kembali",
        "otomatis",
        "berhasil",
        null,
        kelas,
        alat.nama
      );

      return json({
        ok: true,
        type: "alat",
        jenis: "kembali",
        alat: alat.nama,
        kelas,
      });
    }

    /* =====================================================
       12. BELUM DIPINJAM → CEK STOK
    ===================================================== */

    if (alat.stok_tersedia <= 0) {
      await addTapLog(
        supabase,
        sess.uid_kartu,
        uid,
        "alat",
        "otomatis",
        "ditolak",
        "stok_habis",
        kelas,
        alat.nama
      );

      return json({
        ok: false,
        error: "stok_habis",
        type: "alat",
      });
    }

    /* =====================================================
       13. BUAT TRANSAKSI PEMINJAMAN
    ===================================================== */

    const trxId =
      "TRX-" +
      Date.now() +
      "-" +
      Math.random().toString(36).slice(2, 6);

    const {
      error: insertError,
    } = await supabase
      .from("transaksi")
      .insert({
        id: trxId,
        uid_kartu: sess.uid_kartu,
        kelas,
        alat_id: alat.id,
        nama_alat: alat.nama,
        status: "dipinjam",
        sumber: "otomatis",
        kondisi_pinjam: "baik",
        waktu_pinjam: new Date().toISOString(),
      });

    if (insertError) {
      throw insertError;
    }

    /* =====================================================
       14. PERPANJANG SESSION
    ===================================================== */

    extendSession(sess.uid_kartu);

    /* =====================================================
       15. LOG BERHASIL
    ===================================================== */

    await addTapLog(
      supabase,
      sess.uid_kartu,
      uid,
      "pinjam",
      "otomatis",
      "berhasil",
      null,
      kelas,
      alat.nama
    );

    /* =====================================================
       16. RESPONSE KE ESP32
    ===================================================== */

    return json({
      ok: true,
      type: "alat",
      jenis: "pinjam",
      alat: alat.nama,
      kelas,
    });

  } catch (err) {
    console.error("rfid-tap error:", err);

    return json(
      {
        ok: false,
        error: "server_error",
        message: err?.message || "Terjadi kesalahan server",
      },
      500
    );
  }
});

/* =========================================================
   TAP LOG
========================================================= */

async function addTapLog(
  supabase,
  uid_kartu,
  uid_alat,
  jenis_tap,
  jenis_terdeteksi,
  status,
  error_code,
  kelas,
  nama_alat
) {
  const { error } = await supabase
    .from("tap_log")
    .insert({
      id:
        "LOG-" +
        Date.now() +
        "-" +
        Math.random().toString(36).slice(2, 6),

      uid_kartu,
      uid_alat,
      jenis_tap,
      jenis_terdeteksi,
      kelas,
      nama_alat,
      status,
      error_code,
      is_read: false,
      waktu_tap: new Date().toISOString(),
    });

  if (error) {
    console.error("tap_log error:", error);
  }
}

/* =========================================================
   JSON RESPONSE
========================================================= */

function json(data, status = 200) {
  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
      },
    }
  );
}