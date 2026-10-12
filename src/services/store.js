/**
 * src/services/store.js
 * Local simulation store — HANYA dipakai saat Supabase belum dikonfigurasi
 * (misal: mode demo/pengembangan tanpa koneksi Supabase).
 *
 * Di production, semua data berasal dari Supabase:
 *   - Tabel: alat, kartu_rfid, transaksi, tap_log, profiles
 *   - Auth: supabase.auth
 *   - Realtime: supabase.channel('tap-log-realtime')
 */

// ── Seed Data sesuai schema PLAN.md ───────────────────────────
const INITIAL_USERS = [
  {
    uid: 'usr-admin-1',
    nama: 'Administrator Lab',
    email: 'admin@smk.sch.id',
    role: 'admin',
    aktif: true,
    created_at: new Date().toISOString(),
  },
  {
    uid: 'usr-petugas-1',
    nama: 'Budi Santoso',
    email: 'petugas@smk.sch.id',
    role: 'petugas',
    aktif: true,
    created_at: new Date().toISOString(),
  },
];

const INITIAL_KARTU = [
  { uid_kartu: 'KARTU-XI-RPL-1', kelas: 'XI RPL 1', nama_pemegang: 'Ahmad Zaki (Ketua)', aktif: true },
  { uid_kartu: 'KARTU-XI-RPL-2', kelas: 'XI RPL 2', nama_pemegang: 'Siti Rahma', aktif: true },
  { uid_kartu: 'KARTU-XI-TKJ-1', kelas: 'XI TKJ 1', nama_pemegang: 'Rian Pratama', aktif: true },
  { uid_kartu: 'KARTU-XI-TKJ-2', kelas: 'XI TKJ 2', nama_pemegang: 'Dewi Lestari', aktif: false },
];

const INITIAL_ALAT = [
  {
    id: 'ALT-001', kode: 'MM-001', nama: 'Multimeter Digital Fluke',
    kategori: 'elektronik', uid_rfid: 'STK-ALT-001',
    jumlah_total: 5, jumlah_rusak: 0, stok_tersedia: 5,
    created_at: new Date().toISOString(),
  },
  {
    id: 'ALT-002', kode: 'OSC-002', nama: 'Oscilloscope Rigol DS1054Z',
    kategori: 'elektronik', uid_rfid: 'STK-ALT-002',
    jumlah_total: 2, jumlah_rusak: 0, stok_tersedia: 2,
    created_at: new Date().toISOString(),
  },
  {
    id: 'ALT-003', kode: 'SLD-003', nama: 'Solder Station Dekko',
    kategori: 'elektronik', uid_rfid: 'STK-ALT-003',
    jumlah_total: 10, jumlah_rusak: 1, stok_tersedia: 9,
    created_at: new Date().toISOString(),
  },
  {
    id: 'ALT-004', kode: 'TNG-004', nama: 'Tang Kombinasi Tekiro',
    kategori: 'mekanik', uid_rfid: 'STK-ALT-004',
    jumlah_total: 8, jumlah_rusak: 0, stok_tersedia: 8,
    created_at: new Date().toISOString(),
  },
  {
    id: 'ALT-005', kode: 'CRM-005', nama: 'Crimping Tool RJ45',
    kategori: 'jaringan', uid_rfid: 'STK-ALT-005',
    jumlah_total: 3, jumlah_rusak: 3, stok_tersedia: 0,
    tipe: 'alat', satuan: 'unit',
    created_at: new Date().toISOString(),
  },
  {
    id: 'ALT-006', kode: 'KBL-006', nama: 'Kabel UTP Cat6',
    kategori: 'jaringan', uid_rfid: 'STK-ALT-006',
    jumlah_total: 100, jumlah_rusak: 0, stok_tersedia: 100,
    tipe: 'habis_pakai', satuan: 'meter',
    created_at: new Date().toISOString(),
  },
  {
    id: 'ALT-007', kode: 'TIM-007', nama: 'Timah Solder (Tin Lead)',
    kategori: 'elektronik', uid_rfid: 'STK-ALT-007',
    jumlah_total: 500, jumlah_rusak: 0, stok_tersedia: 500,
    tipe: 'habis_pakai', satuan: 'cm',
    created_at: new Date().toISOString(),
  },
  {
    id: 'ALT-008', kode: 'RJ-008', nama: 'Konektor RJ45',
    kategori: 'jaringan', uid_rfid: 'STK-ALT-008',
    jumlah_total: 50, jumlah_rusak: 0, stok_tersedia: 50,
    tipe: 'habis_pakai', satuan: 'pcs',
    created_at: new Date().toISOString(),
  },
];

