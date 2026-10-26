// src/pages/GantiPassword.jsx
// Halaman ganti password mandiri oleh pengguna yang sudah login

import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import PageHeader from '../components/PageHeader';
import PageNote from '../components/PageNote';
import FormField, { inputClass } from '../components/FormField';
import Button from '../components/Button';
import { IconAlertCircle, IconEye, IconEyeOff, IconKey, IconShieldCheck, IconWifiOff } from '@tabler/icons-react';
import { showFeedback, friendlyError } from '../lib/feedback';
import { isOnline, isNetworkError, subscribeNetworkStatus } from '../lib/networkStatus';

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
const STRENGTH_TEXT = ['text-red-700', 'text-orange-700', 'text-amber-700', 'text-blue-700', 'text-emerald-700'];

function PasswordInput({ id, value, onChange, placeholder, autoComplete, show, onToggle }) {
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        className={`${inputClass} pr-12`}
        placeholder={placeholder}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        onClick={onToggle}
        className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        aria-label={show ? 'Sembunyikan password' : 'Tampilkan password'}
        aria-pressed={show}
      >
        {show ? <IconEyeOff size={18} /> : <IconEye size={18} />}
      </button>
    </div>
  );
}

export default function GantiPassword({ user }) {
  const [current, setCurrent] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [online, setOnline] = useState(() => isOnline());

  const pwStrength = strength(newPw);

  useEffect(() => subscribeNetworkStatus(setOnline), []);

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

    if (isSupabaseConfigured && !isOnline()) {
      showFeedback({ type: 'error', title: 'Tidak ada koneksi', message: 'Koneksi internet Anda terputus. Periksa jaringan dan coba lagi.' });
      return;
    }

    setLoading(true);
    try {
      if (isSupabaseConfigured) {
        if (!isOnline()) {
          showFeedback({ type: 'error', title: 'Tidak ada koneksi', message: 'Koneksi internet Anda terputus. Periksa jaringan dan coba lagi.' });
          setLoading(false);
          return;
        }
        // Verifikasi password lama
        const { error: reAuthErr } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: current,
        });
        if (reAuthErr) {
          if (isNetworkError(reAuthErr)) {
            showFeedback({ type: 'error', title: 'Tidak ada koneksi', message: 'Koneksi internet Anda terputus. Periksa jaringan dan coba lagi.' });
          } else {
            setErrors({ current: 'Password saat ini tidak sesuai.' });
          }
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
      const msg = isNetworkError(err)
        ? 'Koneksi internet Anda terputus. Periksa jaringan dan coba lagi.'
        : friendlyError(err, 'Gagal mengganti password. Silakan coba lagi.');
      showFeedback({ type: 'error', title: 'Gagal mengganti password.', message: msg });
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

      <div className="max-w-2xl overflow-hidden rounded-2xl border border-main bg-surface shadow-sm">
        <div className="border-b border-gray-100 bg-gray-50/70 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1E5AAB] ring-1 ring-blue-100">
              <IconKey size={20} />
            </span>
            <div className="min-w-0">
              <h2 className="text-[15px] font-semibold text-main">Perbarui kata sandi</h2>
              <p className="text-xs text-muted">Masukkan password saat ini untuk memverifikasi perubahan.</p>
            </div>
          </div>
        </div>

        {isSupabaseConfigured && !online && (
          <div className="mx-4 mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-amber-900 sm:mx-6">
            <IconWifiOff size={17} className="mt-0.5 shrink-0 text-amber-700" />
            <span>
              <strong className="font-semibold">Sedang offline.</strong> Mengganti password memerlukan koneksi internet.
            </span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 p-4 sm:p-6">
          <FormField label="Password Saat Ini" required error={errors.current}>
            <PasswordInput
              id="password-saat-ini"
              value={current}
              onChange={(e) => { setCurrent(e.target.value); setErrors(prev => ({ ...prev, current: '' })); }}
              placeholder="Masukkan password saat ini"
              autoComplete="current-password"
              show={showPw}
              onToggle={() => setShowPw((v) => !v)}
            />
          </FormField>

          <FormField label="Password Baru" required error={errors.newPw}
            hint={`Minimal ${MIN_PW} karakter.`}>
            <PasswordInput
              id="password-baru"
              value={newPw}
              onChange={(e) => { setNewPw(e.target.value); setErrors(prev => ({ ...prev, newPw: '' })); }}
              placeholder={`Minimal ${MIN_PW} karakter`}
              autoComplete="new-password"
              show={showPw}
              onToggle={() => setShowPw((v) => !v)}
            />
            {newPw && (
              <div className="mt-2">
                <div className="flex gap-1" aria-hidden="true">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors ${i < pwStrength ? STRENGTH_COLOR[pwStrength] : 'bg-gray-200'}`} />
                  ))}
                </div>
                <p className={`mt-1 text-xs font-medium ${STRENGTH_TEXT[pwStrength]}`}>
                  Kekuatan: {STRENGTH_LABEL[pwStrength]}
                </p>
              </div>
            )}
          </FormField>

          <FormField label="Konfirmasi Password Baru" required error={errors.confirm}>
            <PasswordInput
              id="konfirmasi-password"
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setErrors(prev => ({ ...prev, confirm: '' })); }}
              placeholder="Ulangi password baru"
              autoComplete="new-password"
              show={showPw}
              onToggle={() => setShowPw((v) => !v)}
            />
          </FormField>

          <label className="flex min-h-11 cursor-pointer select-none items-center gap-2.5 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showPw}
              onChange={(e) => setShowPw(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 accent-blue-600"
            />
            Tampilkan semua password
          </label>

          <div className="flex flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-1.5 text-[11.5px] leading-relaxed text-muted">
              <IconAlertCircle size={14} className="mt-0.5 shrink-0" />
              Gunakan kombinasi huruf besar, angka, dan simbol.
            </p>
            <Button
              type="submit"
              icon={IconKey}
              disabled={loading || (isSupabaseConfigured && !online)}
              className="w-full justify-center sm:w-auto"
            >
              {loading ? 'Menyimpan Password...' : 'Update Password'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
