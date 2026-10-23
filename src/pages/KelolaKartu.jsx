import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { dbService } from '../services/store';
import Modal from '../components/Modal';
import DataTable from '../components/DataTable';
import Button from '../components/Button';
import Badge from '../components/Badge';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import FormField, { inputClass } from '../components/FormField';
import { showFeedback, friendlyError } from '../lib/feedback';
import PageNote from '../components/PageNote';
import { IconPlus, IconRefresh, IconMail } from '@tabler/icons-react';

const EMPTY_FORM = { uid_kartu: '', kelas: '', nama_pemegang: '', aktif: true };

// ── Data access helpers ──
async function fetchKartu() {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('kartu_rfid')
      .select('uid_kartu, kelas, nama_pemegang, aktif, created_at')
      .order('kelas');
    if (error) throw error;
    return data ?? [];
  }
  return dbService.getKartu();
}

async function fetchActiveLoansByCard(uid_kartu) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('transaksi')
      .select('id, nama_alat')
      .eq('uid_kartu', uid_kartu)
      .eq('status', 'dipinjam');
    if (error) return [];
    return data ?? [];
  }
  return dbService.getActiveLoansByCard(uid_kartu);
}

async function upsertKartu(payload, isEdit) {
  if (isSupabaseConfigured) {
    if (isEdit) {
      const { error } = await supabase
        .from('kartu_rfid')
        .update({ kelas: payload.kelas, nama_pemegang: payload.nama_pemegang, aktif: payload.aktif })
        .eq('uid_kartu', payload.uid_kartu);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from('kartu_rfid')
        .insert({ uid_kartu: payload.uid_kartu, kelas: payload.kelas, nama_pemegang: payload.nama_pemegang, aktif: true });
      if (error) throw error;
    }
    return;
  }
  // localStorage
  const current = dbService.getKartu();
  if (isEdit) {
    const updated = current.map((k) => k.uid_kartu === payload.uid_kartu ? { ...k, ...payload } : k);
    dbService.saveKartu(updated);
  } else {
    current.unshift({ ...payload, aktif: true, created_at: new Date().toISOString() });
    dbService.saveKartu(current);
  }
}

async function toggleKartuAktif(uid_kartu, aktif) {
  if (isSupabaseConfigured) {
    const { error } = await supabase
      .from('kartu_rfid')
      .update({ aktif })
      .eq('uid_kartu', uid_kartu);
    if (error) throw error;
    return;
  }
  const updated = dbService.getKartu().map((k) =>
    k.uid_kartu === uid_kartu ? { ...k, aktif } : k
  );
  dbService.saveKartu(updated);
}

async function deleteKartu(uid_kartu) {
  if (isSupabaseConfigured) {
    // Cek pinjaman aktif dulu
    const { data } = await supabase
      .from('transaksi')
      .select('id')
      .eq('uid_kartu', uid_kartu)
      .eq('status', 'dipinjam')
      .limit(1);
    if (data && data.length > 0) {
      throw new Error('Kartu tidak dapat dihapus karena masih memiliki pinjaman aktif.');
    }
    const { error } = await supabase.from('kartu_rfid').delete().eq('uid_kartu', uid_kartu);
    if (error) throw error;
    return;
  }
  const res = dbService.deleteKartu(uid_kartu);
  if (!res.ok) throw new Error(res.message);
}

async function checkUidUsed(uid_kartu, excludeUid) {
  if (isSupabaseConfigured) {
    let q = supabase.from('kartu_rfid').select('uid_kartu').eq('uid_kartu', uid_kartu.trim());
    if (excludeUid) q = q.neq('uid_kartu', excludeUid);
    const { data } = await q.maybeSingle();
    return !!data;
  }
  return dbService.getKartu().some(
    (k) => k.uid_kartu === uid_kartu.trim() && k.uid_kartu !== excludeUid
  );
}

