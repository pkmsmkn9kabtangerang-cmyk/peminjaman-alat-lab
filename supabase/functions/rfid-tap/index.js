// supabase/functions/rfid-tap/index.js

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-device-id, x-device-key",
};

const SESSION_DURATION_MS = 10 * 1000;

// Device credentials dari Supabase Secrets (fallback default ke device standar & sim-key)
const RFID_DEVICE_ID = Deno.env.get("RFID_DEVICE_ID") || "esp32-lab-01";
const RFID_DEVICE_KEY = Deno.env.get("RFID_DEVICE_KEY") || "sim-key";

/* =========================================================
   SESSION PERSISTEN DATABASE (rfid_session)
========================================================= */

async function getActiveSession(supabase, deviceId) {
  const { data, error } = await supabase
    .from("rfid_session")
    .select("*")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) {
    console.error("getActiveSession error:", error);
    throw error;
  }

  if (!data) return null;

  const now = new Date();
  if (now > new Date(data.expires_at)) {
    // Sesi kedaluwarsa, bersihkan dari database
    const { error: delError } = await supabase
      .from("rfid_session")
      .delete()
      .eq("device_id", deviceId);

    if (delError) {
      console.error("clear expired session error:", delError);
    }
    return null;
  }

  return data;
}

async function setSession(supabase, deviceId, uid_kartu, jenis, kelas = "") {
  const expires_at = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  const updated_at = new Date().toISOString();

  const payload = {
    device_id: deviceId,
    uid_kartu,
    kelas,
    jenis,
    // Sesi baru selalu mulai tanpa riwayat tap alat.
    processed_alat: [],
    expires_at,
    updated_at,
  };

  const { error } = await supabase
    .from("rfid_session")
    .upsert(payload, { onConflict: "device_id" });

  if (!error) return;

  // Migration 009 belum dijalankan: sesi tetap harus bisa dimulai.
  if (error.code === "42703" || /processed_alat/i.test(error.message || "")) {
    console.warn("processed_alat belum tersedia, jalankan migration 009:", error.message);
    delete payload.processed_alat;
    const { error: retryError } = await supabase
      .from("rfid_session")
      .upsert(payload, { onConflict: "device_id" });
    if (!retryError) return;
    console.error("setSession retry error:", retryError);
    throw retryError;
  }

  console.error("setSession error:", error);
  throw error;
}

async function extendSession(supabase, deviceId) {
  const expires_at = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  const updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("rfid_session")
    .update({
      expires_at,
      updated_at,
    })
    .eq("device_id", deviceId);

  if (error) {
    console.error("extendSession error:", error);
    throw error;
  }
}

// Catat UID alat yang sudah diproses pada sesi aktif + perpanjang 10 detik.
// UID yang sama tidak boleh diproses dua kali sampai sesi baru dimulai.
async function markToolProcessed(supabase, deviceId, uidAlat, processed) {
  const list = Array.isArray(processed)
    ? processed.filter((item) => typeof item === "string" && item.length > 0)
    : [];

  if (!list.includes(uidAlat)) list.push(uidAlat);

  const expires_at = new Date(Date.now() + SESSION_DURATION_MS).toISOString();
  const updated_at = new Date().toISOString();

  const { error } = await supabase
    .from("rfid_session")
    .update({
      processed_alat: list,
      expires_at,
      updated_at,
    })
    .eq("device_id", deviceId);

  if (!error) return;

  // Migration 009 belum dijalankan: jangan gagalkan tap yang sudah tercatat.
  // Sesi tetap diperpanjang, anti-duplikat aktif setelah migration diterapkan.
  if (error.code === "42703" || /processed_alat/i.test(error.message || "")) {
    console.warn("processed_alat belum tersedia, jalankan migration 009:", error.message);
    await extendSession(supabase, deviceId);
    return;
  }

  console.error("markToolProcessed error:", error);
  throw error;
}

