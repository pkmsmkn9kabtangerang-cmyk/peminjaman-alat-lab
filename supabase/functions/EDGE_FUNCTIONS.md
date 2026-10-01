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
    ├── manage-pengguna/           # CRUD profil pengguna (admin)
    └── dashboard-stats/           # Statistik & chart dashboard
```

---

## 📋 Referensi Endpoint

| Function | Method | Path | Akses |
|---|---|---|---|
| `rfid-tap` | POST | `/rfid-tap` | ESP32 / service-role |
| `create-petugas` | POST | `/create-petugas` | Admin |
| `process-manual` | POST | `/process-manual` | Admin, Petugas |
| `manage-alat` | GET | `/manage-alat` | Semua (authenticated) |
| `manage-alat` | POST/PUT/DELETE | `/manage-alat` | Admin |
| `manage-kartu` | GET | `/manage-kartu` | Semua (authenticated) |
| `manage-kartu` | POST/PUT/DELETE | `/manage-kartu` | Admin |
| `manage-transaksi` | GET | `/manage-transaksi` | Semua (authenticated) |
| `manage-transaksi` | PUT | `/manage-transaksi?id=:id` | Admin, Petugas |
| `manage-transaksi` | DELETE | `/manage-transaksi?id=:id` | Admin |
| `manage-transaksi` | DELETE | `/manage-transaksi?clear=riwayat` | Admin |
| `manage-transaksi` | DELETE | `/manage-transaksi?clear=taplog` | Admin |
| `manage-pengguna` | GET | `/manage-pengguna` | Admin |
| `manage-pengguna` | PUT/DELETE | `/manage-pengguna?id=:uid` | Admin |
| `dashboard-stats` | GET | `/dashboard-stats?days=7` | Semua (authenticated) |

---

## ⚙️ Environment Variables yang Dibutuhkan

Buat file `.env` di root project untuk frontend:

```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key>
```

Di Supabase Dashboard → Edge Functions → Secrets, tambahkan:

| Secret | Keterangan |
|---|---|
| `SUPABASE_URL` | URL project (otomatis tersedia) |
| `SUPABASE_ANON_KEY` | Anon key (otomatis tersedia) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (otomatis tersedia) |
| `SITE_URL` | URL frontend (untuk redirect email invite) |

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
supabase functions deploy rfid-tap
supabase functions deploy create-petugas
supabase functions deploy process-manual
supabase functions deploy manage-alat
supabase functions deploy manage-kartu
supabase functions deploy manage-transaksi
supabase functions deploy manage-pengguna
supabase functions deploy dashboard-stats
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

# Test rfid-tap
curl -X POST http://localhost:54321/functions/v1/rfid-tap \
  -H "Content-Type: application/json" \
  -d '{"uid":"ABC123"}'

# Test dashboard-stats
curl http://localhost:54321/functions/v1/dashboard-stats?days=7 \
  -H "Authorization: Bearer <anon-key>"
```

---

## 🔐 Catatan Keamanan

- **Service Role Key** tidak pernah dikirim ke frontend. Hanya digunakan di dalam Edge Functions.
- Semua fungsi yang mengubah data memverifikasi JWT dan role dari database (bukan dari body request).
- `rfid-tap` menggunakan service role untuk bisa menulis ke `tap_log` tanpa JWT (untuk ESP32).
- Hapus massal (`clear=riwayat/taplog`) hanya dapat dilakukan oleh `admin`.
