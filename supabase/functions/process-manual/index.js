// supabase/functions/process-manual/index.js
// Edge Function: Transaksi manual peminjaman, pengembalian, dan pemberian consumable
//
// POST /process-manual
// Body: {
//   uid_kartu: string,
//   alat_id: string,
//   jenis: "pinjam" | "kembali" | "habis_pakai" | "pemberian",
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
      .select("id, nama, kode, kategori, stok_tersedia, tipe, satuan")
      .eq("id", alat_id.trim())
      .maybeSingle();

    if (alatErr || !alat) {
      return json({ success: false, error: "alat_tidak_ditemukan", message: "Alat tidak ditemukan" }, 404);
    }

    const petugas = profile.nama_lengkap ?? profile.username ?? null;
    const now = new Date().toISOString();
    const qty = Math.max(1, Number(jumlah));

    // =========================================================
    // A. BARANG HABIS PAKAI (CONSUMABLE)
    // =========================================================
    if (alat.tipe === "habis_pakai") {
      // Consumable tidak mengenal pengembalian
      if (jenis === "kembali") {
        return json({
          success: false,
          error: "alat_habis_pakai_tidak_bisa_dikembalikan",
          message: "Barang sekali pakai (consumable) langsung diberikan dan tidak perlu dikembalikan.",
        }, 422);
      }

      // Coba panggil fungsi RPC atomik PostgreSQL terlebih dahulu
      const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc("catat_pemberian_habis_pakai", {
        p_uid_kartu: kartu.uid_kartu,
        p_alat_id: alat.id,
        p_jumlah: qty,
        p_petugas: petugas,
        p_catatan: catatan ?? "Diproses manual oleh petugas",
      });

      if (!rpcErr && rpcData) {
        if (!rpcData.success) {
          return json({
            success: false,
            error: rpcData.error || "gagal_pemberian",
            message: rpcData.message || "Gagal mencatat pemberian consumable.",
          }, 422);
        }

        return json({
          success: true,
          jenis: "habis_pakai",
          jumlah: qty,
          message: rpcData.message || `${qty} ${alat.satuan || 'unit'} ${alat.nama} berhasil diberikan ke ${kartu.kelas}.`,
        });
      }

      // Fallback jika migration RPC belum dijalankan di database
      if (alat.stok_tersedia < qty) {
        return json({
          success: false,
          error: "stok_habis",
          message: `Stok tidak cukup. Tersedia: ${alat.stok_tersedia}, diminta: ${qty}`,
        }, 422);
      }

      const permintaanId = `REQ-MANUAL-${Date.now()}`;
      const newStok = alat.stok_tersedia - qty;

      // 1. Kurangi stok alat
      const { error: updateStokErr } = await supabaseAdmin
        .from("alat")
        .update({ jumlah_total: newStok })
        .eq("id", alat.id);
      if (updateStokErr) throw updateStokErr;

      // 2. Catat ke permintaan_habis_pakai (status 'disetujui' karena manual)
      const { error: insertReqErr } = await supabaseAdmin
        .from("permintaan_habis_pakai")
        .insert({
          id: permintaanId,
          uid_kartu: kartu.uid_kartu,
          kelas: kartu.kelas,
          alat_id: alat.id,
          nama_alat: alat.nama,
          satuan: alat.satuan || "unit",
          status: "disetujui",
          jumlah: qty,
          catatan: catatan ?? "Diproses manual oleh petugas",
          petugas,
          waktu_tap: now,
          waktu_proses: now,
          created_at: now,
        });
      if (insertReqErr) throw insertReqErr;

      // 3. Catat mutasi stok
      const { error: insertMutasiErr } = await supabaseAdmin
        .from("stok_mutasi")
        .insert({
          alat_id: alat.id,
          delta: -qty,
          stok_setelah: newStok,
          alasan: "persetujuan",
          permintaan_id: permintaanId,
          catatan: catatan ?? "Diproses manual oleh petugas",
          petugas,
          created_at: now,
        });
      if (insertMutasiErr) throw insertMutasiErr;

      // PENTING: Operasi manual tidak dicatat ke tap_log (khusus reader RFID)
      return json({
        success: true,
        jenis: "habis_pakai",
        jumlah: qty,
        message: `${qty} ${alat.satuan || 'unit'} ${alat.nama} berhasil diberikan ke ${kartu.kelas} secara manual.`,
      });
    }

    // =========================================================
    // B. BARANG BERTIPE PINJAM (BUKAN CONSUMABLE)
    // =========================================================
    if (jenis === "habis_pakai" || jenis === "pemberian") {
      return json({
        success: false,
        error: "bukan_alat_habis_pakai",
        message: `Alat "${alat.nama}" bukan barang sekali pakai. Gunakan form peminjaman biasa.`,
      }, 422);
    }

    if (jenis === "pinjam") {
      // ── B.1 Peminjaman Manual ──
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

      // PENTING: Operasi manual tidak dicatat ke tap_log (khusus reader RFID)
      return json({
        success: true,
        jenis: "pinjam",
        jumlah: qty,
        message: `${qty} unit ${alat.nama} berhasil dipinjamkan ke ${kartu.kelas}.`,
      });

    } else {
      // ── B.2 Pengembalian Manual ──
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
          message: `Kartu ${kartu.kelas} tidak memiliki pinjaman aktif untuk alat "${alat.nama}".`,
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

      // PENTING: Operasi manual tidak dicatat ke tap_log (khusus reader RFID)
      return json({
        success: true,
        jenis: "kembali",
        jumlah: ids.length,
        message: `${ids.length} unit ${alat.nama} berhasil dikembalikan dari ${kartu.kelas}.`,
      });
    }

  } catch (err) {
    console.error("process-manual error:", err);
    return json({ success: false, message: "Terjadi kesalahan server", detail: err.message }, 500);
  }
});
