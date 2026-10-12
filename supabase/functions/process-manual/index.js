// supabase/functions/process-manual/index.js
// Edge Function: Transaksi manual peminjaman & pengembalian oleh petugas/admin
//
// POST /process-manual
// Body: {
//   uid_kartu: string,
//   alat_id: string,
//   jenis: "pinjam" | "kembali",
//   jumlah?: number,          // default 1
//   kondisi_pinjam?: string,  // default "baik"
//   kondisi_kembali?: string,
//   catatan?: string,
// }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json, handleCors } from "../_shared/cors.js";
import { requireAuth } from "../_shared/auth.js";

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  // ── Auth: petugas atau admin boleh akses ──
  const auth = await requireAuth(req, null);
  if (auth.error) return auth.error;
  const { supabaseAdmin, profile } = auth;

  if (!["admin", "petugas"].includes(profile.role)) {
    return json({ success: false, message: "Akses ditolak" }, 403);
  }

  // ── Parse body ──
  let body;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, message: "Body request tidak valid (harus JSON)" }, 400);
  }

  const {
    uid_kartu,
    alat_id,
    jenis,
    jumlah = 1,
    kondisi_pinjam = "baik",
    kondisi_kembali = null,
    catatan = null,
  } = body;

  // ── Validasi field wajib ──
  if (!uid_kartu?.trim()) return json({ success: false, message: "uid_kartu wajib diisi" }, 400);
  if (!alat_id?.trim())   return json({ success: false, message: "alat_id wajib diisi" }, 400);
  if (!["pinjam", "kembali", "habis_pakai", "pemberian"].includes(jenis)) {
    return json({ success: false, message: 'jenis harus "pinjam", "kembali", atau "habis_pakai"' }, 400);
  }

  try {
    // ── 1. Cek kartu ──
    const { data: kartu, error: kartuErr } = await supabaseAdmin
      .from("kartu_rfid")
      .select("uid_kartu, kelas, aktif")
      .eq("uid_kartu", uid_kartu.trim())
      .maybeSingle();

    if (kartuErr || !kartu) {
      return json({ success: false, error: "kartu_tidak_ditemukan", message: "Kartu RFID tidak ditemukan" }, 404);
    }
    if (!kartu.aktif) {
      return json({ success: false, error: "kartu_nonaktif", message: "Kartu RFID sudah dinonaktifkan" }, 422);
    }

    // ── 2. Cek alat ──
    const { data: alat, error: alatErr } = await supabaseAdmin
      .from("v_list_barang")
      .select("id, nama, kode, kategori, stok_tersedia, tipe")
      .eq("id", alat_id.trim())
      .maybeSingle();

    if (alatErr || !alat) {
      return json({ success: false, error: "alat_tidak_ditemukan", message: "Alat tidak ditemukan" }, 404);
    }

    const petugas = profile.nama_lengkap ?? profile.username ?? null;
    const now = new Date().toISOString();
    const qty = Math.max(1, Number(jumlah));

    if (alat.tipe === "habis_pakai") {
      if (jenis === "pinjam" || jenis === "habis_pakai" || jenis === "pemberian") {
        if (alat.stok_tersedia < qty) {
          return json({
            success: false,
            error: "stok_habis",
            message: `Stok tidak cukup. Tersedia: ${alat.stok_tersedia}, diminta: ${qty}`,
          }, 422);
        }

        // Langsung catat permintaan yang disetujui (karena manual oleh petugas)
        const permintaanId = `REQ-MANUAL-${Date.now()}`;
        
        // 1. Update stok alat
        const newStok = alat.stok_tersedia - qty;
        await supabaseAdmin.from("alat").update({ jumlah_total: newStok }).eq("id", alat.id);

        // 2. Insert permintaan
        await supabaseAdmin.from("permintaan_habis_pakai").insert({
          id: permintaanId,
          uid_kartu: kartu.uid_kartu,
          kelas: kartu.kelas,
          alat_id: alat.id,
          nama_alat: alat.nama,
          status: "disetujui",
          jumlah: qty,
          catatan: catatan ?? 'Diproses manual',
          petugas: petugas,
          waktu_tap: now,
          waktu_proses: now
        });

        // 3. Insert stok mutasi
        await supabaseAdmin.from("stok_mutasi").insert({
          alat_id: alat.id,
          delta: -qty,
          stok_setelah: newStok,
          alasan: "persetujuan",
          permintaan_id: permintaanId,
          catatan: catatan ?? 'Diproses manual',
          petugas: petugas
        });

        await addTapLog(supabaseAdmin, kartu.uid_kartu, null, "pinjam", "manual", "berhasil", null, kartu.kelas, alat.nama);

        return json({
          success: true,
          jenis: "pinjam",
          jumlah: qty,
          message: `${qty} stok ${alat.nama} berhasil diberikan ke ${kartu.kelas} secara manual`,
        });
      } else {
        // Untuk alat sekali pakai, pengembalian manual = restock
        const newStok = alat.stok_tersedia + qty;
        await supabaseAdmin.from("alat").update({ jumlah_total: newStok }).eq("id", alat.id);

        await supabaseAdmin.from("stok_mutasi").insert({
          alat_id: alat.id,
          delta: qty,
          stok_setelah: newStok,
          alasan: "restock",
          catatan: catatan ?? 'Pengembalian / restock manual',
          petugas: petugas
        });

        await addTapLog(supabaseAdmin, kartu.uid_kartu, null, "kembali", "manual", "berhasil", null, kartu.kelas, alat.nama);

        return json({
          success: true,
          jenis: "kembali",
          jumlah: qty,
          message: `${qty} stok ${alat.nama} berhasil ditambahkan/dikembalikan dari ${kartu.kelas}`,
        });
      }
    }

    if (jenis === "pinjam") {
      // ── 3a. Pinjam ──
      if (alat.stok_tersedia < qty) {
        return json({
          success: false,
          error: "stok_habis",
          message: `Stok tidak cukup. Tersedia: ${alat.stok_tersedia}, diminta: ${qty}`,
        }, 422);
      }

      const rows = Array.from({ length: qty }, (_, i) => ({
        id:             `TRX-${Date.now()}-${i}`,
        uid_kartu:      kartu.uid_kartu,
        kelas:          kartu.kelas,
        alat_id:        alat.id,
        nama_alat:      alat.nama,
        status:         "dipinjam",
        sumber:         "manual",
        kondisi_pinjam: kondisi_pinjam ?? "baik",
        kondisi_kembali: null,
        waktu_pinjam:   now,
        waktu_kembali:  null,
        petugas,
        catatan,
        created_at:     now,
      }));

      const { error: insertErr } = await supabaseAdmin.from("transaksi").insert(rows);
      if (insertErr) throw insertErr;

      // Log tap
      await addTapLog(supabaseAdmin, kartu.uid_kartu, null, "pinjam", "manual", "berhasil", null, kartu.kelas, alat.nama);

      return json({
        success: true,
        jenis: "pinjam",
        jumlah: qty,
        message: `${qty} unit ${alat.nama} berhasil dipinjamkan ke ${kartu.kelas}`,
      });

    } else {
      // ── 3b. Kembali ──
      const qty = Math.max(1, Number(jumlah));

      const { data: activeTrx, error: trxErr } = await supabaseAdmin
        .from("transaksi")
        .select("id")
        .eq("uid_kartu", kartu.uid_kartu)
        .eq("alat_id", alat.id)
        .eq("status", "dipinjam")
        .order("waktu_pinjam", { ascending: true })
        .limit(qty);

      if (trxErr) throw trxErr;

      if (!activeTrx || activeTrx.length === 0) {
        return json({
          success: false,
          error: "tidak_ada_pinjaman",
          message: `Kartu ${kartu.kelas} tidak memiliki pinjaman aktif untuk alat ini`,
        }, 422);
      }

      const ids = activeTrx.map((t) => t.id);
      const { error: updateErr } = await supabaseAdmin
        .from("transaksi")
        .update({
          status:          "dikembalikan",
          waktu_kembali:   now,
          kondisi_kembali: kondisi_kembali ?? "baik",
          catatan,
          petugas,
        })
        .in("id", ids);

      if (updateErr) throw updateErr;

      await addTapLog(supabaseAdmin, kartu.uid_kartu, null, "kembali", "manual", "berhasil", null, kartu.kelas, alat.nama);

      return json({
        success: true,
        jenis: "kembali",
        jumlah: ids.length,
        message: `${ids.length} unit ${alat.nama} berhasil dikembalikan dari ${kartu.kelas}`,
      });
    }

  } catch (err) {
    console.error("process-manual error:", err);
    return json({ success: false, message: "Terjadi kesalahan server", detail: err.message }, 500);
  }
});

async function addTapLog(supabase, uid_kartu, uid_alat, jenis_tap, jenis_terdeteksi, status, error_code, kelas, nama_alat) {
  await supabase.from("tap_log").insert({
    id:               `LOG-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    uid_kartu,
    uid_alat,
    jenis_tap,
    jenis_terdeteksi,
    kelas,
    nama_alat,
    status,
    error_code,
    is_read:          false,
    waktu_tap:        new Date().toISOString(),
  });
}
