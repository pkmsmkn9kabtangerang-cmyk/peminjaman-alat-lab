-- =============================================
-- Migration 004: Fix constraint satuan alat + view update
-- =============================================

-- Fix constraint satuan di tabel alat (tambahkan 'meter' dan 'pack')
DO $$
DECLARE
  constraint_name text;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.alat'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%satuan%';
  
  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.alat DROP CONSTRAINT ' || constraint_name;
  END IF;
END $$;

ALTER TABLE public.alat ADD CONSTRAINT alat_satuan_check 
  CHECK (satuan IN ('unit', 'cm', 'pcs', 'meter', 'pack'));

-- Update view v_list_barang agar menyertakan kolom tipe dan satuan
-- (penting agar KelolaAlat bisa filtering habis_pakai dari view)
CREATE OR REPLACE VIEW public.v_list_barang
WITH (security_invoker = true) AS
SELECT
  a.id,
  a.kode,
  a.nama,
  a.kategori,
  a.jumlah_total,
  a.jumlah_rusak,
  COALESCE(a.tipe, 'pinjam')   AS tipe,
  COALESCE(a.satuan, 'unit')   AS satuan,
  CASE
    WHEN COALESCE(a.tipe, 'pinjam') = 'habis_pakai' THEN
      GREATEST(0, a.jumlah_total)::INTEGER
    ELSE
      GREATEST(0, a.jumlah_total - a.jumlah_rusak - COALESCE(dipinjam.total, 0))::INTEGER
  END AS stok_tersedia,
  CASE
    WHEN COALESCE(a.tipe, 'pinjam') = 'habis_pakai' THEN 0
    ELSE COALESCE(dipinjam.total, 0)::INTEGER
  END AS dipinjam_aktif,
  CASE
    WHEN COALESCE(a.tipe, 'pinjam') = 'habis_pakai' THEN
      CASE WHEN a.jumlah_total <= 0 THEN 'habis' ELSE 'tersedia' END
    WHEN (a.jumlah_total - a.jumlah_rusak - COALESCE(dipinjam.total, 0)) <= 0 THEN 'habis'
    WHEN COALESCE(dipinjam.total, 0) > 0 THEN 'dipinjam'
    ELSE 'tersedia'
  END AS status,
  dipinjam.last_uid_kartu AS peminjam_kartu,
  dipinjam.last_kelas     AS peminjam_kelas
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
