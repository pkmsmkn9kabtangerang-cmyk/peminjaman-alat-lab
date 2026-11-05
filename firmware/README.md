# Firmware ESP32 — SIMLAB SMK (Reader RFID)

Sketch: [`simlab_rfid/simlab_rfid.ino`](simlab_rfid/simlab_rfid.ino)

## Alat yang dipakai

| Barang | Jumlah | Fungsi |
|---|---|---|
| ESP32 DevKit | 1 | Otak + WiFi |
| MFRC522 RFID Reader | 1 | Membaca kartu & stiker |
| Kartu RFID 13,56 MHz | 6 | Kartu kelas |
| RFID Sticker/Tag 13,56 MHz | 20 | Ditempel di alat lab |
| LCD 1602 I2C | 1 | Menampilkan status |
| Buzzer 5V | 1 | Bunyi tanda sukses / gagal |
| Breadboard + kabel jumper | — | Sambungan |
| Case IoT | 1 | Wadah |

## Wiring

| MFRC522 | ESP32 |
|---|---|
| SDA (SS) | GPIO 5 |
| SCK | GPIO 18 |
| MOSI | GPIO 23 |
| MISO | GPIO 19 |
| RST | GPIO 27 |
| 3.3V | **3V3** (jangan ke 5V) |
| GND | GND |

| LCD 1602 I2C | ESP32 |
|---|---|
| SDA | GPIO 4 |
| SCL | GPIO 21 |
| VCC | VIN (5V) |
| GND | GND |

| Buzzer | ESP32 |
|---|---|
| + (atau I/O) | GPIO 22 |
| − | GND |

## Setup Arduino IDE

1. **Board**: File → Preferences → Additional Boards URL:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
   lalu Tools → Board → Boards Manager → install **esp32 by Espressif**.
2. Pilih **Tools → Board → ESP32 Dev Module**.
3. **Library Manager**, install:
   - `MFRC522` by GithubCommunity
   - `LiquidCrystal I2C` by Frank de Brabander
   - `ArduinoJson` by Benoit Blanchon (v7)
4. Buka `simlab_rfid.ino`, isi bagian **KONFIGURASI**:
   `WIFI_SSID`, `WIFI_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
   `DEVICE_ID`, dan `DEVICE_KEY`.
   `DEVICE_ID`/`DEVICE_KEY` harus sama dengan secrets `RFID_DEVICE_ID` /
   `RFID_DEVICE_KEY` di Supabase. Jangan memakai key simulator web.
5. Upload, buka Serial Monitor **115200 baud**.

## Cara pakai

1. Tap kartu/stiker yang belum terdaftar → LCD menampilkan **"Tag tdk dikenal"** + UID-nya
   (juga tercetak di Serial Monitor).
2. Daftarkan UID tersebut di web: **Kartu RFID** (untuk kartu kelas) atau **Kelola Alat** (kolom *Kode stiker / Tag RFID alat*).
3. Alur peminjaman:
   - Tap **kartu kelas** → sesi mulai, LCD menampilkan **kelas** dan hitung mundur 10 detik
   - Tap **stiker alat** → backend menentukan sendiri: `DIPINJAM`, `DIKEMBALIKAN`, atau penolakan
   - Setiap tap alat yang berhasil memperpanjang sesi 10 detik
   - Timer LCD mengikuti `session.expires_in_seconds` dari database; timer lokal
     hanya untuk menggambar hitung mundur, bukan sumber keputusan sesi
   - Tap **stiker alat yang sama** pada sesi yang sama → `TAP DUPLIKAT` (bukan pengembalian)
   - Tap **stiker alat milik kelas lain yang sedang dipinjam** → `SEDANG DIPINJAM`
   - Tap **kartu kelas** lagi → `SESI SELESAI`
   - Tap alat saat tidak ada sesi → `SESI TIDAK AKTIF`

   Firmware tidak menentukan mode PINJAM/KEMBALI. LCD hanya menampilkan
   hasil dari respons backend (`success`, `code`, `action`, `message`,
   `alat`, dan `kelas`). HTTP 200 belum tentu berarti transaksi berhasil.

   Untuk alat pinjam, satu baris idealnya mewakili **satu unit fisik** dengan
   `jumlah_total = 1`. Bila data lama memiliki `jumlah_total > 1`, stok dihitung
   dari total unit dikurangi unit rusak dan transaksi yang masih aktif.
   UID stiker disimpan di kolom `alat.kode` (bukan `uid_rfid`).

## Bunyi buzzer

| Bunyi | Arti |
|---|---|
| klik pendek | Tag terbaca |
| 1× beep | Alat berhasil dipinjam/dikembalikan |
| 2× beep | Sesi mulai / selesai |
| 3× beep | Ditolak / error |

## Troubleshooting

- **LCD menyala tapi tidak ada tulisan** → putar potensiometer di belakang modul I2C, atau ganti `LCD_ADDRESS` ke `0x3F`.
- **"RFID error! Cek kabel RC522"** → cek wiring SPI dan pastikan RC522 di 3.3V.
- **Buzzer bunyi terus / tidak mau bunyi** → sesuaikan `BUZZER_ON_LEVEL` antara `LOW` dan `HIGH` mengikuti modul buzzer.
- **Buzzer tidak bunyi / hanya klik** → kemungkinan buzzer pasif, set `BUZZER_PASSIVE` ke `true`.
- **HTTP 401** → anon key salah, atau project memakai key baru `sb_publishable_...`;
  deploy function dengan `supabase functions deploy rfid-tap --no-verify-jwt`.
- **HTTP 404** → edge function `rfid-tap` belum di-deploy ke Supabase.
