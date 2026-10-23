-- =============================================
-- Migration 006: Tabel rfid_session untuk Sesi RFID Persisten
-- =============================================

-- Tabel rfid_session: menyimpan sesi aktif per perangkat RFID
CREATE TABLE IF NOT EXISTS public.rfid_session (
  device_id   TEXT        PRIMARY KEY,
  uid_kartu   TEXT        NOT NULL REFERENCES public.kartu_rfid(uid_kartu) ON DELETE CASCADE,
  kelas       TEXT,
  jenis       TEXT        NOT NULL CHECK (jenis IN ('pinjam', 'kembali')),
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index untuk mempercepat query & pengecekan waktu kedaluwarsa sesi
CREATE INDEX IF NOT EXISTS idx_rfid_session_expires_at ON public.rfid_session(expires_at);

-- Row Level Security (RLS)
ALTER TABLE public.rfid_session ENABLE ROW LEVEL SECURITY;

-- Batasi akses: Hanya service_role (Edge Functions) yang diizinkan mengakses tabel ini
REVOKE ALL ON TABLE public.rfid_session FROM PUBLIC;
REVOKE ALL ON TABLE public.rfid_session FROM anon;
REVOKE ALL ON TABLE public.rfid_session FROM authenticated;
GRANT ALL ON TABLE public.rfid_session TO service_role;
