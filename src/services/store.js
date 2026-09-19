// Initial Seed Data matching PLAN.md & Design.md
const INITIAL_USERS = [
  { uid: "usr-admin-1", nama: "Administrator Lab", email: "admin@smk.sch.id", role: "admin", createdAt: new Date().toISOString() },
  { uid: "usr-petugas-1", nama: "Budi Petugas", email: "petugas@smk.sch.id", role: "petugas", createdAt: new Date().toISOString() }
];

const INITIAL_KARTU = [
  { uid_kartu: "KARTU-XI-RPL-1", kelas: "XI RPL 1", nama_pemegang: "Ahmad Zaki (Ketua)", status: "aktif", createdAt: new Date().toISOString() },
  { uid_kartu: "KARTU-XI-RPL-2", kelas: "XI RPL 2", nama_pemegang: "Siti Rahma (Perwakilan)", status: "aktif", createdAt: new Date().toISOString() },
  { uid_kartu: "KARTU-XI-TKJ-1", kelas: "XI TKJ 1", nama_pemegang: "Rian Pratama", status: "aktif", createdAt: new Date().toISOString() },
  { uid_kartu: "KARTU-XI-TKJ-2", kelas: "XI TKJ 2", nama_pemegang: "Dewi Lestari", status: "nonaktif", createdAt: new Date().toISOString() }
];

const INITIAL_ALAT = [
  { id_alat: "ALT-001", nama: "Multimeter Digital Fluke", kode: "MM-001", uid_rfid: "STK-ALT-001", kategori: "elektronik", status: "tersedia", stok_total: 5, stok_tersedia: 5, createdAt: new Date().toISOString() },
  { id_alat: "ALT-002", nama: "Oscilloscope Rigol DS1054Z", kode: "OSC-002", uid_rfid: "STK-ALT-002", kategori: "elektronik", status: "dipinjam", stok_total: 2, stok_tersedia: 1, createdAt: new Date().toISOString() },
  { id_alat: "ALT-003", nama: "Solder Station Dekko", kode: "SLD-003", uid_rfid: "STK-ALT-003", kategori: "elektronik", status: "tersedia", stok_total: 10, stok_tersedia: 10, createdAt: new Date().toISOString() },
  { id_alat: "ALT-004", nama: "Tang Kombinasi Tekiro", kode: "TNG-004", uid_rfid: "STK-ALT-004", kategori: "mekanik", status: "tersedia", stok_total: 8, stok_tersedia: 8, createdAt: new Date().toISOString() },
  { id_alat: "ALT-005", nama: "Crimping Tool RJ45", kode: "CRM-005", uid_rfid: "STK-ALT-005", kategori: "jaringan", status: "maintenance", stok_total: 3, stok_tersedia: 0, createdAt: new Date().toISOString() }
];

const INITIAL_TAP_LOG = [
  { id_log: "LOG-101", uid_kartu: "KARTU-XI-RPL-1", uid_alat: "STK-ALT-002", kelas: "XI RPL 1", id_alat: "ALT-002", nama_alat: "Oscilloscope Rigol DS1054Z", jenis_terdeteksi: "kembali", waktu_tap: new Date(Date.now() - 120000).toISOString(), status: "pending" }
];

const INITIAL_TRANSAKSI = [
  { id_transaksi: "TRX-001", uid_kartu: "KARTU-XI-RPL-1", uid_alat: "STK-ALT-002", kelas: "XI RPL 1", id_alat: "ALT-002", nama_alat: "Oscilloscope Rigol DS1054Z", jenis: "pinjam", status: "dikonfirmasi", petugas_konfirmasi: "Budi Petugas", waktu_tap: new Date(Date.now() - 3600000).toISOString(), waktu_konfirmasi: new Date(Date.now() - 3500000).toISOString(), waktu_kembali: null, catatan: "Kondisi baik" }
];

// Helper to get/set localStorage
function getStore(key, initial) {
  const data = localStorage.getItem(`simlab_${key}`);
  if (!data) {
    localStorage.setItem(`simlab_${key}`, JSON.stringify(initial));
    return initial;
  }
  try {
    return JSON.parse(data);
  } catch {
    return initial;
  }
}

function setStore(key, data) {
  localStorage.setItem(`simlab_${key}`, JSON.stringify(data));
  window.dispatchEvent(new Event('simlab_storage_updated'));
}

