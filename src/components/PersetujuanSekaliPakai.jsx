// src/pages/PermintaanHabisPakai.jsx
// Halaman persetujuan permintaan alat habis pakai oleh petugas/admin

import React, { useState, useEffect } from 'react';
import { IconCheck, IconX, IconPackage } from '@tabler/icons-react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { callFunction } from '../lib/api';
import { dbService } from '../services/store';
import DataTable from '../components/DataTable';
import Badge from '../components/Badge';
import PageNote from '../components/PageNote';
import { showFeedback, friendlyError } from '../lib/feedback';

// ── Catatan Penggunaan ──────────────────────────────────────────────────────────
// Halaman ini menampilkan daftar permintaan alat habis pakai yang menunggu
// persetujuan petugas. Permintaan dibuat secara otomatis saat siswa men-tap
// tag RFID alat bertipe 'habis_pakai' di scanner.
//
// ALUR:
//   Siswa tap RFID → rfid-tap membuat record 'menunggu' → muncul di sini
//   Petugas klik Setujui → input jumlah → stok dikurangi atomik via RPC
//   Petugas klik Tolak   → input alasan  → status jadi 'ditolak'
//
// PROD : manage-permintaan Edge Function (GET + PUT)
// DEMO : dbService.getPermintaan() / savePermintaan() di localStorage
// ──────────────────────────────────────────────────────────────────────────────

