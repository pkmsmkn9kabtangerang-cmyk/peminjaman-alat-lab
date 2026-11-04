import { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { dbService } from '../services/store';
import Modal from '../components/Modal';
import DataTable from '../components/DataTable';
import Button from '../components/Button';
import PageHeader from '../components/PageHeader';
import ConfirmDialog from '../components/ConfirmDialog';
import FormField, { inputClass } from '../components/FormField';
import { showFeedback, friendlyError } from '../lib/feedback';
import { beginTapCapture } from '../lib/tapCapture';
import PageNote from '../components/PageNote';
import { IconPlus, IconRefresh, IconMail } from '@tabler/icons-react';

const EMPTY_FORM = {
  id: '', kode: '', nama: '', kategori: 'elektronik', jumlah_total: 1, jumlah_rusak: 0, tipe: 'pinjam', satuan: 'unit'
};

// Alat bertipe pinjam selalu memakai satuan unit. Satuan bebas hanya
// diperlukan untuk alat sekali pakai (cm, pcs, meter, pack, dll).
const satuanAlat = (item) =>
  item?.tipe === 'habis_pakai' ? (item.satuan || 'unit') : 'unit';

// ── Data access: Supabase jika ada, localStorage jika tidak ──
async function fetchAlat() {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('alat')
      .select('id, kode, nama, kategori, jumlah_total, jumlah_rusak, tipe, satuan, created_at')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  }
  return dbService.getAlat();
}

async function insertAlat(payload) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('alat')
      .insert(payload)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const current = dbService.getAlat();
  const newItem = {
    ...payload,
    stok_tersedia: Number(payload.jumlah_total) - Number(payload.jumlah_rusak),
    created_at: new Date().toISOString(),
  };
  current.unshift(newItem);
  dbService.saveAlat(current);
  return newItem;
}

async function updateAlat(id, payload) {
  if (isSupabaseConfigured) {
    const { data, error } = await supabase
      .from('alat')
      .update(payload)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }
  const current = dbService.getAlat();
  const updated = current.map((a) =>
    a.id === id ? { ...a, ...payload, stok_tersedia: Number(payload.jumlah_total) - Number(payload.jumlah_rusak) } : a
  );
  dbService.saveAlat(updated);
}

async function deleteAlat(id) {
  if (isSupabaseConfigured) {
    // Hanya pinjaman aktif yang boleh menahan penghapusan alat.
    const { data: activeTrx, error: activeError } = await supabase
      .from('transaksi')
      .select('id')
      .eq('alat_id', id)
      .eq('status', 'dipinjam')
      .limit(1);

    if (activeError) throw activeError;

    if (activeTrx && activeTrx.length > 0) {
      throw new Error('Alat tidak dapat dihapus karena masih dipinjam. Proses pengembalian terlebih dahulu.');
    }

    // Setelah migration 010, foreign key memakai ON DELETE SET NULL sehingga
    // riwayat tetap tersimpan dan alat bisa langsung dihapus.
    let { error } = await supabase.from('alat').delete().eq('id', id);

    // Sebelum migration 010 diterapkan, FK transaksi masih menahan delete.
    // Lepaskan relasi alat_id saja; baris riwayat dan nama_alat tetap utuh.
    if (error?.code === '23503') {
      const { error: detachError } = await supabase
        .from('transaksi')
        .update({ alat_id: null })
        .eq('alat_id', id);

      if (detachError) throw detachError;

      // Log consumable dipertahankan bila policy mengizinkan. Migration 010
      // juga menangani ini lewat ON DELETE SET NULL.
      await Promise.allSettled([
        supabase.from('permintaan_habis_pakai').update({ alat_id: null }).eq('alat_id', id),
        supabase.from('stok_mutasi').update({ alat_id: null }).eq('alat_id', id),
      ]);

      ({ error } = await supabase.from('alat').delete().eq('id', id));
    }

    if (error) throw error;
  } else {
    const sedangDipinjam = dbService
      .getTransaksi()
      .some((t) => t.alat_id === id && t.status === 'dipinjam');

    if (sedangDipinjam) {
      throw new Error('Alat tidak dapat dihapus karena masih dipinjam. Proses pengembalian terlebih dahulu.');
    }

    dbService.saveAlat(dbService.getAlat().filter((a) => a.id !== id));
  }
}

