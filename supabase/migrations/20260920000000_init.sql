-- =============================================================
-- SIMLAB SMK: Supabase Postgres Migration
-- File: supabase/migrations/20260920000000_init.sql
-- =============================================================

-- ---------------------------------------------------------------
-- 1. Extensions
-- ---------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------
-- 2. ENUM Types
-- ---------------------------------------------------------------
CREATE TYPE role_enum      AS ENUM ('admin', 'petugas');
CREATE TYPE status_kartu   AS ENUM ('aktif', 'nonaktif');
CREATE TYPE status_transaksi AS ENUM ('dipinjam', 'dikembalikan');
CREATE TYPE sumber_transaksi AS ENUM ('otomatis', 'manual');
CREATE TYPE kondisi_barang AS ENUM ('baik', 'rusak');
CREATE TYPE jenis_tap_enum AS ENUM ('kartu', 'alat');
CREATE TYPE tap_status_enum AS ENUM ('berhasil', 'ditolak');

-- ---------------------------------------------------------------
-- 3. Table: profiles (linked to auth.users)
-- ---------------------------------------------------------------
CREATE TABLE public.profiles (
  id       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nama     text NOT NULL,
  email    text NOT NULL UNIQUE,
  role     role_enum NOT NULL DEFAULT 'petugas',
  aktif    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.profiles IS 'Data pengguna sistem (admin & petugas lab)';

-- Auto-create profile saat user baru dibuat di Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, nama, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'nama', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------
-- 4. Table: kartu_rfid
-- ---------------------------------------------------------------
CREATE TABLE public.kartu_rfid (
  uid_kartu      text PRIMARY KEY,
  kelas          text NOT NULL,
  nama_pemegang  text,
  aktif          boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.kartu_rfid IS 'Kartu RFID perwakilan kelas';

-- ---------------------------------------------------------------
-- 5. Table: alat
-- ---------------------------------------------------------------
CREATE TABLE public.alat (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kode           text NOT NULL UNIQUE,
  nama           text NOT NULL,
  kategori       text NOT NULL,
  uid_rfid       text NOT NULL UNIQUE,
  jumlah_total   int  NOT NULL DEFAULT 1 CHECK (jumlah_total >= 0),
  jumlah_rusak   int  NOT NULL DEFAULT 0 CHECK (jumlah_rusak >= 0),
  stok_tersedia  int  NOT NULL GENERATED ALWAYS AS
                   (jumlah_total - jumlah_rusak) STORED,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rusak_lte_total CHECK (jumlah_rusak <= jumlah_total)
);
COMMENT ON TABLE public.alat IS 'Master alat laboratorium dengan stiker RFID';

-- ---------------------------------------------------------------
-- 6. Table: kartu_session (sesi kartu 60 detik)
-- ---------------------------------------------------------------
CREATE TABLE public.kartu_session (
  device_id    text        NOT NULL,
  uid_kartu    text        NOT NULL REFERENCES public.kartu_rfid(uid_kartu) ON DELETE CASCADE,
  jenis        text        NOT NULL DEFAULT 'pinjam', -- pinjam / kembali
  expires_at   timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id)
);
COMMENT ON TABLE public.kartu_session IS 'Sesi aktif kartu RFID per device ESP32 (TTL 60 detik)';

-- ---------------------------------------------------------------
-- 7. Table: devices (daftar ESP32)
-- ---------------------------------------------------------------
CREATE TABLE public.devices (
  id         text PRIMARY KEY,
  nama       text,
  key_hash   text NOT NULL,  -- SHA-256 dari device key asli
  aktif      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.devices IS 'Daftar perangkat ESP32 yang terdaftar';

-- ---------------------------------------------------------------
-- 8. Table: transaksi
-- ---------------------------------------------------------------
CREATE TABLE public.transaksi (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid_kartu       text NOT NULL REFERENCES public.kartu_rfid(uid_kartu),
  kelas           text NOT NULL,
  alat_id         uuid NOT NULL REFERENCES public.alat(id),
  nama_alat       text NOT NULL,
  status          status_transaksi NOT NULL DEFAULT 'dipinjam',
  sumber          sumber_transaksi NOT NULL DEFAULT 'otomatis',
  kondisi_pinjam  kondisi_barang NOT NULL DEFAULT 'baik',
  kondisi_kembali kondisi_barang,
  waktu_pinjam    timestamptz NOT NULL DEFAULT now(),
  waktu_kembali   timestamptz,
  petugas_id      uuid REFERENCES public.profiles(id),
  catatan         text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.transaksi IS '1 baris = 1 unit alat yang dipinjam';
CREATE INDEX idx_transaksi_kartu ON public.transaksi(uid_kartu);
CREATE INDEX idx_transaksi_alat  ON public.transaksi(alat_id);
CREATE INDEX idx_transaksi_status ON public.transaksi(status);

-- ---------------------------------------------------------------
-- 9. Table: tap_log
-- ---------------------------------------------------------------
CREATE TABLE public.tap_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uid_kartu        text,
  uid_alat         text,
  kelas            text,
  nama_alat        text,
  jenis_tap        jenis_tap_enum NOT NULL,
  jenis_terdeteksi text,    -- 'pinjam' | 'kembali' (null jika jenis_tap='kartu')
  kondisi          kondisi_barang,
  status           tap_status_enum NOT NULL DEFAULT 'berhasil',
  error_code       text,
  is_read          boolean NOT NULL DEFAULT false,
  device_id        text,
  waktu_tap        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.tap_log IS 'Log setiap tap RFID yang masuk ke server';
CREATE INDEX idx_tap_log_is_read ON public.tap_log(is_read);
CREATE INDEX idx_tap_log_waktu   ON public.tap_log(waktu_tap DESC);

-- ---------------------------------------------------------------
-- 10. Table: error_log (hanya error 5xx di production)
-- ---------------------------------------------------------------
CREATE TABLE public.error_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  uuid NOT NULL DEFAULT gen_random_uuid(),
  function    text NOT NULL,
  message     text,
  details     jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------
-- 11. View: v_list_barang (untuk halaman List Barang)
-- ---------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_list_barang AS
SELECT
  a.id,
  a.kode,
  a.nama,
  a.kategori,
  a.uid_rfid,
  a.jumlah_total,
  a.jumlah_rusak,
  a.stok_tersedia,
  CASE
    WHEN a.stok_tersedia <= 0 THEN 'habis'
    WHEN EXISTS (
      SELECT 1 FROM public.transaksi t
      WHERE t.alat_id = a.id AND t.status = 'dipinjam'
    ) THEN 'dipinjam'
    ELSE 'tersedia'
  END AS status,
  (
    SELECT t.uid_kartu
    FROM public.transaksi t
    WHERE t.alat_id = a.id AND t.status = 'dipinjam'
    ORDER BY t.waktu_pinjam DESC LIMIT 1
  ) AS peminjam_kartu,
  (
    SELECT kr.kelas
    FROM public.transaksi t
    JOIN public.kartu_rfid kr ON kr.uid_kartu = t.uid_kartu
    WHERE t.alat_id = a.id AND t.status = 'dipinjam'
    ORDER BY t.waktu_pinjam DESC LIMIT 1
  ) AS peminjam_kelas
FROM public.alat a;

-- ---------------------------------------------------------------
-- 12. View: v_stat_harian (30 hari terakhir untuk chart dashboard)
-- ---------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_stat_harian AS
SELECT
  date_trunc('day', waktu_pinjam AT TIME ZONE 'Asia/Jakarta')::date AS tanggal,
  COUNT(*) FILTER (WHERE status = 'dipinjam')     AS jumlah_pinjam,
  COUNT(*) FILTER (WHERE status = 'dikembalikan') AS jumlah_kembali,
  COUNT(*) AS total
FROM public.transaksi
WHERE waktu_pinjam >= NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY 1;

-- ---------------------------------------------------------------
-- 13. Function: process_tap (dipanggil dari edge function rfid-tap)
--    Logika pinjam/kembali atomik berdasarkan UID tunggal
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_tap(
  p_uid         text,
  p_device_id   text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_kartu     public.kartu_rfid%ROWTYPE;
  v_alat      public.alat%ROWTYPE;
  v_session   public.kartu_session%ROWTYPE;
  v_trx       public.transaksi%ROWTYPE;
  v_jenis     text;
  v_log_id    uuid;
  v_trx_id    uuid;
BEGIN
  -- Cek apakah UID adalah kartu
  SELECT * INTO v_kartu FROM public.kartu_rfid WHERE uid_kartu = p_uid;
  IF FOUND THEN
    -- Validasi aktif
    IF NOT v_kartu.aktif THEN
      PERFORM public._log_tap(p_uid, NULL, 'kartu', NULL, 'ditolak', 'kartu_nonaktif', p_device_id, v_kartu.kelas, NULL);
      RETURN jsonb_build_object('ok', false, 'error', 'kartu_nonaktif', 'type', 'kartu');
    END IF;

    -- Tentukan jenis sesi: ada pinjaman aktif → kembali, tidak → pinjam
    SELECT 1 INTO v_trx FROM public.transaksi
    WHERE uid_kartu = p_uid AND status = 'dipinjam' LIMIT 1;
    v_jenis := CASE WHEN FOUND THEN 'kembali' ELSE 'pinjam' END;

    -- Upsert sesi 60 detik
    INSERT INTO public.kartu_session (device_id, uid_kartu, jenis, expires_at)
    VALUES (p_device_id, p_uid, v_jenis, NOW() + INTERVAL '60 seconds')
    ON CONFLICT (device_id) DO UPDATE
      SET uid_kartu  = EXCLUDED.uid_kartu,
          jenis      = EXCLUDED.jenis,
          expires_at = EXCLUDED.expires_at;

    PERFORM public._log_tap(p_uid, NULL, 'kartu', NULL, 'berhasil', NULL, p_device_id, v_kartu.kelas, NULL);
    RETURN jsonb_build_object('ok', true, 'type', 'kartu', 'jenis', v_jenis, 'kelas', v_kartu.kelas);
  END IF;

  -- Cek apakah UID adalah alat
  SELECT * INTO v_alat FROM public.alat WHERE uid_rfid = p_uid;
  IF NOT FOUND THEN
    PERFORM public._log_tap(NULL, p_uid, 'alat', NULL, 'ditolak', 'uid_tidak_dikenal', p_device_id, NULL, NULL);
    RETURN jsonb_build_object('ok', false, 'error', 'uid_tidak_dikenal', 'type', 'alat');
  END IF;

  -- Validasi sesi kartu aktif
  SELECT * INTO v_session FROM public.kartu_session
  WHERE device_id = p_device_id AND expires_at > NOW();
  IF NOT FOUND THEN
    PERFORM public._log_tap(NULL, p_uid, 'alat', NULL, 'ditolak', 'sesi_tidak_ada', p_device_id, NULL, v_alat.nama);
    RETURN jsonb_build_object('ok', false, 'error', 'sesi_tidak_ada', 'type', 'alat');
  END IF;

  -- Kartu ini sedang pinjam alat ini → KEMBALI
  SELECT * INTO v_trx FROM public.transaksi
  WHERE uid_kartu = v_session.uid_kartu AND alat_id = v_alat.id AND status = 'dipinjam'
  LIMIT 1;

  IF FOUND THEN
    -- Update transaksi → dikembalikan
    UPDATE public.transaksi
    SET status = 'dikembalikan', waktu_kembali = NOW()
    WHERE id = v_trx.id;

    v_jenis := 'kembali';
  ELSE
    -- PINJAM: cek stok
    IF v_alat.stok_tersedia <= 0 THEN
      PERFORM public._log_tap(v_session.uid_kartu, p_uid, 'alat', NULL, 'ditolak', 'stok_habis', p_device_id, NULL, v_alat.nama);
      RETURN jsonb_build_object('ok', false, 'error', 'stok_habis', 'type', 'alat');
    END IF;

    -- Buat transaksi baru
    SELECT * INTO v_kartu FROM public.kartu_rfid WHERE uid_kartu = v_session.uid_kartu;

    INSERT INTO public.transaksi (uid_kartu, kelas, alat_id, nama_alat, status, sumber)
    VALUES (v_session.uid_kartu, v_kartu.kelas, v_alat.id, v_alat.nama, 'dipinjam', 'otomatis')
    RETURNING id INTO v_trx_id;

    v_jenis := 'pinjam';
  END IF;

  -- Perpanjang sesi 60 detik
  UPDATE public.kartu_session
  SET expires_at = NOW() + INTERVAL '60 seconds'
  WHERE device_id = p_device_id;

  PERFORM public._log_tap(v_session.uid_kartu, p_uid, 'alat', v_jenis, 'berhasil', NULL, p_device_id, NULL, v_alat.nama);
  RETURN jsonb_build_object('ok', true, 'type', 'alat', 'jenis', v_jenis, 'alat', v_alat.nama);
END;
$$;

-- ---------------------------------------------------------------
-- 14. Helper: _log_tap
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._log_tap(
  p_uid_kartu   text,
  p_uid_alat    text,
  p_jenis_tap   jenis_tap_enum,
  p_jenis_det   text,
  p_status      tap_status_enum,
  p_error_code  text,
  p_device_id   text,
  p_kelas       text,
  p_nama_alat   text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.tap_log
    (uid_kartu, uid_alat, jenis_tap, jenis_terdeteksi, status, error_code, device_id, kelas, nama_alat)
  VALUES
    (p_uid_kartu, p_uid_alat, p_jenis_tap, p_jenis_det, p_status, p_error_code, p_device_id, p_kelas, p_nama_alat);
END;
$$;

-- ---------------------------------------------------------------
-- 15. Function: process_manual (transaksi manual oleh petugas)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_manual(
  p_uid_kartu      text,
  p_alat_id        uuid,
  p_jenis          text,  -- 'pinjam' | 'kembali'
  p_jumlah         int    DEFAULT 1,
  p_kondisi_pinjam kondisi_barang DEFAULT 'baik',
  p_kondisi_kembali kondisi_barang DEFAULT NULL,
  p_catatan        text   DEFAULT NULL,
  p_petugas_id     uuid   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_alat  public.alat%ROWTYPE;
  v_kartu public.kartu_rfid%ROWTYPE;
  v_i     int;
BEGIN
  SELECT * INTO v_alat  FROM public.alat      WHERE id = p_alat_id   FOR UPDATE;
  SELECT * INTO v_kartu FROM public.kartu_rfid WHERE uid_kartu = p_uid_kartu;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'uid_tidak_dikenal');
  END IF;

  IF p_jenis = 'pinjam' THEN
    IF v_alat.stok_tersedia < p_jumlah THEN
      RETURN jsonb_build_object('ok', false, 'error', 'stok_habis');
    END IF;
    FOR v_i IN 1..p_jumlah LOOP
      INSERT INTO public.transaksi (uid_kartu, kelas, alat_id, nama_alat, status, sumber, kondisi_pinjam, catatan, petugas_id)
      VALUES (p_uid_kartu, v_kartu.kelas, p_alat_id, v_alat.nama, 'dipinjam', 'manual', p_kondisi_pinjam, p_catatan, p_petugas_id);
    END LOOP;
  ELSIF p_jenis = 'kembali' THEN
    UPDATE public.transaksi
    SET status = 'dikembalikan',
        waktu_kembali = NOW(),
        kondisi_kembali = p_kondisi_kembali,
        catatan = COALESCE(p_catatan, catatan),
        petugas_id = COALESCE(p_petugas_id, petugas_id)
    WHERE uid_kartu = p_uid_kartu
      AND alat_id = p_alat_id
      AND status = 'dipinjam'
    LIMIT p_jumlah;
  END IF;

  RETURN jsonb_build_object('ok', true, 'jenis', p_jenis, 'jumlah', p_jumlah);
END;
$$;

-- ---------------------------------------------------------------
-- 16. Function: update_kondisi_alat (edit jumlah rusak inline)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_kondisi_alat(
  p_alat_id      uuid,
  p_jumlah_rusak int
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.alat SET jumlah_rusak = p_jumlah_rusak WHERE id = p_alat_id;
END;
$$;

-- ---------------------------------------------------------------
-- 17. Function: mark_taps_read
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_taps_read()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.tap_log SET is_read = true WHERE is_read = false;
END;
$$;

-- ---------------------------------------------------------------
-- 18. RLS Policies
-- ---------------------------------------------------------------
ALTER TABLE public.profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kartu_rfid ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alat       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transaksi  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tap_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kartu_session ENABLE ROW LEVEL SECURITY;

-- profiles: user bisa baca profilnya sendiri; admin baca semua
CREATE POLICY "self_read" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "admin_all" ON public.profiles FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
);

-- kartu_rfid: staff baca, admin tulis
CREATE POLICY "staff_read_kartu"  ON public.kartu_rfid FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin_write_kartu" ON public.kartu_rfid FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- alat: staff baca, admin tulis
CREATE POLICY "staff_read_alat"  ON public.alat FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "admin_write_alat" ON public.alat FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- transaksi & tap_log: staff baca; tulis hanya service_role (edge function)
CREATE POLICY "staff_read_transaksi" ON public.transaksi FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "staff_read_taplog"    ON public.tap_log   FOR SELECT USING (auth.role() = 'authenticated');

-- ---------------------------------------------------------------
-- 19. Realtime: enable untuk tabel yang diperlukan
-- ---------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE public.tap_log;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transaksi;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alat;

-- ---------------------------------------------------------------
-- 20. Seed: Admin pertama
--    Setelah jalankan: buat user di Dashboard Supabase Auth,
--    lalu jalankan SQL berikut (ganti email):
-- ---------------------------------------------------------------
-- UPDATE public.profiles SET role = 'admin' WHERE email = 'admin@smk.sch.id';

-- Seed device untuk pengujian lokal:
-- INSERT INTO public.devices (id, nama, key_hash) VALUES
--   ('lab-esp32-01', 'Scanner Lab', encode(digest('kunci-rahasia-esp32', 'sha256'), 'hex'));
