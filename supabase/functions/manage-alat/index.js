// supabase/functions/manage-alat/index.js
// Edge Function: CRUD Alat (Inventaris)
//
// GET    /manage-alat              → list semua alat (dengan stok)
// POST   /manage-alat              → tambah alat baru          [admin only]
// PUT    /manage-alat?id=:id       → update alat               [admin only]
// DELETE /manage-alat?id=:id       → hapus alat                [admin only]
//
// Alat yang memiliki transaksi berstatus `dipinjam` tidak dapat diubah
// maupun dihapus (422, code `alat_sedang_dipinjam`). Kembalikan alat
// terlebih dahulu.
//
// Body POST/PUT: {
//   nama: string,
//   kode: string,          // UID stiker RFID alat (unik per unit fisik)
//   kategori?: string,
//   jumlah_total?: number, // alat pinjam selalu 1
//   jumlah_rusak?: number,
//   tipe?: string,         // "pinjam" | "habis_pakai"
//   satuan?: string,       // "unit" | "cm" | "pcs"
// }
// 
// POST   /manage-alat?action=stok  → ubah stok habis pakai (body: id, mode, nilai, catatan)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { json, handleCors } from "../_shared/cors.js";
import { requireAuth } from "../_shared/auth.js";

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  const url    = new URL(req.url);
  const method = req.method;
  const id     = url.searchParams.get("id");

  // GET boleh semua user authenticated
  const auth = await requireAuth(req, null);
  if (auth.error) return auth.error;
  const { supabaseAdmin, profile } = auth;

  // Operasi tulis hanya admin atau super_admin
  const isWrite = ["POST", "PUT", "DELETE"].includes(method);
  if (isWrite && !["admin", "super_admin"].includes(profile.role)) {
    return json({ success: false, message: "Hanya Admin atau Super Admin yang dapat mengubah data alat" }, 403);
  }

  try {
    // ── GET: ambil daftar alat ──
    if (method === "GET") {
      const { data, error } = await supabaseAdmin
        .from("v_list_barang")
        .select("*")
        .order("nama", { ascending: true });

      if (error) throw error;
      return json({ success: true, data });
    }

    // ── POST: tambah alat baru atau update stok ──
    if (method === "POST") {
      const action = url.searchParams.get("action");
      if (action === "stok") {
         const body = await req.json();
         const { id: alat_id, mode, nilai, catatan } = body;
         if (!alat_id || !mode || nilai === undefined) {
             return json({ success: false, message: "Parameter tidak lengkap" }, 400);
         }
         if (mode === "penyesuaian" && !catatan?.trim()) {
             return json({ success: false, message: "Catatan wajib diisi untuk penyesuaian stok" }, 400);
         }
         const petugasName = profile.nama_lengkap ?? profile.username ?? null;
         
         const { data, error } = await supabaseAdmin.rpc("ubah_stok_habis_pakai", {
             p_alat_id: alat_id,
             p_mode: mode,
             p_nilai: Number(nilai),
             p_catatan: catatan?.trim() || null,
             p_petugas: petugasName
         });

         if (error) throw error;
         if (!data.success) {
            return json({ success: false, error: data.error, message: `Gagal mengubah stok: ${data.error}` }, 422);
         }
         return json({ success: true, message: "Stok berhasil diperbarui" });
      }

      const body = await req.json();
      const { nama, kode, kategori = "umum", jumlah_total = 1, jumlah_rusak = 0, tipe = "pinjam", satuan = "unit" } = body;

      if (!nama?.trim())  return json({ success: false, message: "Nama alat wajib diisi" }, 400);
      if (!kode?.trim())  return json({ success: false, message: "Kode alat wajib diisi" }, 400);

      const finalTipe = tipe === "habis_pakai" ? "habis_pakai" : "pinjam";
      const finalJumlahTotal = finalTipe === "habis_pakai"
        ? Math.max(1, Number(jumlah_total) || 1)
        : 1;
      const finalJumlahRusak = finalTipe === "habis_pakai"
        ? 0
        : Math.min(1, Math.max(0, Number(jumlah_rusak) || 0));

      // Cek duplikat kode
      const { data: existing } = await supabaseAdmin
        .from("alat")
        .select("id")
        .eq("kode", kode.trim().toUpperCase())
        .maybeSingle();

      if (existing) {
        return json({ success: false, message: `Kode alat "${kode}" sudah digunakan` }, 409);
      }

      const newId = `ALT-${Date.now()}`;
      const now   = new Date().toISOString();

      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("alat")
        .insert({
          id:           newId,
          kode:         kode.trim().toUpperCase(),
          nama:         nama.trim(),
          kategori:     kategori?.trim() ?? "umum",
          jumlah_total: finalJumlahTotal,
          jumlah_rusak: finalJumlahRusak,
          tipe:         finalTipe,
          satuan:       finalTipe === "habis_pakai" ? satuan : "unit",
          created_at:   now,
        })
        .select()
        .single();

      if (insertErr) throw insertErr;
      return json({ success: true, message: `Alat "${nama}" berhasil ditambahkan`, data: inserted }, 201);
    }

    // ── PUT: update alat ──
    if (method === "PUT") {
      if (!id) return json({ success: false, message: "Parameter id diperlukan" }, 400);

      const body = await req.json();
      const { nama, kode, kategori, jumlah_total, jumlah_rusak, tipe, satuan } = body;

      // Cek alat ada
      const { data: existing } = await supabaseAdmin
        .from("alat")
        .select("id, kode, tipe, jumlah_total, jumlah_rusak")
        .eq("id", id)
        .maybeSingle();

      if (!existing) return json({ success: false, message: "Alat tidak ditemukan" }, 404);

      // Alat yang masih dipinjam tidak boleh diubah sama sekali. Perubahan
      // nama, kode, kategori, tipe, maupun jumlah unit dapat membuat data
      // inventaris tidak cocok dengan transaksi yang sedang berjalan.
      const { count: activeCount, error: activeErr } = await supabaseAdmin
        .from("transaksi")
        .select("id", { count: "exact", head: true })
        .eq("alat_id", id)
        .eq("status", "dipinjam");

      if (activeErr) throw activeErr;

      if ((activeCount ?? 0) > 0) {
        return json(
          {
            success: false,
            error: "alat_sedang_dipinjam",
            code: "alat_sedang_dipinjam",
            message: "Alat tidak dapat diubah karena masih dipinjam. Kembalikan alat terlebih dahulu.",
          },
          422
        );
      }

      // Jika ubah tipe, cek apakah ada pinjaman aktif atau permintaan menunggu
      if (tipe && tipe !== existing.tipe) {
         const { data: reqMenunggu } = await supabaseAdmin.from("permintaan_habis_pakai").select("id").eq("alat_id", id).eq("status", "menunggu").limit(1);
         if (reqMenunggu && reqMenunggu.length > 0) {
            return json({ success: false, message: "Tidak dapat mengubah tipe karena ada permintaan yang sedang menunggu" }, 422);
         }
      }

      // Cek duplikat kode (kecuali diri sendiri)
      if (kode && kode.trim().toUpperCase() !== existing.kode) {
        const { data: dupKode } = await supabaseAdmin
          .from("alat")
          .select("id")
          .eq("kode", kode.trim().toUpperCase())
          .neq("id", id)
          .maybeSingle();

        if (dupKode) {
          return json({ success: false, message: `Kode alat "${kode}" sudah digunakan` }, 409);
        }
      }

      const finalTipe = tipe || existing.tipe;
      const finalJumlahRusak = finalTipe === "habis_pakai"
        ? 0
        : (jumlah_rusak !== undefined
            ? Math.min(1, Math.max(0, Number(jumlah_rusak) || 0))
            : undefined);

      // Bangun payload update (hanya field yang dikirim)
      const payload = {};
      if (nama       !== undefined) payload.nama         = nama.trim();
      if (kode       !== undefined) payload.kode         = kode.trim().toUpperCase();
      if (kategori   !== undefined) payload.kategori     = kategori.trim();
      if (jumlah_total !== undefined) {
        payload.jumlah_total = finalTipe === "habis_pakai"
          ? Math.max(1, Number(jumlah_total) || 1)
          : 1;
      } else if (tipe !== undefined) {
        payload.jumlah_total = finalTipe === "habis_pakai"
          ? Math.max(1, Number(existing.jumlah_total) || 1)
          : 1;
      }
      if (finalJumlahRusak !== undefined) payload.jumlah_rusak = finalJumlahRusak;
      if (tipe       !== undefined) payload.tipe         = finalTipe;
      if (satuan     !== undefined) payload.satuan       = finalTipe === "habis_pakai" ? satuan : "unit";

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("alat")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (updateErr) throw updateErr;
      return json({ success: true, message: "Data alat berhasil diperbarui", data: updated });
    }

    // ── DELETE: hapus alat ──
    if (method === "DELETE") {
      if (!id) return json({ success: false, message: "Parameter id diperlukan" }, 400);

      // Cek pinjaman aktif
      const { data: activeTrx } = await supabaseAdmin
        .from("transaksi")
        .select("id")
        .eq("alat_id", id)
        .eq("status", "dipinjam")
        .limit(1);

      if (activeTrx && activeTrx.length > 0) {
        return json({
          success: false,
          error: "alat_sedang_dipinjam",
          message: "Alat tidak dapat dihapus karena masih ada pinjaman aktif",
        }, 422);
      }

      // Riwayat tidak ikut dihapus. Lepaskan relasi sebelum menghapus alat.
      const detachResults = await Promise.all([
        supabaseAdmin.from("transaksi").update({ alat_id: null }).eq("alat_id", id),
        supabaseAdmin.from("permintaan_habis_pakai").update({ alat_id: null }).eq("alat_id", id),
        supabaseAdmin.from("stok_mutasi").update({ alat_id: null }).eq("alat_id", id),
      ]);

      const detachError = detachResults.find((result) => result.error)?.error;
      if (detachError) throw detachError;

      const { error: deleteErr } = await supabaseAdmin.from("alat").delete().eq("id", id);
      if (deleteErr) throw deleteErr;

      return json({ success: true, message: "Alat berhasil dihapus" });
    }

    return json({ success: false, message: "Method tidak diizinkan" }, 405);

  } catch (err) {
    console.error("manage-alat error:", err);
    return json({ success: false, message: "Terjadi kesalahan server", detail: err.message }, 500);
  }
});
