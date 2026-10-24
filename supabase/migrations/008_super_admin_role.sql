-- =============================================
-- Migration 008: Super Admin Role Support & 1-Account Constraint
-- Jalankan di Supabase Dashboard > SQL Editor
-- =============================================

-- 1. Perbarui check constraint pada profiles.role agar mendukung 'super_admin'
ALTER TABLE public.profiles 
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles 
  ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('super_admin', 'admin', 'petugas'));

-- 2. Pastikan hanya ada maksimal 1 akun super_admin di database
CREATE UNIQUE INDEX IF NOT EXISTS only_one_super_admin 
  ON public.profiles ((role = 'super_admin')) 
  WHERE role = 'super_admin';

-- 3. Perbarui RLS policies agar super_admin memiliki seluruh akses admin

-- profiles: select all
DROP POLICY IF EXISTS "profiles_admin_select_all" ON public.profiles;
CREATE POLICY "profiles_admin_select_all" ON public.profiles
  FOR SELECT USING (public.get_my_role() IN ('admin', 'super_admin'));

-- alat: write (insert/update/delete)
DROP POLICY IF EXISTS "alat_admin_write" ON public.alat;
CREATE POLICY "alat_admin_write" ON public.alat
  FOR ALL USING (public.get_my_role() IN ('admin', 'super_admin'));

-- kartu_rfid: write (insert/update/delete)
DROP POLICY IF EXISTS "kartu_rfid_admin_write" ON public.kartu_rfid;
CREATE POLICY "kartu_rfid_admin_write" ON public.kartu_rfid
  FOR ALL USING (public.get_my_role() IN ('admin', 'super_admin'));

-- transaksi: staff insert & update
DROP POLICY IF EXISTS "transaksi_staff_insert" ON public.transaksi;
CREATE POLICY "transaksi_staff_insert" ON public.transaksi
  FOR INSERT WITH CHECK (public.get_my_role() IN ('super_admin', 'admin', 'petugas'));

DROP POLICY IF EXISTS "transaksi_staff_update" ON public.transaksi;
CREATE POLICY "transaksi_staff_update" ON public.transaksi
  FOR UPDATE USING (public.get_my_role() IN ('super_admin', 'admin', 'petugas'));

-- transaksi: admin delete
DROP POLICY IF EXISTS "transaksi_admin_delete" ON public.transaksi;
CREATE POLICY "transaksi_admin_delete" ON public.transaksi
  FOR DELETE USING (public.get_my_role() IN ('admin', 'super_admin'));

-- tap_log: admin delete
DROP POLICY IF EXISTS "tap_log_admin_delete" ON public.tap_log;
CREATE POLICY "tap_log_admin_delete" ON public.tap_log
  FOR DELETE USING (public.get_my_role() IN ('admin', 'super_admin'));

-- permintaan_habis_pakai: admin delete
DROP POLICY IF EXISTS "permintaan_admin_delete" ON public.permintaan_habis_pakai;
CREATE POLICY "permintaan_admin_delete" ON public.permintaan_habis_pakai
  FOR DELETE USING (public.get_my_role() IN ('admin', 'super_admin'));

-- permintaan_habis_pakai & stok_mutasi: staff read
DROP POLICY IF EXISTS "permintaan_read" ON public.permintaan_habis_pakai;
CREATE POLICY "permintaan_read" ON public.permintaan_habis_pakai
  FOR SELECT USING (public.get_my_role() IN ('super_admin', 'admin', 'petugas'));

DROP POLICY IF EXISTS "stok_mutasi_read" ON public.stok_mutasi;
CREATE POLICY "stok_mutasi_read" ON public.stok_mutasi
  FOR SELECT USING (public.get_my_role() IN ('super_admin', 'admin', 'petugas'));
