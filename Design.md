# Design Plan: Dashboard Website Sistem Peminjaman Alat Lab (SIMLAB)

## 1. Konteks & Prinsip Desain

Ini adalah **tools operasional internal**, dipakai petugas lab berkali-kali sehari — bukan landing page atau produk konsumen. Prioritas desain:

| Prioritas | Alasan |
|---|---|
| Kecepatan baca informasi (scan-ability) | Petugas kerja cepat, sering sambil ada antrean siswa |
| Feedback status yang jelas | Petugas harus langsung tahu transaksi sukses/gagal tanpa mikir |
| Konsisten & predictable | Dipakai berulang tiap hari, jangan bikin bingung |
| Kontras warna untuk status | Warna membawa makna (tersedia/dipinjam/error), bukan dekorasi |

**Yang dihindari:** animasi berlebihan, ilustrasi custom, hero section besar, palet warna "ceria ala aplikasi anak sekolah" — karena target user-nya adalah petugas dewasa yang butuh efisiensi, bukan siswa.

---

## 2. Design Tokens

### Warna

| Token | Hex | Fungsi |
|---|---|---|
| Background halaman | `#F7F8FA` | Latar belakang utama, abu sangat terang |
| Surface / Card | `#FFFFFF` | Background card, table, sidebar |
| Teks utama | `#1A1D23` | Judul, isi konten penting |
| Teks sekunder | `#6B7280` | Label, keterangan, timestamp |
| Aksen utama | `#2563EB` (biru) | Link aktif, tombol primary, item sidebar terpilih |
| Sukses | `#16A34A` (hijau) | Status "tersedia", "dikembalikan" |
| Warning | `#D97706` (oranye/amber) | Status "dipinjam" |
| Error | `#DC2626` (merah) | Status "nonaktif", notifikasi gagal |
| Border/Divider | `#E5E7EB` | Garis pembatas antar elemen |

### Tipografi

- **Font**: Inter atau IBM Plex Sans (satu font family aja, jangan campur)
- **Heading**: weight 600, ukuran 18-22px
- **Body text**: weight 400, ukuran 14px
- **Label kecil / caption**: weight 400, ukuran 12-13px, warna teks sekunder
- Hindari lebih dari 2 ukuran font berbeda dalam 1 komponen (misal: 1 card cukup pakai 2 ukuran teks)

### Spacing & Layout

- Radius sudut: `8px` untuk tombol/input, `12px` untuk card
- Border: `1px solid`, warna dari token Border/Divider
- Jarak antar section: `24px` (1.5rem)
- Jarak antar elemen dalam card: `12-16px`
- Grid statistik: 4 kolom di desktop, auto-wrap ke 2 kolom di layar sempit

---

## 3. Struktur Layout

```
┌───────────┬──────────────────────────────────────┐
│           │  [Notifikasi real-time - full width]  │
│  SIDEBAR  ├──────────────────────────────────────┤
│  180-220px│  [Card statistik] [Card] [Card] [Card]│
│           ├──────────────────────────────────────┤
│  - Logo   │  Tabel/List Transaksi Terbaru          │
│  - Menu   │                                        │
│  - User   │                                        │
└───────────┴──────────────────────────────────────┘
```

### Sidebar (fixed, kiri)
- Lebar tetap 180-220px
- Isi dari atas ke bawah:
  1. Logo/nama sistem ("SIMLAB SMK") + icon kecil
  2. Menu navigasi (icon + label, item aktif diberi background halus + warna aksen)
  3. Info user (avatar inisial + nama) di bagian paling bawah, dipisah border

### Menu Sidebar per Role

| Menu | Icon (Tabler) | Admin | Petugas |
|---|---|---|---|
| Dashboard | `ti-layout-dashboard` | ✅ | ✅ |
| Inventaris Barang | `ti-box` | ✅ (CRUD penuh: tambah, edit, hapus, ubah kategori) | ❌ |
| List Barang | `ti-list-details` | ❌ (sudah tercakup di Inventaris Barang) | ✅ (lihat status semua alat + tombol "Tambah Barang" khusus untuk stiker RFID baru) |
| Kartu RFID | `ti-id-badge-2` | ✅ | ❌ |
| Persetujuan | `ti-clipboard-check` | ✅ (lihat & konfirmasi semua transaksi) | ✅ (lihat & konfirmasi transaksi masuk) |
| Peminjaman Barang | `ti-hand-stop` | ✅ | ✅ |
| Pengembalian Barang | `ti-corner-down-left` | ✅ | ✅ |
| Riwayat Peminjaman | `ti-history` | ✅ (semua histori, bisa filter per petugas) | ✅ (histori yang diproses sendiri) |
| Tambah Petugas | `ti-user-plus` | ✅ | ❌ |
| Keluar | `ti-logout` | ✅ | ✅ |

