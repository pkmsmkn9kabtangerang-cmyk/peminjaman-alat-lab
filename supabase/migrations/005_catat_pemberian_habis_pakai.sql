-- =============================================
-- Migration 005: Fungsi Atomik Pemberian Alat Habis Pakai Manual
-- =============================================

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

  -- 4. Cek ketersediaan stok
  IF v_alat.jumlah_total < p_jumlah THEN
    RETURN json_build_object(
      'success', false,
      'error', 'stok_habis',
      'message', 'Stok tidak cukup. Tersedia: ' || v_alat.jumlah_total || ', diminta: ' || p_jumlah
    );
  END IF;

  v_stok_baru := v_alat.jumlah_total - p_jumlah;

  -- 5. Kurangi stok alat
  UPDATE public.alat SET jumlah_total = v_stok_baru WHERE id = v_alat.id;

  -- 6. Insert ke permintaan_habis_pakai (status 'disetujui' karena manual oleh petugas)
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

  -- 7. Insert ke riwayat mutasi stok
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
