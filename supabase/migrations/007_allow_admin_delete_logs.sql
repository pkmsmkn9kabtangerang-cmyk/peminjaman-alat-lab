-- =============================================
-- Migration 007: Policy DELETE untuk Admin
-- Mengizinkan admin membersihkan riwayat transaksi & log tap
-- =============================================

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'transaksi' AND policyname = 'transaksi_admin_delete'
  ) THEN
    CREATE POLICY "transaksi_admin_delete" ON public.transaksi
      FOR DELETE USING (public.get_my_role() = 'admin');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'tap_log' AND policyname = 'tap_log_admin_delete'
  ) THEN
    CREATE POLICY "tap_log_admin_delete" ON public.tap_log
      FOR DELETE USING (public.get_my_role() = 'admin');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'permintaan_habis_pakai' AND policyname = 'permintaan_admin_delete'
  ) THEN
    CREATE POLICY "permintaan_admin_delete" ON public.permintaan_habis_pakai
      FOR DELETE USING (public.get_my_role() = 'admin');
  END IF;
END $$;