**Penjelasan menu "Persetujuan" (kembali diaktifkan):**
Walaupun sistem otomatis mendeteksi jenis transaksi (pinjam/kembali) dari kombinasi tap kartu + UID alat, menu ini tetap penting sebagai **halaman kerja utama petugas** — tempat semua transaksi yang masuk (status `menunggu_konfirmasi`) ditampilkan dalam satu antrian, supaya petugas selalu tahu ada berapa yang belum diproses dan bisa mengklik "Konfirmasi" satu per satu. Ini beda fungsi dari "Peminjaman Barang"/"Pengembalian Barang" yang lebih berfungsi sebagai tampilan/form khusus per jenis transaksi (termasuk untuk input manual kalau sewaktu-waktu RFID/scanner bermasalah).

- **Persetujuan** = antrian real-time semua transaksi yang menunggu konfirmasi (gabungan pinjam & kembali), auto-terisi dari `tap_log`.
- **Peminjaman Barang / Pengembalian Barang** = tampilan/form terpisah per jenis, juga bisa dipakai untuk input manual sebagai fallback.

**Catatan perbedaan hak akses "List Barang" (Petugas) vs "Inventaris Barang" (Admin):**
- Admin: bisa tambah, edit nama/kategori/stok, dan **hapus** alat dari sistem.
- Petugas: hanya bisa **menambahkan alat baru** (saat ada stiker RFID baru ditempel ke alat baru) dan melihat status semua alat — tidak bisa mengedit data alat yang sudah ada atau menghapusnya, untuk mencegah perubahan data yang tidak sengaja.

**Menu yang sengaja tidak diadakan:**
- *Denda* — dihilangkan sesuai kebutuhan proyek (tidak ada mekanisme denda di skema PKM ini).
- *Profil Pengguna* — dihilangkan; jika perlu ganti password/info akun, bisa ditaruh sebagai dropdown kecil di area info user (bagian bawah sidebar), bukan menu penuh.

### Area Konten Utama (kanan)
1. **Notifikasi real-time** (paling atas, full-width) — banner hijau kalau ada tap kartu baru menunggu diproses
2. **Kartu statistik** (grid 4 kolom) — total alat, sedang dipinjam, tersedia, transaksi hari ini
3. **Tabel/list transaksi terbaru** — nama kelas, nama alat, waktu, badge status berwarna

---

## 4. Spesifikasi Komponen

### 4.1 Notifikasi Real-Time (Banner)
- Warna latar: hijau muda (`bg-success` token) saat ada tap baru
- Icon kartu di kiri, teks di tengah (nama kelas + status), tombol "Proses" di kanan
- Muncul dengan sedikit animasi slide-in (bukan fade berulang tiap section)
- Kalau tidak ada notifikasi aktif: tampilkan empty state singkat, misal *"Belum ada aktivitas — sistem siap menerima tap kartu"*

### 4.2 Kartu Statistik
- Background abu muda (`surface-1`), tanpa border tebal, tanpa shadow berat
- Label kecil di atas (13px, teks sekunder), angka besar di bawah (22-24px, weight 500)
- Grid responsive: `repeat(auto-fit, minmax(120px, 1fr))`

### 4.3 Badge Status
- Bentuk pill kecil, padding `3px 10px`, radius `8px`
- **Tersedia**: hijau muda bg + teks hijau tua
- **Dipinjam**: oranye muda bg + teks oranye tua
- **Nonaktif/Error**: merah muda bg + teks merah tua
- Teks pada badge selalu pakai warna gelap dari ramp yang sama (bukan hitam polos), supaya kontras tetap terjaga

