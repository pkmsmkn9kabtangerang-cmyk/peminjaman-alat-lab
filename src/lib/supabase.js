// src/lib/supabase.js
// Koneksi ke Supabase — gunakan ANON KEY saja di frontend
// SERVICE_ROLE_KEY hanya boleh ada di Edge Function (Deno) atau server

import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnon) {
  console.warn('[Supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY belum diisi di .env');
}

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnon &&
  !supabaseUrl.includes('your-project-ref') &&
  !supabaseAnon.includes('your-anon-key') &&
  supabaseUrl.startsWith('https://')
);

export const supabase = createClient(
  supabaseUrl  ?? '',
  supabaseAnon ?? '',
);

