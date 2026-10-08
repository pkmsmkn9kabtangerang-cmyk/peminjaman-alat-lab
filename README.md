# 🔬 SIMLAB — Sistem Peminjaman Alat Lab Berbasis IoT RFID & Cloud

> **Sistem Informasi & Manajemen Peminjaman Alat Laboratorium Berbasis IoT RFID & Supabase Cloud**  
> Dikembangkan untuk digitalisasi inventaris dan otomatisasi peminjaman alat lab di SMK Negeri.

[![React](https://img.shields.io/badge/React-18-blue.svg?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF.svg?logo=vite)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-Database%20%26%20Edge%20Functions-3ECF8E.svg?logo=supabase)](https://supabase.com/)
[![ESP32](https://img.shields.io/badge/IoT-ESP32%20%2B%20RC522-E7352C.svg?logo=espressif)](https://espressif.com/)

---

## 🌟 Fitur Utama

- **⚡ Otomatisasi RFID (Tap-and-Go)**:
  - Siswa/perwakilan kelas cukup melakukan tap **Kartu Kelas** sekali, lalu tap **Stiker RFID Alat**.
  - Sistem otomatis mendeteksi apakah transaksi bersifat **Peminjaman** atau **Pengembalian** tanpa perlu konfirmasi manual.
- **🔄 Dual-Mode Architecture (Production & Local Demo)**:
  - **Mode Production**: Menggunakan Supabase PostgreSQL, Auth, Row Level Security (RLS), Realtime WebSocket, dan 8 Edge Functions.
  - **Mode Demo Offline**: Otomatis fallback ke LocalStorage browser jika environment Supabase belum diatur. Siap diuji coba langsung tanpa setup backend!
- **📊 Realtime Dashboard & Notifikasi**:
  - Live feed aktivitas scanner alat via Supabase Realtime.
  - Statistik ketersediaan alat, grafik peminjaman harian, dan notifikasi tap kartu masuk seketika.
- **🛠️ Peminjaman & Pengembalian Manual**:
  - Form pencatatan manual lengkap jika siswa tidak membawa kartu fisik.
  - Mendukung pemberian alat "Sekali Pakai" (consumable) yang langsung memotong stok tanpa perlu dikembalikan.
  - Pemeriksaan kondisi barang kembali (Baik / Rusak) dengan auto-update stok rusak.
- **🔐 Keamanan & Role-Based Access Control (RBAC)**:
  - Pembagian hak akses tegas antara **Admin** (Kelola Alat, Kartu, Petugas, Hapus Riwayat) dan **Petugas** (Operasional Transaksi & Realtime Card).
  - Proteksi anti self-delete: Akun admin yang sedang login tidak dapat menghapus atau mengubah akunnya sendiri.
  - Alur undangan petugas resmi via email menggunakan Supabase Auth Admin.
  - Fasilitas Ganti Password dan Reset Password mandiri atau oleh admin.
- **🎮 Built-in IoT Simulator**:
  - Halaman simulator web untuk menguji alur tap RFID virtual tanpa perlu menyambungkan perangkat keras fisik.
- **📋 Panduan SOP Terintegrasi (`PageNote`)**:
  - Setiap halaman web memiliki kartu panduan SOP yang ringkas, bersih, dan memudahkan petugas baru.

---

## 🛠️ Tech Stack

| Bagian | Teknologi |
|---|---|
| **Frontend** | React 18, Vite, Vanilla CSS + Tailwind CSS utilities |
| **Icons & Font** | `@tabler/icons-react`, Google Fonts (Poppins / Inter) |
| **Backend / BaaS** | Supabase (PostgreSQL 15, Supabase Auth, Realtime) |
| **Serverless API** | 8 Supabase Edge Functions (Deno Runtime) |
| **Hardware IoT** | ESP32 DevKit V1, RFID RC522 (13.56 MHz), LCD 1602 I2C, Buzzer 5V |
| **Firmware** | Arduino IDE / C++ (`firmware/simlab_rfid/simlab_rfid.ino`) |

---

## 📁 Struktur Direktori

```text
peminjaman-barang/
├── firmware/
│   ├── README.md                  # Panduan wiring & setup hardware
│   └── simlab_rfid/
│       └── simlab_rfid.ino        # Kode firmware ESP32
├── src/
│   ├── assets/                    # Asset gambar & logo sekolah
│   ├── components/                # Komponen UI (Sidebar, Modal, DataTable, PageNote, dll)
│   ├── hooks/                     # Custom hooks React
│   ├── lib/
│   │   ├── api.js                 # Helper pemanggilan Edge Functions
│   │   ├── supabase.js            # Inisialisasi Supabase client
│   │   └── handleError.js         # Standardisasi pesan error
│   ├── pages/                     # Halaman aplikasi web
│   │   ├── AktivitasKartu.jsx     # Live feed tap RFID (Realtime Card)
│   │   ├── DaftarAlat.jsx         # Daftar alat & stok tersedia
│   │   ├── Dashboard.jsx          # Ringkasan analitik & pinjaman aktif
│   │   ├── KelolaAlat.jsx         # Inventaris alat (Admin)
│   │   ├── KelolaKartu.jsx        # Registrasi kartu RFID (Admin)
│   │   ├── KelolaPetugas.jsx      # Manajemen akun petugas (Admin)
│   │   ├── Login.jsx              # Autentikasi staf
│   │   ├── Peminjaman.jsx         # Transaksi pinjam manual
│   │   ├── Pengembalian.jsx       # Transaksi kembali manual
│   │   ├── Riwayat.jsx            # Arsip riwayat transaksi
│   │   └── SimulasiKartu.jsx      # Emulator RFID di browser
│   └── services/
│       ├── store.js               # Mock database LocalStorage (Local Mode)
│       └── petugasService.js      # Service helper akun petugas
├── supabase/
│   ├── migrations/
│   │   └── 001_initial_schema.sql # DDL tabel, views, RLS, functions
│   └── functions/                 # Deno Edge Functions
│       ├── _shared/               # Shared CORS & auth helpers
│       ├── rfid-tap/              # Endpoint webhook tap scanner ESP32
│       ├── create-petugas/        # Admin invite user auth via email
│       ├── process-manual/        # Transaksi pinjam/kembali manual
│       ├── manage-alat/           # CRUD inventaris alat
│       ├── manage-kartu/          # CRUD kartu RFID kelas
│       ├── manage-transaksi/      # Riwayat & pembersihan data
│       ├── manage-pengguna/       # CRUD pengguna/petugas
│       └── dashboard-stats/       # Agregasi statistik lab
├── PLAN.md                        # Master blueprint arsitektur lengkap
└── README.md                      # Dokumentasi pengoperasian ini
```

---

## 🚀 Panduan Memulai Cepat

### 1. Menjalankan di Mode Lokal (Demo Offline)

Tidak memerlukan akun Supabase atau konfigurasi database apa pun.

```bash
# Clone repository
git clone https://github.com/username/peminjaman-barang.git
cd peminjaman-barang

# Install dependensi
npm install

# Jalankan server lokal
npm run dev
```

Buka browser di `http://localhost:5173`.  
- Akun default demo: `admin@smk.sch.id` / password bebas.
- Seluruh data tersimpan secara mandiri di `localStorage` peramban Anda.

---

### 2. Menjalankan di Mode Production (Supabase)

#### A. Buat Project Supabase & Migrasi Database
1. Buka [Supabase Dashboard](https://supabase.com/dashboard) dan buat project baru.
2. Buka menu **SQL Editor**, salin dan jalankan isi file:
   [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql)
   *(Atau jalankan `npx supabase db push` jika menggunakan CLI)*.

#### B. Deploy Supabase Edge Functions
Pastikan Supabase CLI sudah terpasang:
```bash
npm install -g supabase
supabase login
supabase link --project-ref <PROJECT_REF_ANDA>

# Deploy seluruh 8 fungsi backend
supabase functions deploy rfid-tap --no-verify-jwt
supabase functions deploy create-petugas
supabase functions deploy process-manual
supabase functions deploy manage-alat
supabase functions deploy manage-kartu
supabase functions deploy manage-transaksi
supabase functions deploy manage-pengguna
supabase functions deploy dashboard-stats

# Atur secret URL domain web Anda
supabase secrets set SITE_URL=https://domain-anda.vercel.app
```

#### C. Konfigurasi Environment Frontend
Buat file `.env` di root project:
```env
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-key-anda>
VITE_SCHOOL_NAME="SMK NEGERI 9 KAB. TANGERANG"
```

Jalankan atau bangun aplikasi web:
```bash
npm run build
```

---

## 🔌 Integrasi Perangkat IoT (ESP32)

1. **Hardware Wiring**:
   - `MFRC522` ke ESP32: SDA(GPIO 5), SCK(GPIO 18), MOSI(GPIO 23), MISO(GPIO 19), RST(GPIO 4), VCC(**3.3V**).
   - `LCD 1602 I2C`: SDA(GPIO 21), SCL(GPIO 22), VCC(**5V**).
   - `Buzzer`: GPIO 25.
2. **Flash Firmware**:
   - Buka `firmware/simlab_rfid/simlab_rfid.ino` di Arduino IDE.
   - Atur kredensial WiFi dan URL Supabase Edge Function Anda.
   - Upload sketch ke ESP32.
   - Detail troubleshooting perangkat dapat dibaca di [`firmware/README.md`](firmware/README.md).

---

## 📄 Lisensi & Kontribusi

Sistem ini dikembangkan untuk keperluan pengabdian dan kemajuan pendidikan kejuruan. Silakan gunakan dan sesuaikan untuk kebutuhan laboratorium sekolah Anda.