### 4.4 Tabel/List Transaksi
- Row-based list dengan border tipis antar baris (bukan rounded card per baris)
- Setiap baris: nama kelas + nama alat (baris pertama), waktu (baris kedua, lebih kecil & abu-abu), badge status di kanan
- Hover state halus (`background: surface-1`) untuk menunjukkan baris bisa diklik

### 4.5 Form Konfirmasi Transaksi
- Muncul sebagai modal atau panel samping (bukan full-page redirect)
- Isi: nama kelas (readonly, dari kartu yang ditap), dropdown pilih alat (kalau skema manual) atau alat otomatis terisi (kalau skema barcode/RFID alat), tombol "Konfirmasi Peminjaman" (primary, biru) dan "Batal" (secondary, outline)

### 4.6 Tombol
- **Primary**: background biru aksen, teks putih — dipakai untuk 1 aksi utama per halaman (misal "Konfirmasi")
- **Secondary**: outline/border saja, teks warna gelap — untuk aksi sekunder (misal "Batal", "Export")
- **Danger**: outline merah atau solid merah — untuk aksi seperti "Nonaktifkan Kartu"

---

## 5. Halaman yang Perlu Didesain

| Halaman | Komponen Utama | Akses |
|---|---|---|
| **Login** | Form sederhana (email, password), tanpa sidebar, logo di atas form | Semua |
| **Dashboard** | Sidebar + notifikasi real-time + kartu statistik + tabel transaksi terbaru | Admin & Petugas |
| **Inventaris Barang** | Sidebar + tabel 50 alat (nama, kode, kategori, status) + tombol tambah/edit/hapus | Admin only |
| **List Barang** | Sidebar + tabel status alat (read-only untuk data lama) + tombol "Tambah Barang" (khusus alat baru dengan stiker baru) | Petugas |
| **Kartu RFID** | Sidebar + tabel kartu (UID, kelas, status aktif/nonaktif) + tombol tambah/nonaktifkan | Admin only |
| **Persetujuan** | Sidebar + daftar antrian transaksi menunggu konfirmasi (real-time) + tombol "Konfirmasi"/"Tolak" per item | Admin & Petugas |
| **Peminjaman Barang** | Sidebar + form/list proses konfirmasi peminjaman (otomatis terisi dari tap kartu+alat) | Admin & Petugas |
| **Pengembalian Barang** | Sidebar + form/list proses konfirmasi pengembalian | Admin & Petugas |
| **Riwayat Peminjaman** | Sidebar + tabel histori dengan filter (tanggal, kelas, status) | Admin (semua data) & Petugas (data sendiri) |
| **Tambah Petugas** | Sidebar + tabel akun petugas + tombol tambah akun | Admin only |

---

## 6. Bahasa & Microcopy

- Gunakan bahasa Indonesia yang jelas dan langsung, kalimat aktif
- Tombol: kata kerja jelas — "Konfirmasi Peminjaman" bukan "OK" atau "Submit"
- Pesan error: jelaskan apa yang terjadi + apa yang harus dilakukan, contoh: *"Kartu tidak dikenali. Pastikan kartu sudah terdaftar di menu Kartu RFID."*
- Empty state: ajakan bertindak, bukan sekadar "kosong" — contoh: *"Belum ada alat terdaftar. Tambahkan alat pertama."*
- Konsisten menyebut hal yang sama dengan istilah yang sama di semua halaman (misal selalu "Alat", jangan kadang "Barang" kadang "Alat")

---

## 7. Referensi Visual

Mockup awal dashboard (sidebar + notifikasi + statistik + tabel transaksi) sudah dibuat sebagai preview — gunakan sebagai acuan proporsi & tata letak saat implementasi di React.

---

## 8. Catatan untuk AI Agent

- Implementasikan dengan **React + Vite**, styling bebas pakai Tailwind CSS atau CSS Modules (pilih salah satu, konsisten di seluruh project)
- Semua warna sebaiknya didefinisikan sebagai CSS variable/design token (bukan hardcode hex di tiap komponen), supaya gampang diubah kalau ada revisi
- Prioritaskan komponen yang reusable: `Badge`, `Card`, `SidebarItem`, `Button` — buat sebagai komponen terpisah, jangan duplikasi style di tiap halaman
- Pastikan responsive minimal sampai ukuran tablet (sidebar bisa collapse jadi icon-only di layar sempit, opsional kalau waktu memungkinkan)
