-- =============================================
-- Migration 014: Alat yang sedang dipinjam tidak bisa diubah/dihapus
-- =============================================
-- Selama masih ada transaksi berstatus `dipinjam` untuk sebuah alat,
-- seluruh perubahan data alat ditolak. Ini mencegah admin mengubah
-- nama, kode RFID, kategori, tipe, jumlah unit, atau kondisi unit saat
-- alat sedang berada di tangan peminjam.
--
-- Penghapusan alat juga ditolak agar transaksi aktif tidak kehilangan
-- relasi alat_id (ON DELETE SET NULL) dan tetap tampil di Pinjaman Aktif.
--
-- Alur yang benar:
--   1. Kembalikan alat sampai status transaksi menjadi `dikembalikan`.
--   2. Baru data alat boleh diubah atau dihapus.

CREATE OR REPLACE FUNCTION public.prevent_update_active_alat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.transaksi
    WHERE alat_id = OLD.id
      AND status = 'dipinjam'
  ) THEN
    RAISE EXCEPTION
      'Alat "%" tidak dapat diubah karena masih dipinjam. Kembalikan alat terlebih dahulu.',
      COALESCE(OLD.nama, OLD.id)
      USING ERRCODE = 'P0001',
            HINT = 'Selesaikan pengembalian transaksi aktif sebelum mengubah data alat.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_update_alat_dipinjam ON public.alat;

CREATE TRIGGER guard_update_alat_dipinjam
  BEFORE UPDATE ON public.alat
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_update_active_alat();

CREATE OR REPLACE FUNCTION public.prevent_delete_active_alat()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.transaksi
    WHERE alat_id = OLD.id
      AND status = 'dipinjam'
  ) THEN
    RAISE EXCEPTION
      'Alat "%" tidak dapat dihapus karena masih dipinjam. Kembalikan alat terlebih dahulu.',
      COALESCE(OLD.nama, OLD.id)
      USING ERRCODE = 'P0001',
            HINT = 'Selesaikan pengembalian transaksi aktif sebelum menghapus alat.';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS guard_delete_alat_dipinjam ON public.alat;

CREATE TRIGGER guard_delete_alat_dipinjam
  BEFORE DELETE ON public.alat
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_delete_active_alat();

COMMENT ON FUNCTION public.prevent_update_active_alat() IS
  'Menolak perubahan data alat yang masih memiliki transaksi dipinjam.';
COMMENT ON FUNCTION public.prevent_delete_active_alat() IS
  'Menolak penghapusan alat yang masih memiliki transaksi dipinjam.';
