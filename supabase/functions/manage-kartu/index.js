// supabase/functions/manage-kartu/index.js
// Edge Function: CRUD Kartu RFID
//
// GET    /manage-kartu              → list semua kartu
// POST   /manage-kartu              → tambah kartu baru         [admin only]
// PUT    /manage-kartu?id=:uid      → update kartu              [admin only]
// DELETE /manage-kartu?id=:uid      → hapus kartu               [admin only]
//
// Body POST/PUT: {
//   uid_kartu: string,      // ID fisik kartu RFID (hanya saat POST)
//   kelas: string,
//   nama_pemegang?: string,
//   aktif?: boolean,
// }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { json, handleCors } from "../_shared/cors.js";
import { requireAuth } from "../_shared/auth.js";

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  const url    = new URL(req.url);
  const method = req.method;
  const uid    = url.searchParams.get("id"); // uid_kartu sebagai identifier

  const auth = await requireAuth(req, null);
  if (auth.error) return auth.error;
  const { supabaseAdmin, profile } = auth;

  const isWrite = ["POST", "PUT", "DELETE"].includes(method);
  if (isWrite && profile.role !== "admin") {
    return json({ success: false, message: "Hanya Admin yang dapat mengubah data kartu" }, 403);
  }

  try {
    // ── GET: list kartu ──
    if (method === "GET") {
      const { data, error } = await supabaseAdmin
        .from("kartu_rfid")
        .select("*")
        .order("kelas", { ascending: true });

      if (error) throw error;
      return json({ success: true, data });
    }

    // ── POST: tambah kartu ──
    if (method === "POST") {
      const body = await req.json();
      const { uid_kartu, kelas, nama_pemegang, aktif = true } = body;

      if (!uid_kartu?.trim()) return json({ success: false, message: "uid_kartu wajib diisi" }, 400);
      if (!kelas?.trim())     return json({ success: false, message: "Kelas wajib diisi" }, 400);

      // Cek duplikat
      const { data: existing } = await supabaseAdmin
        .from("kartu_rfid")
        .select("uid_kartu")
        .eq("uid_kartu", uid_kartu.trim())
        .maybeSingle();

      if (existing) {
        return json({ success: false, message: `Kartu dengan UID "${uid_kartu}" sudah terdaftar` }, 409);
      }

      const { data: inserted, error: insertErr } = await supabaseAdmin
        .from("kartu_rfid")
        .insert({
          uid_kartu:     uid_kartu.trim(),
          kelas:         kelas.trim(),
          nama_pemegang: nama_pemegang?.trim() || null,
          aktif:         Boolean(aktif),
          created_at:    new Date().toISOString(),
        })
        .select()
        .single();

      if (insertErr) throw insertErr;
      return json({ success: true, message: `Kartu untuk kelas ${kelas} berhasil ditambahkan`, data: inserted }, 201);
    }

    // ── PUT: update kartu ──
    if (method === "PUT") {
      if (!uid) return json({ success: false, message: "Parameter id (uid_kartu) diperlukan" }, 400);

      const body = await req.json();
      const { kelas, nama_pemegang, aktif } = body;

      const { data: existing } = await supabaseAdmin
        .from("kartu_rfid")
        .select("uid_kartu")
        .eq("uid_kartu", uid)
        .maybeSingle();

      if (!existing) return json({ success: false, message: "Kartu tidak ditemukan" }, 404);

      const payload = {};
      if (kelas         !== undefined) payload.kelas         = kelas.trim();
      if (nama_pemegang !== undefined) payload.nama_pemegang = nama_pemegang?.trim() || null;
      if (aktif         !== undefined) payload.aktif         = Boolean(aktif);

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("kartu_rfid")
        .update(payload)
        .eq("uid_kartu", uid)
        .select()
        .single();

      if (updateErr) throw updateErr;
      return json({ success: true, message: "Data kartu berhasil diperbarui", data: updated });
    }

    // ── DELETE: hapus kartu ──
    if (method === "DELETE") {
      if (!uid) return json({ success: false, message: "Parameter id (uid_kartu) diperlukan" }, 400);

      // Cek pinjaman aktif pada kartu ini
      const { data: activeTrx } = await supabaseAdmin
        .from("transaksi")
        .select("id")
        .eq("uid_kartu", uid)
        .eq("status", "dipinjam")
        .limit(1);

      if (activeTrx && activeTrx.length > 0) {
        return json({
          success: false,
          error: "kartu_sedang_meminjam",
          message: "Kartu tidak dapat dihapus karena masih memiliki pinjaman aktif",
        }, 422);
      }

      const { error: deleteErr } = await supabaseAdmin.from("kartu_rfid").delete().eq("uid_kartu", uid);
      if (deleteErr) throw deleteErr;

      return json({ success: true, message: "Kartu berhasil dihapus" });
    }

    return json({ success: false, message: "Method tidak diizinkan" }, 405);

  } catch (err) {
    console.error("manage-kartu error:", err);
    return json({ success: false, message: "Terjadi kesalahan server", detail: err.message }, 500);
  }
});
