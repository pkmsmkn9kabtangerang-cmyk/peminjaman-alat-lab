-- =============================================
-- Migration 012: Tap RFID atomik tanpa mode global
-- =============================================
-- Semua keputusan transaksi RFID dilakukan di database dalam satu
-- transaksi PostgreSQL. Firmware hanya mengirim UID dan menampilkan
-- respons yang dikembalikan fungsi ini.
--
-- Prinsip:
--   * Satu sesi per device (rfid_session.device_id).
--   * Sesi berakhir setelah 20 detik tanpa tap berhasil.
--   * processed_alat menyimpan UID alat yang sudah berhasil diproses
--     pada sesi aktif. Tap UID yang sama ditolak sebagai tap_duplikat.
--   * Tidak ada mode global PINJAM/KEMBALI. Aksi ditentukan per UID alat
--     dari kondisi transaksi terkini.
--   * Locking:
--       - advisory lock per device  -> tap dari device yang sama antre
--       - SELECT ... FOR UPDATE alat -> dua device yang men-tap unit yang
--         sama antre, sehingga tidak mungkin membuat dua transaksi aktif.
-- =============================================

-- 1. Pastikan tabel dan kolom yang menjadi prasyarat tersedia.
DO $$
BEGIN
  IF to_regclass('public.rfid_session') IS NULL THEN
    RAISE EXCEPTION 'Migration 006 (rfid_session) belum diterapkan.';
  END IF;
  IF to_regclass('public.alat') IS NULL
     OR to_regclass('public.kartu_rfid') IS NULL
     OR to_regclass('public.transaksi') IS NULL
     OR to_regclass('public.tap_log') IS NULL
     OR to_regclass('public.permintaan_habis_pakai') IS NULL THEN
    RAISE EXCEPTION 'Skema dasar (migration 001/002) belum lengkap.';
  END IF;
END $$;

-- 2. processed_alat wajib ada. Tidak ada fallback yang mematikan
--    perlindungan duplikat bila kolom ini belum tersedia.
ALTER TABLE public.rfid_session
  ADD COLUMN IF NOT EXISTS processed_alat TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

-- 3. Hapus konsep mode global dari kolom jenis. Kolom tetap dipertahankan
--    agar data lama tidak hilang, tetapi sesi baru memakai nilai 'aktif'
--    dan kode tidak lagi membacanya untuk menentukan aksi.
ALTER TABLE public.rfid_session
  ALTER COLUMN jenis DROP NOT NULL;
ALTER TABLE public.rfid_session
  ALTER COLUMN jenis SET DEFAULT 'aktif';

DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  FOR v_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.rfid_session'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%jenis%'
  LOOP
    EXECUTE format('ALTER TABLE public.rfid_session DROP CONSTRAINT %I', v_constraint);
  END LOOP;
END $$;

ALTER TABLE public.rfid_session
  ADD CONSTRAINT rfid_session_jenis_check
  CHECK (jenis IS NULL OR jenis IN ('aktif', 'pinjam', 'kembali'));

-- 4. Index untuk pemeriksaan transaksi aktif per unit alat.
CREATE INDEX IF NOT EXISTS idx_transaksi_aktif_alat
  ON public.transaksi (alat_id)
  WHERE status = 'dipinjam';

