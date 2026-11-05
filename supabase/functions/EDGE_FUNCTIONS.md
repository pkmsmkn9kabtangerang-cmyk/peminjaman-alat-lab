# 🚀 Backend — Supabase Edge Functions

Semua logic backend SIMLAB diimplementasi sebagai **Supabase Edge Functions** (Deno runtime).

---

## 📁 Struktur Folder

```
supabase/
├── config.toml                    # Konfigurasi Supabase CLI
├── migrations/
│   └── 001_initial_schema.sql     # DDL tabel, RLS, views, indexes
└── functions/
    ├── _shared/
    │   ├── cors.js                # Helper CORS & json() response
    │   └── auth.js                # Helper requireAuth() JWT + role check
    │
    ├── rfid-tap/                  # Proses tap RFID dari ESP32
    ├── create-petugas/            # Buat akun petugas baru (admin only)
    ├── process-manual/            # Transaksi manual pinjam/kembali
    ├── manage-alat/               # CRUD inventaris alat (admin write)
    ├── manage-kartu/              # CRUD kartu RFID (admin write)
    ├── manage-transaksi/          # Kelola riwayat + hapus semua (admin)
    ├── manage-permintaan/         # Persetujuan alat habis pakai
    ├── manage-pengguna/           # CRUD profil pengguna (admin)
    └── dashboard-stats/           # Statistik & chart dashboard
```

---

## 📋 Referensi Endpoint

| Function            | Method          | Path                                           | Akses                 |
| ------------------- | --------------- | ---------------------------------------------- | --------------------- |
| `rfid-tap`          | POST            | `/rfid-tap`                                    | ESP32 / simulator (device headers) |
| `create-petugas`    | POST            | `/create-petugas`                              | Admin                 |
| `process-manual`    | POST            | `/process-manual`                              | Admin, Petugas        |
| `manage-alat`       | GET             | `/manage-alat`                                 | Semua (authenticated) |
| `manage-alat`       | POST/PUT/DELETE | `/manage-alat`                                 | Admin                 |
| `manage-kartu`      | GET             | `/manage-kartu`                                | Semua (authenticated) |
| `manage-kartu`      | POST/PUT/DELETE | `/manage-kartu`                                | Admin                 |
| `manage-transaksi`  | GET             | `/manage-transaksi`                            | Semua (authenticated) |
| `manage-transaksi`  | PUT             | `/manage-transaksi?id=:id`                     | Admin, Petugas        |
| `manage-transaksi`  | DELETE          | `/manage-transaksi?id=:id`                     | Admin                 |
| `manage-transaksi`  | DELETE          | `/manage-transaksi?clear=riwayat`              | Admin                 |
| `manage-transaksi`  | DELETE          | `/manage-transaksi?clear=taplog`               | Admin                 |
| `manage-permintaan` | GET             | `/manage-permintaan?status=menunggu`           | Admin, Petugas        |
| `manage-permintaan` | PUT             | `/manage-permintaan?id=:id`                    | Admin, Petugas        |
| `manage-pengguna`   | GET             | `/manage-pengguna`                             | Admin                 |
| `manage-pengguna`   | PUT/DELETE      | `/manage-pengguna?id=:uid`                     | Admin                 |
| `manage-pengguna`   | POST            | `/manage-pengguna?id=:uid&aksi=reset-password` | Admin                 |
| `dashboard-stats`   | GET             | `/dashboard-stats?days=7`                      | Semua (authenticated) |

Penghapusan riwayat pinjam (`clear=riwayat`/`clear=pinjam`) dan penghapusan
satu transaksi ditolak dengan HTTP `409` dan `code: "masih_ada_pinjam"` selama
transaksi tersebut masih berstatus `dipinjam`. Kembalikan alat terlebih dahulu;
migration `013_guard_hapus_transaksi_aktif.sql` juga memasang trigger database
sebagai pengaman terakhir.

---

## ⚙️ Environment Variables yang Dibutuhkan