export default function PersetujuanSekaliPakai({ user }) {
  const isDemo = !isSupabaseConfigured;

  const [permintaan, setPermintaan]   = useState([]);
  const [loading, setLoading]         = useState(true);

  // Modal Setujui
  const [showSetujuModal, setShowSetujuModal] = useState(false);
  const [selectedReq, setSelectedReq]         = useState(null);
  const [jumlahSetuju, setJumlahSetuju]       = useState('');
  const [catatanSetuju, setCatatanSetuju]     = useState('');

  // Modal Tolak
  const [showTolakModal, setShowTolakModal] = useState(false);
  const [alasanTolak, setAlasanTolak]       = useState('');

  // ── Fetch permintaan ─────────────────────────────────────────────────────────
  const fetchPermintaan = async () => {
    setLoading(true);
    try {
      if (isDemo) {
        const data    = dbService.getPermintaan().filter(p => p.status === 'menunggu');
        const kList   = dbService.getKartu();
        const enriched = data.map(p => {
          const k = kList.find(x => x.uid_kartu === p.uid_kartu);
          return { ...p, kartu_rfid: { nama_pemegang: k?.nama_pemegang ?? '' } };
        });
        setPermintaan(enriched);
      } else {
        const data = await callFunction('manage-permintaan', undefined, {
          method: 'GET',
          params: { status: 'menunggu' },
        });
        setPermintaan(data?.data ?? []);
      }
    } catch (err) {
      console.error('[PermintaanHabisPakai] fetch error:', err);
      showFeedback({ type: 'error', title: 'Gagal memuat permintaan.', message: friendlyError(err) });
    } finally {
      setLoading(false);
    }
  };

  // ── Realtime subscription ────────────────────────────────────────────────────
  useEffect(() => {
    fetchPermintaan();

    if (!isDemo) {
      const ch = supabase
        .channel('permintaan_habis_pakai_changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'permintaan_habis_pakai' }, () => {
          fetchPermintaan();
        })
        .subscribe();
      return () => supabase.removeChannel(ch);
    } else {
      const handler = () => fetchPermintaan();
      window.addEventListener('simlab_storage_updated', handler);
      return () => window.removeEventListener('simlab_storage_updated', handler);
    }
  }, [isDemo]);

  // ── Action: Setujui / Tolak ──────────────────────────────────────────────────
  const handleAction = async (aksi) => {
    if (isDemo) {
      // ── Mode demo: update langsung ke localStorage ─────────────────────────
      const all  = dbService.getPermintaan();
      const pIdx = all.findIndex(x => x.id === selectedReq.id);
      if (pIdx === -1) return;

      if (aksi === 'setujui') {
        const qty = parseInt(jumlahSetuju, 10);
        if (isNaN(qty) || qty <= 0) {
          showFeedback({ type: 'error', title: 'Jumlah tidak valid.' });
          return;
        }
        // Kurangi stok demo
        const alatList = dbService.getAlat();
        const aIdx = alatList.findIndex(x => x.id === selectedReq.alat_id);
        if (aIdx > -1) {
          if (alatList[aIdx].jumlah_total < qty) {
            showFeedback({ type: 'error', title: 'Stok tidak cukup.' });
            return;
          }
          alatList[aIdx].jumlah_total -= qty;
          alatList[aIdx].stok_tersedia = alatList[aIdx].jumlah_total;
          dbService.saveAlat(alatList);
        }
        all[pIdx] = {
          ...all[pIdx], status: 'disetujui', jumlah: qty, catatan: catatanSetuju,
          petugas: user?.nama || 'Demo', waktu_proses: new Date().toISOString()
        };
      } else {
        if (!alasanTolak.trim()) {
          showFeedback({ type: 'error', title: 'Alasan penolakan wajib diisi.' });
          return;
        }
        all[pIdx] = {
          ...all[pIdx], status: 'ditolak', alasan_tolak: alasanTolak,
          petugas: user?.nama || 'Demo', waktu_proses: new Date().toISOString()
        };
      }

      dbService.savePermintaan(all);
      showFeedback({ type: 'success', title: `Permintaan berhasil di${aksi === 'setujui' ? 'setujui' : 'tolak'}.` });
      closeModals();
      fetchPermintaan();
      return;
    }

    // ── Mode Supabase ──────────────────────────────────────────────────────────
    try {
      const payload = { aksi };
      if (aksi === 'setujui') {
        const qty = parseInt(jumlahSetuju, 10);
        if (isNaN(qty) || qty <= 0) throw new Error('Jumlah harus lebih dari 0');
        payload.jumlah = qty;
        if (catatanSetuju) payload.catatan = catatanSetuju;
      } else {
        if (!alasanTolak.trim()) throw new Error('Alasan wajib diisi');
        payload.alasan = alasanTolak;
      }

      await callFunction('manage-permintaan', payload, {
        method: 'PUT',
        params: { id: selectedReq.id },
      });

      showFeedback({ type: 'success', title: `Permintaan berhasil di${aksi === 'setujui' ? 'setujui' : 'tolak'}.` });
      closeModals();
      fetchPermintaan();
    } catch (err) {
      console.error('[PermintaanHabisPakai] action error:', err);
      showFeedback({ type: 'error', title: 'Gagal memproses permintaan.', message: friendlyError(err) });
    }
  };

  const closeModals = () => {
    setShowSetujuModal(false);
    setShowTolakModal(false);
    setSelectedReq(null);
    setJumlahSetuju('');
    setCatatanSetuju('');
    setAlasanTolak('');
  };

  // ── Kolom tabel ──────────────────────────────────────────────────────────────
  const columns = [
    { key: 'waktu', label: 'Waktu', render: (r) => <span className="text-muted">{new Date(r.waktu_tap).toLocaleString('id-ID')}</span> },
    { key: 'alat', label: 'Alat', render: (r) => <span className="font-medium text-main">{r.nama_alat}</span> },
    { key: 'kelas', label: 'Kelas', render: (r) => <span>{r.kelas}</span> },
    { key: 'pemegang', label: 'Nama Pemegang', render: (r) => <span className="text-muted">{r.kartu_rfid?.nama_pemegang || '—'}</span> },
    { key: 'status', label: 'Status', render: () => <Badge status="menunggu" /> },
    {
      key: 'aksi',
      label: 'Tindakan',
      render: (r) => (
        <div className="flex items-center gap-1 justify-end">
          <button
            onClick={() => { setSelectedReq(r); setShowSetujuModal(true); }}
            className="table-action table-action-edit"
            title="Setujui"
          >
            <IconCheck size={16} className="mr-1 inline" /> Setujui
          </button>
          <button
            onClick={() => { setSelectedReq(r); setShowTolakModal(true); }}
            className="table-action table-action-danger"
            title="Tolak"
          >
            <IconX size={16} className="mr-1 inline" /> Tolak
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 bg-yellow-50 border border-yellow-200 p-4 rounded-xl">
      <div>
        <h2 className="text-lg font-semibold text-yellow-900 flex items-center gap-2">
          <IconPackage className="text-yellow-600" />
          Persetujuan Alat Sekali Pakai Menunggu
        </h2>
        <p className="text-[14px] text-yellow-800 mt-1">
          Daftar permintaan pengambilan alat sekali pakai dari tap RFID siswa yang butuh persetujuan segera.
        </p>
      </div>



      {/* ── Tabel Permintaan ─────────────────────────────────────────── */}
      <DataTable
        columns={columns}
        data={permintaan}
        loading={loading}
        searchPlaceholder="Cari permintaan..."
        searchKeys={['nama_alat', 'kelas']}
        emptyMessage="Tidak ada permintaan yang menunggu"
        emptyDescription="Permintaan baru akan muncul di sini saat siswa men-tap alat sekali pakai di scanner RFID."
        className="bg-white rounded-lg shadow-sm"
      />

      {/* ── Modal: Setujui ─────────────────────────────────────────────── */}
      {showSetujuModal && selectedReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl overflow-hidden border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-semibold text-main">Setujui Permintaan</h3>
              <button onClick={closeModals} className="text-gray-400 hover:text-gray-600"><IconX size={20} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted mb-0.5">Alat</p>
                  <p className="font-medium text-main">{selectedReq.nama_alat}</p>
                </div>
                <div>
                  <p className="text-muted mb-0.5">Peminta</p>
                  <p className="font-medium text-main">{selectedReq.kelas}</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Jumlah yang diberikan ({selectedReq.satuan || 'unit'}) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number" min="1"
                  value={jumlahSetuju}
                  onChange={(e) => setJumlahSetuju(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                  placeholder="Contoh: 5"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Catatan (Opsional)</label>
                <input
                  type="text"
                  value={catatanSetuju}
                  onChange={(e) => setCatatanSetuju(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                  placeholder="Catatan persetujuan..."
                />
              </div>
            </div>
            <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={closeModals} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Batal</button>
              <button
                onClick={() => handleAction('setujui')}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                Setujui & Kurangi Stok
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Tolak ───────────────────────────────────────────────── */}
      {showTolakModal && selectedReq && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl w-full max-w-md shadow-xl overflow-hidden border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
              <h3 className="font-semibold text-main">Tolak Permintaan</h3>
              <button onClick={closeModals} className="text-gray-400 hover:text-gray-600"><IconX size={20} /></button>
            </div>
            <div className="p-5">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Alasan Penolakan <span className="text-red-500">*</span>
              </label>
              <textarea
                value={alasanTolak}
                onChange={(e) => setAlasanTolak(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:outline-none text-sm"
                placeholder="Contoh: Stok sedang tidak tersedia"
                rows="3"
              />
            </div>
            <div className="px-5 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={closeModals} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Batal</button>
              <button
                onClick={() => handleAction('tolak')}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold transition-colors"
              >
                Tolak Permintaan
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
