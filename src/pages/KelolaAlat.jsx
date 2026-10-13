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
import PageNote from '../components/PageNote';
import { IconPlus, IconRefresh, IconMail } from '@tabler/icons-react';

const EMPTY_FORM = {
  id: '', kode: '', nama: '', kategori: 'elektronik', jumlah_total: 1, jumlah_rusak: 0, tipe: 'pinjam', satuan: 'unit'
};

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
    // Cek dulu apakah ada transaksi aktif
    const { data: activeTrx } = await supabase
      .from('transaksi')
      .select('id')
      .eq('alat_id', id)
      .eq('status', 'dipinjam')
      .limit(1);

    if (activeTrx && activeTrx.length > 0) {
      throw new Error('Alat tidak dapat dihapus karena masih dipinjam.');
    }

    const { error } = await supabase.from('alat').delete().eq('id', id);
    if (error) throw error;
  } else {
    dbService.saveAlat(dbService.getAlat().filter((a) => a.id !== id));
  }
}

async function checkKodeUsed(kode, excludeId) {
  if (isSupabaseConfigured) {
    let query = supabase.from('alat').select('id').eq('kode', kode.trim());
    if (excludeId) query = query.neq('id', excludeId);
    const { data } = await query.maybeSingle();
    return !!data;
  }
  const current = dbService.getAlat();
  return current.some((a) => a.kode === kode.trim() && a.id !== excludeId);
}

async function checkUidUsed(uid_rfid, excludeId) {
  if (isSupabaseConfigured) {
    let query = supabase.from('alat').select('id').eq('uid_rfid', uid_rfid.trim());
    if (excludeId) query = query.neq('id', excludeId);
    const { data } = await query.maybeSingle();
    return !!data;
  }
  const current = dbService.getAlat();
  return current.some((a) => a.uid_rfid === uid_rfid.trim() && a.id !== excludeId);
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

  const openAdd = () => {
    setEditItem(null);
    setErrors({});
    setForm({
      ...EMPTY_FORM,
      id: 'ALT-' + Math.floor(100 + Math.random() * 900),
      kode: 'KD-' + Math.floor(1000 + Math.random() * 9000),
    });
    setModal(true);
  };

  const openEdit = (item) => {
    setEditItem(item);
    setErrors({});
    setForm({
      ...item,
      satuan: item.satuan || 'unit',
      tipe: item.tipe || 'pinjam',
    });
    setModal(true);
  };

  const validate = async () => {
    const next = {};
    if (!form.nama?.trim()) next.nama = 'Nama alat wajib diisi.';
    if (!form.kategori?.trim()) next.kategori = 'Kategori wajib diisi.';
    if (!String(form.jumlah_total).trim() || Number(form.jumlah_total) < 1) {
      next.jumlah_total = 'Jumlah unit minimal 1.';
    }
    const rusak = Number(form.jumlah_rusak) || 0;
    const total = Number(form.jumlah_total) || 0;
    if (rusak > total) next.jumlah_rusak = 'Jumlah rusak tidak boleh melebihi jumlah total.';

    if (form.kode?.trim()) {
      const kodeUsed = await checkKodeUsed(form.kode, editItem?.id);
      if (kodeUsed) next.kode = 'Kode alat tersebut sudah digunakan.';
    }
    return next;
  };

  const handleSave = async (e) => {
    e.preventDefault();
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
        jumlah_total: Number(form.jumlah_total),
        jumlah_rusak: form.tipe === 'habis_pakai' ? 0 : (Number(form.jumlah_rusak) || 0),
        tipe: form.tipe,
        satuan: form.satuan || 'unit',
      };

      if (editItem) {
        await updateAlat(editItem.id, payload);
        showFeedback({ type: 'success', title: 'Perubahan berhasil disimpan.' });
      } else {
        payload.id = form.id;
        await insertAlat(payload);
        showFeedback({ type: 'success', title: 'Alat berhasil ditambahkan.' });
      }
      setModal(false);
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
    if (!deleteTarget) return;
    try {
      await deleteAlat(deleteTarget.id);
      showFeedback({ type: 'success', title: 'Alat berhasil dihapus.' });
      setDeleteTarget(null);
      reload();
    } catch (err) {
      console.error('[KelolaAlat] delete error:', err);
      showFeedback({ type: 'error', title: 'Alat gagal dihapus.', message: friendlyError(err) });
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
      label: 'Total Stok',
      sortable: true,
      render: (row) => <span className="font-medium">{row.jumlah_total} {row.satuan || 'unit'}</span>,
    },
    {
      key: 'satuan',
      label: 'Satuan',
      sortable: true,
      render: (row) => <span className="text-main font-semibold">{row.satuan || 'unit'}</span>,
    },
    {
      key: 'jumlah_rusak',
      label: 'Rusak',
      render: (row) => row.tipe === 'habis_pakai' ? <span className="text-muted">—</span> : (
        <span className={row.jumlah_rusak > 0 ? 'text-orange-800 font-medium' : 'text-muted'}>
          {row.jumlah_rusak} {row.satuan || 'unit'}
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reload}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"
              title="Refresh data"
            >
              <IconRefresh size={18} />
            </button>
            <Button icon={IconPlus} onClick={openAdd}>Tambah Alat</Button>
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
              placeholder="Contoh: Multimeter Digital"
            />
          </FormField>

          <FormField
            label="Kode stiker alat"
            required
            hint="Kode yang tertera pada stiker alat."
            error={errors.kode}
          >
            <input
              required
              value={form.kode || ''}
              onChange={(e) =>
                setForm({
                  ...form,
                  kode: e.target.value.toUpperCase().replace(/\s/g, ''),
                })
              }
              className={inputClass}
              placeholder="Contoh: KD-NomorBebas"
            />
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
            <FormField label={form.tipe === 'habis_pakai' ? 'Total (Sesuai satuan)' : 'Total unit'} required error={errors.jumlah_total}>
              <input
                type="text"
                inputMode="numeric"
                required
                value={form.jumlah_total}
                onChange={(e) => setForm({ ...form, jumlah_total: e.target.value.replace(/\D/g, '') })}
                className={inputClass}
                placeholder="Contoh: 5"
              />
            </FormField>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Tipe Alat" required error={errors.tipe}>
              <select
                value={form.tipe}
                onChange={(e) => setForm({ ...form, tipe: e.target.value })}
                className={inputClass}
              >
                <option value="pinjam">Pinjam (Biasa)</option>
                <option value="habis_pakai">Sekali Pakai (Consumable)</option>
              </select>
            </FormField>

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
          </div>

          {form.tipe !== 'habis_pakai' && editItem && (
            <FormField
              label="Unit rusak"
              hint="Jika alat sudah diperbaiki, isi 0 agar unit bisa dipinjam lagi."
              error={errors.jumlah_rusak}
            >
              <input
                type="text"
                inputMode="numeric"
                value={form.jumlah_rusak}
                onChange={(e) => setForm({ ...form, jumlah_rusak: e.target.value.replace(/\D/g, '') })}
                className={inputClass}
              />
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
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleExecuteDelete}
        title="Hapus alat?"
        message={`Apakah Anda yakin ingin menghapus "${deleteTarget?.nama}"?\n\nTindakan ini tidak dapat dibatalkan. Alat yang sedang dipinjam tidak bisa dihapus.`}
        confirmLabel="Hapus alat"
      />
    </div>
  );
}
