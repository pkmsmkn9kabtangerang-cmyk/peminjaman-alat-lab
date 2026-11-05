-- =============================================
-- Migration 015: Sesi RFID 20 detik
-- =============================================
-- Migration 012 mengunci durasi sesi ke 10 detik. Migration ini
-- memperbarui fungsi process_rfid_tap yang sudah terpasang tanpa
-- menyalin ulang seluruh body fungsi.
--
-- Pembaruan dilakukan dengan mengambil definisi fungsi yang aktif dari
-- PostgreSQL, mengganti literal interval 10 detik menjadi 20 detik,
-- lalu menjalankannya kembali dengan CREATE OR REPLACE. Cara ini aman
-- untuk database yang sudah menjalankan migration 012 dan tetap
-- idempotent bila fungsi sudah memakai 20 detik.
--
-- Jika fungsi belum ada, migration berhenti dengan pesan yang jelas.
-- Terapkan migration 012 terlebih dahulu.

DO $$
DECLARE
  v_proc REGPROCEDURE;
  v_def  TEXT;
BEGIN
  v_proc := to_regprocedure('public.process_rfid_tap(text,text)');

  IF v_proc IS NULL THEN
    RAISE EXCEPTION
      'Fungsi public.process_rfid_tap belum ada. Terapkan migration 012_rfid_atomic_tap.sql terlebih dahulu.';
  END IF;

  v_def := pg_get_functiondef(v_proc);

  -- Tangani penulisan INTERVAL '10 seconds' dengan huruf besar/kecil
  -- dan spasi yang berbeda.
  IF v_def ~* 'INTERVAL\s+''10 seconds''' THEN
    v_def := regexp_replace(
      v_def,
      'INTERVAL\s+''10 seconds''',
      'INTERVAL ''20 seconds''',
      'gi'
    );
  ELSIF v_def !~* 'INTERVAL\s+''20 seconds''' THEN
    -- Jangan diam-diam menganggap berhasil bila bentuk definisi fungsi
    -- berbeda dari yang dihasilkan migration 012.
    RAISE EXCEPTION
      'Definisi public.process_rfid_tap tidak memuat interval 10/20 detik. Terapkan ulang migration 012_rfid_atomic_tap.sql, lalu jalankan migration ini.';
  END IF;

  EXECUTE v_def;

  -- Pastikan fungsi yang aktif benar-benar sudah memakai 20 detik.
  v_def := pg_get_functiondef(v_proc);
  IF v_def !~* 'INTERVAL\s+''20 seconds''' THEN
    RAISE EXCEPTION
      'Fungsi public.process_rfid_tap masih belum memakai interval 20 detik setelah pembaruan.';
  END IF;
END;
$$;

COMMENT ON FUNCTION public.process_rfid_tap(TEXT, TEXT) IS
  'Memproses satu tap RFID secara atomik: sesi kartu 20 detik, pinjam, kembali, duplikat, dan log.';
