// supabase/functions/_shared/auth.js
// Helper: verifikasi JWT dan ambil profile requester dari DB

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { json } from "./cors.js";

/**
 * Verifikasi JWT dari Authorization header.
 * Kembalikan { supabaseClient, supabaseAdmin, user, profile } atau Response error.
 *
 * @param {Request} req
 * @param {"admin"|"petugas"|null} requiredRole - null = semua role authenticated
 */
export async function requireAuth(req, requiredRole = null) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return { error: json({ success: false, message: "Tidak terotorisasi" }, 401) };
  }

  // Client dengan JWT user yang request
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_ANON_KEY"),
    { global: { headers: { Authorization: authHeader } } }
  );

  const {
    data: { user },
    error: authError,
  } = await supabaseClient.auth.getUser();

  if (authError || !user) {
    return { error: json({ success: false, message: "Session tidak valid, silakan login ulang" }, 401) };
  }

  // Ambil profile untuk cek role
  const { data: profile, error: profileError } = await supabaseClient
    .from("profiles")
    .select("id, role, nama_lengkap, username, nip, email")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return { error: json({ success: false, message: "Profil tidak ditemukan" }, 403) };
  }

  if (requiredRole && profile.role !== requiredRole) {
    return {
      error: json(
        { success: false, message: `Hanya ${requiredRole} yang dapat melakukan aksi ini` },
        403
      ),
    };
  }

  // Admin client untuk operasi yang butuh service role
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
  );

  return { supabaseClient, supabaseAdmin, user, profile };
}
