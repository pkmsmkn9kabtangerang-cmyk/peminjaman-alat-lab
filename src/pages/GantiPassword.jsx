// src/pages/GantiPassword.jsx
// Halaman ganti password mandiri oleh pengguna yang sudah login

import { useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import PageNote from '../components/PageNote';
import FormField, { inputClass } from '../components/FormField';
import Button from '../components/Button';
import { IconKey, IconShieldCheck } from '@tabler/icons-react';
import { showFeedback } from '../lib/feedback';

const MIN_PW = 8;

function strength(pw) {
  let s = 0;
  if (pw.length >= MIN_PW) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

const STRENGTH_LABEL = ['Sangat lemah', 'Lemah', 'Cukup', 'Kuat', 'Sangat kuat'];
const STRENGTH_COLOR = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'];

export default function GantiPassword({ user }) {
  const [current, setCurrent] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);

  const pwStrength = strength(newPw);

  const validate = () => {
    const errs = {};
    if (!current) errs.current = 'Password saat ini wajib diisi.';
    if (!newPw || newPw.length < MIN_PW) errs.newPw = `Password baru minimal ${MIN_PW} karakter.`;
    if (newPw && newPw === current) errs.newPw = 'Password baru harus berbeda dari password saat ini.';
    if (!confirm) errs.confirm = 'Konfirmasi password wajib diisi.';
    else if (confirm !== newPw) errs.confirm = 'Konfirmasi tidak cocok.';
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      if (isSupabaseConfigured) {
        // Verifikasi password lama
        const { error: reAuthErr } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: current,
        });
        if (reAuthErr) {
          setErrors({ current: 'Password saat ini tidak sesuai.' });
          setLoading(false);
          return;
        }
        // Ganti password
        const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
        if (updateErr) throw updateErr;
      } else {
        // Mode demo: cek panjang minimal
        if (current.length < 6) {
          setErrors({ current: 'Password saat ini tidak sesuai. (Demo: minimal 6 karakter)' });
          setLoading(false);
          return;
        }
      }
      showFeedback({ type: 'success', title: 'Password berhasil diubah.', message: 'Gunakan password baru Anda saat login berikutnya.' });
      setCurrent('');
      setNewPw('');
      setConfirm('');
    } catch (err) {
      console.error('[GantiPassword] error:', err);
      showFeedback({ type: 'error', title: 'Gagal mengganti password.', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5 max-w-full">
      <PageHeader
        title="Ganti Password"
        description="Perbarui password akun Anda. Gunakan password yang kuat dan unik."
      />

      <PageNote title="Keamanan Akun" icon={IconShieldCheck}>
        Password baru minimal {MIN_PW} karakter. Gunakan kombinasi huruf besar, angka, dan karakter khusus untuk keamanan yang optimal.
      </PageNote>

      <div className="bg-surface border border-main p-5 sm:p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Password Saat Ini" required error={errors.current}>
            <input
              type={showPw ? 'text' : 'password'}
              value={current}
              onChange={(e) => { setCurrent(e.target.value); setErrors(prev => ({ ...prev, current: '' })); }}
              className={inputClass}
              placeholder="Masukkan password saat ini"
              autoComplete="current-password"
            />
          </FormField>

          <FormField label="Password Baru" required error={errors.newPw}
            hint={`Minimal ${MIN_PW} karakter.`}>
            <input
              type={showPw ? 'text' : 'password'}
              value={newPw}
              onChange={(e) => { setNewPw(e.target.value); setErrors(prev => ({ ...prev, newPw: '' })); }}
              className={inputClass}
              placeholder={`Minimal ${MIN_PW} karakter`}
              autoComplete="new-password"
            />
            {newPw && (
              <div className="mt-2">
                <div className="flex gap-1">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i < pwStrength ? STRENGTH_COLOR[pwStrength] : 'bg-gray-200'}`} />
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1">Kekuatan: {STRENGTH_LABEL[pwStrength]}</p>
              </div>
            )}
          </FormField>

          <FormField label="Konfirmasi Password Baru" required error={errors.confirm}>
            <input
              type={showPw ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setErrors(prev => ({ ...prev, confirm: '' })); }}
              className={inputClass}
              placeholder="Ulangi password baru"
              autoComplete="new-password"
            />
          </FormField>

          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showPw}
              onChange={(e) => setShowPw(e.target.checked)}
              className="rounded accent-blue-600"
            />
            Tampilkan password
          </label>

          <div className="flex justify-end pt-4 border-t border-gray-100">
            <Button type="submit" icon={IconKey} disabled={loading} className="w-full sm:w-auto justify-center">
              {loading ? 'Menyimpan Password...' : 'Update Password'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
