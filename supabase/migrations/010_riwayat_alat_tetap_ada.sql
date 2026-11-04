-- =============================================
-- Migration 010: Riwayat tetap ada saat alat dihapus
-- =============================================
-- Alat boleh dihapus walaupun sudah memiliki riwayat transaksi/log.
-- Penghapusan hanya ditahan oleh pinjaman yang masih aktif (dicek di
-- aplikasi/edge function). Relasi riwayat dilepas dengan ON DELETE SET NULL
-- agar baris riwayat tidak ikut terhapus. Kolom snapshot seperti
-- transaksi.nama_alat dan permintaan_habis_pakai.nama_alat tetap tersimpan.

-- Riwayat peminjaman/pengembalian
ALTER TABLE public.transaksi
  DROP CONSTRAINT IF EXISTS transaksi_alat_id_fkey;

ALTER TABLE public.transaksi
  ADD CONSTRAINT transaksi_alat_id_fkey
  FOREIGN KEY (alat_id) REFERENCES public.alat(id) ON DELETE SET NULL;

-- Riwayat permintaan alat sekali pakai
ALTER TABLE public.permintaan_habis_pakai
  DROP CONSTRAINT IF EXISTS permintaan_habis_pakai_alat_id_fkey;

ALTER TABLE public.permintaan_habis_pakai
  ADD CONSTRAINT permintaan_habis_pakai_alat_id_fkey
  FOREIGN KEY (alat_id) REFERENCES public.alat(id) ON DELETE SET NULL;

-- Riwayat mutasi stok
ALTER TABLE public.stok_mutasi
  DROP CONSTRAINT IF EXISTS stok_mutasi_alat_id_fkey;

ALTER TABLE public.stok_mutasi
  ADD CONSTRAINT stok_mutasi_alat_id_fkey
  FOREIGN KEY (alat_id) REFERENCES public.alat(id) ON DELETE SET NULL;
