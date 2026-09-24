-- =============================================
-- SIMLAB Database Schema — Migration 001
-- Jalankan di Supabase Dashboard > SQL Editor
-- atau: npx supabase db push
-- =============================================

-- Tabel profiles (profil pengguna, terhubung ke auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nama_lengkap  TEXT        NOT NULL,
  nip           TEXT        UNIQUE,
  username      TEXT        UNIQUE NOT NULL,
  email         TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'petugas' CHECK (role IN ('admin', 'petugas')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabel alat (inventaris alat lab)
CREATE TABLE IF NOT EXISTS public.alat (
  id            TEXT        PRIMARY KEY,
  kode          TEXT        NOT NULL UNIQUE,
  nama          TEXT        NOT NULL,
  kategori      TEXT        NOT NULL DEFAULT 'umum',
  uid_rfid      TEXT        UNIQUE,
  jumlah_total  INTEGER     NOT NULL DEFAULT 1,
  jumlah_rusak  INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabel kartu_rfid (kartu per perwakilan kelas)
CREATE TABLE IF NOT EXISTS public.kartu_rfid (
  uid_kartu     TEXT        PRIMARY KEY,
  kelas         TEXT        NOT NULL,
  nama_pemegang TEXT,
  aktif         BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabel transaksi (riwayat peminjaman)
CREATE TABLE IF NOT EXISTS public.transaksi (
  id            TEXT        PRIMARY KEY,
  uid_kartu     TEXT        REFERENCES public.kartu_rfid(uid_kartu),
  kelas         TEXT,
  alat_id       TEXT        REFERENCES public.alat(id),
  nama_alat     TEXT,
  status        TEXT        NOT NULL DEFAULT 'dipinjam' CHECK (status IN ('dipinjam', 'dikembalikan')),
  sumber        TEXT        NOT NULL DEFAULT 'otomatis' CHECK (sumber IN ('otomatis', 'manual')),
  waktu_pinjam  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  waktu_kembali TIMESTAMPTZ,
  petugas       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabel tap_log (log setiap tap RFID dari scanner ESP32)
CREATE TABLE IF NOT EXISTS public.tap_log (
  id                TEXT        PRIMARY KEY,
  uid_kartu         TEXT,
  uid_alat          TEXT,
  jenis_tap         TEXT,
  jenis_terdeteksi  TEXT,
  kelas             TEXT,
  nama_alat         TEXT,
  status            TEXT        NOT NULL CHECK (status IN ('berhasil', 'ditolak')),
  error_code        TEXT,
  is_read           BOOLEAN     NOT NULL DEFAULT FALSE,
  waktu_tap         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes untuk performa query
CREATE INDEX IF NOT EXISTS idx_transaksi_uid_kartu ON public.transaksi(uid_kartu);
CREATE INDEX IF NOT EXISTS idx_transaksi_alat_id   ON public.transaksi(alat_id);
CREATE INDEX IF NOT EXISTS idx_transaksi_status    ON public.transaksi(status);
CREATE INDEX IF NOT EXISTS idx_tap_log_waktu       ON public.tap_log(waktu_tap DESC);
CREATE INDEX IF NOT EXISTS idx_tap_log_uid_kartu   ON public.tap_log(uid_kartu);

-- =============================================
-- Row Level Security (RLS)
-- =============================================

ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alat        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kartu_rfid  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaksi   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tap_log     ENABLE ROW LEVEL SECURITY;

-- Helper: ambil role dari profiles berdasarkan user yang login
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$;

-- ── profiles ──
CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "profiles_admin_select_all" ON public.profiles
  FOR SELECT USING (public.get_my_role() = 'admin');

-- Update profil sendiri (tidak bisa ubah role)
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (role = (SELECT role FROM public.profiles WHERE id = auth.uid()));

-- ── alat ──
CREATE POLICY "alat_read" ON public.alat
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "alat_admin_write" ON public.alat
  FOR ALL USING (public.get_my_role() = 'admin');

-- ── kartu_rfid ──
CREATE POLICY "kartu_rfid_read" ON public.kartu_rfid
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "kartu_rfid_admin_write" ON public.kartu_rfid
  FOR ALL USING (public.get_my_role() = 'admin');

-- ── transaksi ──
CREATE POLICY "transaksi_read" ON public.transaksi
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "transaksi_staff_insert" ON public.transaksi
  FOR INSERT WITH CHECK (public.get_my_role() IN ('admin', 'petugas'));

CREATE POLICY "transaksi_staff_update" ON public.transaksi
  FOR UPDATE USING (public.get_my_role() IN ('admin', 'petugas'));

-- ── tap_log ──
CREATE POLICY "tap_log_read" ON public.tap_log
  FOR SELECT USING (auth.role() = 'authenticated');
-- Insert hanya dari service role (Edge Function / ESP32 webhook)
