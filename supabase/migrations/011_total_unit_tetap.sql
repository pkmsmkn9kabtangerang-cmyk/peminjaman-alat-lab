-- =============================================
-- Migration 011: Total unit consumable tetap, stok dihitung dari pemakaian
-- =============================================
-- Sebelumnya `alat.jumlah_total` ikut berkurang setiap kali barang sekali
-- pakai diberikan. Akibatnya kolom "Total Unit" di Daftar Alat berubah
-- menjadi stok tersisa. Mulai migration ini:
--   jumlah_total = total unit yang dimiliki (tidak berubah saat dipakai)
--   stok_tersedia = jumlah_total - total permintaan yang disetujui
-- =============================================

-- 1. Kembalikan jumlah_total menjadi total unit.
--    Nilai lama sudah dikurangi oleh permintaan berstatus 'disetujui',
--    jadi tambahkan kembali jumlah yang sudah diberikan.
--    Guard mencegah penambahan ganda bila migration dijalankan ulang:
--    view baru selalu memuat kolom turunan `terpakai`.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_views
    WHERE schemaname = 'public'
      AND viewname = 'v_list_barang'
      AND position('terpakai' IN definition) = 0
  ) THEN
    UPDATE public.alat a
    SET jumlah_total = a.jumlah_total + COALESCE((
      SELECT SUM(p.jumlah)
      FROM public.permintaan_habis_pakai p
      WHERE p.alat_id = a.id
        AND p.status = 'disetujui'
        AND p.jumlah IS NOT NULL
    ), 0)::INTEGER
    WHERE a.tipe = 'habis_pakai';
  END IF;
END $$;

-- 2. View: stok tersedia dihitung dari total unit dikurangi pemakaian.
--    View dibuat ulang (bukan CREATE OR REPLACE) agar urutan kolom lama
--    yang berbeda tetap aman. Tidak ada view lain yang bergantung padanya.
CREATE INDEX IF NOT EXISTS idx_permintaan_disetujui_alat
  ON public.permintaan_habis_pakai (alat_id)
  WHERE status = 'disetujui';

DROP VIEW IF EXISTS public.v_list_barang;
CREATE VIEW public.v_list_barang
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
      GREATEST(0, a.jumlah_total - COALESCE(terpakai.total, 0))::INTEGER
    ELSE
      GREATEST(0, a.jumlah_total - a.jumlah_rusak - COALESCE(dipinjam.total, 0))::INTEGER
  END AS stok_tersedia,
  CASE
    WHEN COALESCE(a.tipe, 'pinjam') = 'habis_pakai' THEN 0
    ELSE COALESCE(dipinjam.total, 0)::INTEGER
  END AS dipinjam_aktif,
  CASE
    WHEN COALESCE(a.tipe, 'pinjam') = 'habis_pakai' THEN
      CASE
        WHEN GREATEST(0, a.jumlah_total - COALESCE(terpakai.total, 0)) <= 0 THEN 'habis'
        ELSE 'tersedia'
      END
    WHEN (a.jumlah_total - a.jumlah_rusak - COALESCE(dipinjam.total, 0)) <= 0 THEN 'habis'
    WHEN COALESCE(dipinjam.total, 0) > 0 THEN 'dipinjam'
    ELSE 'tersedia'
  END AS status,
  dipinjam.last_uid_kartu AS peminjam_kartu,
  dipinjam.last_kelas     AS peminjam_kelas,
  COALESCE(terpakai.total, 0)::INTEGER AS terpakai
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
) dipinjam ON a.id = dipinjam.alat_id
LEFT JOIN (
  SELECT
    alat_id,
    SUM(jumlah)::INTEGER AS total
  FROM public.permintaan_habis_pakai
  WHERE status = 'disetujui'
    AND jumlah IS NOT NULL
  GROUP BY alat_id
) terpakai ON a.id = terpakai.alat_id;

GRANT SELECT ON public.v_list_barang TO authenticated;
GRANT SELECT ON public.v_list_barang TO service_role;

