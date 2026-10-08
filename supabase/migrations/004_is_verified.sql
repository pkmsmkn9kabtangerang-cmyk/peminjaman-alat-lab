-- 1. Tambahkan kolom is_verified di tabel profiles untuk melacak status verifikasi invite
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT TRUE;
