// src/pages/ChangePasswordMandiri.jsx
// Layar wajib ganti password saat pertama login (flag wajib_ganti_password = true)

import { useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { dbService } from '../services/store';
import logoSmk from '../assets/logo-smk.svg';

const MIN_PW = 8;

function strength(pw) {
  let s = 0;
  if (pw.length >= MIN_PW) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s; // 0-4
}

const STRENGTH_LABEL = ['Sangat lemah', 'Lemah', 'Cukup', 'Kuat', 'Sangat kuat'];
const STRENGTH_COLOR = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-blue-500', 'bg-green-500'];

export default function ChangePasswordMandiri({ user, onSuccess, onCancel }) {
  const [current, setCurrent] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState('');

  const pwStrength = strength(newPw);

  const validate = () => {
    const errs = {};
    if (!current) errs.current = 'Password lama wajib diisi.';
    if (!newPw || newPw.length < MIN_PW) errs.newPw = `Password baru minimal ${MIN_PW} karakter.`;
    if (newPw && newPw === current) errs.newPw = 'Password baru harus berbeda dari password lama.';
    if (!confirm) errs.confirm = 'Konfirmasi password wajib diisi.';
    else if (confirm !== newPw) errs.confirm = 'Konfirmasi tidak cocok.';
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGlobalError('');
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      if (isSupabaseConfigured) {
        // Verifikasi password lama dengan re-auth
        const { error: reAuthErr } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: current,
        });
        if (reAuthErr) {
          setErrors({ current: 'Password lama tidak sesuai.' });
          setLoading(false);
          return;
        }

        // Update password baru
        const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
        if (updateErr) throw updateErr;

        // Clear flag wajib_ganti_password
        await supabase
          .from('profiles')
          .update({ wajib_ganti_password: false })
          .eq('id', user.uid);

        onSuccess();
      } else {
        // Mode demo: verifikasi password lama (minimal 6 karakter = valid)
        if (current.length < 6) {
          setErrors({ current: 'Password lama tidak sesuai. (Demo: minimal 6 karakter)' });
          setLoading(false);
          return;
        }
        onSuccess();
      }
    } catch (err) {
      console.error('[ChangePassword] error:', err);
      setGlobalError(err.message || 'Terjadi kesalahan. Silakan coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 pt-8 pb-6 text-white">
          <div className="flex items-center gap-3 mb-4">
            <img src={logoSmk} alt="Logo SMK" className="w-10 h-10 filter brightness-0 invert" />
            <div>
              <p className="text-blue-200 text-sm">SIMLAB</p>
              <h1 className="font-bold text-lg">Wajib Ganti Password</h1>
            </div>
          </div>
          <p className="text-blue-100 text-sm leading-relaxed">
            Akun <strong>{user.nama}</strong> perlu mengganti password sebelum bisa menggunakan sistem.
            Ini dilakukan untuk keamanan akun Anda.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {globalError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {globalError}
            </div>
          )}

          {/* Password Lama */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Password Lama <span className="text-red-500">*</span>
            </label>
            <input
              type={showPw ? 'text' : 'password'}
              value={current}
              onChange={(e) => { setCurrent(e.target.value); setErrors(prev => ({ ...prev, current: '' })); }}
              className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                errors.current ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'
              }`}
              placeholder="Masukkan password lama"
              autoComplete="current-password"
            />
            {errors.current && <p className="mt-1 text-xs text-red-600">{errors.current}</p>}
          </div>

          {/* Password Baru */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Password Baru <span className="text-red-500">*</span>
            </label>
            <input
              type={showPw ? 'text' : 'password'}
              value={newPw}
              onChange={(e) => { setNewPw(e.target.value); setErrors(prev => ({ ...prev, newPw: '' })); }}
              className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                errors.newPw ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'
              }`}
              placeholder={`Minimal ${MIN_PW} karakter`}
              autoComplete="new-password"
            />
            {errors.newPw && <p className="mt-1 text-xs text-red-600">{errors.newPw}</p>}
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
          </div>

          {/* Konfirmasi */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">
              Konfirmasi Password Baru <span className="text-red-500">*</span>
            </label>
            <input
              type={showPw ? 'text' : 'password'}
              value={confirm}
              onChange={(e) => { setConfirm(e.target.value); setErrors(prev => ({ ...prev, confirm: '' })); }}
              className={`w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                errors.confirm ? 'border-red-400 bg-red-50' : 'border-gray-300 bg-white'
              }`}
              placeholder="Ulangi password baru"
              autoComplete="new-password"
            />
            {errors.confirm && <p className="mt-1 text-xs text-red-600">{errors.confirm}</p>}
          </div>

          {/* Toggle show password */}
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showPw}
              onChange={(e) => setShowPw(e.target.checked)}
              className="rounded accent-blue-600"
            />
            Tampilkan password
          </label>

          {/* Actions */}
          <div className="flex flex-col gap-2.5 pt-2">
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Menyimpan...
                </>
              ) : 'Simpan Password Baru'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="w-full py-2.5 text-gray-500 hover:text-gray-700 text-sm font-medium transition-colors"
            >
              Keluar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
