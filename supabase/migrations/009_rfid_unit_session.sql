-- =============================================
-- Migration 009: Sesi RFID per unit alat
-- =============================================
-- Satu baris `alat` = satu unit fisik (jumlah_total = 1) dan
-- `alat.kode` menyimpan UID stiker RFID unit tersebut.
--
-- `processed_alat` menyimpan UID alat yang sudah berhasil diproses
-- pada sesi kartu yang sedang aktif. Tap UID yang sama berikutnya
-- ditolak sebagai `tap_duplikat` sampai sesi baru dimulai.
ALTER TABLE public.rfid_session
  ADD COLUMN IF NOT EXISTS processed_alat TEXT[] NOT NULL DEFAULT '{}'::TEXT[];

-- Mempercepat pencarian transaksi aktif per unit + kartu.
-- Tidak memakai maybeSingle() karena satu alat_id dapat memiliki
-- beberapa baris transaksi pada data lama.
CREATE INDEX IF NOT EXISTS idx_transaksi_aktif_unit
  ON public.transaksi (alat_id, uid_kartu, status);
