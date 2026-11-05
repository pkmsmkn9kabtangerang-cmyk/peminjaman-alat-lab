-- =============================================
-- Migration 013: Lindungi transaksi aktif dari penghapusan
-- =============================================
-- Menghapus transaksi berstatus `dipinjam` membuat alat seolah-olah
-- tersedia kembali padahal unit fisiknya masih dipegang peminjam.
-- Trigger ini menjadi pengaman terakhir di database, termasuk untuk
-- request yang memakai service role atau menghapus langsung lewat
-- PostgREST tanpa melewati validasi Edge Function.
--
-- Alur yang benar:
--   1. Kembalikan alat (status berubah menjadi `dikembalikan`).
--   2. Baru riwayat transaksi boleh dihapus.
--
-- Trigger hanya memeriksa baris yang benar-benar dihapus. Menghapus
-- riwayat yang sudah dikembalikan tetap diizinkan, termasuk pada alat
-- multi-unit yang masih memiliki transaksi aktif lain.

CREATE OR REPLACE FUNCTION public.prevent_delete_active_transaksi()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.status = 'dipinjam' THEN
    RAISE EXCEPTION
      'Transaksi % tidak dapat dihapus karena alat "%" masih dipinjam. Kembalikan alat terlebih dahulu.',
      OLD.id,
      COALESCE(OLD.nama_alat, OLD.alat_id)
      USING ERRCODE = 'P0001',
            HINT = 'Selesaikan pengembalian transaksi aktif sebelum menghapus riwayat.';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS guard_delete_transaksi_aktif ON public.transaksi;

CREATE TRIGGER guard_delete_transaksi_aktif
  BEFORE DELETE ON public.transaksi
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_delete_active_transaksi();

COMMENT ON FUNCTION public.prevent_delete_active_transaksi() IS
  'Menolak penghapusan transaksi yang masih berstatus dipinjam.';
