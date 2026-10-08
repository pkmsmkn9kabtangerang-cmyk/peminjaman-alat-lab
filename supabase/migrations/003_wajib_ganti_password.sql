-- =============================================
-- Migration 003: Wajib Ganti Password
-- =============================================

-- 1. Tambahkan kolom wajib_ganti_password di tabel profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS wajib_ganti_password BOOLEAN NOT NULL DEFAULT FALSE;

-- Catatan:
-- - Tidak ada policy RLS yang diubah, karena "profiles_update_own" 
--   sudah mengizinkan update ke baris sendiri selama role tidak berubah.
-- - Saat reset admin, Edge Function menggunakan service_role yang
--   melompati RLS, sehingga tetap bisa update flag ini untuk user lain.