Buat file `.env` di root project untuk frontend:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
# Wajib untuk halaman Simulator IoT; jangan pakai key device ESP32.
VITE_SIM_DEVICE_ID=web-simulator
VITE_SIM_DEVICE_KEY=<key-simulator-yang-kuat>
```

Di Supabase Dashboard → Edge Functions → Secrets, tambahkan:

| Secret                      | Keterangan                                 |
| --------------------------- | ------------------------------------------ |
| `SUPABASE_URL`              | URL project (otomatis tersedia)            |
| `SUPABASE_ANON_KEY`         | Anon key (otomatis tersedia)               |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (otomatis tersedia)       |
| `SITE_URL`                  | URL frontend (untuk redirect email invite) |
| `RFID_DEVICE_ID`            | Device ID hardware yang diizinkan (wajib)  |
| `RFID_DEVICE_KEY`           | Device key hardware (wajib, gunakan key acak yang kuat) |
| `RFID_SIMULATOR_ID`         | Device ID simulator web (opsional)         |
| `RFID_SIMULATOR_KEY`        | Device key simulator web (opsional, terpisah dari hardware) |

Tidak ada fallback `esp32-lab-01` / `sim-key`. Jika secret wajib belum
diset, `rfid-tap` menolak request dengan `server_error`.

### Kontrak respons `rfid-tap`

Hasil bisnis (termasuk penolakan) tetap HTTP 200 dengan bentuk:

```json
{
  "success": true,
  "code": "dipinjam",
  "action": "pinjam",
  "message": "...",
  "alat": { "id": "...", "nama": "...", "kode": "..." },
  "kelas": "XI RPL 1",
  "session": {
    "uid_kartu": "...",
    "kelas": "XI RPL 1",
    "nama_pemegang": "...",
    "expires_at": "2026-01-01T00:00:00+00:00",
    "expires_in_seconds": 10
  }
}
```

- `session.expires_in_seconds` dihitung PostgreSQL dari `expires_at - now()`.
  Firmware memakai nilai ini sebagai awal timer LCD; timer lokal hanya untuk
  menggambar hitung mundur, bukan sumber keputusan sesi.
- `session.expires_at` tetap tersedia untuk web.
- Firmware wajib memeriksa `success`/`code`, bukan status HTTP.
- Tap alat yang sama pada sesi yang sama menghasilkan `tap_duplikat`.

---

## 🚢 Deploy ke Supabase

### 1. Install Supabase CLI

```bash
npm install -g supabase
```

### 2. Login & Link project

```bash
supabase login
supabase link --project-ref <project-ref>
```

### 3. Jalankan migrasi database

```bash
supabase db push
```

### 4. Deploy semua Edge Functions sekaligus

```bash
supabase functions deploy rfid-tap --use-api
supabase functions deploy create-petugas --use-api
supabase functions deploy process-manual --use-api
supabase functions deploy manage-alat --use-api
supabase functions deploy manage-kartu --use-api
supabase functions deploy manage-transaksi --use-api
supabase functions deploy manage-permintaan --use-api
supabase functions deploy manage-pengguna --use-api
supabase functions deploy dashboard-stats --use-api
```

### 5. Set SITE_URL secret

```bash
supabase secrets set SITE_URL=https://your-frontend-domain.com
```

---

## 🧪 Test Lokal

```bash
# Jalankan Supabase lokal
supabase start

# Terapkan migration (termasuk 012_rfid_atomic_tap.sql dan
# 013_guard_hapus_transaksi_aktif.sql)
supabase db reset

# Test rfid-tap (wajib menyertakan header device)
curl -X POST http://localhost:54321/functions/v1/rfid-tap \
  -H "Content-Type: application/json" \
  -H "apikey: <anon-key>" \
  -H "Authorization: Bearer <anon-key>" \
  -H "x-device-id: <device-id>" \
  -H "x-device-key: <device-key>" \
  -d '{"uid":"ABC123"}'

# Respons bisnis selalu HTTP 200 dengan kontrak:
# { "success": bool, "code": string, "action": string, "message": string,
#   "alat": object|null, "kelas": string|null, "session": object|null }
# Periksa `success`, bukan hanya status HTTP.

# Test dashboard-stats
curl http://localhost:54321/functions/v1/dashboard-stats?days=7 \
  -H "Authorization: Bearer <anon-key>"
```

---

## 🔐 Catatan Keamanan

- **Service Role Key** tidak pernah dikirim ke frontend. Hanya digunakan di dalam Edge Functions.
- Semua fungsi web yang mengubah data memverifikasi JWT dan role dari database (bukan dari body request).
- `rfid-tap` memverifikasi header `x-device-id` / `x-device-key`, lalu memakai service role **hanya di server** untuk memanggil RPC `process_rfid_tap`. Service role tidak pernah dikirim ke ESP32.
- Hapus massal (`clear=riwayat/taplog`) hanya dapat dilakukan oleh `admin`.