-- 5. Fungsi atomik pemroses tap RFID.
--    Hanya boleh dipanggil dengan service role dari Edge Function.
CREATE OR REPLACE FUNCTION public.process_rfid_tap(
  p_device_id TEXT,
  p_uid TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now          TIMESTAMPTZ := clock_timestamp();
  v_device_id    TEXT := btrim(COALESCE(p_device_id, ''));
  v_uid          TEXT := upper(btrim(COALESCE(p_uid, '')));
  v_kartu        RECORD;
  v_alat         RECORD;
  v_session      RECORD;
  v_trx          RECORD;
  v_owner        RECORD;
  v_aktif        INTEGER := 0;
  v_has_session  BOOLEAN := FALSE;
  v_terpakai     INTEGER := 0;
  v_stok         INTEGER := 0;
  v_kelas        TEXT;
  v_peminjam     TEXT;
  v_expires      TIMESTAMPTZ;
  v_trx_id       TEXT;
  v_req_id       TEXT;
  v_alat_json    JSON;
BEGIN
  IF v_device_id = '' OR v_uid = '' THEN
    RETURN json_build_object(
      'success', false,
      'code', 'payload_tidak_lengkap',
      'action', 'error',
      'message', 'UID dan device ID wajib diisi.',
      'alat', NULL,
      'kelas', NULL,
      'session', NULL
    );
  END IF;

  -- Semua tap dari device yang sama diproses berurutan. Ini mencegah dua
  -- request kartu yang hampir bersamaan membuat dua sesi.
  PERFORM pg_advisory_xact_lock(65280, hashtext(v_device_id));

  -- =====================================================
  -- A. UID KARTU KELAS
  -- =====================================================
  SELECT * INTO v_kartu
  FROM public.kartu_rfid
  WHERE upper(uid_kartu) = v_uid
  LIMIT 1;

  IF FOUND THEN
    IF NOT v_kartu.aktif THEN
      -- Sesi milik kartu ini tidak boleh tetap hidup setelah kartu
      -- dinonaktifkan. Sesi kartu lain pada device yang sama tidak disentuh.
      DELETE FROM public.rfid_session
      WHERE device_id = v_device_id
        AND uid_kartu = v_kartu.uid_kartu;

      INSERT INTO public.tap_log (
        id, uid_kartu, uid_alat, jenis_tap, jenis_terdeteksi,
        kelas, nama_alat, status, error_code, is_read, waktu_tap
      ) VALUES (
        'LOG-' || gen_random_uuid()::text,
        v_kartu.uid_kartu, NULL, 'kartu', 'otomatis',
        v_kartu.kelas, NULL, 'ditolak', 'kartu_nonaktif', FALSE, v_now
      );

      RETURN json_build_object(
        'success', false,
        'code', 'kartu_nonaktif',
        'action', 'tolak',
        'message', 'Kartu RFID tidak aktif.',
        'alat', NULL,
        'kelas', v_kartu.kelas,
        'session', NULL
      );
    END IF;

    SELECT * INTO v_session
    FROM public.rfid_session
    WHERE device_id = v_device_id
    FOR UPDATE;

    v_has_session := FOUND;

    IF v_has_session AND v_session.expires_at <= v_now THEN
      DELETE FROM public.rfid_session WHERE device_id = v_device_id;
      v_has_session := FALSE;
    END IF;

    -- Masih ada sesi aktif pada device ini.
    IF v_has_session THEN
      IF v_session.uid_kartu = v_kartu.uid_kartu THEN
        -- Kartu yang sama ditap lagi: akhiri sesi.
        DELETE FROM public.rfid_session WHERE device_id = v_device_id;

        INSERT INTO public.tap_log (
          id, uid_kartu, uid_alat, jenis_tap, jenis_terdeteksi,
          kelas, nama_alat, status, error_code, is_read, waktu_tap
        ) VALUES (
          'LOG-' || gen_random_uuid()::text,
          v_kartu.uid_kartu, NULL, 'selesai', 'otomatis',
          v_kartu.kelas, NULL, 'berhasil', NULL, FALSE, v_now
        );

        RETURN json_build_object(
          'success', true,
          'code', 'sesi_selesai',
          'action', 'selesai',
          'message', 'Sesi ' || COALESCE(v_kartu.kelas, v_session.kelas, v_kartu.uid_kartu) || ' selesai.',
          'alat', NULL,
          'kelas', COALESCE(v_kartu.kelas, v_session.kelas),
          'session', NULL
        );
      END IF;

      -- Kartu lain men-tap saat sesi masih aktif.
      SELECT * INTO v_owner
      FROM public.kartu_rfid
      WHERE uid_kartu = v_session.uid_kartu
      LIMIT 1;

      INSERT INTO public.tap_log (
        id, uid_kartu, uid_alat, jenis_tap, jenis_terdeteksi,
        kelas, nama_alat, status, error_code, is_read, waktu_tap
      ) VALUES (
        'LOG-' || gen_random_uuid()::text,
        v_kartu.uid_kartu, NULL, 'kartu', 'otomatis',
        v_kartu.kelas, NULL, 'ditolak', 'sesi_kartu_lain_aktif', FALSE, v_now
      );

      RETURN json_build_object(
        'success', false,
        'code', 'sesi_kartu_lain_aktif',
        'action', 'tolak',
        'message', 'Sesi ' || COALESCE(v_owner.nama_pemegang, v_owner.kelas, v_session.kelas, v_session.uid_kartu) || ' sedang aktif.',
        'alat', NULL,
        'kelas', v_kartu.kelas,
        'session', json_build_object(
          'uid_kartu', v_session.uid_kartu,
          'kelas', COALESCE(v_owner.kelas, v_session.kelas),
          'nama_pemegang', v_owner.nama_pemegang,
          'expires_at', v_session.expires_at
        )
      );
    END IF;

    -- Mulai sesi baru. Tidak ada lagi penentuan mode pinjam/kembali.
    v_expires := v_now + INTERVAL '20 seconds';

    INSERT INTO public.rfid_session (
      device_id, uid_kartu, kelas, jenis, processed_alat,
      expires_at, created_at, updated_at
    ) VALUES (
      v_device_id, v_kartu.uid_kartu, v_kartu.kelas, 'aktif', ARRAY[]::TEXT[],
      v_expires, v_now, v_now
    )
    ON CONFLICT (device_id) DO UPDATE SET
      uid_kartu     = EXCLUDED.uid_kartu,
      kelas         = EXCLUDED.kelas,
      jenis         = 'aktif',
      processed_alat = ARRAY[]::TEXT[],
      expires_at    = EXCLUDED.expires_at,
      updated_at    = EXCLUDED.updated_at;

    INSERT INTO public.tap_log (
      id, uid_kartu, uid_alat, jenis_tap, jenis_terdeteksi,
      kelas, nama_alat, status, error_code, is_read, waktu_tap
    ) VALUES (
      'LOG-' || gen_random_uuid()::text,
      v_kartu.uid_kartu, NULL, 'kartu', 'otomatis',
      v_kartu.kelas, NULL, 'berhasil', NULL, FALSE, v_now
    );

    RETURN json_build_object(
      'success', true,
      'code', 'sesi_dimulai',
      'action', 'mulai',
      'message', 'Sesi ' || v_kartu.kelas || ' aktif.',
      'alat', NULL,
      'kelas', v_kartu.kelas,
      'session', json_build_object(
        'uid_kartu', v_kartu.uid_kartu,
        'kelas', v_kartu.kelas,
        'nama_pemegang', v_kartu.nama_pemegang,
        'expires_at', v_expires
      )
    );
  END IF;

  -- =====================================================
  -- B. UID TAG ALAT
  -- =====================================================
  -- Kunci row unit alat. Transaksi lain yang men-tap unit yang sama akan
  -- menunggu sampai transaksi ini commit, lalu membaca kondisi terbaru.
  SELECT * INTO v_alat
  FROM public.alat
  WHERE upper(kode) = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.tap_log (
      id, uid_kartu, uid_alat, jenis_tap, jenis_terdeteksi,
      kelas, nama_alat, status, error_code, is_read, waktu_tap
    ) VALUES (
      'LOG-' || gen_random_uuid()::text,
      NULL, v_uid, 'alat', 'otomatis',
      NULL, NULL, 'ditolak', 'tag_tidak_dikenal', FALSE, v_now
    );

    RETURN json_build_object(
      'success', false,
      'code', 'tag_tidak_dikenal',
      'action', 'tolak',
      'message', 'Tag alat tidak dikenal.',
      'alat', json_build_object('id', NULL, 'nama', NULL, 'kode', v_uid),
      'kelas', NULL,
      'session', NULL
    );
  END IF;

  v_alat_json := json_build_object(
    'id', v_alat.id,
    'nama', v_alat.nama,
    'kode', v_alat.kode
  );

  SELECT * INTO v_session
  FROM public.rfid_session
  WHERE device_id = v_device_id
  FOR UPDATE;

  v_has_session := FOUND;

  IF v_has_session AND v_session.expires_at <= v_now THEN
    DELETE FROM public.rfid_session WHERE device_id = v_device_id;
    v_has_session := FALSE;
  END IF;

  IF NOT v_has_session THEN
    INSERT INTO public.tap_log (
      id, uid_kartu, uid_alat, jenis_tap, jenis_terdeteksi,
      kelas, nama_alat, status, error_code, is_read, waktu_tap
    ) VALUES (
      'LOG-' || gen_random_uuid()::text,
      NULL, v_alat.kode, 'alat', 'otomatis',
      NULL, v_alat.nama, 'ditolak', 'sesi_tidak_aktif', FALSE, v_now
    );

    RETURN json_build_object(
      'success', false,
      'code', 'sesi_tidak_aktif',
      'action', 'tolak',
      'message', 'Sesi tidak aktif. Tap kartu kelas terlebih dahulu.',
      'alat', v_alat_json,
      'kelas', NULL,
      'session', NULL
    );
  END IF;

  -- Validasi ulang kartu pemilik sesi (bisa saja dinonaktifkan setelah
  -- sesi dimulai).
  SELECT * INTO v_kartu
  FROM public.kartu_rfid
  WHERE uid_kartu = v_session.uid_kartu
  LIMIT 1;

  IF NOT FOUND OR NOT v_kartu.aktif THEN
    DELETE FROM public.rfid_session WHERE device_id = v_device_id;

    INSERT INTO public.tap_log (
      id, uid_kartu, uid_alat, jenis_tap, jenis_terdeteksi,
      kelas, nama_alat, status, error_code, is_read, waktu_tap
    ) VALUES (
      'LOG-' || gen_random_uuid()::text,
      v_session.uid_kartu, v_alat.kode, 'alat', 'otomatis',
      COALESCE(v_kartu.kelas, v_session.kelas), v_alat.nama,
      'ditolak', 'kartu_nonaktif', FALSE, v_now
    );

    RETURN json_build_object(
      'success', false,
      'code', 'kartu_nonaktif',
      'action', 'tolak',
      'message', 'Kartu RFID sudah tidak aktif.',
      'alat', v_alat_json,
      'kelas', COALESCE(v_kartu.kelas, v_session.kelas),
      'session', NULL
    );
  END IF;

  v_kelas := COALESCE(v_kartu.kelas, v_session.kelas);

  -- Anti-duplikat per sesi. Diperiksa setelah sesi dan alat tervalidasi,
  -- sebelum transaksi apa pun dibuat/diubah.
  IF v_uid = ANY (COALESCE(v_session.processed_alat, ARRAY[]::TEXT[])) THEN
    INSERT INTO public.tap_log (
      id, uid_kartu, uid_alat, jenis_tap, jenis_terdeteksi,
      kelas, nama_alat, status, error_code, is_read, waktu_tap
    ) VALUES (
      'LOG-' || gen_random_uuid()::text,
      v_session.uid_kartu, v_alat.kode, 'alat', 'otomatis',
      v_kelas, v_alat.nama, 'ditolak', 'tap_duplikat', FALSE, v_now
    );

    RETURN json_build_object(
      'success', false,
      'code', 'tap_duplikat',
      'action', 'duplikat',
      'message', v_alat.nama || ' sudah diproses pada sesi ini.',
      'alat', v_alat_json,
      'kelas', v_kelas,
      'session', json_build_object(
        'uid_kartu', v_session.uid_kartu,
        'kelas', v_kelas,
        'nama_pemegang', v_kartu.nama_pemegang,
        'expires_at', v_session.expires_at
      )
    );
  END IF;

  -- =====================================================
  -- C. ALAT HABIS PAKAI (permintaan persetujuan petugas)
  -- =====================================================
  IF v_alat.tipe = 'habis_pakai' THEN
    SELECT COALESCE(SUM(p.jumlah), 0) INTO v_terpakai
    FROM public.permintaan_habis_pakai p
    WHERE p.alat_id = v_alat.id
      AND p.status = 'disetujui'
      AND p.jumlah IS NOT NULL;

    v_stok := GREATEST(0, v_alat.jumlah_total - v_terpakai);

    IF v_stok <= 0 THEN
      INSERT INTO public.tap_log (
        id, uid_kartu, uid_alat, jenis_tap, jenis_terdeteksi,
        kelas, nama_alat, status, error_code, is_read, waktu_tap
      ) VALUES (
        'LOG-' || gen_random_uuid()::text,
        v_session.uid_kartu, v_alat.kode, 'alat', 'otomatis',
        v_kelas, v_alat.nama, 'ditolak', 'stok_habis', FALSE, v_now
      );

      RETURN json_build_object(
        'success', false,
        'code', 'stok_habis',
        'action', 'tolak',
        'message', 'Stok ' || v_alat.nama || ' habis.',
        'alat', v_alat_json,
        'kelas', v_kelas,
        'session', json_build_object(
          'uid_kartu', v_session.uid_kartu,
          'kelas', v_kelas,
          'nama_pemegang', v_kartu.nama_pemegang,
          'expires_at', v_session.expires_at
        )
      );
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.permintaan_habis_pakai p
      WHERE p.uid_kartu = v_session.uid_kartu
        AND p.alat_id = v_alat.id
        AND p.status = 'menunggu'
    ) THEN
      INSERT INTO public.tap_log (
        id, uid_kartu, uid_alat, jenis_tap, jenis_terdeteksi,
        kelas, nama_alat, status, error_code, is_read, waktu_tap
      ) VALUES (
        'LOG-' || gen_random_uuid()::text,
        v_session.uid_kartu, v_alat.kode, 'alat', 'otomatis',
        v_kelas, v_alat.nama, 'ditolak', 'permintaan_sudah_ada', FALSE, v_now
      );

      RETURN json_build_object(
        'success', false,
        'code', 'permintaan_sudah_ada',
        'action', 'tolak',
        'message', v_alat.nama || ' sudah menunggu persetujuan petugas.',
        'alat', v_alat_json,
        'kelas', v_kelas,
        'session', json_build_object(
          'uid_kartu', v_session.uid_kartu,
          'kelas', v_kelas,
          'nama_pemegang', v_kartu.nama_pemegang,
          'expires_at', v_session.expires_at
        )
      );
    END IF;

    v_req_id := 'REQ-' || gen_random_uuid()::text;

    INSERT INTO public.permintaan_habis_pakai (
      id, uid_kartu, kelas, alat_id, nama_alat, satuan,
      status, jumlah, catatan, waktu_tap, created_at
    ) VALUES (
      v_req_id, v_session.uid_kartu, v_kelas, v_alat.id, v_alat.nama, v_alat.satuan,
      'menunggu', NULL, NULL, v_now, v_now
    );

    v_expires := v_now + INTERVAL '20 seconds';

    UPDATE public.rfid_session
    SET processed_alat = array_append(COALESCE(processed_alat, ARRAY[]::TEXT[]), v_uid),
        expires_at     = v_expires,
        updated_at     = v_now
    WHERE device_id = v_device_id;

    INSERT INTO public.tap_log (
      id, uid_kartu, uid_alat, jenis_tap, jenis_terdeteksi,
      kelas, nama_alat, status, error_code, is_read, waktu_tap
    ) VALUES (
      'LOG-' || gen_random_uuid()::text,
      v_session.uid_kartu, v_alat.kode, 'alat', 'otomatis',
      v_kelas, v_alat.nama, 'menunggu', NULL, FALSE, v_now
    );

    RETURN json_build_object(
      'success', true,
      'code', 'menunggu_persetujuan',
      'action', 'menunggu',
      'message', v_alat.nama || ' menunggu persetujuan petugas.',
      'alat', v_alat_json,
      'kelas', v_kelas,
      'session', json_build_object(
        'uid_kartu', v_session.uid_kartu,
        'kelas', v_kelas,
        'nama_pemegang', v_kartu.nama_pemegang,
        'expires_at', v_expires
      )
    );
  END IF;

  -- =====================================================
  -- D. ALAT PINJAM: periksa transaksi aktif per unit
  -- =====================================================
  -- Kunci semua baris aktif unit ini agar dua request yang hampir
  -- bersamaan tidak sama-sama melihat "belum dipinjam".
  PERFORM 1
  FROM public.transaksi t
  WHERE t.alat_id = v_alat.id
    AND t.status = 'dipinjam'
  FOR UPDATE;

  SELECT COUNT(*) INTO v_aktif
  FROM public.transaksi t
  WHERE t.alat_id = v_alat.id
    AND t.status = 'dipinjam';

  SELECT * INTO v_trx
  FROM public.transaksi t
  WHERE t.alat_id = v_alat.id
    AND t.status = 'dipinjam'
    AND (
      t.uid_kartu = v_session.uid_kartu
      OR (v_kelas IS NOT NULL AND t.kelas = v_kelas)
    )
  ORDER BY t.waktu_pinjam ASC
  LIMIT 1;

  -- Dipinjam oleh kelas lain.
  IF v_aktif > 0 AND v_trx.id IS NULL THEN
    SELECT t.kelas INTO v_peminjam
    FROM public.transaksi t
    WHERE t.alat_id = v_alat.id
      AND t.status = 'dipinjam'
    ORDER BY t.waktu_pinjam ASC
    LIMIT 1;

    INSERT INTO public.tap_log (
      id, uid_kartu, uid_alat, jenis_tap, jenis_terdeteksi,
      kelas, nama_alat, status, error_code, is_read, waktu_tap
    ) VALUES (
      'LOG-' || gen_random_uuid()::text,
      v_session.uid_kartu, v_alat.kode, 'alat', 'otomatis',
      v_kelas, v_alat.nama, 'ditolak', 'sedang_dipinjam', FALSE, v_now
    );

    RETURN json_build_object(
      'success', false,
      'code', 'sedang_dipinjam',
      'action', 'tolak',
      'message', v_alat.nama || ' sedang dipinjam' ||
        CASE WHEN v_peminjam IS NOT NULL THEN ' oleh ' || v_peminjam ELSE '' END || '.',
      'alat', v_alat_json,
      'kelas', v_kelas,
      'peminjam_kelas', v_peminjam,
      'session', json_build_object(
        'uid_kartu', v_session.uid_kartu,
        'kelas', v_kelas,
        'nama_pemegang', v_kartu.nama_pemegang,
        'expires_at', v_session.expires_at
      )
    );
  END IF;

  -- Sudah dipinjam oleh kelas yang sama -> kembalikan.
  IF v_trx.id IS NOT NULL THEN
    UPDATE public.transaksi
    SET status = 'dikembalikan',
        waktu_kembali = v_now
    WHERE alat_id = v_alat.id
      AND status = 'dipinjam'
      AND (
        uid_kartu = v_session.uid_kartu
        OR (v_kelas IS NOT NULL AND kelas = v_kelas)
      );

    v_expires := v_now + INTERVAL '20 seconds';

    UPDATE public.rfid_session
    SET processed_alat = array_append(COALESCE(processed_alat, ARRAY[]::TEXT[]), v_uid),
        expires_at     = v_expires,
        updated_at     = v_now
    WHERE device_id = v_device_id;

    INSERT INTO public.tap_log (
      id, uid_kartu, uid_alat, jenis_tap, jenis_terdeteksi,
      kelas, nama_alat, status, error_code, is_read, waktu_tap
    ) VALUES (
      'LOG-' || gen_random_uuid()::text,
      v_session.uid_kartu, v_alat.kode, 'kembali', 'otomatis',
      v_kelas, v_alat.nama, 'berhasil', NULL, FALSE, v_now
    );

    RETURN json_build_object(
      'success', true,
      'code', 'dikembalikan',
      'action', 'kembali',
      'message', v_alat.nama || ' berhasil dikembalikan.',
      'alat', v_alat_json,
      'kelas', v_kelas,
      'session', json_build_object(
        'uid_kartu', v_session.uid_kartu,
        'kelas', v_kelas,
        'nama_pemegang', v_kartu.nama_pemegang,
        'expires_at', v_expires
      )
    );
  END IF;

  -- Belum dipinjam -> buat peminjaman baru.
  v_stok := GREATEST(0, v_alat.jumlah_total - v_alat.jumlah_rusak);

  IF v_stok <= 0 THEN
    INSERT INTO public.tap_log (
      id, uid_kartu, uid_alat, jenis_tap, jenis_terdeteksi,
      kelas, nama_alat, status, error_code, is_read, waktu_tap
    ) VALUES (
      'LOG-' || gen_random_uuid()::text,
      v_session.uid_kartu, v_alat.kode, 'alat', 'otomatis',
      v_kelas, v_alat.nama, 'ditolak', 'stok_habis', FALSE, v_now
    );

    RETURN json_build_object(
      'success', false,
      'code', 'stok_habis',
      'action', 'tolak',
      'message', v_alat.nama || ' tidak tersedia.',
      'alat', v_alat_json,
      'kelas', v_kelas,
      'session', json_build_object(
        'uid_kartu', v_session.uid_kartu,
        'kelas', v_kelas,
        'nama_pemegang', v_kartu.nama_pemegang,
        'expires_at', v_session.expires_at
      )
    );
  END IF;

  v_trx_id := 'TRX-' || gen_random_uuid()::text;

  INSERT INTO public.transaksi (
    id, uid_kartu, kelas, alat_id, nama_alat,
    status, sumber, kondisi_pinjam, waktu_pinjam, created_at
  ) VALUES (
    v_trx_id, v_session.uid_kartu, v_kelas, v_alat.id, v_alat.nama,
    'dipinjam', 'otomatis', 'baik', v_now, v_now
  );

  v_expires := v_now + INTERVAL '20 seconds';

  UPDATE public.rfid_session
  SET processed_alat = array_append(COALESCE(processed_alat, ARRAY[]::TEXT[]), v_uid),
      expires_at     = v_expires,
      updated_at     = v_now
  WHERE device_id = v_device_id;

  INSERT INTO public.tap_log (
    id, uid_kartu, uid_alat, jenis_tap, jenis_terdeteksi,
    kelas, nama_alat, status, error_code, is_read, waktu_tap
  ) VALUES (
    'LOG-' || gen_random_uuid()::text,
    v_session.uid_kartu, v_alat.kode, 'pinjam', 'otomatis',
    v_kelas, v_alat.nama, 'berhasil', NULL, FALSE, v_now
  );

  RETURN json_build_object(
    'success', true,
    'code', 'dipinjam',
    'action', 'pinjam',
    'message', v_alat.nama || ' berhasil dipinjam.',
    'alat', v_alat_json,
    'kelas', v_kelas,
    'session', json_build_object(
      'uid_kartu', v_session.uid_kartu,
      'kelas', v_kelas,
      'nama_pemegang', v_kartu.nama_pemegang,
      'expires_at', v_expires
    )
  );
END;
$$;

-- 6. Hanya service role (Edge Function) yang boleh memanggil fungsi ini.
REVOKE ALL ON FUNCTION public.process_rfid_tap(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.process_rfid_tap(TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.process_rfid_tap(TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.process_rfid_tap(TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.process_rfid_tap(TEXT, TEXT) IS
  'Memproses satu tap RFID secara atomik: sesi kartu, pinjam, kembali, duplikat, dan log.';

-- 7. Segarkan cache PostgREST agar RPC langsung terlihat oleh Edge Function.
NOTIFY pgrst, 'reload schema';
