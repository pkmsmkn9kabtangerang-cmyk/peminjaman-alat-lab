// supabase/functions/manage-transaksi/index.js
// Edge Function: Manajemen riwayat transaksi & tap_log
//
// GET    /manage-transaksi                  → list transaksi (dengan filter)
//   ?status=dipinjam|dikembalikan
//   ?kelas=:kelas
//   ?limit=50
//
// PUT    /manage-transaksi?id=:id           → update kondisi/catatan transaksi [petugas+admin]
// DELETE /manage-transaksi?id=:id           → hapus 1 transaksi               [admin only]
// DELETE /manage-transaksi?clear=riwayat    → hapus SEMUA riwayat             [admin only]
// DELETE /manage-transaksi?clear=taplog     → hapus SEMUA tap_log             [admin only]
//
// Body PUT: { kondisi_kembali?: string, catatan?: string }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { json, handleCors } from "../_shared/cors.js";
import { requireAuth } from "../_shared/auth.js";

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  const url    = new URL(req.url);
  const method = req.method;
  const id     = url.searchParams.get("id");
  const clear  = url.searchParams.get("clear"); // "riwayat" | "taplog"

  const auth = await requireAuth(req, null);
  if (auth.error) return auth.error;
  const { supabaseAdmin, profile } = auth;

  try {
    // ── GET: list transaksi ──
    if (method === "GET") {
      const status = url.searchParams.get("status");
      const kelas  = url.searchParams.get("kelas");
      const limit  = Math.min(Number(url.searchParams.get("limit") || 200), 500);

      let query = supabaseAdmin
        .from("transaksi")
        .select("*, kartu_rfid(kelas, nama_pemegang), alat(nama, kode)")
        .order("waktu_pinjam", { ascending: false })
        .limit(limit);

      if (status) query = query.eq("status", status);
      if (kelas)  query = query.eq("kelas", kelas);

      const { data, error } = await query;
      if (error) throw error;
      return json({ success: true, data });
    }

    // ── PUT: update kondisi/catatan transaksi ──
    if (method === "PUT") {
      if (!id) return json({ success: false, message: "Parameter id diperlukan" }, 400);

      if (!["admin", "petugas"].includes(profile.role)) {
        return json({ success: false, message: "Akses ditolak" }, 403);
      }

      const body = await req.json();
      const { kondisi_kembali, catatan } = body;

      const payload = {};
      if (kondisi_kembali !== undefined) payload.kondisi_kembali = kondisi_kembali;
      if (catatan         !== undefined) payload.catatan         = catatan;

      if (Object.keys(payload).length === 0) {
        return json({ success: false, message: "Tidak ada field yang diperbarui" }, 400);
      }

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("transaksi")
        .update(payload)
        .eq("id", id)
        .select()
        .single();

      if (updateErr) throw updateErr;
      return json({ success: true, message: "Transaksi berhasil diperbarui", data: updated });
    }

    // ── DELETE ──
    if (method === "DELETE") {
      // Hapus semua harus admin
      if (clear) {
        if (profile.role !== "admin") {
          return json({ success: false, message: "Hanya Admin yang dapat menghapus semua data" }, 403);
        }

        if (clear === "riwayat") {
          // Cek dulu ada data
          const { count } = await supabaseAdmin
            .from("transaksi")
            .select("id", { count: "exact", head: true });

          if (!count || count === 0) {
            return json({ success: false, message: "Tidak ada riwayat transaksi yang dapat dihapus" }, 422);
          }

          const { error: deleteErr } = await supabaseAdmin
            .from("transaksi")
            .delete()
            .neq("id", ""); // delete all rows

          if (deleteErr) throw deleteErr;
          return json({ success: true, message: `${count} riwayat transaksi berhasil dihapus` });
        }

        if (clear === "taplog") {
          const { count } = await supabaseAdmin
            .from("tap_log")
            .select("id", { count: "exact", head: true });

          if (!count || count === 0) {
            return json({ success: false, message: "Tidak ada log tap yang dapat dihapus" }, 422);
          }

          const { error: deleteErr } = await supabaseAdmin
            .from("tap_log")
            .delete()
            .neq("id", "");

          if (deleteErr) throw deleteErr;
          return json({ success: true, message: `${count} log tap berhasil dihapus` });
        }

        return json({ success: false, message: 'Parameter clear harus "riwayat" atau "taplog"' }, 400);
      }

      // Hapus 1 transaksi — admin only
      if (!id) return json({ success: false, message: "Parameter id diperlukan" }, 400);

      if (profile.role !== "admin") {
        return json({ success: false, message: "Hanya Admin yang dapat menghapus transaksi" }, 403);
      }

      const { error: deleteErr } = await supabaseAdmin
        .from("transaksi")
        .delete()
        .eq("id", id);

      if (deleteErr) throw deleteErr;
      return json({ success: true, message: "Transaksi berhasil dihapus" });
    }

    return json({ success: false, message: "Method tidak diizinkan" }, 405);

  } catch (err) {
    console.error("manage-transaksi error:", err);
    return json({ success: false, message: "Terjadi kesalahan server", detail: err.message }, 500);
  }
});