-- 3. Setujui permintaan: jangan ubah jumlah_total, cukup catat pemakaian.
CREATE OR REPLACE FUNCTION public.setujui_permintaan_habis_pakai(p_id TEXT, p_jumlah INTEGER, p_petugas TEXT, p_catatan TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_permintaan RECORD;
  v_alat RECORD;
  v_terpakai INTEGER;
  v_stok_tersedia INTEGER;
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
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'alat_tidak_ditemukan');
  END IF;

  -- Hitung pemakaian yang sudah disetujui (permintaan ini masih 'menunggu').
  SELECT COALESCE(SUM(jumlah), 0) INTO v_terpakai
  FROM permintaan_habis_pakai
  WHERE alat_id = v_alat.id
    AND status = 'disetujui'
    AND jumlah IS NOT NULL;

  v_stok_tersedia := GREATEST(0, v_alat.jumlah_total - v_terpakai);

  IF v_stok_tersedia < p_jumlah THEN
    RETURN json_build_object('success', false, 'error', 'stok_tidak_cukup');
  END IF;

  v_stok_baru := v_stok_tersedia - p_jumlah;

  -- Update permintaan
  UPDATE permintaan_habis_pakai
  SET status = 'disetujui', jumlah = p_jumlah, petugas = p_petugas, catatan = p_catatan, waktu_proses = NOW()
  WHERE id = p_id;

  -- Insert mutasi (jumlah_total tidak diubah)
  INSERT INTO stok_mutasi (alat_id, delta, stok_setelah, alasan, permintaan_id, petugas, catatan)
  VALUES (v_alat.id, -p_jumlah, v_stok_baru, 'persetujuan', p_id, p_petugas, p_catatan);

  RETURN json_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.setujui_permintaan_habis_pakai(TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.setujui_permintaan_habis_pakai(TEXT, INTEGER, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.setujui_permintaan_habis_pakai(TEXT, INTEGER, TEXT, TEXT) TO service_role;

-- 4. Batalkan persetujuan: stok otomatis kembali karena status tidak lagi
--    dihitung sebagai pemakaian. jumlah_total tetap.
CREATE OR REPLACE FUNCTION public.batalkan_permintaan_habis_pakai(p_id TEXT, p_petugas TEXT, p_catatan TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_permintaan RECORD;
  v_alat RECORD;
  v_terpakai INTEGER;
  v_stok_baru INTEGER;
BEGIN
  SELECT * INTO v_permintaan FROM permintaan_habis_pakai WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'permintaan_tidak_ditemukan'); END IF;
  IF v_permintaan.status != 'disetujui' THEN RETURN json_build_object('success', false, 'error', 'hanya_disetujui_bisa_dibatalkan'); END IF;

  SELECT * INTO v_alat FROM alat WHERE id = v_permintaan.alat_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'alat_tidak_ditemukan'); END IF;

  -- Hitung pemakaian setelah permintaan ini dibatalkan.
  SELECT COALESCE(SUM(jumlah), 0) INTO v_terpakai
  FROM permintaan_habis_pakai
  WHERE alat_id = v_alat.id
    AND status = 'disetujui'
    AND jumlah IS NOT NULL
    AND id <> p_id;

  v_stok_baru := GREATEST(0, v_alat.jumlah_total - v_terpakai);

  UPDATE permintaan_habis_pakai SET status = 'dibatalkan', petugas = p_petugas, catatan = p_catatan, waktu_proses = NOW() WHERE id = p_id;

  INSERT INTO stok_mutasi (alat_id, delta, stok_setelah, alasan, permintaan_id, petugas, catatan)
  VALUES (v_alat.id, COALESCE(v_permintaan.jumlah, 0), v_stok_baru, 'pembatalan', p_id, p_petugas, p_catatan);

  RETURN json_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.batalkan_permintaan_habis_pakai(TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.batalkan_permintaan_habis_pakai(TEXT, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.batalkan_permintaan_habis_pakai(TEXT, TEXT, TEXT) TO service_role;

-- 5. Pemberian manual: catat permintaan tanpa mengurangi jumlah_total.
CREATE OR REPLACE FUNCTION public.catat_pemberian_habis_pakai(
  p_uid_kartu TEXT,
  p_alat_id TEXT,
  p_jumlah INTEGER,
  p_petugas TEXT,
  p_catatan TEXT
)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_kartu RECORD;
  v_alat RECORD;
  v_terpakai INTEGER;
  v_stok_tersedia INTEGER;
  v_stok_baru INTEGER;
  v_permintaan_id TEXT;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  -- 1. Validasi jumlah
  IF p_jumlah IS NULL OR p_jumlah <= 0 THEN
    RETURN json_build_object('success', false, 'error', 'jumlah_tidak_valid', 'message', 'Jumlah harus lebih besar dari 0');
  END IF;

  -- 2. Cek kartu
  SELECT * INTO v_kartu FROM public.kartu_rfid WHERE uid_kartu = p_uid_kartu;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'kartu_tidak_ditemukan', 'message', 'Kartu RFID tidak ditemukan');
  END IF;

  IF NOT v_kartu.aktif THEN
    RETURN json_build_object('success', false, 'error', 'kartu_nonaktif', 'message', 'Kartu RFID sudah dinonaktifkan');
  END IF;

  -- 3. Kunci row alat dan cek tipe
  SELECT * INTO v_alat FROM public.alat WHERE id = p_alat_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN json_build_object('success', false, 'error', 'alat_tidak_ditemukan', 'message', 'Alat tidak ditemukan');
  END IF;

  IF v_alat.tipe != 'habis_pakai' THEN
    RETURN json_build_object('success', false, 'error', 'bukan_alat_habis_pakai', 'message', 'Alat ini bukan tipe habis pakai');
  END IF;

  -- 4. Cek ketersediaan stok dari total unit dikurangi pemakaian disetujui
  SELECT COALESCE(SUM(jumlah), 0) INTO v_terpakai
  FROM public.permintaan_habis_pakai
  WHERE alat_id = v_alat.id
    AND status = 'disetujui'
    AND jumlah IS NOT NULL;

  v_stok_tersedia := GREATEST(0, v_alat.jumlah_total - v_terpakai);

  IF v_stok_tersedia < p_jumlah THEN
    RETURN json_build_object(
      'success', false,
      'error', 'stok_habis',
      'message', 'Stok tidak cukup. Tersedia: ' || v_stok_tersedia || ', diminta: ' || p_jumlah
    );
  END IF;

  v_stok_baru := v_stok_tersedia - p_jumlah;

  -- 5. Insert ke permintaan_habis_pakai (status 'disetujui' karena manual oleh petugas)
  v_permintaan_id := 'REQ-MANUAL-' || EXTRACT(EPOCH FROM v_now)::BIGINT || '-' || floor(random() * 1000)::INT;
  INSERT INTO public.permintaan_habis_pakai (
    id,
    uid_kartu,
    kelas,
    alat_id,
    nama_alat,
    satuan,
    status,
    jumlah,
    catatan,
    petugas,
    waktu_tap,
    waktu_proses,
    created_at
  ) VALUES (
    v_permintaan_id,
    v_kartu.uid_kartu,
    v_kartu.kelas,
    v_alat.id,
    v_alat.nama,
    v_alat.satuan,
    'disetujui',
    p_jumlah,
    p_catatan,
    p_petugas,
    v_now,
    v_now,
    v_now
  );

  -- 6. Insert ke riwayat mutasi stok (jumlah_total tidak diubah)
  INSERT INTO public.stok_mutasi (
    alat_id,
    delta,
    stok_setelah,
    alasan,
    permintaan_id,
    petugas,
    catatan,
    created_at
  ) VALUES (
    v_alat.id,
    -p_jumlah,
    v_stok_baru,
    'persetujuan',
    v_permintaan_id,
    p_petugas,
    COALESCE(p_catatan, 'Pemberian manual petugas'),
    v_now
  );

  RETURN json_build_object(
    'success', true,
    'permintaan_id', v_permintaan_id,
    'stok_setelah', v_stok_baru,
    'message', p_jumlah || ' ' || COALESCE(v_alat.satuan, 'unit') || ' ' || v_alat.nama || ' berhasil diberikan ke ' || v_kartu.kelas
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.catat_pemberian_habis_pakai(TEXT, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.catat_pemberian_habis_pakai(TEXT, TEXT, INTEGER, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.catat_pemberian_habis_pakai(TEXT, TEXT, INTEGER, TEXT, TEXT) TO service_role;

-- 6. Restock / penyesuaian stok.
--    Restock menambah total unit. Penyesuaian menetapkan stok tersisa,
--    sehingga total unit menjadi pemakaian + stok hasil penyesuaian.
CREATE OR REPLACE FUNCTION public.ubah_stok_habis_pakai(p_alat_id TEXT, p_mode TEXT, p_nilai INTEGER, p_catatan TEXT, p_petugas TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_alat RECORD;
  v_terpakai INTEGER;
  v_stok_lama INTEGER;
  v_stok_baru INTEGER;
  v_delta INTEGER;
BEGIN
  SELECT * INTO v_alat FROM alat WHERE id = p_alat_id FOR UPDATE;
  IF NOT FOUND THEN RETURN json_build_object('success', false, 'error', 'alat_tidak_ditemukan'); END IF;

  SELECT COALESCE(SUM(jumlah), 0) INTO v_terpakai
  FROM permintaan_habis_pakai
  WHERE alat_id = v_alat.id
    AND status = 'disetujui'
    AND jumlah IS NOT NULL;

  v_stok_lama := GREATEST(0, v_alat.jumlah_total - v_terpakai);

  IF p_mode = 'restock' THEN
    UPDATE alat SET jumlah_total = v_alat.jumlah_total + p_nilai WHERE id = v_alat.id;
    v_stok_baru := v_stok_lama + p_nilai;
    v_delta := p_nilai;
  ELSIF p_mode = 'penyesuaian' THEN
    v_stok_baru := GREATEST(0, p_nilai);
    UPDATE alat SET jumlah_total = v_terpakai + v_stok_baru WHERE id = v_alat.id;
    v_delta := v_stok_baru - v_stok_lama;
  ELSE
    RETURN json_build_object('success', false, 'error', 'mode_tidak_valid');
  END IF;

  INSERT INTO stok_mutasi (alat_id, delta, stok_setelah, alasan, petugas, catatan)
  VALUES (v_alat.id, v_delta, v_stok_baru, p_mode, p_petugas, p_catatan);

  RETURN json_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.ubah_stok_habis_pakai(TEXT, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ubah_stok_habis_pakai(TEXT, TEXT, INTEGER, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ubah_stok_habis_pakai(TEXT, TEXT, INTEGER, TEXT, TEXT) TO service_role;