export default function KartuRfidPage() {
  const [kartu, setKartu] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [lockedModal, setLockedModal] = useState({ isOpen: false, kartu: null, items: [] });
  const [confirmDelete, setConfirmDelete] = useState({ isOpen: false, item: null });

  // Cache pinjaman aktif per kartu (hitung di client agar tidak N+1)
  const [activeLoansMap, setActiveLoansMap] = useState({});

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchKartu();
      setKartu(data);

      // Hitung pinjaman aktif per kartu sekaligus
      if (isSupabaseConfigured) {
        const { data: trx } = await supabase
          .from('transaksi')
          .select('uid_kartu, id, nama_alat')
          .eq('status', 'dipinjam');
        const map = {};
        (trx ?? []).forEach((t) => {
          if (!map[t.uid_kartu]) map[t.uid_kartu] = [];
          map[t.uid_kartu].push(t);
        });
        setActiveLoansMap(map);
      } else {
        const map = {};
        data.forEach((k) => {
          map[k.uid_kartu] = dbService.getActiveLoansByCard(k.uid_kartu);
        });
        setActiveLoansMap(map);
      }
    } catch (err) {
      console.error('[KelolaKartu] reload error:', err);
      showFeedback({ type: 'error', title: 'Gagal memuat data kartu.', message: friendlyError(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    if (!isSupabaseConfigured) return;
    const ch = supabase
      .channel('kartu-rfid-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kartu_rfid' }, () => reload())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [reload]);

  useEffect(() => {
    if (!modal || editItem) return;

    if (isSupabaseConfigured) {
      const ch = supabase
        .channel(`kelola-kartu-tap-reader-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'tap_log' },
          (payload) => {
            const scannedUid = (payload.new?.uid_alat || payload.new?.uid_kartu || '').trim();
            if (scannedUid) {
              setForm((prev) => ({ ...prev, uid_kartu: scannedUid }));
              setErrors((prev) => ({ ...prev, uid_kartu: null }));
              showFeedback({
                type: 'success',
                title: 'Kartu Terdeteksi!',
                message: `UID ${scannedUid} berhasil dibaca dari scanner.`,
              });
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(ch);
      };
    } else {
      const handleStorageUpdate = () => {
        const logs = dbService.getTapLog();
        if (logs.length > 0) {
          const latest = logs[0];
          const scannedUid = (latest.uid_alat || latest.uid_kartu || '').trim();
          if (scannedUid) {
            setForm((prev) => ({ ...prev, uid_kartu: scannedUid }));
            setErrors((prev) => ({ ...prev, uid_kartu: null }));
            showFeedback({
              type: 'success',
              title: 'Kartu Terdeteksi!',
              message: `UID ${scannedUid} berhasil dibaca dari scanner.`,
            });
          }
        }
      };

      window.addEventListener('simlab_storage_updated', handleStorageUpdate);
      return () => {
        window.removeEventListener('simlab_storage_updated', handleStorageUpdate);
      };
    }
  }, [modal, editItem]);

  const openAdd = async () => {
    setEditItem(null);
    setErrors({});
    setForm({
      ...EMPTY_FORM,
      uid_kartu: '',
      aktif: true,
    });
    setModal(true);

    // Cek apakah baru saja ada kartu yang di-tap di reader dalam 30 detik terakhir
    if (isSupabaseConfigured) {
      try {
        const { data: latestTap } = await supabase
          .from('tap_log')
          .select('uid_alat, uid_kartu, waktu_tap')
          .order('waktu_tap', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestTap && latestTap.waktu_tap) {
          const diffMs = Date.now() - new Date(latestTap.waktu_tap).getTime();
          if (diffMs < 30000) {
            const uid = (latestTap.uid_alat || latestTap.uid_kartu || '').trim();
            if (uid) {
              setForm((prev) => ({ ...prev, uid_kartu: uid }));
            }
          }
        }
      } catch (e) {
        console.warn('Gagal membaca tap terakhir:', e);
      }
    }
  };

  const openEdit = (item) => {
    setEditItem(item);
    setErrors({});
    setForm({ ...item });
    setModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const next = {};
    if (!form.uid_kartu?.trim()) next.uid_kartu = 'Nomor kartu wajib diisi (tempelkan kartu pada scanner reader).';
    if (!form.kelas?.trim()) next.kelas = 'Kelas wajib diisi.';

    if (form.uid_kartu?.trim()) {
      const used = await checkUidUsed(form.uid_kartu, editItem?.uid_kartu);
      if (used) next.uid_kartu = 'Nomor kartu tersebut sudah digunakan.';
    }

    setErrors(next);
    if (Object.keys(next).length) {
      showFeedback({ type: 'warning', title: 'Data tidak valid', message: Object.values(next)[0] });
      return;
    }

    setSaving(true);
    try {
      await upsertKartu({
        uid_kartu: form.uid_kartu.trim(),
        kelas: form.kelas.trim(),
        nama_pemegang: form.nama_pemegang?.trim() || null,
        aktif: form.aktif,
      }, !!editItem);

      showFeedback({
        type: 'success',
        title: editItem ? 'Perubahan berhasil disimpan.' : 'Kartu berhasil didaftarkan.',
      });
      setModal(false);
      reload();
    } catch (err) {
      console.error('[KelolaKartu] save error:', err);
      showFeedback({ type: 'error', title: 'Kartu gagal disimpan.', message: friendlyError(err) });
    } finally {
      setSaving(false);
    }
  };

  const handleAttemptDelete = async (item) => {
    const activeLoans = activeLoansMap[item.uid_kartu] ?? [];
    if (activeLoans.length > 0) {
      setLockedModal({ isOpen: true, kartu: item, items: activeLoans });
      return;
    }
    setConfirmDelete({ isOpen: true, item });
  };

  const handleExecuteDelete = async () => {
    const uid = confirmDelete.item?.uid_kartu;
    if (!uid) return;
    try {
      await deleteKartu(uid);
      showFeedback({ type: 'success', title: 'Kartu berhasil dihapus.' });
      setConfirmDelete({ isOpen: false, item: null });
      reload();
    } catch (err) {
      console.error('[KelolaKartu] delete error:', err);
      showFeedback({
        type: 'error',
        title: 'Kartu gagal dihapus.',
        message: err?.message || friendlyError(err),
      });
    }
  };

  const handleToggleAktif = async (item) => {
    try {
      await toggleKartuAktif(item.uid_kartu, !item.aktif);
      showFeedback({
        type: 'success',
        title: item.aktif ? 'Kartu berhasil diblokir.' : 'Kartu berhasil diaktifkan kembali.',
      });
      reload();
    } catch (err) {
      console.error('[KelolaKartu] toggleAktif error:', err);
      showFeedback({ type: 'error', title: 'Gagal mengubah status kartu.', message: friendlyError(err) });
    }
  };

  const columns = [
    {
      key: 'kelas',
      label: 'Kelas',
      sortable: true,
      render: (row) => <span className="font-medium text-main">{row.kelas}</span>,
    },
    {
      key: 'pemegang',
      label: 'Pemegang',
      sortable: true,
      render: (row) => <span className="font-medium text-main">{row.nama_pemegang || '—'}</span>,
    },
    {
      key: 'uid_kartu',
      label: 'UID Kartu',
      render: (row) => <span className="text-sm">{row.uid_kartu}</span>,
    },
    {
      key: 'pinjaman_aktif',
      label: 'Pinjaman aktif',
      sortable: false,
      render: (row) => {
        const count = (activeLoansMap[row.uid_kartu] ?? []).length;
        return count > 0
          ? <span className="text-orange-800 font-medium">{count} alat dipinjam</span>
          : <span className="text-muted">Tidak ada</span>;
      },
    },
    {
      key: 'aktif',
      label: 'Status',
      sortable: true,
      render: (row) => <Badge status={row.aktif ? 'aktif' : 'nonaktif'} />,
    },
    {
      key: 'aksi',
      label: 'Tindakan',
      render: (row) => {
        const isBorrowing = (activeLoansMap[row.uid_kartu] ?? []).length > 0;
        return (
          <div className="flex items-center gap-1 justify-end flex-wrap">
            <button
              type="button"
              onClick={() => handleToggleAktif(row)}
              className="table-action table-action-edit"
            >
              {row.aktif ? 'Blokir' : 'Aktifkan'}
            </button>
            <button type="button" onClick={() => openEdit(row)} className="table-action table-action-edit">
              Edit
            </button>
            <button
              type="button"
              onClick={() => handleAttemptDelete(row)}
              className="table-action table-action-danger"
              title={isBorrowing ? 'Kartu tidak dapat dihapus karena masih meminjam alat' : 'Hapus kartu'}
            >
              Hapus
            </button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Kelola Kartu RFID"
        description="Tambah, Edit, Hapus dan Blokir Kartu RFID"
      />

      <PageNote title="Informasi Penting" icon={IconMail}>
        UID Kartu akan otomatis terbaca jika Anda melakukan tap pada perangkat alat scanner reader. Kartu yang sedang memiliki pinjaman aktif tidak dapat dihapus dari sistem.
      </PageNote>

      <DataTable
        columns={columns}
        data={kartu}
        loading={loading}
        searchPlaceholder="Cari Kelas atau UID..."
        searchKeys={['kelas', 'nama_pemegang', 'uid_kartu']}
        emptyMessage="Belum ada kartu RFID"
        emptyDescription="Kartu yang didaftarkan akan muncul di sini."
        actionButton={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reload}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
              title="Refresh data"
            >
              <IconRefresh size={18} />
            </button>
            <Button icon={IconPlus} onClick={openAdd} className="w-full md:w-auto justify-center">
              Daftar kartu
            </Button>
          </div>
        }
      />

      {/* Modal Tambah/Edit */}
      <Modal
        isOpen={modal}
        onClose={() => !saving && setModal(false)}
        title={editItem ? 'Ubah kartu' : 'Daftar kartu baru'}
        subtitle="Kolom bertanda * wajib diisi."
      >
        <form onSubmit={handleSave} className="space-y-4">
          <FormField
            label="Nomor kartu (UID)"
            required
            error={errors.uid_kartu}
            hint={
              editItem
                ? 'UID tidak bisa diubah setelah didaftarkan.'
                : 'UID otomatis terisi langsung saat kartu identitas di-tap pada alat scanner reader.'
            }
          >
            <div className="space-y-2">
              <div className="relative">
                <input
                  required
                  readOnly
                  value={form.uid_kartu}
                  className={`${inputClass} bg-gray-50 font-mono text-base font-semibold tracking-wider cursor-not-allowed`}
                  placeholder={editItem ? 'UID Kartu' : 'Tempelkan kartu ke reader RFID...'}
                />
                {form.uid_kartu ? (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full shadow-xs">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Terbaca
                  </span>
                ) : (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                    Menunggu Tap
                  </span>
                )}
              </div>

              {!editItem && (
                !form.uid_kartu ? (
                  <div className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-50/80 border border-blue-200 text-xs text-blue-800">
                    <span className="relative flex h-3 w-3 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-600"></span>
                    </span>
                    <span>
                      <strong>Scanner Aktif:</strong> Tempelkan kartu kelas ke reader RFID. UID akan otomatis terisi tanpa perlu mengetik manual atau melihat serial monitor.
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between text-xs px-1 text-gray-500">
                    <span className="text-emerald-600 font-medium flex items-center gap-1">
                      ✓ UID identitas kartu berhasil dibaca dari scanner
                    </span>
                    <span className="text-gray-400">
                      Tap kartu lain jika ingin mengganti
                    </span>
                  </div>
                )
              )}
            </div>
          </FormField>
          <FormField label="Kelas" required error={errors.kelas}>
            <input
              required
              value={form.kelas}
              onChange={(e) => setForm({ ...form, kelas: e.target.value })}
              placeholder="XII RPL 1"
              className={inputClass}
            />
          </FormField>
          <FormField label="Nama perwakilan">
            <input
              value={form.nama_pemegang || ''}
              onChange={(e) => setForm({ ...form, nama_pemegang: e.target.value })}
              placeholder="Ketua kelas / penanggung jawab"
              className={inputClass}
            />
          </FormField>

          {editItem && (
            <label className="flex items-center gap-2 pt-1 text-[15px]">
              <input
                type="checkbox"
                checked={form.aktif}
                onChange={(e) => setForm({ ...form, aktif: e.target.checked })}
                className="w-4 h-4"
              />
              Kartu aktif (boleh dipakai meminjam)
            </label>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-3 border-t border-gray-200">
            <Button variant="secondary" onClick={() => setModal(false)} disabled={saving} className="w-full sm:w-auto justify-center">
              Batal
            </Button>
            <Button type="submit" disabled={saving} className="w-full sm:w-auto justify-center">
              {saving ? 'Menyimpan...' : (editItem ? 'Simpan perubahan' : 'Simpan kartu')}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Kartu locked (ada pinjaman aktif) */}
      <Modal
        isOpen={lockedModal.isOpen}
        onClose={() => setLockedModal({ isOpen: false, kartu: null, items: [] })}
        title="Kartu tidak dapat dihapus"
        subtitle="Kartu masih memiliki alat yang belum dikembalikan."
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-[15px] text-gray-700 leading-relaxed">
            Kelas <b>{lockedModal.kartu?.kelas}</b> masih meminjam alat. Kembalikan alat terlebih dahulu, lalu hapus kartu.
          </p>
          <div className="border border-gray-200 divide-y divide-gray-200 rounded-lg overflow-hidden">
            {lockedModal.items.map((item, idx) => (
              <div key={item.id || idx} className="flex items-center justify-between py-2 px-3 text-[15px]">
                <span>{item.nama_alat || item.alat_id}</span>
                <Badge status="dipinjam" />
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={() => setLockedModal({ isOpen: false, kartu: null, items: [] })}>
              Tutup
            </Button>
          </div>
        </div>
      </Modal>

      {/* Confirm delete */}
      <ConfirmDialog
        isOpen={confirmDelete.isOpen}
        onClose={() => setConfirmDelete({ isOpen: false, item: null })}
        onConfirm={handleExecuteDelete}
        title="Hapus kartu?"
        message={`Apakah Anda yakin ingin menghapus kartu kelas ${confirmDelete.item?.kelas}?\n\nTindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Hapus kartu"
      />
    </div>
  );
}
