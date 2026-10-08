// supabase/functions/create-petugas/index.js
// Edge Function: Membuat akun Petugas baru (hanya bisa dipanggil Admin)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ── 1. Ambil JWT dari request header (user yang sedang login) ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ success: false, message: 'Tidak terotorisasi' }, 401);
    }

    // ── 2. Buat Supabase client biasa (untuk verifikasi requester) ──
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_ANON_KEY'),
      { global: { headers: { Authorization: authHeader } } }
    );

    // ── 3. Verifikasi user yang request sudah login ──
    const { data: { user: requester }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !requester) {
      return json({ success: false, message: 'Session tidak valid, silakan login ulang' }, 401);
    }

    // ── 4. Cek role requester dari DATABASE (JANGAN percaya data dari frontend!) ──
    const { data: requesterProfile, error: profileError } = await supabaseClient
      .from('profiles')
      .select('role')
      .eq('id', requester.id)
      .single();

    if (profileError || !requesterProfile) {
      return json({ success: false, message: 'Profil requester tidak ditemukan' }, 403);
    }

    if (requesterProfile.role !== 'admin') {
      return json({ success: false, message: 'Hanya Admin yang dapat menambah petugas' }, 403);
    }

    // ── 5. Parse body request ──
    const body = await req.json();
    const { nama_lengkap, nip, email, username } = body;

    // ── 6. Validasi input ──
    if (!nama_lengkap?.trim()) {
      return json({ success: false, message: 'Nama lengkap wajib diisi' }, 400);
    }
    if (!nip?.trim()) {
      return json({ success: false, message: 'NIP wajib diisi' }, 400);
    }
    if (!email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ success: false, message: 'Format email tidak valid' }, 400);
    }
    if (!username?.trim()) {
      return json({ success: false, message: 'Username wajib diisi' }, 400);
    }

    // ── 7. Buat Admin client (Service Role — HANYA di server!) ──
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );

    // ── 8. Cek duplikat NIP ──
    const { data: existingNip } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('nip', nip.trim())
      .maybeSingle();

    if (existingNip) {
      return json({ success: false, message: 'NIP sudah digunakan oleh petugas lain' }, 409);
    }

    // ── 9. Cek duplikat username ──
    const { data: existingUsername } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', username.trim().toLowerCase())
      .maybeSingle();

    if (existingUsername) {
      return json({ success: false, message: 'Username sudah digunakan' }, 409);
    }

    // ── 10. Buat user di Supabase Auth & kirim invitation email ──
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email.trim(),
      {
        data: {
          nama_lengkap: nama_lengkap.trim(),
          username:     username.trim().toLowerCase(),
          nip:          nip.trim(),
          role:         'petugas', // Selalu paksa role petugas!
        },
        redirectTo: `${Deno.env.get('SITE_URL')}/auth/set-password`,
      }
    );

    if (createError) {
      if (createError.message?.includes('already registered')) {
        return json({ success: false, message: 'Email sudah terdaftar di sistem' }, 409);
      }
      throw createError;
    }

    // ── 11. Simpan profil ke tabel profiles ──
    const { error: insertError } = await supabaseAdmin
      .from('profiles')
      .insert({
        id:           newUser.user.id,
        nama_lengkap: nama_lengkap.trim(),
        nip:          nip.trim(),
        username:     username.trim().toLowerCase(),
        email:        email.trim(),
        role:         'petugas', // Paksa 'petugas', TIDAK dari body!
        is_verified:  false,     // Belum diverifikasi (belum set password)
        created_at:   new Date().toISOString(),
      });

    if (insertError) {
      // Rollback: hapus auth user jika insert profile gagal
      await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
      console.error('Insert profile gagal, rollback auth user:', insertError);
      return json({ success: false, message: 'Gagal menyimpan profil petugas. Coba lagi.' }, 500);
    }

    return json({
      success: true,
      message: 'Petugas berhasil ditambahkan. Email undangan telah dikirim.',
    });

  } catch (err) {
  console.error('Edge Function error:', err);

  return json({
    success: false,
    message: err?.message || String(err),
  }, 500);
}
});

// Helper: buat JSON Response
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
