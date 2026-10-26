// src/pages/ChangePasswordMandiri.jsx
// Layar wajib ganti password saat pertama login (flag wajib_ganti_password = true)

import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { isOnline, isNetworkError, subscribeNetworkStatus } from '../lib/networkStatus';
import { friendlyError } from '../lib/feedback';
import {
  IconAlertCircle,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconKey,
  IconLock,
  IconLogout,
  IconShieldCheck,
  IconWifiOff,
} from '@tabler/icons-react';
import logo from '../assets/logo.png';

const SCHOOL_NAME = import.meta.env.VITE_SCHOOL_NAME ?? 'SMK Negeri';
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
const STRENGTH_COLOR = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-blue-500', 'bg-emerald-500'];
const STRENGTH_TEXT = ['text-red-700', 'text-orange-700', 'text-amber-700', 'text-blue-700', 'text-emerald-700'];

function PasswordField({ id, label, value, onChange, error, placeholder, autoComplete, show, onToggle }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-slate-700">
        {label} <span className="text-red-600">*</span>
      </label>
      <div className="relative">
        <IconLock
          size={18}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          id={id}
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          className={`min-h-12 w-full rounded-xl border bg-white py-3 pl-10 pr-12 text-[15px] text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus:ring-4 ${
            error
              ? 'border-red-300 bg-red-50/50 focus:border-red-500 focus:ring-red-500/10'
              : 'border-slate-300 focus:border-[#1E5AAB] focus:ring-blue-500/15'
          }`}
          placeholder={placeholder}
          autoComplete={autoComplete}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label={show ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
          aria-pressed={show}
        >
          {show ? <IconEyeOff size={18} /> : <IconEye size={18} />}
        </button>
      </div>
      {error && (
        <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1.5 text-[12.5px] font-medium leading-snug text-red-700">
          <IconAlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}

export default function ChangePasswordMandiri({ user, onSuccess, onCancel }) {
  const [current, setCurrent] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [globalError, setGlobalError] = useState('');
  const [online, setOnline] = useState(() => isOnline());

  const pwStrength = strength(newPw);
  const requiresConnection = isSupabaseConfigured;

  useEffect(() => subscribeNetworkStatus((isOnlineNow) => {
    setOnline(isOnlineNow);
    if (isOnlineNow) {
      setGlobalError((prev) => (prev.toLowerCase().includes('koneksi') ? '' : prev));
    }
  }), []);

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

    if (requiresConnection && !isOnline()) {
      setGlobalError('Koneksi internet terputus. Sambungkan kembali jaringan untuk menyimpan password baru.');
      return;
    }

    setLoading(true);
    try {
      if (isSupabaseConfigured) {
        // Verifikasi password lama dengan re-auth.
        const { error: reAuthErr } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: current,
        });
        if (reAuthErr) {
          if (isNetworkError(reAuthErr)) {
            setGlobalError('Koneksi internet terputus. Periksa jaringan lalu coba lagi.');
          } else {
            setErrors({ current: 'Password lama tidak sesuai.' });
          }
          setLoading(false);
          return;
        }

        const { error: updateErr } = await supabase.auth.updateUser({ password: newPw });
        if (updateErr) throw updateErr;

        await supabase
          .from('profiles')
          .update({ wajib_ganti_password: false })
          .eq('id', user.uid);

        onSuccess();
      } else {
        // Mode demo: password lama dianggap valid jika minimal 6 karakter.
        if (current.length < 6) {
          setErrors({ current: 'Password lama tidak sesuai. (Demo: minimal 6 karakter)' });
          setLoading(false);
          return;
        }
        onSuccess();
      }
    } catch (err) {
      console.error('[ChangePassword] error:', err);
      setGlobalError(
        isNetworkError(err)
          ? 'Koneksi internet terputus. Periksa jaringan lalu coba lagi.'
          : friendlyError(err, 'Terjadi kesalahan. Silakan coba lagi.')
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f7fb]">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-5 sm:px-6 sm:py-7">
        <header className="mb-6 flex items-center gap-2.5 sm:mb-8">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
            <img src={logo} alt="Logo sekolah" className="h-7 w-7 object-contain" />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-bold leading-tight tracking-tight text-[#12365f]">SISPAS</p>
            <p className="truncate text-[11px] leading-tight text-slate-500">{SCHOOL_NAME}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] font-semibold text-slate-500 transition hover:bg-white hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <IconLogout size={16} />
            Keluar
          </button>
        </header>

        <div className="grid flex-1 items-start gap-6 lg:grid-cols-[0.88fr_1.12fr] lg:gap-8">
          {/* ── Panel informasi ─────────────────────────────────── */}
          <aside className="relative hidden overflow-hidden rounded-2xl bg-[#0b2f55] p-7 text-white shadow-[0_24px_60px_-36px_rgba(8,39,68,0.8)] lg:block">
            <div
              className="pointer-events-none absolute inset-0 opacity-60"
              style={{
                backgroundImage:
                  'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
                backgroundSize: '38px 38px',
              }}
              aria-hidden="true"
            />
            <div className="pointer-events-none absolute -right-14 -top-14 h-48 w-48 rounded-full bg-cyan-400/15 blur-2xl" aria-hidden="true" />

            <div className="relative">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-cyan-200">
                <IconShieldCheck size={26} />
              </span>
              <h2 className="mt-6 text-[26px] font-bold leading-tight tracking-tight">
                Amankan akun Anda
                <br />
                sebelum memulai.
              </h2>
              <p className="mt-3 text-[13px] leading-relaxed text-blue-100/75">
                Password sementara hanya boleh dipakai sekali. Buat password pribadi yang kuat agar
                data laboratorium tetap aman.
              </p>

              <ul className="mt-7 space-y-3.5 text-[12.5px] text-blue-50/90">
                {[
                  'Minimal 8 karakter',
                  'Gunakan huruf besar dan kecil',
                  'Tambahkan angka serta simbol',
                  'Jangan bagikan password Anda',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2.5">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/15 text-emerald-300">
                      <IconCheck size={13} stroke={2.5} />
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative mt-10 rounded-xl border border-white/10 bg-white/[0.06] p-3.5">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-blue-200/60">
                Akun yang sedang masuk
              </p>
              <p className="mt-1.5 truncate text-[13.5px] font-semibold text-white">{user?.nama || 'Pengguna'}</p>
              <p className="mt-0.5 truncate text-[11.5px] text-blue-100/60">{user?.email || '—'}</p>
            </div>
          </aside>

          {/* ── Form ────────────────────────────────────────────── */}
          <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_24px_60px_-34px_rgba(15,45,80,0.35)] sm:p-7">
            <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#1E5AAB] ring-1 ring-blue-100">
              <IconKey size={22} />
            </span>

            <h1 className="text-[21px] font-bold tracking-tight text-[#172033] sm:text-[23px]">
              Buat password baru
            </h1>
            <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
              Hai <strong className="font-semibold text-slate-700">{user?.nama || 'Pengguna'}</strong>, demi keamanan
              akun, ganti password sementara Anda sebelum melanjutkan.
            </p>

            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 px-3.5 py-2.5 text-[12px] leading-relaxed text-blue-900 lg:hidden">
              Password baru minimal {MIN_PW} karakter. Gunakan kombinasi huruf besar, angka, dan simbol.
            </div>

            {requiresConnection && !online && (
              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-amber-900">
                <IconWifiOff size={17} className="mt-0.5 shrink-0 text-amber-700" />
                <span>
                  <strong className="font-semibold">Sedang offline.</strong> Menyimpan password baru memerlukan koneksi internet.
                </span>
              </div>
            )}

            {globalError && (
              <div
                role="alert"
                className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-red-800"
              >
                <IconAlertCircle size={17} className="mt-0.5 shrink-0" />
                <span>{globalError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-5 space-y-4" noValidate>
              <PasswordField
                id="current-password"
                label="Password lama"
                value={current}
                onChange={(e) => {
                  setCurrent(e.target.value);
                  setErrors((prev) => ({ ...prev, current: '' }));
                }}
                error={errors.current}
                placeholder="Masukkan password sementara"
                autoComplete="current-password"
                show={showPw}
                onToggle={() => setShowPw((v) => !v)}
              />

              <div>
                <PasswordField
                  id="new-password"
                  label="Password baru"
                  value={newPw}
                  onChange={(e) => {
                    setNewPw(e.target.value);
                    setErrors((prev) => ({ ...prev, newPw: '' }));
                  }}
                  error={errors.newPw}
                  placeholder={`Minimal ${MIN_PW} karakter`}
                  autoComplete="new-password"
                  show={showPw}
                  onToggle={() => setShowPw((v) => !v)}
                />

                {newPw && (
                  <div className="mt-2.5">
                    <div className="flex gap-1" aria-hidden="true">
                      {[0, 1, 2, 3].map((i) => (
                        <div
                          key={i}
                          className={`h-1.5 flex-1 rounded-full transition-colors ${
                            i < pwStrength ? STRENGTH_COLOR[pwStrength] : 'bg-slate-200'
                          }`}
                        />
                      ))}
                    </div>
                    <p className={`mt-1 text-[11.5px] font-medium ${STRENGTH_TEXT[pwStrength]}`}>
                      Kekuatan password: {STRENGTH_LABEL[pwStrength]}
                    </p>
                  </div>
                )}
              </div>

              <PasswordField
                id="confirm-password"
                label="Ulangi password baru"
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setErrors((prev) => ({ ...prev, confirm: '' }));
                }}
                error={errors.confirm}
                placeholder="Ketik ulang password baru"
                autoComplete="new-password"
                show={showPw}
                onToggle={() => setShowPw((v) => !v)}
              />

              <label className="flex min-h-10 cursor-pointer items-center gap-2 select-none text-[12.5px] text-slate-600">
                <input
                  type="checkbox"
                  checked={showPw}
                  onChange={(e) => setShowPw(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-[#1E5AAB]"
                />
                Tampilkan semua password
              </label>

              <div className="flex flex-col gap-2 border-t border-slate-100 pt-4">
                <button
                  type="submit"
                  disabled={loading || (requiresConnection && !online)}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1E5AAB] px-4 text-[14px] font-semibold text-white shadow-sm shadow-blue-900/20 transition hover:bg-[#184A8C] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {loading ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <IconShieldCheck size={17} />
                      Simpan password baru
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="flex min-h-11 w-full items-center justify-center rounded-xl text-[12.5px] font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  Keluar dari akun
                </button>
              </div>
            </form>
          </section>
        </div>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-slate-400">
          © {new Date().getFullYear()} SISPAS · {SCHOOL_NAME}
        </p>
      </div>
    </div>
  );
}
