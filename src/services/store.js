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
    uid: 'usr-superadmin-1',
    nama: 'Super Admin',
    email: 'superadmin@smk.sch.id',
    role: 'super_admin',
    aktif: true,
    created_at: new Date().toISOString(),
  },
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
    kategori: 'elektronik',
    jumlah_total: 5, jumlah_rusak: 0, stok_tersedia: 5,
    created_at: new Date().toISOString(),
  },
  {
    id: 'ALT-002', kode: 'OSC-002', nama: 'Oscilloscope Rigol DS1054Z',
    kategori: 'elektronik',
    jumlah_total: 2, jumlah_rusak: 0, stok_tersedia: 2,
    created_at: new Date().toISOString(),
  },
  {
    id: 'ALT-003', kode: 'SLD-003', nama: 'Solder Station Dekko',
    kategori: 'elektronik',
    jumlah_total: 10, jumlah_rusak: 1, stok_tersedia: 9,
    created_at: new Date().toISOString(),
  },
  {
    id: 'ALT-004', kode: 'TNG-004', nama: 'Tang Kombinasi Tekiro',
    kategori: 'mekanik',
    jumlah_total: 8, jumlah_rusak: 0, stok_tersedia: 8,
    created_at: new Date().toISOString(),
  },
  {
    id: 'ALT-005', kode: 'CRM-005', nama: 'Crimping Tool RJ45',
    kategori: 'jaringan',
    jumlah_total: 3, jumlah_rusak: 3, stok_tersedia: 0,
    tipe: 'alat', satuan: 'unit',
    created_at: new Date().toISOString(),
  },
  {
    id: 'ALT-006', kode: 'KBL-006', nama: 'Kabel UTP Cat6',
    kategori: 'jaringan',
    jumlah_total: 100, jumlah_rusak: 0, stok_tersedia: 100,
    tipe: 'habis_pakai', satuan: 'meter',
    created_at: new Date().toISOString(),
  },
  {
    id: 'ALT-007', kode: 'TIM-007', nama: 'Timah Solder (Tin Lead)',
    kategori: 'elektronik',
    jumlah_total: 500, jumlah_rusak: 0, stok_tersedia: 500,
    tipe: 'habis_pakai', satuan: 'cm',
    created_at: new Date().toISOString(),
  },
  {
    id: 'ALT-008', kode: 'RJ-008', nama: 'Konektor RJ45',
    kategori: 'jaringan',
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

// ── Sesi kartu 10 detik (in-memory, reset saat refresh) ───────
export const SESSION_DURATION_SECONDS = 10;
export const SESSION_DURATION_MS = SESSION_DURATION_SECONDS * 1000;

// { uid_kartu: { expires: Date, uid_kartu, kelas, processed: string[] } }
// Tidak ada mode global PINJAM/KEMBALI. Aksi ditentukan per UID alat.
const kartuSessions = {};

function getSession(uid_kartu) {
  const s = kartuSessions[uid_kartu];
  if (!s) return null;
  if (new Date() > new Date(s.expires)) {
    delete kartuSessions[uid_kartu];
    return null;
  }
  return s;
}

function setSession(uid_kartu, kelas = '') {
  const expires = new Date(Date.now() + SESSION_DURATION_MS);
  // Sesi baru selalu mulai dengan daftar tap alat yang kosong.
  kartuSessions[uid_kartu] = { uid_kartu, kelas, expires, processed: [] };
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

// Catat UID alat yang sudah diproses pada sesi aktif + perpanjang 10 detik.
// UID yang sama tidak boleh diproses dua kali sampai sesi baru dimulai.
function markToolProcessed(uid_kartu, uid_alat) {
  const s = kartuSessions[uid_kartu];
  if (!s) return false;

  if (!Array.isArray(s.processed)) s.processed = [];
  if (s.processed.includes(uid_alat)) return false;

  s.processed.push(uid_alat);
  s.expires = new Date(Date.now() + SESSION_DURATION_MS);
  window.dispatchEvent(new Event('simlab_storage_updated'));
  return true;
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

  // Hitung stok_tersedia dari jumlah_total & jumlah_dipinjam aktif.
  // Untuk alat sekali pakai, jumlah_total adalah total unit yang dimiliki
  // dan tidak berkurang; stok dihitung dari permintaan yang disetujui.
  getAlatWithStok: () => {
    const alat      = dbService.getAlat();
    const transaksi = getStore('transaksi', INITIAL_TRANSAKSI);
    const permintaan = getStore('permintaan', []);
    return alat.map((a) => {
      const dipinjam = transaksi.filter(
        (t) => t.alat_id === a.id && t.status === 'dipinjam'
      ).length;
      const terpakai = a.tipe === 'habis_pakai'
        ? permintaan
          .filter((p) => p.alat_id === a.id && p.status === 'disetujui' && p.jumlah != null)
          .reduce((total, p) => total + (Number(p.jumlah) || 0), 0)
        : 0;
      const stok_tersedia = a.tipe === 'habis_pakai'
        ? Math.max(0, Number(a.jumlah_total) - terpakai)
        : Math.max(0, a.jumlah_total - (a.jumlah_rusak || 0) - dipinjam);
      return { ...a, stok_tersedia, dipinjam_aktif: dipinjam, terpakai };
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
  getUnreadCount: () => getStore('tap_log', INITIAL_TAP_LOG).filter((l) => !l.is_read && l.jenis_terdeteksi !== 'manual').length,
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

    const alatDenganStok = dbService.getAlatWithStok().find((x) => x.id === req.alat_id);
    if (!alatDenganStok) return { ok: false, error: 'alat_tidak_ditemukan' };

    // jumlah_total tetap; stok berkurang dari permintaan yang disetujui.
    if (alatDenganStok.stok_tersedia < qty) {
      return { ok: false, error: 'stok_habis' };
    }

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

    // Stok otomatis kembali karena permintaan ini tidak lagi berstatus
    // 'disetujui'. jumlah_total (total unit) tidak perlu diubah.
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

  // ── processTap: simulasi lokal dari RPC process_rfid_tap ─────
  /**
   * Meniru proses tap RFID dari ESP32 untuk mode demo/localStorage.
   * Kontrak respons sama dengan backend:
   *   { success, code, action, message, alat, kelas, session }
   *
   * Tidak ada mode global PINJAM/KEMBALI. Setiap UID alat diputuskan
   * berdasarkan kondisi transaksi alat tersebut.
   */
  processTap: (uid) => {
    const uidNorm = String(uid || '').trim().toUpperCase();
    const kartuList = dbService.getKartu();
    const kartu = kartuList.find(
      (k) => String(k.uid_kartu || '').toUpperCase() === uidNorm
    );

    const sessionInfo = (s) => {
      if (!s) return null;
      const expiresAt = new Date(s.expires).getTime();
      return {
        uid_kartu: s.uid_kartu,
        kelas: s.kelas,
        nama_pemegang:
          kartuList.find((k) => k.uid_kartu === s.uid_kartu)?.nama_pemegang ?? null,
        expires_at: new Date(expiresAt).toISOString(),
        // Sisa waktu dihitung dari waktu kedaluwarsa sesi, bukan timer UI.
        expires_in_seconds: Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000)),
      };
    };

    // ---------- UID KARTU KELAS ----------
    if (kartu) {
      if (!kartu.aktif) {
        clearSession(kartu.uid_kartu);
        dbService._addTapLog(kartu.uid_kartu, null, 'kartu', 'otomatis', 'ditolak', 'kartu_nonaktif', kartu.kelas, null);
        return {
          success: false,
          code: 'kartu_nonaktif',
          action: 'tolak',
          message: 'Kartu RFID tidak aktif.',
          alat: null,
          kelas: kartu.kelas,
          session: null,
        };
      }

      const activeSessions = dbService.getActiveSessions();
      const current = activeSessions.length > 0 ? activeSessions[0] : null;

      if (current) {
        if (current.uid_kartu === kartu.uid_kartu) {
          clearSession(kartu.uid_kartu);
          dbService._addTapLog(kartu.uid_kartu, null, 'selesai', 'otomatis', 'berhasil', null, kartu.kelas, null);
          return {
            success: true,
            code: 'sesi_selesai',
            action: 'selesai',
            message: `Sesi ${kartu.kelas} selesai.`,
            alat: null,
            kelas: kartu.kelas,
            session: null,
          };
        }

        const activeCard = kartuList.find((k) => k.uid_kartu === current.uid_kartu);
        const activeName = activeCard?.nama_pemegang || activeCard?.kelas || current.kelas || current.uid_kartu;
        dbService._addTapLog(kartu.uid_kartu, null, 'kartu', 'otomatis', 'ditolak', 'sesi_kartu_lain_aktif', kartu.kelas, null);
        return {
          success: false,
          code: 'sesi_kartu_lain_aktif',
          action: 'tolak',
          message: `Sesi ${activeName} sedang aktif.`,
          alat: null,
          kelas: kartu.kelas,
          session: sessionInfo(current),
        };
      }

      // Sesi baru: tidak membaca status pinjaman kelas untuk menentukan mode.
      const sess = setSession(kartu.uid_kartu, kartu.kelas);
      dbService._addTapLog(kartu.uid_kartu, null, 'kartu', 'otomatis', 'berhasil', null, kartu.kelas, null);
      return {
        success: true,
        code: 'sesi_dimulai',
        action: 'mulai',
        message: `Sesi ${kartu.kelas} aktif.`,
        alat: null,
        kelas: kartu.kelas,
        session: sessionInfo(sess),
      };
    }

    // ---------- UID TAG ALAT ----------
    const alatList = dbService.getAlatWithStok();
    // Kolom UID stiker RFID pada skema ini adalah `alat.kode`.
    const alat = alatList.find(
      (a) => String(a.kode || '').trim().toUpperCase() === uidNorm
    );

    if (!alat) {
      dbService._addTapLog(null, uidNorm, 'alat', 'otomatis', 'ditolak', 'tag_tidak_dikenal', null, null);
      return {
        success: false,
        code: 'tag_tidak_dikenal',
        action: 'tolak',
        message: 'Tag alat tidak dikenal.',
        alat: { id: null, nama: null, kode: uidNorm },
        kelas: null,
        session: null,
      };
    }

    const alatInfo = { id: alat.id, nama: alat.nama, kode: alat.kode };
    const activeSessions = dbService.getActiveSessions();
    const sess = activeSessions.length > 0 ? activeSessions[0] : null;

    if (!sess) {
      dbService._addTapLog(null, alat.kode, 'alat', 'otomatis', 'ditolak', 'sesi_tidak_aktif', null, alat.nama);
      return {
        success: false,
        code: 'sesi_tidak_aktif',
        action: 'tolak',
        message: 'Sesi tidak aktif. Tap kartu kelas terlebih dahulu.',
        alat: alatInfo,
        kelas: null,
        session: null,
      };
    }

    const kartuData = kartuList.find((k) => k.uid_kartu === sess.uid_kartu);
    if (!kartuData || !kartuData.aktif) {
      clearSession(sess.uid_kartu);
      dbService._addTapLog(sess.uid_kartu, alat.kode, 'alat', 'otomatis', 'ditolak', 'kartu_nonaktif', kartuData?.kelas ?? sess.kelas, alat.nama);
      return {
        success: false,
        code: 'kartu_nonaktif',
        action: 'tolak',
        message: 'Kartu RFID sudah tidak aktif.',
        alat: alatInfo,
        kelas: kartuData?.kelas ?? sess.kelas,
        session: null,
      };
    }

    const kelas = kartuData.kelas || sess.kelas || '';
    const processed = Array.isArray(sess.processed) ? sess.processed : [];

    // Anti-duplikat per sesi diperiksa sebelum transaksi apa pun diubah.
    if (processed.includes(uidNorm)) {
      dbService._addTapLog(sess.uid_kartu, alat.kode, 'alat', 'otomatis', 'ditolak', 'tap_duplikat', kelas, alat.nama);
      return {
        success: false,
        code: 'tap_duplikat',
        action: 'duplikat',
        message: `${alat.nama} sudah diproses pada sesi ini.`,
        alat: alatInfo,
        kelas,
        session: sessionInfo(sess),
      };
    }

    // ---------- ALAT HABIS PAKAI ----------
    if (alat.tipe === 'habis_pakai') {
      if (alat.stok_tersedia <= 0) {
        dbService._addTapLog(sess.uid_kartu, alat.kode, 'alat', 'otomatis', 'ditolak', 'stok_habis', kelas, alat.nama);
        return {
          success: false,
          code: 'stok_habis',
          action: 'tolak',
          message: `Stok ${alat.nama} habis.`,
          alat: alatInfo,
          kelas,
          session: sessionInfo(sess),
        };
      }

      const permintaan = dbService.getPermintaan();
      const existingReq = permintaan.find(
        (p) => p.uid_kartu === sess.uid_kartu && p.alat_id === alat.id && p.status === 'menunggu'
      );

      if (existingReq) {
        dbService._addTapLog(sess.uid_kartu, alat.kode, 'alat', 'otomatis', 'ditolak', 'permintaan_sudah_ada', kelas, alat.nama);
        return {
          success: false,
          code: 'permintaan_sudah_ada',
          action: 'tolak',
          message: `${alat.nama} sudah menunggu persetujuan petugas.`,
          alat: alatInfo,
          kelas,
          session: sessionInfo(sess),
        };
      }

      const newReq = {
        id: 'REQ-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        uid_kartu: sess.uid_kartu,
        kelas,
        alat_id: alat.id,
        nama_alat: alat.nama,
        satuan: alat.satuan || 'unit',
        status: 'menunggu',
        jumlah: null,
        waktu_tap: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      permintaan.unshift(newReq);
      setStore('permintaan', permintaan);

      markToolProcessed(sess.uid_kartu, uidNorm);
      dbService._addTapLog(sess.uid_kartu, alat.kode, 'alat', 'otomatis', 'menunggu', null, kelas, alat.nama);
      return {
        success: true,
        code: 'menunggu_persetujuan',
        action: 'menunggu',
        message: `${alat.nama} menunggu persetujuan petugas.`,
        alat: alatInfo,
        kelas,
        session: sessionInfo(sess),
      };
    }

    // ---------- ALAT PINJAM ----------
    const transaksi = dbService.getTransaksi();
    const activeRows = transaksi
      .filter((t) => t.alat_id === alat.id && t.status === 'dipinjam')
      .sort((a, b) => new Date(a.waktu_pinjam) - new Date(b.waktu_pinjam));
    // Prioritaskan transaksi milik kartu yang sama, lalu kelas yang sama.
    const ownTrx =
      activeRows.find((t) => t.uid_kartu === sess.uid_kartu) ||
      activeRows.find((t) => kelas && t.kelas === kelas);

    if (ownTrx) {
      // Kembalikan hanya satu transaksi yang dipilih, bukan semua
      // transaksi aktif milik kelas tersebut.
      const now = new Date().toISOString();
      const updated = transaksi.map((t) => (
        t.id === ownTrx.id
          ? { ...t, status: 'dikembalikan', waktu_kembali: now }
          : t
      ));
      setStore('transaksi', updated);

      markToolProcessed(sess.uid_kartu, uidNorm);
      dbService._addTapLog(sess.uid_kartu, alat.kode, 'kembali', 'otomatis', 'berhasil', null, kelas, alat.nama);
      return {
        success: true,
        code: 'dikembalikan',
        action: 'kembali',
        message: `${alat.nama} berhasil dikembalikan.`,
        alat: alatInfo,
        kelas,
        session: sessionInfo(sess),
      };
    }

    // stok_tersedia sudah memperhitungkan transaksi aktif. Jika masih
    // tersisa, alat dengan jumlah_total > 1 boleh dipinjam walau ada
    // transaksi aktif dari kelas lain.
    if (alat.stok_tersedia <= 0) {
      if (activeRows.length > 0) {
        const peminjamKelas = activeRows[0]?.kelas || 'kelas lain';
        dbService._addTapLog(sess.uid_kartu, alat.kode, 'alat', 'otomatis', 'ditolak', 'sedang_dipinjam', kelas, alat.nama);
        return {
          success: false,
          code: 'sedang_dipinjam',
          action: 'tolak',
          message: `Stok ${alat.nama} habis; sedang dipinjam oleh ${peminjamKelas}.`,
          alat: alatInfo,
          kelas,
          peminjam_kelas: peminjamKelas,
          session: sessionInfo(sess),
        };
      }

      dbService._addTapLog(sess.uid_kartu, alat.kode, 'alat', 'otomatis', 'ditolak', 'stok_habis', kelas, alat.nama);
      return {
        success: false,
        code: 'stok_habis',
        action: 'tolak',
        message: `${alat.nama} tidak tersedia.`,
        alat: alatInfo,
        kelas,
        session: sessionInfo(sess),
      };
    }

    const now = new Date().toISOString();
    const newTrx = {
      id: 'TRX-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      uid_kartu: sess.uid_kartu,
      kelas,
      alat_id: alat.id,
      nama_alat: alat.nama,
      status: 'dipinjam',
      sumber: 'otomatis',
      kondisi_pinjam: 'baik',
      kondisi_kembali: null,
      waktu_pinjam: now,
      waktu_kembali: null,
      petugas: null,
      catatan: null,
      created_at: now,
    };
    transaksi.unshift(newTrx);
    setStore('transaksi', transaksi);

    markToolProcessed(sess.uid_kartu, uidNorm);
    dbService._addTapLog(sess.uid_kartu, alat.kode, 'pinjam', 'otomatis', 'berhasil', null, kelas, alat.nama);
    return {
      success: true,
      code: 'dipinjam',
      action: 'pinjam',
      message: `${alat.nama} berhasil dipinjam.`,
      alat: alatInfo,
      kelas,
      session: sessionInfo(sess),
    };
  },

  // ── processManual: transaksi manual petugas ──────────────────
  processManual: ({ uid_kartu, alat_id, jenis, jumlah = 1, kondisi_pinjam = 'baik', kondisi_kembali = null, catatan = null, petugas = null }) => {
    const kartu = dbService.getKartu().find((k) => k.uid_kartu === uid_kartu);
    if (!kartu) return { ok: false, error: 'uid_tidak_dikenal' };

    const alat = dbService.getAlatWithStok().find((a) => a.id === alat_id);
    if (!alat) return { ok: false, error: 'uid_tidak_dikenal' };

    const qty = Math.max(1, Number(jumlah));

    // A. Barang Sekali pakai (Consumable)
    if (alat.tipe === 'habis_pakai') {
      if (jenis === 'kembali') {
        return {
          ok: false,
          error: 'alat_habis_pakai_tidak_bisa_dikembalikan',
          message: 'Barang sekali pakai (consumable) langsung diberikan dan tidak perlu dikembalikan.',
        };
      }

      if (alat.stok_tersedia < qty) {
        return { ok: false, error: 'stok_habis', message: `Stok tidak cukup. Tersedia: ${alat.stok_tersedia}, diminta: ${qty}` };
      }

      const now = new Date().toISOString();
      // jumlah_total adalah total unit dan tidak dikurangi. Stok tersisa
      // dihitung dari permintaan berstatus 'disetujui' di getAlatWithStok.
      const permintaanId = `REQ-MANUAL-${Date.now()}`;
      const allReq = dbService.getPermintaan();
      allReq.unshift({
        id: permintaanId,
        uid_kartu,
        kelas: kartu.kelas,
        alat_id,
        nama_alat: alat.nama,
        satuan: alat.satuan || 'unit',
        status: 'disetujui',
        jumlah: qty,
        catatan: catatan ?? 'Diproses manual oleh petugas',
        petugas,
        waktu_tap: now,
        waktu_proses: now,
        created_at: now,
      });
      dbService.savePermintaan(allReq);

      // Simpan riwayat stok_mutasi
      const allMutasi = getStore('stok_mutasi', []);
      allMutasi.unshift({
        id: `MUT-${Date.now()}`,
        alat_id: alat.id,
        delta: -qty,
        stok_setelah: Math.max(0, alat.stok_tersedia - qty),
        alasan: 'persetujuan',
        permintaan_id: permintaanId,
        catatan: catatan ?? 'Pemberian manual petugas',
        petugas,
        created_at: now,
      });
      setStore('stok_mutasi', allMutasi);

      // PENTING: Operasi manual TIDAK dicatat ke tap_log (khusus reader RFID)
      return { ok: true, jenis: 'habis_pakai', jumlah: qty };
    }

    // B. Barang Bertipe Pinjam
    if (jenis === 'habis_pakai' || jenis === 'pemberian') {
      return {
        ok: false,
        error: 'bukan_alat_habis_pakai',
        message: `Alat "${alat.nama}" bukan barang sekali pakai. Gunakan form peminjaman biasa.`,
      };
    }

    const transaksi = dbService.getTransaksi();

    if (jenis === 'pinjam') {
      if (alat.stok_tersedia < qty) {
        return { ok: false, error: 'stok_habis', message: `Stok tidak cukup. Tersedia: ${alat.stok_tersedia}, diminta: ${qty}` };
      }
      for (let i = 0; i < qty; i++) {
        transaksi.unshift({
          id: `TRX-${Date.now()}-${i}`,
          uid_kartu,
          kelas: kartu.kelas,
          alat_id: alat.id,
          nama_alat: alat.nama,
          status: 'dipinjam',
          sumber: 'manual',
          kondisi_pinjam: kondisi_pinjam ?? 'baik',
          kondisi_kembali: null,
          waktu_pinjam: new Date().toISOString(),
          waktu_kembali: null,
          petugas,
          catatan,
          created_at: new Date().toISOString(),
        });
      }
      setStore('transaksi', transaksi);
      // PENTING: Operasi manual TIDAK dicatat ke tap_log (khusus reader RFID)
      return { ok: true, jenis: 'pinjam', jumlah: qty };
    } else {
      // Satu baris alat = satu unit fisik. Kembalikan hanya satu transaksi
      // aktif yang cocok, walaupun klien mengirim jumlah lebih dari 1.
      let returned = false;
      const updated = transaksi.map((t) => {
        if (
          !returned &&
          t.uid_kartu === uid_kartu &&
          t.alat_id === alat_id &&
          t.status === 'dipinjam'
        ) {
          returned = true;
          return {
            ...t,
            status: 'dikembalikan',
            waktu_kembali: new Date().toISOString(),
            kondisi_kembali: kondisi_kembali ?? 'baik',
            catatan: catatan ?? t.catatan,
            petugas: petugas ?? t.petugas,
          };
        }
        return t;
      });

      if (!returned) {
        return {
          ok: false,
          error: 'tidak_ada_pinjaman',
          message: `Kartu ${kartu.kelas} tidak memiliki pinjaman aktif untuk alat "${alat.nama}".`,
        };
      }

      setStore('transaksi', updated);
      // PENTING: Operasi manual TIDAK dicatat ke tap_log (khusus reader RFID)
      return { ok: true, jenis: 'kembali', jumlah: 1 };
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
