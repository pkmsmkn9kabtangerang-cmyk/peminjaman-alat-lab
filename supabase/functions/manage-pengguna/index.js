// supabase/functions/manage-pengguna/index.js
// Edge Function: Manajemen pengguna (admin CRUD profil petugas)
//
// GET    /manage-pengguna              → list semua profil         [admin only]
// GET    /manage-pengguna?id=:uid      → ambil 1 profil
// PUT    /manage-pengguna?id=:uid      → update profil             [admin only]
// DELETE /manage-pengguna?id=:uid      → hapus pengguna            [admin only]
//
// Catatan: untuk TAMBAH pengguna gunakan Edge Function `create-petugas`
// Body PUT: { nama_lengkap?, nip?, username?, email?, role? }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { json, handleCors } from "../_shared/cors.js";
import { requireAuth } from "../_shared/auth.js";

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  const url    = new URL(req.url);
  const method = req.method;
  const id     = url.searchParams.get("id"); // UUID pengguna

  const auth = await requireAuth(req, null);
  if (auth.error) return auth.error;
  const { supabaseAdmin, profile } = auth;

  try {
    // ── GET: list pengguna atau 1 pengguna ──
    if (method === "GET") {
      // Pengguna biasa hanya boleh lihat diri sendiri
      if (id) {
        if (profile.role !== "admin" && id !== profile.id) {
          return json({ success: false, message: "Akses ditolak" }, 403);
        }

        const { data, error } = await supabaseAdmin
          .from("profiles")
          .select("id, nama_lengkap, nip, username, email, role, created_at")
          .eq("id", id)
          .maybeSingle();

        if (error) throw error;
        if (!data) return json({ success: false, message: "Pengguna tidak ditemukan" }, 404);
        return json({ success: true, data });
      }

      // List semua → admin only
      if (profile.role !== "admin") {
        return json({ success: false, message: "Akses ditolak" }, 403);
      }

      const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("id, nama_lengkap, nip, username, email, role, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return json({ success: true, data });
    }

    // ── PUT: update profil ──
    if (method === "PUT") {
      if (!id) return json({ success: false, message: "Parameter id diperlukan" }, 400);

      // Admin bisa update siapa saja, petugas hanya diri sendiri (dan tidak bisa ganti role)
      if (profile.role !== "admin" && id !== profile.id) {
        return json({ success: false, message: "Akses ditolak" }, 403);
      }

      const body = await req.json();
      const { nama_lengkap, nip, username, email, role } = body;

      // Cek pengguna ada
      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("id, role")
        .eq("id", id)
        .maybeSingle();

      if (!existing) return json({ success: false, message: "Pengguna tidak ditemukan" }, 404);

      // Petugas tidak bisa ganti role siapapun
      if (role && profile.role !== "admin") {
        return json({ success: false, message: "Anda tidak dapat mengubah role" }, 403);
      }

      // Validasi role
      if (role && !["admin", "petugas"].includes(role)) {
        return json({ success: false, message: 'Role harus "admin" atau "petugas"' }, 400);
      }

      // Cek duplikat NIP (kecuali diri sendiri)
      if (nip) {
        const { data: dupNip } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("nip", nip.trim())
          .neq("id", id)
          .maybeSingle();

        if (dupNip) return json({ success: false, message: "NIP sudah digunakan pengguna lain" }, 409);
      }

      // Cek duplikat username
      if (username) {
        const { data: dupUser } = await supabaseAdmin
          .from("profiles")
          .select("id")
          .eq("username", username.trim().toLowerCase())
          .neq("id", id)
          .maybeSingle();

        if (dupUser) return json({ success: false, message: "Username sudah digunakan pengguna lain" }, 409);
      }

      const payload = {};
      if (nama_lengkap !== undefined) payload.nama_lengkap = nama_lengkap.trim();
      if (nip          !== undefined) payload.nip          = nip.trim();
      if (username     !== undefined) payload.username     = username.trim().toLowerCase();
      if (email        !== undefined) payload.email        = email.trim();
      if (role         !== undefined) payload.role         = role;

      const { data: updated, error: updateErr } = await supabaseAdmin
        .from("profiles")
        .update(payload)
        .eq("id", id)
        .select("id, nama_lengkap, nip, username, email, role, created_at")
        .single();

      if (updateErr) throw updateErr;
      return json({ success: true, message: "Profil berhasil diperbarui", data: updated });
    }

    // ── DELETE: hapus pengguna ──
    if (method === "DELETE") {
      if (!id) return json({ success: false, message: "Parameter id diperlukan" }, 400);

      if (profile.role !== "admin") {
        return json({ success: false, message: "Hanya Admin yang dapat menghapus pengguna" }, 403);
      }

      // Jangan hapus diri sendiri
      if (id === profile.id) {
        return json({ success: false, message: "Anda tidak dapat menghapus akun sendiri" }, 422);
      }

      // Cek pengguna ada
      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("id", id)
        .maybeSingle();

      if (!existing) return json({ success: false, message: "Pengguna tidak ditemukan" }, 404);

      // Hapus dari auth (cascade akan hapus profile via FK)
      const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(id);
      if (deleteErr) throw deleteErr;

      return json({ success: true, message: "Pengguna berhasil dihapus" });
    }

    return json({ success: false, message: "Method tidak diizinkan" }, 405);

  } catch (err) {
    console.error("manage-pengguna error:", err);
    return json({ success: false, message: "Terjadi kesalahan server", detail: err.message }, 500);
  }
});