const INITIAL_TRANSAKSI = [];
const INITIAL_TAP_LOG   = [];

// ── Local Storage helpers ──────────────────────────────────────
function getStore(key, initial) {
  const raw = localStorage.getItem(`simlab_${key}`);
  if (!raw) {
    localStorage.setItem(`simlab_${key}`, JSON.stringify(initial));
    return initial;
  }
  try { return JSON.parse(raw); } catch { return initial; }
}

function setStore(key, data) {
  localStorage.setItem(`simlab_${key}`, JSON.stringify(data));
  window.dispatchEvent(new Event('simlab_storage_updated'));
}

// ── Sesi kartu 20 detik (in-memory, reset saat refresh) ───────
export const SESSION_DURATION_SECONDS = 20;
export const SESSION_DURATION_MS = SESSION_DURATION_SECONDS * 1000;

const kartuSessions = {}; // { uid_kartu: { expires: Date, jenis: 'pinjam'|'kembali', uid_kartu, kelas: string } }

function getSession(uid_kartu) {
  const s = kartuSessions[uid_kartu];
  if (!s) return null;
  if (new Date() > new Date(s.expires)) {
    delete kartuSessions[uid_kartu];
    return null;
  }
  return s;
}

function setSession(uid_kartu, jenis, kelas = '') {
  const expires = new Date(Date.now() + SESSION_DURATION_MS);
  kartuSessions[uid_kartu] = { uid_kartu, jenis, kelas, expires };
  window.dispatchEvent(new Event('simlab_storage_updated'));
  return kartuSessions[uid_kartu];
}

function extendSession(uid_kartu) {
  const s = kartuSessions[uid_kartu];
  if (s) {
    s.expires = new Date(Date.now() + SESSION_DURATION_MS);
    window.dispatchEvent(new Event('simlab_storage_updated'));
  }
}

function clearSession(uid_kartu) {
  if (uid_kartu) {
    delete kartuSessions[uid_kartu];
  } else {
    for (const k in kartuSessions) delete kartuSessions[k];
  }
  window.dispatchEvent(new Event('simlab_storage_updated'));
}

