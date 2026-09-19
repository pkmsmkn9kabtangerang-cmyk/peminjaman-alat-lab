/* eslint-env node */
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// In-memory fallback database if Firebase Admin credentials are not attached
const memoryDb = {
  kartu_rfid: {
    "KARTU-XI-RPL-1": { kelas: "XI RPL 1", nama_pemegang: "Budi (Ketua Kelas)", status: "aktif" },
    "KARTU-XI-RPL-2": { kelas: "XI RPL 2", nama_pemegang: "Siti (Perwakilan)", status: "aktif" },
    "KARTU-XI-TKJ-1": { kelas: "XI TKJ 1", nama_pemegang: "Andi", status: "aktif" },
    "KARTU-XI-TKJ-2": { kelas: "XI TKJ 2", nama_pemegang: "Dewi", status: "nonaktif" }
  },
  alat: [
    { id_alat: "ALT-001", nama: "Multimeter Digital Fluke", kode: "MM-001", uid_rfid: "STK-ALT-001", kategori: "elektronik", status: "tersedia", stok_total: 5, stok_tersedia: 5 },
    { id_alat: "ALT-002", nama: "Oscilloscope Rigol DS1054Z", kode: "OSC-002", uid_rfid: "STK-ALT-002", kategori: "elektronik", status: "dipinjam", stok_total: 2, stok_tersedia: 1 },
    { id_alat: "ALT-003", nama: "Solder Station Dekko", kode: "SLD-003", uid_rfid: "STK-ALT-003", kategori: "elektronik", status: "tersedia", stok_total: 10, stok_tersedia: 10 },
    { id_alat: "ALT-004", nama: "Tang Kombinasi Tekiro", kode: "TNG-004", uid_rfid: "STK-ALT-004", kategori: "mekanik", status: "tersedia", stok_total: 8, stok_tersedia: 8 },
    { id_alat: "ALT-005", nama: "Crimping Tool RJ45", kode: "CRM-005", uid_rfid: "STK-ALT-005", kategori: "jaringan", status: "maintenance", stok_total: 3, stok_tersedia: 0 }
  ],
  tap_log: [],
  transaksi: []
};

// ESP32 RFID Tap Endpoint
app.post('/api/tap', (req, res) => {
  const { uid_kartu, uid_alat } = req.body;

  if (!uid_kartu || !uid_alat) {
    return res.status(400).json({ success: false, error: "payload_tidak_lengkap" });
  }

  // 1. Validasi kartu
  const kartu = memoryDb.kartu_rfid[uid_kartu];
  if (!kartu || kartu.status !== "aktif") {
    return res.status(400).json({ success: false, error: "kartu_tidak_valid" });
  }

  // 2. Validasi alat
  const alat = memoryDb.alat.find(a => a.uid_rfid === uid_alat);
  if (!alat) {
    return res.status(400).json({ success: false, error: "alat_tidak_terdaftar" });
  }

  if (alat.status === "maintenance") {
    return res.status(400).json({ success: false, error: "alat_maintenance" });
  }

  // 3. Deteksi jenis transaksi
  const jenis_terdeteksi = (alat.status === "dipinjam") ? "kembali" : "pinjam";

  // 4. Catat ke tap_log
  const logId = "LOG-" + Date.now();
  const logItem = {
    id_log: logId,
    uid_kartu,
    uid_alat,
    kelas: kartu.kelas,
    id_alat: alat.id_alat,
    nama_alat: alat.nama,
    jenis_terdeteksi,
    waktu_tap: new Date().toISOString(),
    status: "pending"
  };

  memoryDb.tap_log.unshift(logItem);

  return res.json({
    success: true,
    id_log: logId,
    kelas: kartu.kelas,
    nama_alat: alat.nama,
    jenis_terdeteksi
  });
});

// GET endpoints for API access
app.get('/api/tap_log', (req, res) => {
  res.json({ success: true, data: memoryDb.tap_log });
});

app.get('/api/alat', (req, res) => {
  res.json({ success: true, data: memoryDb.alat });
});

app.get('/api/kartu', (req, res) => {
  res.json({ success: true, data: memoryDb.kartu_rfid });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Backend SIMLAB IoT API server running on port ${PORT}`);
});