export const dbService = {
  getUsers: () => getStore('users', INITIAL_USERS),
  saveUsers: (users) => setStore('users', users),

  getKartu: () => getStore('kartu', INITIAL_KARTU),
  saveKartu: (kartu) => setStore('kartu', kartu),

  getAlat: () => getStore('alat', INITIAL_ALAT),
  saveAlat: (alat) => setStore('alat', alat),

  getTapLog: () => getStore('tap_log', INITIAL_TAP_LOG),
  saveTapLog: (logs) => setStore('tap_log', logs),

  getTransaksi: () => getStore('transaksi', INITIAL_TRANSAKSI),
  saveTransaksi: (trx) => setStore('transaksi', trx),

  getCurrentUser: () => {
    const user = localStorage.getItem('simlab_current_user');
    if (!user) {
      // Default to admin for convenient testing
      const defaultAdmin = { uid: "usr-admin-1", nama: "Administrator Lab", email: "admin@smk.sch.id", role: "admin" };
      localStorage.setItem('simlab_current_user', JSON.stringify(defaultAdmin));
      return defaultAdmin;
    }
    try {
      return JSON.parse(user);
    } catch {
      return null;
    }
  },

  setCurrentUser: (user) => {
    localStorage.setItem('simlab_current_user', JSON.stringify(user));
    window.dispatchEvent(new Event('simlab_storage_updated'));
  },

  logout: () => {
    localStorage.removeItem('simlab_current_user');
    window.dispatchEvent(new Event('simlab_storage_updated'));
  },

  // IoT Simulation Tap function (mimicking ESP32 sending RFID tap)
  simulateEsp32Tap: (uid_kartu, uid_alat) => {
    const kartuList = dbService.getKartu();
    const alatList = dbService.getAlat();

    const kartu = kartuList.find(k => k.uid_kartu === uid_kartu);
    if (!kartu || kartu.status !== "aktif") {
      return { success: false, error: "kartu_tidak_valid", message: "Kartu tidak terdaftar atau nonaktif." };
    }

    const alat = alatList.find(a => a.uid_rfid === uid_alat);
    if (!alat) {
      return { success: false, error: "alat_tidak_terdaftar", message: "Sticker RFID alat tidak terdaftar." };
    }

    if (alat.status === "maintenance") {
      return { success: false, error: "alat_maintenance", message: "Alat sedang dalam perbaikan/maintenance." };
    }

    const jenis_terdeteksi = (alat.status === "dipinjam") ? "kembali" : "pinjam";

    const newLog = {
      id_log: "LOG-" + Date.now(),
      uid_kartu,
      uid_alat,
      kelas: kartu.kelas,
      id_alat: alat.id_alat,
      nama_alat: alat.nama,
      jenis_terdeteksi,
      waktu_tap: new Date().toISOString(),
      status: "pending"
    };

    const logs = dbService.getTapLog();
    logs.unshift(newLog);
    dbService.saveTapLog(logs);

    return { success: true, data: newLog };
  },

  // Confirm transaction from Tap Log
  konfirmasiTransaksi: (logId, petugasNama, koreksiJenis = null) => {
    const logs = dbService.getTapLog();
    const logIndex = logs.findIndex(l => l.id_log === logId);
    if (logIndex === -1) return { success: false, message: "Log tap tidak ditemukan." };

    const logItem = logs[logIndex];
    const jenisTransaksi = koreksiJenis || logItem.jenis_terdeteksi;

    const alatList = dbService.getAlat();
    const alatIndex = alatList.findIndex(a => a.id_alat === logItem.id_alat);
    if (alatIndex === -1) return { success: false, message: "Alat tidak ditemukan." };

    const alat = alatList[alatIndex];

    // Update alat status and stock
    if (jenisTransaksi === "pinjam") {
      alat.status = "dipinjam";
      alat.stok_tersedia = Math.max(0, alat.stok_tersedia - 1);
    } else {
      alat.status = "tersedia";
      alat.stok_tersedia = Math.min(alat.stok_total, alat.stok_tersedia + 1);
    }
    dbService.saveAlat(alatList);

    // Create Transaction record
    const newTrx = {
      id_transaksi: "TRX-" + Date.now(),
      uid_kartu: logItem.uid_kartu,
      uid_alat: logItem.uid_alat,
      kelas: logItem.kelas,
      id_alat: logItem.id_alat,
      nama_alat: logItem.nama_alat,
      jenis: jenisTransaksi,
      status: jenisTransaksi === "pinjam" ? "dikonfirmasi" : "selesai",
      petugas_konfirmasi: petugasNama || "Petugas Lab",
      waktu_tap: logItem.waktu_tap,
      waktu_konfirmasi: new Date().toISOString(),
      waktu_kembali: jenisTransaksi === "kembali" ? new Date().toISOString() : null,
      catatan: jenisTransaksi === "pinjam" ? "Dipinjam via RFID" : "Dikembalikan via RFID"
    };

    const transaksiList = dbService.getTransaksi();
    transaksiList.unshift(newTrx);
    dbService.saveTransaksi(transaksiList);

    // Update tap log status to processed
    logs[logIndex].status = "processed";
    dbService.saveTapLog(logs);

    return { success: true, transaksi: newTrx };
  }
};
