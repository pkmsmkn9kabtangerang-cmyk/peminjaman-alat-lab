// supabase/functions/manage-pengguna/index.js
// Edge Function: Manajemen pengguna (admin CRUD profil petugas)
//
// GET    /manage-pengguna              → list semua profil         [admin only]
// GET    /manage-pengguna?id=:uid      → ambil 1 profil
// PUT    /manage-pengguna?id=:uid      → update profil             [admin only]
// DELETE /manage-pengguna?id=:uid      → hapus pengguna            [admin only]
// POST   /manage-pengguna?id=:uid&aksi=reset-password → reset password [admin only]
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
        if (!["admin", "super_admin"].includes(profile.role) && id !== profile.id) {
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

      // List semua → admin & super_admin only
      if (!["admin", "super_admin"].includes(profile.role)) {
        return json({ success: false, message: "Akses ditolak" }, 403);
      }

      let query = supabaseAdmin
        .from("profiles")
        .select("id, nama_lengkap, nip, username, email, role, created_at")
        .order("created_at", { ascending: false });

      // Admin biasa hanya boleh melihat petugas
      if (profile.role === "admin") {
        query = query.eq("role", "petugas");
      }

      const { data, error } = await query;

      if (error) throw error;
      return json({ success: true, data });
    }

    // ── PUT: update profil ──
    if (method === "PUT") {
      if (!id) return json({ success: false, message: "Parameter id diperlukan" }, 400);

      const isSuperAdmin = profile.role === "super_admin";
      const isAdmin = profile.role === "admin";

      // Bukan admin/super_admin hanya boleh update diri sendiri
      if (!isSuperAdmin && !isAdmin && id !== profile.id) {
        return json({ success: false, message: "Akses ditolak" }, 403);
      }

      const body = await req.json();
      const { nama_lengkap, nip, username, email, role } = body;

      // Cek pengguna target ada
      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("id, role")
        .eq("id", id)
        .maybeSingle();

      if (!existing) return json({ success: false, message: "Pengguna tidak ditemukan" }, 404);

      // Admin biasa tidak boleh mengubah data super_admin atau sesama admin (kecuali diri sendiri)
      if (isAdmin && id !== profile.id && existing.role !== "petugas") {
        return json({ success: false, message: "Admin hanya dapat mengubah data petugas" }, 403);
      }

      // Validasi perubahan role:
      if (role && role !== existing.role) {
        // Hanya super_admin yang boleh mengubah role
        if (!isSuperAdmin) {
          return json({ success: false, message: "Hanya Super Admin yang dapat mengubah role" }, 403);
        }
        // Super admin tidak boleh mengubah target menjadi super_admin (hanya boleh 1 super_admin)
        if (role === "super_admin") {
          return json({ success: false, message: "Tidak dapat mengubah role menjadi super_admin" }, 400);
        }
        // Tidak boleh mengubah role super_admin itu sendiri
        if (existing.role === "super_admin") {
          return json({ success: false, message: "Role Super Admin tidak dapat diubah" }, 403);
        }
        if (!["admin", "petugas"].includes(role)) {
          return json({ success: false, message: 'Role harus "admin" atau "petugas"' }, 400);
        }
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
      if (role         !== undefined && isSuperAdmin && existing.role !== "super_admin") {
        payload.role = role;
      }

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

      const isSuperAdmin = profile.role === "super_admin";
      const isAdmin = profile.role === "admin";

      if (!isSuperAdmin && !isAdmin) {
        return json({ success: false, message: "Hanya Admin atau Super Admin yang dapat menghapus pengguna" }, 403);
      }

      // Jangan hapus diri sendiri
      if (id === profile.id) {
        return json({ success: false, message: "Anda tidak dapat menghapus akun sendiri" }, 422);
      }

      // Cek pengguna target ada
      const { data: existing } = await supabaseAdmin
        .from("profiles")
        .select("id, role")
        .eq("id", id)
        .maybeSingle();

      if (!existing) return json({ success: false, message: "Pengguna tidak ditemukan" }, 404);

      // Super admin tidak boleh dihapus
      if (existing.role === "super_admin") {
        return json({ success: false, message: "Akun Super Admin tidak dapat dihapus" }, 403);
      }

      // Admin biasa hanya boleh menghapus petugas
      if (isAdmin && existing.role !== "petugas") {
        return json({ success: false, message: "Admin hanya dapat menghapus akun petugas" }, 403);
      }

      // Hapus dari auth (cascade akan hapus profile via FK)
      const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(id);
      if (deleteErr) throw deleteErr;

      return json({ success: true, message: "Pengguna berhasil dihapus" });
    }

    // ── POST: aksi khusus (misal: reset-password) ──
    if (method === "POST") {
      const aksi = url.searchParams.get("aksi");
      if (!id || aksi !== "reset-password") {
        return json({ success: false, message: "Parameter id dan aksi=reset-password diperlukan" }, 400);
      }

      const isSuperAdmin = profile.role === "super_admin";
      const isAdmin = profile.role === "admin";

      if (!isSuperAdmin && !isAdmin) {
        return json({ success: false, message: "Hanya Admin atau Super Admin yang dapat melakukan reset password" }, 403);
      }

      if (id === profile.id) {
        return json({ success: false, error: "tidak_boleh_reset_diri_sendiri", message: "Anda tidak dapat mereset password sendiri" }, 422);
      }

      const { data: targetProfile } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", id)
        .maybeSingle();

      if (!targetProfile) {
        return json({ success: false, error: "pengguna_tidak_ditemukan", message: "Pengguna tidak ditemukan" }, 404);
      }

      if (targetProfile.role === "super_admin") {
        return json({ success: false, error: "tidak_dapat_reset_superadmin", message: "Tidak dapat mereset password Super Admin" }, 422);
      }

      // Admin biasa hanya boleh reset password petugas
      if (isAdmin && targetProfile.role !== "petugas") {
        return json({ success: false, error: "hanya_petugas", message: "Admin hanya dapat mereset password role petugas" }, 422);
      }

      // Generate random password (length 14)
      const array = new Uint8Array(14);
      crypto.getRandomValues(array);
      const tempPassword = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 14);

      // Update di Auth
      const { error: resetErr } = await supabaseAdmin.auth.admin.updateUserById(id, { password: tempPassword });
      if (resetErr) throw resetErr;

      // Update flag di profiles
      const { error: profileErr } = await supabaseAdmin
        .from("profiles")
        .update({ wajib_ganti_password: true })
        .eq("id", id);
      if (profileErr) throw profileErr;

      return new Response(JSON.stringify({ success: true, message: "Password berhasil direset", tempPassword }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    return json({ success: false, message: "Method tidak diizinkan" }, 405);

  } catch (err) {
    console.error("manage-pengguna error:", err);
    return json({ success: false, message: "Terjadi kesalahan server", detail: err.message }, 500);
  }
});
