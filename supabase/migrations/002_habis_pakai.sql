-- =============================================
-- Migration 002: Alat Habis Pakai & Persetujuan
-- =============================================

-- 1. Tambahkan tipe dan satuan di tabel alat
ALTER TABLE public.alat ADD COLUMN IF NOT EXISTS tipe TEXT NOT NULL DEFAULT 'pinjam' CHECK (tipe IN ('pinjam', 'habis_pakai'));
ALTER TABLE public.alat ADD COLUMN IF NOT EXISTS satuan TEXT NOT NULL DEFAULT 'unit' CHECK (satuan IN ('unit', 'cm', 'pcs', 'meter', 'pack'));

-- 2. Update constraint pada tap_log untuk mengizinkan status 'menunggu'
DO $$ 
DECLARE 
  constraint_name text;
BEGIN
  -- Cari nama constraint check status pada tap_log
  SELECT conname INTO constraint_name
  FROM pg_constraint 
  WHERE conrelid = 'public.tap_log'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%status%';
  
  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.tap_log DROP CONSTRAINT ' || constraint_name;
  END IF;
END $$;
ALTER TABLE public.tap_log ADD CONSTRAINT tap_log_status_check CHECK (status IN ('berhasil', 'ditolak', 'menunggu'));

-- 3. Tabel permintaan_habis_pakai
CREATE TABLE IF NOT EXISTS public.permintaan_habis_pakai (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  uid_kartu TEXT REFERENCES public.kartu_rfid(uid_kartu) ON DELETE CASCADE,
  kelas TEXT,
  alat_id TEXT REFERENCES public.alat(id) ON DELETE CASCADE,
  nama_alat TEXT,
  satuan TEXT,
  status TEXT NOT NULL DEFAULT 'menunggu' CHECK (status IN ('menunggu', 'disetujui', 'ditolak', 'dibatalkan')),
  jumlah INTEGER NULL CHECK (jumlah IS NULL OR jumlah > 0),
  catatan TEXT,
  alasan_tolak TEXT,
  petugas TEXT,
  waktu_tap TIMESTAMPTZ DEFAULT NOW(),
  waktu_proses TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial index untuk cegah permintaan ganda yang masih menunggu
CREATE UNIQUE INDEX IF NOT EXISTS idx_permintaan_menunggu_unique 
  ON public.permintaan_habis_pakai (uid_kartu, alat_id) 
  WHERE status = 'menunggu';

CREATE INDEX IF NOT EXISTS idx_permintaan_status ON public.permintaan_habis_pakai(status);
CREATE INDEX IF NOT EXISTS idx_permintaan_waktu ON public.permintaan_habis_pakai(waktu_tap DESC);

-- 4. Tabel stok_mutasi
CREATE TABLE IF NOT EXISTS public.stok_mutasi (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  alat_id TEXT REFERENCES public.alat(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  stok_setelah INTEGER NOT NULL,
  alasan TEXT NOT NULL CHECK (alasan IN ('persetujuan', 'pembatalan', 'restock', 'penyesuaian')),
  permintaan_id TEXT REFERENCES public.permintaan_habis_pakai(id) ON DELETE SET NULL,
  catatan TEXT,
  petugas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. RLS
ALTER TABLE public.permintaan_habis_pakai ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stok_mutasi ENABLE ROW LEVEL SECURITY;

CREATE POLICY "permintaan_read" ON public.permintaan_habis_pakai
  FOR SELECT USING (public.get_my_role() IN ('admin', 'petugas'));

CREATE POLICY "stok_mutasi_read" ON public.stok_mutasi
  FOR SELECT USING (public.get_my_role() IN ('admin', 'petugas'));

-- 6. Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'permintaan_habis_pakai'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.permintaan_habis_pakai;
  END IF;
END $$;

-- 7. Functions Atomik (Service Role Only)
CREATE OR REPLACE FUNCTION public.setujui_permintaan_habis_pakai(p_id TEXT, p_jumlah INTEGER, p_petugas TEXT, p_catatan TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_permintaan RECORD;
  v_alat RECORD;
  v_stok_baru INTEGER;
BEGIN
  -- Kunci row permintaan
  SELECT * INTO v_permintaan FROM permintaan_habis_pakai WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'permintaan_tidak_ditemukan');
  END IF;
  
  IF v_permintaan.status != 'menunggu' THEN
    RETURN json_build_object('success', false, 'error', 'permintaan_sudah_diproses');
  END IF;

  -- Kunci row alat
  SELECT * INTO v_alat FROM alat WHERE id = v_permintaan.alat_id FOR UPDATE;
  
  IF v_alat.jumlah_total < p_jumlah THEN
    RETURN json_build_object('success', false, 'error', 'stok_tidak_cukup');
  END IF;

  v_stok_baru := v_alat.jumlah_total - p_jumlah;

  -- Update stok alat
  UPDATE alat SET jumlah_total = v_stok_baru WHERE id = v_alat.id;

  -- Update permintaan
  UPDATE permintaan_habis_pakai 
  SET status = 'disetujui', jumlah = p_jumlah, petugas = p_petugas, catatan = p_catatan, waktu_proses = NOW()
  WHERE id = p_id;

  -- Insert mutasi
  INSERT INTO stok_mutasi (alat_id, delta, stok_setelah, alasan, permintaan_id, petugas, catatan)
  VALUES (v_alat.id, -p_jumlah, v_stok_baru, 'persetujuan', p_id, p_petugas, p_catatan);

  RETURN json_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.setujui_permintaan_habis_pakai(TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.setujui_permintaan_habis_pakai(TEXT, INTEGER, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.setujui_permintaan_habis_pakai(TEXT, INTEGER, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.batalkan_permintaan_habis_pakai(p_id TEXT, p_petugas TEXT, p_catatan TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_permintaan RECORD;
  v_alat RECORD;
  v_stok_baru INTEGER;
BEGIN
  SELECT * INTO v_permintaan FROM permintaan_habis_pakai WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'permintaan_tidak_ditemukan'); END IF;
  IF v_permintaan.status != 'disetujui' THEN RETURN json_build_object('success', false, 'error', 'hanya_disetujui_bisa_dibatalkan'); END IF;

  SELECT * INTO v_alat FROM alat WHERE id = v_permintaan.alat_id FOR UPDATE;
  v_stok_baru := v_alat.jumlah_total + v_permintaan.jumlah;

  UPDATE alat SET jumlah_total = v_stok_baru WHERE id = v_alat.id;
  UPDATE permintaan_habis_pakai SET status = 'dibatalkan', petugas = p_petugas, catatan = p_catatan, waktu_proses = NOW() WHERE id = p_id;
  
  INSERT INTO stok_mutasi (alat_id, delta, stok_setelah, alasan, permintaan_id, petugas, catatan)
  VALUES (v_alat.id, v_permintaan.jumlah, v_stok_baru, 'pembatalan', p_id, p_petugas, p_catatan);

  RETURN json_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.batalkan_permintaan_habis_pakai(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.batalkan_permintaan_habis_pakai(TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.batalkan_permintaan_habis_pakai(TEXT, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.ubah_stok_habis_pakai(p_alat_id TEXT, p_mode TEXT, p_nilai INTEGER, p_catatan TEXT, p_petugas TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_alat RECORD;
  v_stok_baru INTEGER;
  v_delta INTEGER;
BEGIN
  SELECT * INTO v_alat FROM alat WHERE id = p_alat_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'alat_tidak_ditemukan'); END IF;

  IF p_mode = 'restock' THEN
    v_stok_baru := v_alat.jumlah_total + p_nilai;
    v_delta := p_nilai;
  ELSIF p_mode = 'penyesuaian' THEN
    v_stok_baru := p_nilai;
    v_delta := p_nilai - v_alat.jumlah_total;
  ELSE
    RETURN json_build_object('success', false, 'error', 'mode_tidak_valid');
  END IF;

  UPDATE alat SET jumlah_total = v_stok_baru WHERE id = v_alat.id;

  INSERT INTO stok_mutasi (alat_id, delta, stok_setelah, alasan, petugas, catatan)
  VALUES (v_alat.id, v_delta, v_stok_baru, p_mode, p_petugas, p_catatan);

  RETURN json_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ubah_stok_habis_pakai(TEXT, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ubah_stok_habis_pakai(TEXT, TEXT, INTEGER, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ubah_stok_habis_pakai(TEXT, TEXT, INTEGER, TEXT, TEXT) TO service_role;

-- 8. Update v_list_barang
CREATE OR REPLACE VIEW public.v_list_barang WITH (security_invoker = true) AS
SELECT
  a.id,
  a.kode,
  a.nama,
  a.kategori,
  a.jumlah_total,
  a.jumlah_rusak,
  CASE 
    WHEN a.tipe = 'habis_pakai' THEN a.jumlah_total
    ELSE GREATEST(0, a.jumlah_total - a.jumlah_rusak - COALESCE(dipinjam.total, 0))::INTEGER 
  END AS stok_tersedia,
  CASE WHEN a.tipe = 'habis_pakai' THEN 0 ELSE COALESCE(dipinjam.total, 0)::INTEGER END AS dipinjam_aktif,
  CASE
    WHEN a.tipe = 'habis_pakai' THEN 
      CASE WHEN a.jumlah_total <= 0 THEN 'habis' ELSE 'tersedia' END
    ELSE
      CASE 
        WHEN (a.jumlah_total - a.jumlah_rusak - COALESCE(dipinjam.total, 0)) <= 0 THEN 'habis'
        WHEN COALESCE(dipinjam.total, 0) > 0 THEN 'dipinjam'
        ELSE 'tersedia'
      END
  END AS status,
  CASE WHEN a.tipe = 'habis_pakai' THEN NULL ELSE dipinjam.last_uid_kartu END AS peminjam_kartu,
  CASE WHEN a.tipe = 'habis_pakai' THEN NULL ELSE dipinjam.last_kelas END AS peminjam_kelas,
  a.tipe,
  a.satuan
FROM public.alat a
LEFT JOIN (
  SELECT
    alat_id,
    COUNT(*)::INTEGER AS total,
    (ARRAY_AGG(uid_kartu ORDER BY waktu_pinjam DESC))[1] AS last_uid_kartu,
    (ARRAY_AGG(kelas ORDER BY waktu_pinjam DESC))[1] AS last_kelas
  FROM public.transaksi
  WHERE status = 'dipinjam'
  GROUP BY alat_id
) dipinjam ON a.id = dipinjam.alat_id;

GRANT SELECT ON public.v_list_barang TO authenticated;
GRANT SELECT ON public.v_list_barang TO service_role;