// ── dbService ─────────────────────────────────────────────────
export const dbService = {
  // --- Users / Profiles ---
  getUsers:  () => getStore('users', INITIAL_USERS),
  saveUsers: (u) => setStore('users', u),

  getCurrentUser: () => {
    const raw = localStorage.getItem('simlab_current_user');
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  },
  setCurrentUser: (user) => {
    localStorage.setItem('simlab_current_user', JSON.stringify(user));
    window.dispatchEvent(new Event('simlab_storage_updated'));
  },
  logout: () => {
    localStorage.removeItem('simlab_current_user');
    window.dispatchEvent(new Event('simlab_storage_updated'));
  },

  // --- Kartu RFID ---
  getKartu:  () => getStore('kartu', INITIAL_KARTU),
  saveKartu: (k) => setStore('kartu', k),
  getActiveLoansByCard: (uid) => {
    const transaksi = dbService.getTransaksi();
    return transaksi.filter((t) => t.uid_kartu === uid && t.status === 'dipinjam');
  },
  deleteKartu: (uid) => {
    const active = dbService.getActiveLoansByCard(uid);
    if (active.length > 0) {
      return {
        ok: false,
        error: 'kartu_sedang_meminjam',
        message: `Kartu tidak dapat dihapus karena masih memiliki ${active.length} pinjaman aktif.`,
        count: active.length,
      };
    }
    const list = dbService.getKartu().filter((k) => k.uid_kartu !== uid);
    setStore('kartu', list);
    return { ok: true };
  },

  // --- Alat ---
  getAlat: () => {
    const list = getStore('alat', INITIAL_ALAT);
    const hasConsumable = list.some((a) => a.tipe === 'habis_pakai');
    if (!hasConsumable) {
      const merged = [...list, ...INITIAL_ALAT.filter((a) => a.tipe === 'habis_pakai')];
      setStore('alat', merged);
      return merged;
    }
    return list;
  },
  saveAlat: (a) => setStore('alat', a),

  // Hitung stok_tersedia dari jumlah_total & jumlah_dipinjam aktif
  getAlatWithStok: () => {
    const alat      = dbService.getAlat();
    const transaksi = getStore('transaksi', INITIAL_TRANSAKSI);
    return alat.map((a) => {
      const dipinjam = transaksi.filter(
        (t) => t.alat_id === a.id && t.status === 'dipinjam'
      ).length;
      const stok_tersedia = Math.max(0, a.jumlah_total - (a.jumlah_rusak || 0) - dipinjam);
      return { ...a, stok_tersedia, dipinjam_aktif: dipinjam };
    });
  },

  getListBarang: () => {
    return dbService.getAlatWithStok().map((a) => {
      let status = 'tersedia';
      if (a.stok_tersedia === 0) status = 'habis';
      else if (a.dipinjam_aktif > 0) status = 'dipinjam';
      return {
        ...a,
        status,
      };
    });
  },

  updateKondisiAlat: (id, jumlah_rusak) => {
    const list = dbService.getAlat();
    const idx  = list.findIndex((a) => a.id === id);
    if (idx === -1) return;
    list[idx].jumlah_rusak = jumlah_rusak;
    list[idx].stok_tersedia = Math.max(0, list[idx].jumlah_total - jumlah_rusak);
    setStore('alat', list);
  },

  // --- Tap Log ---
  getTapLog:  () => getStore('tap_log', INITIAL_TAP_LOG),
  saveTapLog: (l) => setStore('tap_log', l),
  getUnreadCount: () => getStore('tap_log', INITIAL_TAP_LOG).filter((l) => !l.is_read).length,
  markTapsRead: () => {
    const logs = dbService.getTapLog().map((l) => ({ ...l, is_read: true }));
    setStore('tap_log', logs);
  },

  // --- Transaksi ---
  getTransaksi:  () => getStore('transaksi', INITIAL_TRANSAKSI),
  saveTransaksi: (t) => setStore('transaksi', t),

  // --- Permintaan Habis Pakai ---
  getPermintaan: () => getStore('permintaan', []),
  savePermintaan: (p) => setStore('permintaan', p),

  setujuiPermintaan: ({ id, jumlah, catatan, petugas }) => {
    const all = dbService.getPermintaan();
    const pIdx = all.findIndex((x) => x.id === id);
    if (pIdx === -1) return { ok: false, error: 'permintaan_tidak_ditemukan' };

    const req = all[pIdx];
    const qty = parseInt(jumlah, 10);
    if (isNaN(qty) || qty <= 0) return { ok: false, error: 'jumlah_tidak_valid' };

    const alatList = dbService.getAlat();
    const aIdx = alatList.findIndex((x) => x.id === req.alat_id);
    if (aIdx === -1) return { ok: false, error: 'alat_tidak_ditemukan' };

    if (alatList[aIdx].stok_tersedia < qty && alatList[aIdx].jumlah_total < qty) {
      return { ok: false, error: 'stok_habis' };
    }

    alatList[aIdx].jumlah_total = Math.max(0, alatList[aIdx].jumlah_total - qty);
    alatList[aIdx].stok_tersedia = alatList[aIdx].jumlah_total;
    dbService.saveAlat(alatList);

    const now = new Date().toISOString();
    all[pIdx] = {
      ...req,
      status: 'disetujui',
      jumlah: qty,
      catatan: catatan || req.catatan || '',
      petugas: petugas || 'Petugas',
      waktu_proses: now,
    };
    dbService.savePermintaan(all);
    return { ok: true, data: all[pIdx] };
  },

  tolakPermintaan: ({ id, alasan, petugas }) => {
    const all = dbService.getPermintaan();
    const pIdx = all.findIndex((x) => x.id === id);
    if (pIdx === -1) return { ok: false, error: 'permintaan_tidak_ditemukan' };

    all[pIdx] = {
      ...all[pIdx],
      status: 'ditolak',
      alasan_tolak: alasan || 'Ditolak petugas',
      petugas: petugas || 'Petugas',
      waktu_proses: new Date().toISOString(),
    };
    dbService.savePermintaan(all);
    return { ok: true, data: all[pIdx] };
  },

  batalkanPermintaan: ({ id, catatan, petugas }) => {
    const all = dbService.getPermintaan();
    const pIdx = all.findIndex((x) => x.id === id);
    if (pIdx === -1) return { ok: false, error: 'permintaan_tidak_ditemukan' };

    const req = all[pIdx];
    if (req.status === 'disetujui') {
      const qty = req.jumlah || 1;
      const alatList = dbService.getAlat();
      const aIdx = alatList.findIndex((x) => x.id === req.alat_id);
      if (aIdx > -1) {
        alatList[aIdx].jumlah_total += qty;
        alatList[aIdx].stok_tersedia = alatList[aIdx].jumlah_total;
        dbService.saveAlat(alatList);
      }
    }

    all[pIdx] = {
      ...req,
      status: 'dibatalkan',
      catatan: catatan ? `${req.catatan ? req.catatan + ' | ' : ''}Batal: ${catatan}` : req.catatan,
      petugas: petugas || 'Petugas',
      waktu_proses: new Date().toISOString(),
    };
    dbService.savePermintaan(all);
    return { ok: true, data: all[pIdx] };
  },

  // --- Kartu Session ---
  getSession,
  setSession,
  extendSession,
  clearSession,
  getActiveSessions: () => {
    const now = new Date();
    for (const uid in kartuSessions) {
      if (new Date(kartuSessions[uid].expires) <= now) {
        delete kartuSessions[uid];
      }
    }
    return Object.values(kartuSessions).filter((s) => new Date(s.expires) > now);
  },

  // ── processTap: meniru logika edge function process_tap ──────
  /**
   * Meniru proses tap RFID dari ESP32.
   * Tap tunggal UID → deteksi otomatis kartu atau alat.
   *
   * Respons mengikuti kontrak PLAN.md §4:
   *   { ok:true,  type:'kartu', jenis, kelas }
   *   { ok:true,  type:'alat',  jenis, alat  }
   *   { ok:false, error:'kartu_nonaktif' | 'uid_tidak_dikenal' | 'sesi_tidak_ada' | 'stok_habis' }
   */
  processTap: (uid, deviceId = 'web-sim') => {
    const kartuList = dbService.getKartu();
    const kartu = kartuList.find((k) => k.uid_kartu === uid);

    if (kartu) {
      // --- UID adalah kartu ---
      if (!kartu.aktif) {
        dbService._addTapLog(uid, null, 'kartu', 'otomatis', 'ditolak', 'kartu_nonaktif', kartu.kelas, null);
        return { ok: false, error: 'kartu_nonaktif', type: 'kartu' };
      }

      // Periksa apakah ada sesi kartu aktif saat ini
      const activeSessions = dbService.getActiveSessions();
      const currentActiveSession = activeSessions.length > 0 ? activeSessions[0] : null;

      if (currentActiveSession) {
        // Jika sesi aktif adalah milik kartu yang sama -> Pengguna men-tap kartu lagi untuk mengakhiri sesi
        if (currentActiveSession.uid_kartu === uid) {
          clearSession(uid);
          dbService._addTapLog(uid, null, 'kartu', 'otomatis', 'berhasil', null, kartu.kelas, null);
          return {
            ok: true,
            type: 'kartu',
            action: 'selesai',
            jenis: 'selesai',
            kelas: kartu.kelas,
            message: `Sesi ${kartu.kelas} selesai diakhiri.`,
          };
        } else {
          // Kartu lain (User 2) men-tap saat sesi User 1 masih aktif -> Tolak!
          const activeKelas = currentActiveSession.kelas || currentActiveSession.uid_kartu;
          dbService._addTapLog(uid, null, 'kartu', 'otomatis', 'ditolak', 'sesi_kartu_lain_aktif', kartu.kelas, null);
          return {
            ok: false,
            error: 'sesi_kartu_lain_aktif',
            type: 'kartu',
            activeCard: currentActiveSession,
            message: `Sesi ${activeKelas} sedang aktif! Harap tunggu hingga sesi selesai atau diakhiri.`,
          };
        }
      }

      // Belum ada sesi aktif -> mulai sesi baru (20 detik)
      const transaksi = dbService.getTransaksi();
      const hasAktif  = transaksi.some((t) => t.uid_kartu === uid && t.status === 'dipinjam');
      const jenis     = hasAktif ? 'kembali' : 'pinjam';
      setSession(uid, jenis, kartu.kelas);
      dbService._addTapLog(uid, null, 'kartu', 'otomatis', 'berhasil', null, kartu.kelas, null);
      return { ok: true, type: 'kartu', action: 'mulai', jenis, kelas: kartu.kelas };
    }

    // --- UID adalah alat ---
    const alatList  = dbService.getAlatWithStok();
    const alat      = alatList.find((a) => a.uid_rfid === uid);

    if (!alat) {
      dbService._addTapLog(null, uid, 'alat', 'otomatis', 'ditolak', 'uid_tidak_dikenal', null, null);
      return { ok: false, error: 'uid_tidak_dikenal', type: 'alat' };
    }

    // Cari sesi kartu aktif (cek semua sesi — simulasi 1 device)
    const activeSessions = dbService.getActiveSessions();
    if (activeSessions.length === 0) {
      dbService._addTapLog(null, uid, 'alat', 'otomatis', 'ditolak', 'sesi_tidak_ada', null, alat.nama);
      return { ok: false, error: 'sesi_tidak_ada', type: 'alat' };
    }

    const sess = activeSessions[0];
    const kartuData = kartuList.find((k) => k.uid_kartu === sess.uid_kartu);

    // Kartu ini sudah pinjam alat ini? → KEMBALI
    const transaksi = dbService.getTransaksi();
    const activeTrx = transaksi.find(
      (t) => t.uid_kartu === sess.uid_kartu && t.alat_id === alat.id && t.status === 'dipinjam'
    );

    let jenis;
    if (alat.tipe === "habis_pakai") {
      if (alat.stok_tersedia <= 0) {
        dbService._addTapLog(sess.uid_kartu, uid, 'alat', 'otomatis', 'ditolak', 'stok_habis', kartuData?.kelas, alat.nama);
        return { ok: false, error: 'stok_habis', type: 'alat' };
      }
      const permintaan = dbService.getPermintaan();
      const existingReq = permintaan.find(p => p.uid_kartu === sess.uid_kartu && p.alat_id === alat.id && p.status === 'menunggu');
      if (existingReq) {
        dbService._addTapLog(sess.uid_kartu, uid, 'alat', 'otomatis', 'ditolak', 'permintaan_sudah_ada', kartuData?.kelas, alat.nama);
        return { ok: false, error: 'permintaan_sudah_ada', type: 'alat' };
      }
      const newReq = {
        id: 'REQ-' + Date.now(),
        uid_kartu: sess.uid_kartu,
        kelas: kartuData?.kelas ?? '',
        alat_id: alat.id,
        nama_alat: alat.nama,
        satuan: alat.satuan || 'unit',
        status: 'menunggu',
        waktu_tap: new Date().toISOString()
      };
      permintaan.unshift(newReq);
      setStore('permintaan', permintaan);
      extendSession(sess.uid_kartu);
      dbService._addTapLog(sess.uid_kartu, uid, 'alat', 'otomatis', 'menunggu', null, kartuData?.kelas, alat.nama);
      return { ok: true, type: 'alat', jenis: 'pinjam', alat: alat.nama, kelas: kartuData?.kelas, status: 'menunggu_persetujuan' };
    }

    if (activeTrx) {
      // Kembalikan
      const updated = transaksi.map((t) =>
        t.id === activeTrx.id
          ? { ...t, status: 'dikembalikan', waktu_kembali: new Date().toISOString() }
          : t
      );
      setStore('transaksi', updated);
      jenis = 'kembali';
    } else {
      // Pinjam — cek stok
      if (alat.stok_tersedia <= 0) {
        dbService._addTapLog(sess.uid_kartu, uid, 'alat', 'otomatis', 'ditolak', 'stok_habis', kartuData?.kelas, alat.nama);
        return { ok: false, error: 'stok_habis', type: 'alat' };
      }
      const newTrx = {
        id: 'TRX-' + Date.now(),
        uid_kartu: sess.uid_kartu,
        kelas: kartuData?.kelas ?? '',
        alat_id: alat.id,
        nama_alat: alat.nama,
        status: 'dipinjam',
        sumber: 'otomatis',
        kondisi_pinjam: 'baik',
        kondisi_kembali: null,
        waktu_pinjam: new Date().toISOString(),
        waktu_kembali: null,
        petugas: null,
        catatan: null,
      };
      const all = dbService.getTransaksi();
      all.unshift(newTrx);
      setStore('transaksi', all);
      jenis = 'pinjam';
    }

    extendSession(sess.uid_kartu);
    dbService._addTapLog(sess.uid_kartu, uid, jenis, 'otomatis', 'berhasil', null, kartuData?.kelas, alat.nama);
    return { ok: true, type: 'alat', jenis, alat: alat.nama, kelas: kartuData?.kelas };
  },

  // ── processManual: transaksi manual petugas ──────────────────
  processManual: ({ uid_kartu, alat_id, jenis, jumlah = 1, kondisi_pinjam = 'baik', kondisi_kembali = null, catatan = null, petugas = null }) => {
    const kartu = dbService.getKartu().find((k) => k.uid_kartu === uid_kartu);
    if (!kartu) return { ok: false, error: 'uid_tidak_dikenal' };

    const alat = dbService.getAlatWithStok().find((a) => a.id === alat_id);
    if (!alat) return { ok: false, error: 'uid_tidak_dikenal' };

    if (alat.tipe === 'habis_pakai') {
      const now = new Date().toISOString();
      const allAlat = dbService.getAlat();
      const aIdx = allAlat.findIndex(a => a.id === alat_id);
      
      if (jenis === 'pinjam' || jenis === 'habis_pakai' || jenis === 'pemberian') {
        if (alat.stok_tersedia < jumlah) return { ok: false, error: 'stok_habis' };
        
        if (aIdx > -1) {
          allAlat[aIdx].jumlah_total -= jumlah;
          allAlat[aIdx].stok_tersedia = allAlat[aIdx].jumlah_total;
          dbService.saveAlat(allAlat);
        }

        const allReq = dbService.getPermintaan();
        allReq.unshift({
          id: `REQ-MANUAL-${Date.now()}`,
          uid_kartu, kelas: kartu.kelas,
          alat_id, nama_alat: alat.nama, satuan: alat.satuan,
          status: 'disetujui', jumlah, catatan: catatan ?? 'Diproses manual',
          petugas, waktu_tap: now, waktu_proses: now
        });
        dbService.savePermintaan(allReq);

        dbService._addTapLog(uid_kartu, null, 'pinjam', 'manual', 'berhasil', null, kartu.kelas, alat.nama);
        return { ok: true, jenis, jumlah };
      } else {
        if (aIdx > -1) {
          allAlat[aIdx].jumlah_total += jumlah;
          allAlat[aIdx].stok_tersedia = allAlat[aIdx].jumlah_total;
          dbService.saveAlat(allAlat);
        }
        dbService._addTapLog(uid_kartu, null, 'kembali', 'manual', 'berhasil', null, kartu.kelas, alat.nama);
        return { ok: true, jenis, jumlah };
      }
    }

    const transaksi = dbService.getTransaksi();

    if (jenis === 'pinjam') {
      if (alat.stok_tersedia < jumlah) return { ok: false, error: 'stok_habis' };
      for (let i = 0; i < jumlah; i++) {
        transaksi.unshift({
          id: 'TRX-' + Date.now() + '-' + i,
          uid_kartu, kelas: kartu.kelas,
          alat_id, nama_alat: alat.nama,
          status: 'dipinjam', sumber: 'manual',
          kondisi_pinjam, kondisi_kembali: null,
          waktu_pinjam: new Date().toISOString(),
          waktu_kembali: null, petugas, catatan,
        });
      }
      setStore('transaksi', transaksi);
      dbService._addTapLog(uid_kartu, null, 'pinjam', 'manual', 'berhasil', null, kartu.kelas, alat.nama);
      return { ok: true, jenis, jumlah };
    } else {
      let count = 0;
      const updated = transaksi.map((t) => {
        if (t.uid_kartu === uid_kartu && t.alat_id === alat_id && t.status === 'dipinjam' && count < jumlah) {
          count++;
          return { ...t, status: 'dikembalikan', waktu_kembali: new Date().toISOString(), kondisi_kembali, catatan: catatan ?? t.catatan, petugas: petugas ?? t.petugas };
        }
        return t;
      });
      setStore('transaksi', updated);
      dbService._addTapLog(uid_kartu, null, 'kembali', 'manual', 'berhasil', null, kartu.kelas, alat.nama);
      return { ok: true, jenis, jumlah: count };
    }
  },

  // ── Private helper: tambah tap_log ───────────────────────────
  _addTapLog: (uid_kartu, uid_alat, jenis_tap, jenis_terdeteksi, status, error_code, kelas, nama_alat) => {
    const log = {
      id: 'LOG-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      uid_kartu, uid_alat,
      jenis_tap,
      jenis_terdeteksi,
      kelas, nama_alat,
      status,
      error_code,
      is_read: false,
      waktu_tap: new Date().toISOString(),
    };
    const logs = dbService.getTapLog();
    logs.unshift(log);
    setStore('tap_log', logs);
    return log;
  },

  // ── Stat Harian (untuk chart dashboard) ─────────────────────
  getStatHarian: (days = 7) => {
    const transaksi = dbService.getTransaksi();
    const result    = [];
    const now       = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d     = new Date(now);
      d.setDate(now.getDate() - i);
      const key   = d.toISOString().slice(0, 10);
      const pinjam  = transaksi.filter((t) => t.waktu_pinjam?.startsWith(key)).length;
      const kembali = transaksi.filter((t) => t.waktu_kembali?.startsWith(key)).length;
      result.push({ tanggal: key, jumlah_pinjam: pinjam, jumlah_kembali: kembali, total: pinjam + kembali });
    }
    return result;
  },

  // ── v_list_barang simulation ─────────────────────────────────
  getListBarang: () => {
    const alat      = dbService.getAlatWithStok();
    const transaksi = dbService.getTransaksi();
    const kartu     = dbService.getKartu();
    return alat.map((a) => {
      const activeTrx = a.tipe === 'habis_pakai' ? null : transaksi.find((t) => t.alat_id === a.id && t.status === 'dipinjam');
      const peminjam_kartu = activeTrx?.uid_kartu ?? null;
      const peminjam_kelas = activeTrx
        ? (kartu.find((k) => k.uid_kartu === activeTrx.uid_kartu)?.kelas ?? null)
        : null;
      const status = a.tipe === 'habis_pakai' ? (a.stok_tersedia <= 0 ? 'habis' : 'tersedia') : (a.stok_tersedia <= 0 ? 'habis' : (activeTrx ? 'dipinjam' : 'tersedia'));
      return { ...a, status, peminjam_kartu, peminjam_kelas };
    });
  },

  // ── v_pinjaman_aktif simulation ──────────────────────────────
  getPinjamanAktif: () => {
    const transaksi = dbService.getTransaksi();
    const kartuList = dbService.getKartu();
    const alatList  = dbService.getAlat();
    const now       = Date.now();

    return transaksi
      .filter((t) => t.status === 'dipinjam')
      .map((t) => {
        const kartu = kartuList.find((k) => k.uid_kartu === t.uid_kartu);
        const alat  = alatList.find((a) => a.id === t.alat_id);
        const waktuPinjamMs = t.waktu_pinjam ? new Date(t.waktu_pinjam).getTime() : now;
        const durasi_menit = Math.max(0, Math.floor((now - waktuPinjamMs) / 60000));

        return {
          transaksi_id: t.id,
          id: t.id,
          uid_kartu: t.uid_kartu,
          kelas: t.kelas || kartu?.kelas || '—',
          nama_pemegang: kartu?.nama_pemegang || null,
          kartu_aktif: kartu ? kartu.aktif : true,
          alat_id: t.alat_id,
          alat_nama: t.nama_alat || alat?.nama || '—',
          nama_alat: t.nama_alat || alat?.nama || '—',
          alat_kode: alat?.kode || null,
          alat_kategori: alat?.kategori || 'umum',
          status: t.status,
          sumber: t.sumber,
          kondisi_pinjam: t.kondisi_pinjam || 'baik',
          petugas: t.petugas,
          catatan: t.catatan,
          waktu_pinjam: t.waktu_pinjam,
          durasi_menit,
        };
      });
  },
};