async function checkUidAvailability(uid, excludeAlatId = null) {
  const cleanUid = (uid || '').trim();
  if (!cleanUid) return { used: false };

  if (isSupabaseConfigured) {
    // 1. Cek di tabel alat
    let qAlat = supabase.from('alat').select('id, nama, kode').eq('kode', cleanUid);
    if (excludeAlatId) qAlat = qAlat.neq('id', excludeAlatId);
    const { data: existingAlat } = await qAlat.maybeSingle();

    if (existingAlat) {
      return {
        used: true,
        type: 'alat',
        message: `UID sudah digunakan oleh alat "${existingAlat.nama}" (ID: ${existingAlat.id}).`,
      };
    }

    // 2. Cek di tabel kartu_rfid
    const { data: existingKartu } = await supabase
      .from('kartu_rfid')
      .select('uid_kartu, kelas, nama_pemegang')
      .eq('uid_kartu', cleanUid)
      .maybeSingle();

    if (existingKartu) {
      return {
        used: true,
        type: 'kartu',
        message: `UID ini sudah terdaftar sebagai Kartu Kelas "${existingKartu.kelas}".`,
      };
    }

    return { used: false };
  }

  // Local storage check
  const allAlat = dbService.getAlat();
  const foundAlat = allAlat.find(a => a.kode === cleanUid && a.id !== excludeAlatId);
  if (foundAlat) {
    return {
      used: true,
      type: 'alat',
      message: `UID sudah digunakan oleh alat "${foundAlat.nama}".`,
    };
  }

  const allKartu = dbService.getKartu();
  const foundKartu = allKartu.find(k => k.uid_kartu === cleanUid);
  if (foundKartu) {
    return {
      used: true,
      type: 'kartu',
      message: `UID ini sudah terdaftar sebagai Kartu Kelas "${foundKartu.kelas}".`,
    };
  }

  return { used: false };
}