async function clearSession(supabase, deviceId) {
  const { error } = await supabase
    .from("rfid_session")
    .delete()
    .eq("device_id", deviceId);

  if (error) {
    console.error("clearSession error:", error);
    throw error;
  }
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

    const isMatchConfig = (deviceId === RFID_DEVICE_ID && deviceKey === RFID_DEVICE_KEY);
    const isEsp32Default = (deviceId === "esp32-lab-01" && (deviceKey === RFID_DEVICE_KEY || deviceKey === "sim-key"));
    const isWebSimulator = (deviceId === "web-simulator" && (deviceKey === RFID_DEVICE_KEY || deviceKey === "sim-key"));

    if (!isMatchConfig && !isEsp32Default && !isWebSimulator) {
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

      const currentSession = await getActiveSession(supabase, deviceId);

      /* ===================================================
         KARTU YANG SAMA → SELESAIKAN SESSION
      =================================================== */

      if (currentSession) {
        if (currentSession.uid_kartu === uid) {
          await clearSession(supabase, deviceId);

          await addTapLog(
            supabase,
            uid,
            null,
            "selesai",
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
            nama_pemegang: kartu.nama_pemegang ?? "",
            message: `Sesi ${kartu.nama_pemegang || kartu.kelas} selesai.`,
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

        const { data: activeCard } = await supabase
          .from("kartu_rfid")
          .select("nama_pemegang")
          .eq("uid_kartu", currentSession.uid_kartu)
          .maybeSingle();

        const activeName =
          activeCard?.nama_pemegang ||
          currentSession.kelas ||
          currentSession.uid_kartu;

        return json({
          ok: false,
          error: "sesi_kartu_lain_aktif",
          type: "kartu",
          activeCard: {
            ...currentSession,
            nama_pemegang: activeCard?.nama_pemegang ?? "",
          },
          message: `Sesi ${activeName} sedang aktif!`,
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

      await setSession(supabase, deviceId, uid, jenis, kartu.kelas);

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
        nama_pemegang: kartu.nama_pemegang ?? "",
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

    const sess = await getActiveSession(supabase, deviceId);

    if (!sess) {
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
       10. CEK ALAT HABIS PAKAI
    ===================================================== */

    if (alat.tipe === "habis_pakai") {
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

      const { data: existingReq, error: reqErr } = await supabase
        .from("permintaan_habis_pakai")
        .select("id")
        .eq("uid_kartu", sess.uid_kartu)
        .eq("alat_id", alat.id)
        .eq("status", "menunggu")
        .maybeSingle();

      if (reqErr) {
        throw reqErr;
      }

      if (existingReq) {
        await addTapLog(
          supabase,
          sess.uid_kartu,
          uid,
          "alat",
          "otomatis",
          "ditolak",
          "permintaan_sudah_ada",
          kelas,
          alat.nama
        );

        return json({
          ok: false,
          error: "permintaan_sudah_ada",
          type: "alat",
        });
      }

      const { error: insertReqErr } = await supabase
        .from("permintaan_habis_pakai")
        .insert({
          uid_kartu: sess.uid_kartu,
          kelas,
          alat_id: alat.id,
          nama_alat: alat.nama,
          satuan: alat.satuan,
          status: "menunggu",
        });

      if (insertReqErr) {
        if (insertReqErr.code === '23505') {
          await addTapLog(
            supabase,
            sess.uid_kartu,
            uid,
            "alat",
            "otomatis",
            "ditolak",
            "permintaan_sudah_ada",
            kelas,
            alat.nama
          );

          return json({
            ok: false,
            error: "permintaan_sudah_ada",
            type: "alat",
          });
        }
        throw insertReqErr;
      }

      await extendSession(supabase, deviceId);

      await addTapLog(
        supabase,
        sess.uid_kartu,
        uid,
        "alat",
        "otomatis",
        "menunggu",
        null,
        kelas,
        alat.nama
      );

      return json({
        ok: true,
        type: "alat",
        jenis: "pinjam",
        alat: alat.nama,
        kelas,
        status: "menunggu_persetujuan"
      });
    }

    /* =====================================================
       11. CEGAH TAP GANDA PADA SESI AKTIF

       UID alat yang sudah berhasil diproses di sesi ini tidak boleh
       langsung dianggap sebagai pengembalian.
    ===================================================== */

    const processedAlat = Array.isArray(sess.processed_alat)
      ? sess.processed_alat
      : [];

    if (processedAlat.includes(uid)) {
      await addTapLog(
        supabase,
        sess.uid_kartu,
        uid,
        "alat",
        "otomatis",
        "ditolak",
        "tap_duplikat",
        kelas,
        alat.nama
      );

      return json({
        ok: false,
        error: "tap_duplikat",
        type: "alat",
        alat: alat.nama,
        message:
          `${alat.nama} sudah diproses pada sesi ini. ` +
          "Akhiri sesi lalu mulai sesi baru untuk memproses ulang.",
      });
    }

    /* =====================================================
       12. CEK SELURUH TRANSAKSI AKTIF UNIT INI

       Satu baris alat = satu unit fisik. Jangan memakai maybeSingle()
       karena satu alat_id dapat memiliki lebih dari satu baris aktif
       pada data lama.
    ===================================================== */

    const {
      data: activeRows,
      error: activeTrxError,
    } = await supabase
      .from("transaksi")
      .select("id, uid_kartu, kelas, waktu_pinjam")
      .eq("alat_id", alat.id)
      .eq("status", "dipinjam")
      .order("waktu_pinjam", { ascending: true });

    if (activeTrxError) {
      throw activeTrxError;
    }

    const activeList = activeRows ?? [];
    const ownTrx =
      activeList.find((trx) => trx.uid_kartu === sess.uid_kartu) ?? null;

    /* =====================================================
       13. DIPINJAM KELAS LAIN → TOLAK
    ===================================================== */

    if (activeList.length > 0 && !ownTrx) {
      const peminjamKelas = activeList[0]?.kelas || "kelas lain";

      await addTapLog(
        supabase,
        sess.uid_kartu,
        uid,
        "alat",
        "otomatis",
        "ditolak",
        "alat_sedang_dipinjam",
        kelas,
        alat.nama
      );

      return json({
        ok: false,
        error: "alat_sedang_dipinjam",
        type: "alat",
        alat: alat.nama,
        peminjam_kelas: peminjamKelas,
        message: `${alat.nama} sedang dipinjam oleh ${peminjamKelas}.`,
      });
    }

    /* =====================================================
       14. SUDAH DIPINJAM KARTU INI → KEMBALIKAN
    ===================================================== */

    if (ownTrx) {
      const {
        error: updateError,
      } = await supabase
        .from("transaksi")
        .update({
          status: "dikembalikan",
          waktu_kembali: new Date().toISOString(),
        })
        .eq("id", ownTrx.id);

      if (updateError) {
        throw updateError;
      }

      await markToolProcessed(supabase, deviceId, uid, processedAlat);

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
       15. BELUM DIPINJAM → CEK STOK
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
       16. BUAT TRANSAKSI PEMINJAMAN
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
       17. TANDAI UNIT + PERPANJANG SESSION
    ===================================================== */

    await markToolProcessed(supabase, deviceId, uid, processedAlat);

    /* =====================================================
       18. LOG BERHASIL
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
       19. RESPONSE KE ESP32
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