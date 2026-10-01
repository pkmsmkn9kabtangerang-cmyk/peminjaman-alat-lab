// supabase/functions/rfid-tap/index.js
// Edge Function: Memproses tap RFID dari ESP32 / Simulator
// Di-invoke oleh: firmware ESP32 atau callRfidTap() di frontend saat Supabase terkonfigurasi.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-device-id, x-device-key",
};

// Durasi sesi kartu dalam detik (harus sama dengan SESSION_DURATION_SECONDS di store.js)
const SESSION_DURATION_MS = 20 * 1000;

// In-memory session map (valid selama instance function hidup)
const kartuSessions = new Map(); // Map<uid_kartu, { uid_kartu, kelas, jenis, expires: Date }>

function getSession(uid) {
  const s = kartuSessions.get(uid);
  if (!s) return null;
  if (new Date() > new Date(s.expires)) {
    kartuSessions.delete(uid);
    return null;
  }
  return s;
}

function setSession(uid, jenis, kelas = "") {
  const expires = new Date(Date.now() + SESSION_DURATION_MS);
  kartuSessions.set(uid, { uid_kartu: uid, jenis, kelas, expires });
}

function extendSession(uid) {
  const s = kartuSessions.get(uid);
  if (s) {
    s.expires = new Date(Date.now() + SESSION_DURATION_MS);
  }
}

function clearSession(uid) {
  kartuSessions.delete(uid);
}

function getActiveSessions() {
  const now = new Date();
  for (const [uid, sess] of kartuSessions.entries()) {
    if (new Date(sess.expires) <= now) kartuSessions.delete(uid);
  }
  return [...kartuSessions.values()].filter((s) => new Date(s.expires) > now);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL"),
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") // service role agar bisa write tap_log
    );

    const body = await req.json();
    const { uid } = body;

    if (!uid) {
      return json({ ok: false, error: "payload_tidak_lengkap" }, 400);
    }

    // 1. Cek apakah UID adalah kartu
    const { data: kartu } = await supabase
      .from("kartu_rfid")
      .select("*")
      .eq("uid_kartu", uid)
      .maybeSingle();

    if (kartu) {
      if (!kartu.aktif) {
        await addTapLog(supabase, uid, null, "kartu", "otomatis", "ditolak", "kartu_nonaktif", kartu.kelas, null);
        return json({ ok: false, error: "kartu_nonaktif", type: "kartu" });
      }

      const activeSessions = getActiveSessions();
      const currentSession = activeSessions.length > 0 ? activeSessions[0] : null;

      if (currentSession) {
        if (currentSession.uid_kartu === uid) {
          clearSession(uid);
          await addTapLog(supabase, uid, null, "kartu", "otomatis", "berhasil", null, kartu.kelas, null);
          return json({
            ok: true, type: "kartu", action: "selesai", jenis: "selesai",
            kelas: kartu.kelas, message: `Sesi ${kartu.kelas} selesai.`,
          });
        } else {
          await addTapLog(supabase, uid, null, "kartu", "otomatis", "ditolak", "sesi_kartu_lain_aktif", kartu.kelas, null);
          return json({
            ok: false, error: "sesi_kartu_lain_aktif", type: "kartu",
            activeCard: currentSession,
            message: `Sesi ${currentSession.kelas || currentSession.uid_kartu} sedang aktif!`,
          });
        }
      }

      // Mulai sesi baru
      const { data: transaksiAktif } = await supabase
        .from("transaksi")
        .select("id")
        .eq("uid_kartu", uid)
        .eq("status", "dipinjam")
        .limit(1);

      const jenis = (transaksiAktif && transaksiAktif.length > 0) ? "kembali" : "pinjam";
      setSession(uid, jenis, kartu.kelas);
      await addTapLog(supabase, uid, null, "kartu", "otomatis", "berhasil", null, kartu.kelas, null);
      return json({ ok: true, type: "kartu", action: "mulai", jenis, kelas: kartu.kelas });
    }

    // 2. Cek apakah UID adalah alat
    const { data: alat } = await supabase
      .from("v_list_barang")
      .select("*")
      .eq("uid_rfid", uid)
      .maybeSingle();

    if (!alat) {
      await addTapLog(supabase, null, uid, "alat", "otomatis", "ditolak", "uid_tidak_dikenal", null, null);
      return json({ ok: false, error: "uid_tidak_dikenal", type: "alat" });
    }

    const activeSessions = getActiveSessions();
    if (activeSessions.length === 0) {
      await addTapLog(supabase, null, uid, "alat", "otomatis", "ditolak", "sesi_tidak_ada", null, alat.nama);
      return json({ ok: false, error: "sesi_tidak_ada", type: "alat" });
    }

    const sess = activeSessions[0];
    const { data: kartuData } = await supabase
      .from("kartu_rfid")
      .select("kelas")
      .eq("uid_kartu", sess.uid_kartu)
      .maybeSingle();

    const kelas = kartuData?.kelas ?? sess.kelas ?? "";

    const { data: activeTrx } = await supabase
      .from("transaksi")
      .select("id")
      .eq("uid_kartu", sess.uid_kartu)
      .eq("alat_id", alat.id)
      .eq("status", "dipinjam")
      .maybeSingle();

    let jenis;
    if (activeTrx) {
      await supabase
        .from("transaksi")
        .update({ status: "dikembalikan", waktu_kembali: new Date().toISOString() })
        .eq("id", activeTrx.id);
      jenis = "kembali";
    } else {
      if (alat.stok_tersedia <= 0) {
        await addTapLog(supabase, sess.uid_kartu, uid, "alat", "otomatis", "ditolak", "stok_habis", kelas, alat.nama);
        return json({ ok: false, error: "stok_habis", type: "alat" });
      }
      const trxId = "TRX-" + Date.now();
      await supabase.from("transaksi").insert({
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
      jenis = "pinjam";
    }

    extendSession(sess.uid_kartu);
    await addTapLog(supabase, sess.uid_kartu, uid, jenis, "otomatis", "berhasil", null, kelas, alat.nama);
    return json({ ok: true, type: "alat", jenis, alat: alat.nama, kelas });

  } catch (err) {
    console.error("rfid-tap error:", err);
    return json({ ok: false, error: "server_error", message: err.message }, 500);
  }
});

async function addTapLog(supabase, uid_kartu, uid_alat, jenis_tap, jenis_terdeteksi, status, error_code, kelas, nama_alat) {
  await supabase.from("tap_log").insert({
    id: "LOG-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    uid_kartu, uid_alat, jenis_tap,
    jenis_terdeteksi,
    kelas, nama_alat, status, error_code,
    is_read: false,
    waktu_tap: new Date().toISOString(),
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