export default function KelolaAlat() {
  const [alat, setAlat] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAlat();
      setAlat(data);
    } catch (err) {
      console.error('[KelolaAlat] reload error:', err);
      showFeedback({ type: 'error', title: 'Gagal memuat data alat.', message: friendlyError(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();

    // Subscribe Realtime jika Supabase terkonfigurasi
    if (!isSupabaseConfigured) return;
    const ch = supabase
      .channel('alat-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alat' }, () => reload())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [reload]);

  useEffect(() => {
    if (!modal || editItem) return;

    if (isSupabaseConfigured) {
      const ch = supabase
        .channel(`kelola-alat-tap-reader-${Date.now()}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'tap_log' },
          async (payload) => {
            const scannedUid = (payload.new?.uid_alat || payload.new?.uid_kartu || '').trim();
            if (scannedUid) {
              const check = await checkUidAvailability(scannedUid, editItem?.id);
              setForm((prev) => ({ ...prev, kode: scannedUid }));
              if (check.used) {
                setErrors((prev) => ({ ...prev, kode: check.message }));
              } else {
                setErrors((prev) => ({ ...prev, kode: null }));
              }
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(ch);
      };
    } else {
      const handleStorageUpdate = async () => {
        const logs = dbService.getTapLog();
        if (logs.length > 0) {
          const latest = logs[0];
          const scannedUid = (latest.uid_alat || latest.uid_kartu || '').trim();
          if (scannedUid) {
            const check = await checkUidAvailability(scannedUid, editItem?.id);
            setForm((prev) => ({ ...prev, kode: scannedUid }));
            if (check.used) {
              setErrors((prev) => ({ ...prev, kode: check.message }));
            } else {
              setErrors((prev) => ({ ...prev, kode: null }));
            }
          }
        }
      };

      window.addEventListener('simlab_storage_updated', handleStorageUpdate);
      return () => {
        window.removeEventListener('simlab_storage_updated', handleStorageUpdate);
      };
    }
  }, [modal, editItem]);

  useEffect(() => {
    if (!modal) return undefined;
    return beginTapCapture();
  }, [modal]);

  const openAdd = async () => {
    setEditItem(null);
    setErrors({});
    setForm({
      ...EMPTY_FORM,
      id: 'ALT-' + Math.floor(100 + Math.random() * 900),
      kode: '',
    });
    setModal(true);

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
              const check = await checkUidAvailability(uid);
              setForm((prev) => ({ ...prev, kode: uid }));
              if (check.used) {
                setErrors((prev) => ({ ...prev, kode: check.message }));
              }
            }
          }
        }
      } catch (e) {
        console.warn('Gagal membaca tap terakhir:', e);
      }
    }
  };

  const openEdit = (item) => {
    const habisPakai = item.tipe === 'habis_pakai';
    setEditItem(item);
    setErrors({});
    setForm({
      ...item,
      // Satu baris alat pinjam = satu unit fisik. Nilai lama yang masih > 1
      // akan dinormalisasi saat disimpan.
      jumlah_total: habisPakai ? item.jumlah_total : 1,
      jumlah_rusak: habisPakai ? 0 : Math.min(Number(item.jumlah_rusak) || 0, 1),
      satuan: satuanAlat(item),
      tipe: item.tipe || 'pinjam',
    });
    setModal(true);
  };

  const isHabisPakai = form.tipe === 'habis_pakai';
  const legacyMultiUnit =
    !!editItem &&
    !isHabisPakai &&
    editItem.tipe !== 'habis_pakai' &&
    Number(editItem.jumlah_total) > 1;

  const validate = async () => {
    const next = {};
    if (!form.nama?.trim()) next.nama = 'Nama alat wajib diisi.';
    if (!form.kategori?.trim()) next.kategori = 'Kategori wajib diisi.';

    if (isHabisPakai) {
      if (!String(form.jumlah_total).trim() || Number(form.jumlah_total) < 1) {
        next.jumlah_total = 'Jumlah minimal 1.';
      }
    } else if (Number(form.jumlah_total) !== 1) {
      next.jumlah_total = 'Alat pinjam selalu 1 unit per baris.';
    }

    const rusak = isHabisPakai ? 0 : (Number(form.jumlah_rusak) || 0);
    const total = isHabisPakai ? (Number(form.jumlah_total) || 0) : 1;
    if (rusak > total) next.jumlah_rusak = 'Jumlah rusak tidak boleh melebihi total unit.';

    if (form.kode?.trim()) {
      const check = await checkUidAvailability(form.kode, editItem?.id);
      if (check.used) next.kode = check.message;
    } else {
      next.kode = 'Kode tag/stiker RFID alat wajib diisi (tempelkan tag ke scanner).';
    }
    return next;
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setErrors({});

    try {
      const next = await validate();
      setErrors(next);
      if (Object.keys(next).length) {
        showFeedback({ type: 'warning', title: 'Data tidak valid', message: Object.values(next)[0] });
        return;
      }

      const payload = {
        kode: form.kode?.trim() || null,
        nama: form.nama.trim(),
        kategori: form.kategori.trim(),
        jumlah_total: isHabisPakai ? Number(form.jumlah_total) : 1,
        jumlah_rusak: isHabisPakai ? 0 : Math.min(Number(form.jumlah_rusak) || 0, 1),
        tipe: isHabisPakai ? 'habis_pakai' : 'pinjam',
        satuan: isHabisPakai ? (form.satuan || 'unit') : 'unit',
      };

      if (editItem) {
        await updateAlat(editItem.id, payload);
        setModal(false);
        showFeedback({ type: 'success', title: 'Perubahan berhasil disimpan.' });
      } else {
        payload.id = form.id;
        await insertAlat(payload);
        setModal(false);
        showFeedback({ type: 'success', title: 'Alat berhasil ditambahkan.' });
      }
      reload();
    } catch (err) {
      console.error('[KelolaAlat] save error:', err);
      showFeedback({
        type: 'error',
        title: editItem ? 'Perubahan gagal disimpan.' : 'Alat gagal ditambahkan.',
        message: friendlyError(err, 'Silakan periksa data, lalu coba lagi.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleExecuteDelete = async () => {
    if (!deleteTarget || deleting) return;
    const target = deleteTarget;
    setDeleting(true);
    try {
      await deleteAlat(target.id);
      // Tutup dialog lebih dulu agar pengguna langsung melihat hasilnya.
      setDeleteTarget(null);
      setAlat((prev) => prev.filter((a) => a.id !== target.id));
      showFeedback({
        type: 'success',
        title: 'Alat berhasil dihapus.',
        message: `"${target.nama}" sudah dihapus. Riwayat transaksi dan log tetap tersimpan.`,
      });
      reload();
    } catch (err) {
      console.error('[KelolaAlat] delete error:', err);
      showFeedback({
        type: 'error',
        title: 'Alat gagal dihapus.',
        message: friendlyError(err, 'Silakan coba lagi.'),
      });
    } finally {
      setDeleting(false);
    }
  };

  const columns = [
    {
      key: 'nama',
      label: 'Nama Alat',
      sortable: true,
      render: (row) => <p className="font-medium text-main">{row.nama}</p>,
    },
    {
      key: 'kode',
      label: 'Kode Alat',
      sortable: true,
      render: (row) => <p className="text-main">{row.kode || '—'}</p>,
    },
    {
      key: 'kategori',
      label: 'Kategori',
      sortable: true,
      render: (row) => <span className="capitalize text-main">{row.kategori}</span>,
    },
    {
      key: 'jumlah_total',
      label: 'Total Unit',
      sortable: true,
      render: (row) => (
        <span className="font-medium">
          {row.tipe === 'habis_pakai' ? `${row.jumlah_total} ${satuanAlat(row)}` : '1 unit'}
        </span>
      ),
    },
    {
      key: 'satuan',
      label: 'Satuan',
      sortable: true,
      render: (row) => <span className="text-main font-semibold">{satuanAlat(row)}</span>,
    },
    {
      key: 'jumlah_rusak',
      label: 'Rusak',
      render: (row) => row.tipe === 'habis_pakai' ? <span className="text-muted">—</span> : (
        <span className={row.jumlah_rusak > 0 ? 'text-orange-800 font-medium' : 'text-muted'}>
          {row.jumlah_rusak} {satuanAlat(row)}
        </span>
      ),
    },
    {
      key: 'tipe',
      label: 'Tipe',
      render: (row) => <span className="text-main capitalize">{row.tipe === 'habis_pakai' ? 'Sekali Pakai' : 'Pinjam'}</span>
    },
    {
      key: 'aksi',
      label: '',
      render: (row) => (
        <div className="flex items-center gap-1 justify-end">
          <button type="button" onClick={() => openEdit(row)} className="table-action table-action-edit">
            Edit
          </button>
          <button type="button" onClick={() => setDeleteTarget(row)} className="table-action table-action-danger">
            Hapus
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Kelola Alat"
        description="Tambah, ubah, atau hapus data alat laboratorium."
      />

      <PageNote title="Informasi Penting" icon={IconMail}>
        Alat yang didaftarkan di sini akan langsung sinkron dengan ketersediaan stok secara realtime. Pastikan kode alat unik untuk setiap jenis barang agar tidak terjadi tumpang tindih data saat peminjaman.
      </PageNote>

      <DataTable
        columns={columns}
        data={alat}
        loading={loading}
        searchPlaceholder="Cari Alat..."
        searchKeys={['nama', 'kode', 'kategori', 'satuan', 'tipe']}
        emptyMessage="Belum ada alat"
        emptyDescription="Alat yang ditambahkan akan muncul di sini."
        actionButton={
          <div className="flex w-full flex-col gap-2 min-[420px]:flex-row min-[420px]:items-center md:w-auto">
            <button
              type="button"
              onClick={reload}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white text-gray-600 transition hover:bg-gray-50 min-[420px]:w-11 min-[420px]:border-0 min-[420px]:bg-transparent"
              title="Refresh data"
            >
              <IconRefresh size={18} />
              <span className="text-sm font-semibold min-[420px]:sr-only">Muat ulang</span>
            </button>
            <Button icon={IconPlus} onClick={openAdd} className="w-full justify-center min-[420px]:flex-1 md:w-auto md:flex-none">Tambah Alat</Button>
          </div>
        }
      />

      <datalist id="kategori-list">
        {Array.from(new Set(alat.map(a => a.kategori))).map(kat => (
          <option key={kat} value={kat} />
        ))}
        <option value="elektronik" />
        <option value="mekanik" />
        <option value="jaringan" />
        <option value="umum" />
      </datalist>

      <Modal
        isOpen={modal}
        onClose={() => !saving && setModal(false)}
        title={editItem ? 'Ubah alat' : 'Tambah alat'}
        subtitle={editItem ? 'Perbarui data alat, lalu simpan.' : 'Isi data alat baru. Kolom bertanda * wajib diisi.'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <FormField label="Nama alat" required error={errors.nama}>
            <input
              required
              value={form.nama}
              onChange={(e) => setForm({ ...form, nama: e.target.value })}
              className={inputClass}
              placeholder="Contoh: Crimping Tool"
            />
          </FormField>

          <FormField
            label="Kode stiker / Tag RFID alat"
            required
            hint={
              editItem
                ? 'Kode tag RFID alat (tidak bisa diubah).'
                : 'UID otomatis terisi langsung saat stiker/tag RFID alat di-tap pada scanner reader.'
            }
            error={errors.kode}
          >
            <div className="space-y-2">
              <div className="relative">
                <input
                  required
                  readOnly
                  value={form.kode || ''}
                  className={`${inputClass} bg-gray-50 font-mono text-base font-semibold tracking-wider cursor-not-allowed`}
                  placeholder={editItem ? 'Kode Tag Alat' : 'Tempelkan tag alat ke reader RFID...'}
                />
                {form.kode ? (
                  <span className={`absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full shadow-xs ${errors.kode
                      ? 'text-rose-700 bg-rose-50 border border-rose-200'
                      : 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                    }`}>
                    <span className={`w-2 h-2 rounded-full ${errors.kode ? 'bg-rose-500' : 'bg-emerald-500 animate-pulse'}`} />
                    {errors.kode ? 'Duplikat' : 'Terbaca'}
                  </span>
                ) : (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                    Menunggu Tap
                  </span>
                )}
              </div>

              {!editItem && (
                !form.kode ? (
                  <div className="flex items-center gap-2.5 p-3 rounded-xl bg-blue-50/80 border border-blue-200 text-xs text-blue-800">
                    <span className="relative flex h-3 w-3 shrink-0">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-600"></span>
                    </span>
                    <span>
                      <strong>Scanner Aktif:</strong> Tempelkan stiker / tag RFID alat ke reader. UID akan otomatis terisi tanpa perlu mengetik manual atau melihat serial monitor.
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs px-1 text-gray-500">
                    <span className={errors.kode ? 'text-rose-600 font-medium flex items-center gap-1' : 'text-emerald-600 font-medium flex items-center gap-1'}>
                      {errors.kode ? '⚠ Tag sudah terdaftar di sistem' : '✓ UID tag alat berhasil dibaca dari scanner'}
                    </span>
                    <span className="text-gray-400">
                      Tap tag lain jika ingin mengganti
                    </span>
                  </div>
                )
              )}
            </div>
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Kategori" required error={errors.kategori}>
              <input
                required
                list="kategori-list"
                value={form.kategori}
                onChange={(e) => setForm({ ...form, kategori: e.target.value })}
                className={inputClass}
                placeholder="Pilih atau ketik kategori"
              />
            </FormField>
            <FormField
              label={isHabisPakai ? 'Total (Sesuai satuan)' : 'Total unit'}
              required
              error={errors.jumlah_total}
              hint={
                isHabisPakai
                  ? 'Stok alat sekali pakai bisa diubah kapan saja saat restock.'
                  : 'Terkunci 1 unit. Satu baris = satu unit fisik dengan tag RFID masing-masing.'
              }
            >
              {isHabisPakai ? (
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={form.jumlah_total}
                  onChange={(e) => setForm({ ...form, jumlah_total: e.target.value.replace(/\D/g, '') })}
                  className={inputClass}
                  placeholder="Contoh: 100"
                />
              ) : (
                <div className="relative">
                  <input
                    type="text"
                    readOnly
                    value="1"
                    aria-readonly="true"
                    className={`${inputClass} cursor-not-allowed bg-gray-50 pr-24 font-semibold`}
                  />
                  <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                    Terkunci
                  </span>
                </div>
              )}
            </FormField>
          </div>

          {legacyMultiUnit && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-xs leading-relaxed text-amber-800">
              Data lama alat ini tercatat <b>{editItem.jumlah_total} unit</b>. Setelah disimpan, baris ini menjadi
              <b> 1 unit</b>. Daftarkan unit fisik lainnya sebagai baris baru dengan tag RFID masing-masing.
            </div>
          )}

          <div className={`grid grid-cols-1 gap-3 ${isHabisPakai ? 'sm:grid-cols-2' : ''}`}>
            <FormField label="Tipe Alat" required error={errors.tipe}>
              <select
                value={form.tipe}
                onChange={(e) => {
                  const tipe = e.target.value;
                  setForm((prev) => ({
                    ...prev,
                    tipe,
                    jumlah_total: 1,
                    jumlah_rusak: tipe === 'habis_pakai' ? 0 : Math.min(Number(prev.jumlah_rusak) || 0, 1),
                    satuan: tipe === 'pinjam' ? 'unit' : (prev.satuan || 'unit'),
                  }));
                  setErrors((prev) => ({ ...prev, jumlah_total: null, jumlah_rusak: null }));
                }}
                className={inputClass}
              >
                <option value="pinjam">Pinjam (Biasa)</option>
                <option value="habis_pakai">Sekali Pakai (Consumable)</option>
              </select>
            </FormField>

            {isHabisPakai && (
              <FormField label="Satuan" required error={errors.satuan} hint="Contoh: unit, pcs, cm, meter, pack">
                <select
                  value={form.satuan || 'unit'}
                  onChange={(e) => setForm({ ...form, satuan: e.target.value })}
                  className={inputClass}
                >
                  <option value="unit">Unit</option>
                  <option value="pcs">Pcs</option>
                  <option value="cm">Cm</option>
                  <option value="meter">Meter</option>
                  <option value="pack">Pack</option>
                  <option value="set">Set</option>
                  <option value="roll">Roll</option>
                  <option value="box">Box</option>
                </select>
              </FormField>
            )}
          </div>

          {!isHabisPakai && (
            <p className="-mt-1 text-xs text-muted">
              Alat tipe pinjam otomatis menggunakan satuan <b className="text-main">unit</b>.
            </p>
          )}

          {!isHabisPakai && (
            <FormField
              label="Kondisi unit"
              hint="Pilih rusak jika unit ini tidak bisa dipinjam. Jika sudah diperbaiki, pilih baik."
              error={errors.jumlah_rusak}
            >
              <select
                value={Number(form.jumlah_rusak) > 0 ? '1' : '0'}
                onChange={(e) => setForm({ ...form, jumlah_rusak: Number(e.target.value) })}
                className={inputClass}
              >
                <option value="0">Baik / bisa dipinjam</option>
                <option value="1">Rusak / tidak bisa dipinjam</option>
              </select>
            </FormField>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5 pt-3 border-t border-gray-200">
            <Button variant="secondary" onClick={() => setModal(false)} disabled={saving} className="w-full sm:w-auto justify-center">
              Batal
            </Button>
            <Button type="submit" disabled={saving} className="w-full sm:w-auto justify-center">
              {saving ? 'Menyimpan...' : (editItem ? 'Simpan perubahan' : 'Simpan alat')}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={handleExecuteDelete}
        loading={deleting}
        title="Hapus alat?"
        message={`Apakah Anda yakin ingin menghapus "${deleteTarget?.nama}"?\n\nRiwayat transaksi dan log tetap disimpan. Alat hanya tidak bisa dihapus jika masih dipinjam.`}
        confirmLabel="Hapus alat"
      >
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-3 text-xs leading-relaxed text-blue-800">
          Data alat akan hilang dari daftar, tetapi riwayat peminjaman yang sudah ada tidak ikut terhapus.
        </div>
      </ConfirmDialog>
    </div>
  );
}
