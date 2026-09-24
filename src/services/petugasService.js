// src/services/petugasService.js
// Service layer untuk operasi Petugas via Supabase Edge Function

import { supabase } from '../lib/supabase';

/**
 * Tambah petugas baru via Edge Function.
 * Service Role Key TIDAK pernah ada di sini — hanya di server (Edge Function).
 *
 * @param {{ nama_lengkap: string, nip: string, email: string, username: string }} payload
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function createPetugas({ nama_lengkap, nip, email, username }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Anda belum login. Silakan login ulang.');

  const res = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-petugas`,
    {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey':        import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ nama_lengkap, nip, email, username }),
    }
  );

  const result = await res.json();
  if (!result.success) throw new Error(result.message);
  return result;
}
