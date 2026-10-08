# 📋 Master Plan & Dokumentasi Sistem: SIMLAB SMK
> **Sistem Informasi & Manajemen Peminjaman Alat Laboratorium Berbasis IoT RFID & Cloud Supabase**  
> Dibuat untuk Program Kreativitas Mahasiswa (PKM) / Pengabdian Masyarakat di SMK Negeri.

---

## 📑 Daftar Isi
1. [Ringkasan & Tujuan Sistem](#1-ringkasan--tujuan-sistem)
2. [Arsitektur Sistem (Dual Mode)](#2-arsitektur-sistem-dual-mode)
3. [Tech Stack](#3-tech-stack)
4. [Skema Database & Views Supabase](#4-skema-database--views-supabase)
5. [Supabase Edge Functions](#5-supabase-edge-functions)
6. [Alur Bisnis & Logika IoT RFID](#6-alur-bisnis--logika-iot-rfid)
7. [Fitur-Fitur & Halaman Frontend](#7-fitur-fitur--halaman-frontend)
8. [Keamanan & Role-Based Access Control (RBAC)](#8-keamanan--role-based-access-control-rbac)
9. [Firmware & Hardware IoT](#9-firmware--hardware-iot)
10. [Panduan Instalasi & Deployment (Prod & Local)](#10-panduan-instalasi--deployment-prod--local)

---

## 1. Ringkasan & Tujuan Sistem

**SIMLAB** adalah platform terpadu peminjaman inventaris alat lab yang mengintegrasikan pemindaian RFID fisik (kartu perwakilan kelas & stiker alat) dengan sistem berbasis web modern dan backend serverless Supabase.

### Masalah yang Diselesaikan:
- Pencatatan peminjaman alat lab konvensional berbasis buku sering mengalami kehilangan data, alat tercecer, atau ketidakjelasan siapa penanggung jawab peminjam.
- Petugas laboratorium kesulitan memantau sisa stok alat yang layak pakai versus unit yang rusak secara seketika (*realtime*).
- Kebutuhan alur cepat: siswa hanya perlu tap kartu RFID kelas lalu tap alat yang diambil, tanpa menunggu antrean pencatatan manual yang panjang.

---

## 2. Arsitektur Sistem (Dual Mode)

SIMLAB dirancang dengan arsitektur cerdas **Dual-Mode**:
1. **Production Mode (Live Supabase)**: Menggunakan Supabase Database (PostgreSQL), Supabase Auth, Row Level Security (RLS), Supabase Realtime WebSocket, dan 8 Edge Functions Deno.
2. **Local Demo Mode (Fallback)**: Jika `VITE_SUPABASE_URL` belum diset, aplikasi secara otomatis berjalan di memori browser (`localStorage` via `dbService` di `src/services/store.js`). Penguji dapat mencoba seluruh alur tanpa setup server.

### Diagram Arsitektur Alur Data:

```mermaid
flowchart TD
    subgraph Hardware_IoT["Hardware Lab (IoT)"]
        K[Kartu RFID Kelas 13.56MHz] -->|Tap 1x| RC[Scanner RC522]
        A[Stiker RFID Alat] -->|Tap 1..n| RC
        RC --> ESP[ESP32 DevKit]
        ESP -->|Status & Bip| LCD[LCD 1602 + Buzzer]
    end

    subgraph Supabase_Cloud["Supabase Backend"]
        EF_TAP["Edge Function: rfid-tap"]
        EF_AUTH["Edge Function: create-petugas"]
        EF_MAN["Edge Function: process-manual / manage-*"]
        DB[(PostgreSQL + RLS)]
        AUTH_SVC[Supabase Auth]
        RT[Supabase Realtime Pub/Sub]
        VIEW1["View: v_list_barang"]
        VIEW2["View: v_pinjaman_aktif"]
    end

    subgraph Frontend_App["Frontend Web (React + Vite)"]
        WEB[Dashboard & Pages]
        SIM[Simulasi RFID Web]
        TOAST[Live Notification & Bel]
    end

    ESP -->|HTTPS POST + anon key + device key| EF_TAP
    SIM -->|HTTPS POST| EF_TAP
    EF_TAP --> DB
    EF_TAP --> RT

    WEB -->|JWT User (Admin/Petugas)| EF_AUTH
    WEB -->|JWT User (Admin/Petugas)| EF_MAN
    EF_AUTH --> AUTH_SVC
    EF_AUTH --> DB
    EF_MAN --> DB

    WEB -->|Direct Query via supabase-js + RLS| VIEW1
    WEB -->|Direct Query via supabase-js + RLS| VIEW2
    RT -->|WebSocket Event (transaksi, tap_log)| TOAST
    RT -->|Live Updates| WEB
```

---

## 3. Tech Stack

| Layer | Komponen / Teknologi | Keterangan |
|---|---|---|
| **Frontend** | React 18, Vite | SPA super cepat, hot-reloading |
| **Styling** | Vanilla CSS + Tailwind CSS utilities | Desain modern, responsive, badge, modal, dark/light tones |
| **Icons & Font** | `@tabler/icons-react`, Google Font (Poppins / Inter) | UI informatif, modern, konsisten |
| **Data Visualization**| SVG & Custom Progress Charts | Visualisasi stok, tren harian, persentase ketersediaan |
| **Database** | PostgreSQL 15 (Supabase Cloud) | Dilengkapi View terhitung & RLS policies |
| **Backend API** | Supabase Edge Functions (Deno Runtime) | Serverless, performa tinggi, aman (Service Role key terisolasi) |
| **Realtime** | Supabase Realtime (PostgreSQL Changes) | Notifikasi instan saat ada tap RFID baru atau mutasi transaksi |
| **Autentikasi** | Supabase Auth (Email + Password / Invite Email) | Role-Based Access Control (`admin` vs `petugas`) |
| **Hardware** | ESP32 DevKit V1, RC522 RFID Reader, LCD 1602 I2C, Buzzer | Pemindai fisik di lab |

---

## 4. Skema Database & Views Supabase

File migrasi DDL lengkap: `supabase/migrations/001_initial_schema.sql`

### 4.1 Tabel Utama

1. **`public.profiles`**
   - Terhubung langsung dengan `auth.users(id)` (ON DELETE CASCADE).
   - Kolom: `id` (UUID, PK), `nama_lengkap`, `nip`, `username`, `email`, `role` (`admin` | `petugas`), `created_at`.
2. **`public.alat`**
   - Inventaris alat laboratorium.
   - Kolom: `id` (PK, text misal `ALT-001`), `kode` (unique), `nama`, `kategori`, `jumlah_total`, `jumlah_rusak`, `tipe` (`pinjam` | `sekali_pakai`), `satuan`, `created_at`.
3. **`public.kartu_rfid`**
   - Registrasi kartu fisik perwakilan kelas.
   - Kolom: `uid_kartu` (PK), `kelas`, `nama_pemegang`, `aktif` (boolean), `created_at`.
4. **`public.transaksi`**
   - Riwayat peminjaman dan pengembalian unit.
   - Kolom: `id` (PK), `uid_kartu` (FK), `kelas`, `alat_id` (FK), `nama_alat`, `status` (`dipinjam` | `dikembalikan`), `sumber` (`otomatis` | `manual`), `kondisi_pinjam` (default 'baik'), `kondisi_kembali`, `catatan`, `waktu_pinjam`, `waktu_kembali`, `petugas`, `created_at`.
5. **`public.tap_log`**
   - Audit trail semua aktivitas tap dari ESP32 atau emulator.
   - Kolom: `id` (PK), `uid_kartu`, `uid_alat`, `jenis_tap`, `jenis_terdeteksi`, `kelas`, `nama_alat`, `status` (`berhasil` | `ditolak`), `error_code`, `is_read` (boolean), `waktu_tap`.

---

### 4.2 Views & Computed Data

1. **`v_list_barang`**  
   Menghitung status ketersediaan alat secara otomatis:
   - `stok_tersedia` = `GREATEST(0, jumlah_total - jumlah_rusak - dipinjam_aktif)`
   - `dipinjam_aktif` = Jumlah baris transaksi alat tersebut yang berstatus `dipinjam`
   - `status` = `'habis'` jika stok_tersedia <= 0, `'dipinjam'` jika sedang ada yang meminjam, `'tersedia'` jika utuh.
   - `peminjam_kartu` & `peminjam_kelas` = Data kartu peminjam terakhir.

2. **`v_pinjaman_aktif`**  
   Mendaftar semua transaksi yang belum dikembalikan (`status = 'dipinjam'`) di-join dengan info `kartu_rfid` dan `alat`, dilengkapi kalkulasi:
   - `durasi_menit` = Durasi sejak `waktu_pinjam` hingga `NOW()`.

---

### 4.3 Stored Procedures & Realtime Publication

- **`public.get_my_role()`**: Fungsi `SECURITY DEFINER` untuk memeriksa role dari user yang sedang melakukan request (`SELECT role FROM profiles WHERE id = auth.uid()`).
- **`public.mark_taps_read()`**: Menandai seluruh tap belum terbaca (`is_read = FALSE`) menjadi `TRUE`.
- **Publication `supabase_realtime`**: Menyiarkan event INSERT/UPDATE pada tabel `transaksi` dan `tap_log`.

---

## 5. Supabase Edge Functions

Semua backend serverless berlokasi di direktori `supabase/functions/` (Deno runtime).

| Function | Method | Otorisasi | Deskripsi & Logic |
|---|---|---|---|
| **`rfid-tap`** | `POST` | Anon / Service Role (`--no-verify-jwt`) | Endpoint untuk ESP32 & Simulator. Mengidentifikasi UID kartu vs stiker alat, mengelola sesi aktif 20 detik, mencatat peminjaman/pengembalian otomatis, dan mencatat log audit ke `tap_log`. |
| **`create-petugas`** | `POST` | Admin (JWT Auth) | Menggunakan Supabase Service Role untuk memanggil `auth.admin.inviteUserByEmail`. Mengirim email aktivasi resmi, menetapkan role `petugas`, dan membuat entri di tabel `profiles`. |
| **`process-manual`** | `POST` | Admin, Petugas (JWT) | Memproses peminjaman dan pengembalian yang dilakukan manual oleh staf via web (memvalidasi stok, update status transaksi, isi catatan & kondisi). |
| **`manage-alat`** | `GET, POST, PUT, DELETE`| Read: Authenticated<br>Write: Admin | CRUD inventaris alat lab, kode alat, kategori, jumlah total, dan pelaporan unit rusak. |
| **`manage-kartu`** | `GET, POST, PUT, DELETE`| Read: Authenticated<br>Write: Admin | Registrasi kartu RFID kelas, status aktif/blokir, nama ketua/pemegang kartu. |
| **`manage-transaksi`**| `GET, PUT, DELETE` | Admin & Petugas (Clear all: Admin) | Mengambil daftar riwayat transaksi, update catatan/kondisi, serta fitur *danger zone* pembersihan massal riwayat / tap log. |
| **`manage-pengguna`** | `GET, PUT, DELETE` | Admin only (JWT) | Mengelola profil petugas, ganti data/NIP, hapus petugas. **Dilengkapi proteksi:** Admin tidak bisa menghapus atau mengubah akun dirinya sendiri. |
| **`dashboard-stats`** | `GET` | Authenticated (JWT) | Menyediakan data metrik statistik dashboard (total alat, unit dipinjam, unit rusak, tren aktivitas 7/30 hari). |

---

## 6. Alur Bisnis & Logika IoT RFID

### Alur Sesi Tap (Smart 20-Second Window):
1. **Tap 1 (Kartu Kelas)**:
   - ESP32 membaca UID kartu kelas.
   - Server mengecek apakah kartu terdaftar dan aktif.
   - Sesi dibuka selama 20 detik.
   - Sistem menentukan mode: jika kelas masih memiliki alat yang belum dikembalikan, mode otomatis siap **kembali / pinjam**.
   - Buzzer berbunyi 2× beep, LCD menampilkan nama kelas & status standby.
2. **Tap 2..n (Stiker Alat)**:
   - Siswa menempelkan stiker alat yang dipinjam/dikembalikan.
   - Jika alat tersebut sedang dipinjam oleh kelas tersebut -> **STATUS: DIKEMBALIKAN** (stok bertambah 1).
   - Jika alat belum dipinjam dan stok > 0 -> **STATUS: DIPINJAM** (stok berkurang 1).
   - Setiap tap alat memperpanjang durasi sesi sebanyak 20 detik.
   - Buzzer berbunyi 1× beep (sukses) atau 3× beep (gagal/stok habis/tag tidak dikenal).
3. **Penutupan Sesi**:
   - Siswa tap kartu kelas sekali lagi, ATAU durasi 20 detik habis tanpa ada tap baru.

---

## 7. Fitur-Fitur & Halaman Frontend

Aplikasi web terbagi ke dalam menu navigasi yang intuitif dan profesional:

1. **Dashboard** (`#dashboard`)
   - Sambutan personal sesuai nama petugas yang login.
   - Kartu metrik: Total Alat, Unit Dipinjam, Alat Tersedia, dan Unit Rusak.
   - Progress bar ketersediaan dan visualisasi tren peminjaman.
   - Tabel ringkasan pinjaman aktif yang sedang berlangsung.
2. **Aktivitas RFID / Realtime Card** (`#realtime_card`)
   - Tampilan live feed audit tap kartu dan alat dari scanner lab.
   - Highlight visual saat ada transaksi baru masuk lewat Supabase Realtime WebSocket.
   - Indikator status berhasil vs ditolak beserta kode error.
3. **Peminjaman Manual** (`#peminjaman`)
   - Digunakan oleh petugas jika siswa tidak membawa kartu fisik atau scanner mengalami kendala.
   - Pemilihan kelas, pencarian alat berbasis live stock, stepper jumlah unit, dan catatan kondisi awal.
4. **Pengembalian Manual** (`#pengembalian`)
   - Memilih kartu kelas peminjam, menampilkan daftar barang yang sedang mereka bawa.
   - Pemeriksaan kondisi barang saat kembali (Baik / Rusak / Hilang) untuk otomatis memperbarui `jumlah_rusak` di database.
5. **Riwayat Peminjaman** (`#riwayat`)
   - Catatan lengkap seluruh transaksi historis lab.
   - Filter status (`Semua`, `Dipinjam`, `Dikembalikan`), filter sumber (`Otomatis RFID` vs `Manual Web`), pencarian nama alat/siswa, dan pagination.
   - Kemampuan export data riwayat.
6. **Daftar Alat** (`#list_alat`)
   - Menampilkan inventaris lab beserta status terkini (`Tersedia`, `Dipinjam`, `Habis`).
   - Format rasio stok praktis (`X / Y unit tersedia`).
   - Informasi siapa kelas yang sedang meminjam unit tersebut secara transparan.
7. **Inventaris Alat (Admin Only)** (`#inventaris`)
   - Manajemen katalog alat: Tambah alat baru, ubah nama/kode/kategori, update jumlah total unit, dan pelaporan barang rusak.
8. **Kartu RFID (Admin Only)** (`#kartu_rfid`)
   - Registrasi kartu fisik baru, asosiasi ke nama kelas, penugasan nama pemegang kartu (Ketua Kelas/Penanggung Jawab), serta toggle aktif/nonaktif kartu.
9. **Kelola Pengguna (Admin Only)** (`#pengguna`)
   - Pendaftaran akun petugas baru dengan undangan email aktivasi resmi.
   - Pengelolaan NIP, username, nama lengkap.
   - **Aturan Proteksi Akun Admin**: Admin yang sedang login tidak dapat melihat opsi edit/hapus pada akunnya sendiri, menjaga integritas akses sistem.
10. **Simulasi Kartu / IoT Simulator** (`#simulasi_iot`)
    - Emulator scanner hardware langsung di browser.
    - Uji coba tap kartu kelas dan tap alat secara virtual untuk verifikasi alur sebelum diuji pada alat fisik.
11. **Ganti Password** (`#ganti_password`)
    - Memungkinkan petugas dan admin mengganti password akun mereka sendiri secara mandiri.
    - Evaluasi kekuatan password.
12. **Catatan Halaman Elegan (`PageNote`)**:
    - Setiap halaman dilengkapi panduan SOP terintegrasi yang ringkas dan fungsional, tanpa membebani antarmuka.

---

## 8. Keamanan & Role-Based Access Control (RBAC)

1. **Row Level Security (RLS) PostgreSQL**:
   - Seluruh tabel database dilindungi kebijakan RLS ketat.
   - Pengguna publik tanpa autentikasi diblokir total dari membaca data inventaris maupun transaksi.
   - Petugas hanya dapat mengelola transaksi; modifikasi tabel master (`alat`, `kartu_rfid`, `profiles`) dibatasi hanya untuk `role = 'admin'`.
2. **Kerahasiaan Service Role Key**:
   - `SUPABASE_SERVICE_ROLE_KEY` **hanya** berada di environment Edge Functions Supabase.
   - Frontend web hanya memegang `VITE_SUPABASE_ANON_KEY`.
3. **Keamanan URL & Sesi**:
   - Saat logout, sistem secara otomatis membersihkan hash navigasi dan meredirect ke state `/#login` yang bersih.
   - Proteksi route di frontend memvalidasi sesi dan profil secara reaktif.

---

## 9. Firmware & Hardware IoT

- **Platform**: ESP32 DevKit V1 (30/38 pin)
- **Komponen**:
  - Sensor RFID RC522 (koneksi SPI via GPIO 5, 18, 19, 23, 4) — *tegangan 3.3V*
  - Display LCD 1602 I2C (koneksi I2C via GPIO 21 & 22) — *tegangan 5V*
  - Buzzer Aktif 5V (GPIO 25)
- **Firmware Sketch**: `firmware/simlab_rfid/simlab_rfid.ino`
- **Konfigurasi**: Cukup mengisi SSID WiFi, Password WiFi, URL Edge Function Supabase, dan Anon Key.

---

## 10. Panduan Instalasi & Deployment (Prod & Local)

### 10.1 Menjalankan Frontend Lokal

```bash
# 1. Clone repository & install dependencies
npm install

# 2. Siapkan file .env (salin dari .env.example)
cp .env.example .env

# 3. Jalankan server pengembangan
npm run dev
```

> **Tips:** Jika `.env` dibiarkan kosong, aplikasi langsung aktif dalam **Mode Demo Offline** menggunakan LocalStorage bawaan.

### 10.2 Setup Supabase Backend (Production)

```bash
# 1. Install Supabase CLI & Login
npm install -g supabase
supabase login
supabase link --project-ref <PROJECT_REF_ANDA>

# 2. Jalankan Migrasi Database Schema
supabase db push

# 3. Deploy Seluruh Edge Functions
supabase functions deploy rfid-tap --no-verify-jwt
supabase functions deploy create-petugas
supabase functions deploy process-manual
supabase functions deploy manage-alat
supabase functions deploy manage-kartu
supabase functions deploy manage-transaksi
supabase functions deploy manage-pengguna
supabase functions deploy dashboard-stats

# 4. Set Secret URL Frontend (untuk redirect email aktivasi petugas)
supabase secrets set SITE_URL=https://peminjaman-alat-lab-iot.vercel.app
```

### 10.3 Konfigurasi Environment Variable Frontend (`.env`)

```env
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
VITE_SCHOOL_NAME="SMK NEGERI 9 KAB. TANGERANG"
```

---
*Dokumen ini merupakan spesifikasi arsitektur resmi sistem SIMLAB.*