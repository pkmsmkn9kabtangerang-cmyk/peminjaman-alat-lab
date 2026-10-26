// src/pages/Login.jsx
// Login form terpusat dengan branding ringkas.
// Logic: Supabase Auth jika terkonfigurasi, fallback ke localStorage demo.

import { useState, useEffect } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { dbService } from '../services/store';
import {
  isOnline,
  isNetworkError,
  reportNetworkError,
  reportNetworkSuccess,
  subscribeNetworkStatus,
} from '../lib/networkStatus';
import { friendlyError } from '../lib/feedback';
import {
  IconAlertCircle,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconCircleCheck,
  IconEye,
  IconEyeOff,
  IconIdBadge2,
  IconKey,
  IconLock,
  IconMail,
  IconShieldCheck,
  IconUser,
  IconWifiOff,
} from '@tabler/icons-react';
import logo from '../assets/logo.png';

const SCHOOL_NAME = import.meta.env.VITE_SCHOOL_NAME ?? 'SMK Negeri';

// Validasi form sebelum submit.
function validateForm(username, password) {
  const errors = {};
  const trimUser = username.trim();
  const trimPass = password;

  if (!trimUser) {
    errors.username = 'Nama pengguna wajib diisi.';
  } else if (trimUser.length < 3) {
    errors.username = 'Nama pengguna minimal 3 karakter.';
  } else if (/\s/.test(trimUser)) {
    errors.username = 'Nama pengguna tidak boleh mengandung spasi.';
  }

  if (!trimPass) {
    errors.password = 'Kata sandi wajib diisi.';
  } else if (trimPass.length < 6) {
    errors.password = 'Kata sandi minimal 6 karakter.';
  }

  return errors;
}

function FieldError({ id, children }) {
  if (!children) return null;
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-[12.5px] font-medium leading-snug text-red-700">
      <IconAlertCircle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

function SubmitSpinner() {
  return (
    <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
    </svg>
  );
}

function BrandMark({ compact = false }) {
  return (
    <div className={`flex items-center ${compact ? 'gap-2.5' : 'gap-3'}`}>
      <span
        className={`flex items-center justify-center rounded-xl bg-white ring-1 ring-slate-200/80 shadow-sm ${
          compact ? 'h-10 w-10' : 'h-12 w-12'
        }`}
      >
        <img src={logo} alt="Logo sekolah" className={compact ? 'h-7 w-7 object-contain' : 'h-9 w-9 object-contain'} />
      </span>
      <div className="min-w-0">
        <p className={`${compact ? 'text-[15px]' : 'text-base'} font-bold leading-tight tracking-tight text-[#12365f]`}>
          SISPAS
        </p>
        <p className={`${compact ? 'text-[11px]' : 'text-xs'} truncate leading-tight text-slate-500`}>
          {SCHOOL_NAME}
        </p>
      </div>
    </div>
  );
}

export default function LoginPage({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [globalError, setGlobalError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [view, setView] = useState('login'); // 'login' | 'forgot'
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [online, setOnline] = useState(() => isOnline());

  const requiresConnection = isSupabaseConfigured;
  const connectionReady = online || !requiresConnection;

  useEffect(() => {
    return subscribeNetworkStatus((isOnlineNow) => {
      setOnline(isOnlineNow);
      if (isOnlineNow) {
        setGlobalError((prev) => (prev.toLowerCase().includes('koneksi') ? '' : prev));
        setForgotError((prev) => (prev.toLowerCase().includes('koneksi') ? '' : prev));
      }
    });
  }, []);

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setForgotError('');
    setForgotSuccess('');

    if (!forgotEmail.trim()) {
      setForgotError('Masukkan email akun Anda.');
      return;
    }
    if (!/^[^@]+@[^@]+\.[^@]+$/.test(forgotEmail.trim())) {
      setForgotError('Format email tidak valid.');
      return;
    }
    if (!isSupabaseConfigured) {
      setForgotSuccess('Mode demo: fitur lupa password tidak tersedia. Hubungi admin untuk reset password.');
      return;
    }
    if (!isOnline()) {
      setForgotError('Tidak dapat mengirim email karena koneksi internet terputus. Periksa jaringan dan coba lagi.');
      return;
    }

    setForgotLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: `${window.location.origin}/auth/set-password`,
      });
      if (error) throw error;
      setForgotSuccess('Link reset password telah dikirim ke email Anda. Periksa inbox dan folder spam.');
    } catch (err) {
      if (isNetworkError(err)) {
        reportNetworkError();
        setForgotError('Tidak dapat mengirim email karena koneksi internet terputus. Periksa jaringan dan coba lagi.');
      } else {
        setForgotError(friendlyError(err, 'Gagal mengirim email reset password. Silakan coba lagi.'));
      }
    } finally {
      setForgotLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setGlobalError('');

    // Validasi form lebih dulu agar pesan kesalahan spesifik.
    const validationErrors = validateForm(username, password);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    // Mode demo tetap bisa dipakai tanpa internet karena memakai localStorage.
    if (isSupabaseConfigured && !isOnline()) {
      setGlobalError('Tidak bisa masuk, koneksi internet Anda tidak tersambung. Silakan periksa jaringan dan coba lagi.');
      return;
    }

    setLoading(true);

    try {
      // ── Mode Supabase ──────────────────────────────────────────
      if (isSupabaseConfigured) {
        // Username bisa berupa email langsung, atau dicari dari profiles.
        let loginEmail = username.trim();

        if (!loginEmail.includes('@')) {
          const { data: profileData, error: profileErr } = await supabase
            .from('profiles')
            .select('email')
            .eq('username', loginEmail.toLowerCase())
            .maybeSingle();

          if (profileErr) {
            console.error('[Login] profiles lookup error:', profileErr);
            if (isNetworkError(profileErr)) {
              reportNetworkError();
              setGlobalError('Tidak bisa masuk, koneksi internet Anda tidak tersambung. Silakan periksa jaringan dan coba lagi.');
              setLoading(false);
              return;
            }
          }

          if (profileData?.email) {
            loginEmail = profileData.email;
          } else {
            setErrors({ username: 'Nama pengguna tidak ditemukan.' });
            setLoading(false);
            return;
          }
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: loginEmail,
          password,
        });

        if (error) {
          if (isNetworkError(error)) {
            reportNetworkError();
            setGlobalError('Tidak bisa masuk, koneksi internet Anda tidak tersambung. Silakan periksa jaringan dan coba lagi.');
          } else if (
            error.message?.toLowerCase().includes('invalid login') ||
            error.message?.toLowerCase().includes('email not confirmed') ||
            error.message?.toLowerCase().includes('invalid credentials')
          ) {
            setGlobalError('Nama pengguna atau kata sandi salah. Silakan periksa kembali.');
          } else if (error.message?.toLowerCase().includes('too many requests')) {
            setGlobalError('Terlalu banyak percobaan masuk. Tunggu beberapa menit, lalu coba lagi.');
          } else {
            setGlobalError(friendlyError(error, 'Tidak bisa masuk. Silakan periksa akun Anda dan coba lagi.'));
          }
          setLoading(false);
          return;
        }

        // Ambil profil dari tabel profiles
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, nama_lengkap, email, role, wajib_ganti_password')
          .eq('id', data.user.id)
          .maybeSingle();

        if (profileError || !profile) {
          if (isNetworkError(profileError)) {
            reportNetworkError();
            setGlobalError('Tidak bisa masuk, koneksi internet Anda tidak tersambung. Silakan periksa jaringan dan coba lagi.');
          } else {
            setGlobalError('Akun ditemukan, tetapi data profil tidak tersedia. Hubungi administrator.');
          }
          await supabase.auth.signOut().catch(() => {});
          setLoading(false);
          return;
        }

        reportNetworkSuccess();

        onLoginSuccess({
          uid: profile.id,
          nama: profile.nama_lengkap || profile.nama || data.user.email,
          email: profile.email || data.user.email,
          role: profile.role,
          wajib_ganti_password: profile.wajib_ganti_password,
        });
        return;
      }

      // ── Mode Demo / Local (localStorage) ──────────────────────
      const users = dbService.getUsers();
      const trimmedUser = username.trim().toLowerCase();

      const foundUser = users.find((u) => {
        const emailPrefix = (u.email ?? '').split('@')[0].toLowerCase();
        const storedUsername = (u.username ?? '').toLowerCase();
        return emailPrefix === trimmedUser || storedUsername === trimmedUser;
      });

      if (!foundUser) {
        setErrors({ username: 'Nama pengguna tidak terdaftar.' });
        setLoading(false);
        return;
      }

      // Mode demo: password minimal 6 karakter, isi tidak dicek.
      if (password.length < 6) {
        setErrors({ password: 'Kata sandi salah. (Demo: minimal 6 karakter, contoh: petugas123)' });
        setLoading(false);
        return;
      }

      onLoginSuccess(foundUser);
    } catch (err) {
      console.error('[Login] unexpected error:', err);
      if (isNetworkError(err)) {
        reportNetworkError();
        setGlobalError('Tidak bisa masuk, koneksi internet Anda tidak tersambung. Silakan periksa jaringan dan coba lagi.');
      } else {
        setGlobalError(friendlyError(err, 'Terjadi kendala saat memproses login. Silakan coba lagi.'));
      }
    } finally {
      setLoading(false);
    }
  };

  // Quick login hanya tampil di mode demo (localStorage).
  const quickLogin = (role) => {
    if (isSupabaseConfigured) return;
    const found = dbService.getUsers().find((u) => u.role === role);
    if (found) onLoginSuccess(found);
  };

  const openForgot = () => {
    setView('forgot');
    setForgotError('');
    setForgotSuccess('');
    setGlobalError('');
  };

  const backToLogin = () => {
    setView('login');
    setForgotError('');
    setForgotSuccess('');
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f4f7fb]">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -left-28 top-0 h-72 w-72 rounded-full bg-blue-200/25 blur-3xl" />
        <div className="absolute -right-24 bottom-0 h-80 w-80 rounded-full bg-cyan-100/50 blur-3xl" />
        <div className="absolute left-1/2 top-16 h-64 w-64 -translate-x-1/2 rounded-full bg-white/60 blur-3xl" />
      </div>

      <main className="relative flex min-h-screen flex-col px-4 py-6 sm:px-6 sm:py-10">
        <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center">
          <div className="mb-6 flex justify-center">
            <BrandMark compact />
          </div>

          {view === 'forgot' ? (
            <section className="animate-fadeIn rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_24px_60px_-32px_rgba(15,45,80,0.35)] sm:p-7">
              <button
                type="button"
                onClick={backToLogin}
                className="mb-6 inline-flex min-h-10 items-center gap-2 rounded-lg text-[13px] font-semibold text-slate-600 transition hover:text-[#1E5AAB] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <IconArrowLeft size={16} />
                Kembali ke halaman masuk
              </button>

              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#1E5AAB] ring-1 ring-blue-100">
                <IconKey size={22} />
              </span>
              <h2 className="text-[22px] font-bold tracking-tight text-[#172033]">Lupa password?</h2>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-500">
                Masukkan email yang terdaftar. Kami akan mengirimkan tautan untuk mengatur ulang kata sandi Anda.
              </p>

              {!online && (
                <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-amber-900">
                  <IconWifiOff size={17} className="mt-0.5 shrink-0 text-amber-700" />
                  <span>
                    <strong className="font-semibold">Sedang offline.</strong> Tautan reset memerlukan koneksi internet.
                  </span>
                </div>
              )}

              {forgotError && (
                <div
                  role="alert"
                  className="mt-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-red-800"
                >
                  <IconAlertCircle size={17} className="mt-0.5 shrink-0" />
                  <span>{forgotError}</span>
                </div>
              )}

              {forgotSuccess ? (
                <div className="mt-6 animate-fadeIn rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-start gap-2.5">
                    <IconCircleCheck size={20} className="mt-0.5 shrink-0 text-emerald-700" />
                    <div>
                      <p className="text-[13.5px] font-semibold text-emerald-900">Permintaan diproses</p>
                      <p className="mt-1 text-[12.5px] leading-relaxed text-emerald-800">{forgotSuccess}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={backToLogin}
                    className="mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-[13px] font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-2"
                  >
                    Kembali ke halaman masuk
                    <IconArrowRight size={16} />
                  </button>
                </div>
              ) : (
                <form onSubmit={handleForgotPassword} className="mt-6 space-y-4" noValidate>
                  <div>
                    <label htmlFor="forgot-email" className="mb-1.5 block text-[13px] font-semibold text-slate-700">
                      Email akun
                    </label>
                    <div className="relative">
                      <IconMail
                        size={18}
                        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                        aria-hidden="true"
                      />
                      <input
                        id="forgot-email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        value={forgotEmail}
                        onChange={(e) => {
                          setForgotEmail(e.target.value);
                          setForgotError('');
                        }}
                        className="min-h-12 w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-3.5 text-[15px] text-slate-900 placeholder:text-slate-400 transition focus:border-[#1E5AAB] focus:outline-none focus:ring-4 focus:ring-blue-500/15"
                        placeholder="nama@sekolah.sch.id"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={forgotLoading || (isSupabaseConfigured && !online)}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1E5AAB] px-4 text-[14px] font-semibold text-white shadow-sm shadow-blue-900/15 transition hover:bg-[#184A8C] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    {forgotLoading ? (
                      <>
                        <SubmitSpinner />
                        Mengirim...
                      </>
                    ) : (
                      <>
                        Kirim tautan reset
                        <IconArrowRight size={17} />
                      </>
                    )}
                  </button>
                </form>
              )}
            </section>
          ) : (
            <section className="animate-fadeIn rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_24px_60px_-32px_rgba(15,45,80,0.35)] sm:p-7">
              <div className="mb-6">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-[24px] font-bold tracking-tight text-[#172033] sm:text-[26px]">
                    Masuk ke SISPAS
                  </h1>
                  {!isSupabaseConfigured && (
                    <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800">
                      Mode demo
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-500">
                  Gunakan akun yang diberikan administrator laboratorium.
                </p>
              </div>

              {!connectionReady && (
                <div
                  role="status"
                  className="mb-5 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-amber-900"
                >
                  <IconWifiOff size={17} className="mt-0.5 shrink-0 text-amber-700" />
                  <span>
                    <strong className="font-semibold">Koneksi internet terputus.</strong> Masuk ke akun
                    memerlukan jaringan. Notifikasi ini akan hilang otomatis setelah tersambung kembali.
                  </span>
                </div>
              )}

              {globalError && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="animate-fadeIn mb-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-red-800"
                >
                  <IconAlertCircle size={17} className="mt-0.5 shrink-0" />
                  <span>{globalError}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4" noValidate>
                <div>
                  <label htmlFor="username-login" className="mb-1.5 block text-[13px] font-semibold text-slate-700">
                    {isSupabaseConfigured ? 'Email atau nama pengguna' : 'Nama pengguna'}
                  </label>
                  <div className="relative">
                    <IconUser
                      size={18}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="username-login"
                      type="text"
                      inputMode={isSupabaseConfigured ? 'email' : 'text'}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        setGlobalError('');
                        if (errors.username) setErrors((prev) => ({ ...prev, username: '' }));
                      }}
                      autoComplete="username"
                      required
                      aria-invalid={Boolean(errors.username)}
                      aria-describedby={errors.username ? 'username-login-error' : undefined}
                      placeholder={isSupabaseConfigured ? 'nama@sekolah.sch.id' : 'Contoh: admin'}
                      className={`min-h-12 w-full rounded-xl border bg-white py-3 pl-10 pr-3.5 text-[15px] text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus:ring-4 ${
                        errors.username
                          ? 'border-red-300 bg-red-50/50 focus:border-red-500 focus:ring-red-500/10'
                          : 'border-slate-300 focus:border-[#1E5AAB] focus:ring-blue-500/15'
                      }`}
                    />
                  </div>
                  <FieldError id="username-login-error">{errors.username}</FieldError>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <label htmlFor="password-login" className="block text-[13px] font-semibold text-slate-700">
                      Kata sandi
                    </label>
                    {isSupabaseConfigured && (
                      <button
                        type="button"
                        onClick={openForgot}
                        className="rounded text-[12px] font-semibold text-[#1E5AAB] transition hover:text-[#12365f] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      >
                        Lupa password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <IconLock
                      size={18}
                      className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                      aria-hidden="true"
                    />
                    <input
                      id="password-login"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setGlobalError('');
                        if (errors.password) setErrors((prev) => ({ ...prev, password: '' }));
                      }}
                      autoComplete="current-password"
                      required
                      aria-invalid={Boolean(errors.password)}
                      aria-describedby={errors.password ? 'password-login-error' : undefined}
                      placeholder="Masukkan kata sandi"
                      className={`min-h-12 w-full rounded-xl border bg-white py-3 pl-10 pr-12 text-[15px] text-slate-900 placeholder:text-slate-400 transition focus:outline-none focus:ring-4 ${
                        errors.password
                          ? 'border-red-300 bg-red-50/50 focus:border-red-500 focus:ring-red-500/10'
                          : 'border-slate-300 focus:border-[#1E5AAB] focus:ring-blue-500/15'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                      aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <IconEyeOff size={18} /> : <IconEye size={18} />}
                    </button>
                  </div>
                  <FieldError id="password-login-error">{errors.password}</FieldError>
                </div>

                <button
                  id="btn-login-submit"
                  type="submit"
                  disabled={loading || (isSupabaseConfigured && !online)}
                  className="mt-1 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1E5AAB] px-4 text-[14px] font-semibold text-white shadow-sm shadow-blue-900/20 transition hover:bg-[#184A8C] active:bg-[#12365f] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {loading ? (
                    <>
                      <SubmitSpinner />
                      Memverifikasi...
                    </>
                  ) : !connectionReady ? (
                    <>
                      <IconWifiOff size={17} />
                      Menunggu koneksi
                    </>
                  ) : (
                    <>
                      Masuk ke dashboard
                      <IconArrowRight size={17} />
                    </>
                  )}
                </button>
              </form>

              {!isSupabaseConfigured && (
                <div className="mt-6 border-t border-slate-200 pt-5">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="h-px flex-1 bg-slate-200" />
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                      Akses cepat demo
                    </span>
                    <span className="h-px flex-1 bg-slate-200" />
                  </div>

                  <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-3">
                    <button
                      id="btn-quick-super-admin"
                      type="button"
                      onClick={() => quickLogin('super_admin')}
                      className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-2 text-[11.5px] font-semibold text-violet-800 transition hover:border-violet-300 hover:bg-violet-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
                    >
                      <IconShieldCheck size={15} />
                      Super Admin
                    </button>
                    <button
                      id="btn-quick-admin"
                      type="button"
                      onClick={() => quickLogin('admin')}
                      className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-2 text-[11.5px] font-semibold text-blue-800 transition hover:border-blue-300 hover:bg-blue-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <IconIdBadge2 size={15} />
                      Admin
                    </button>
                    <button
                      id="btn-quick-petugas"
                      type="button"
                      onClick={() => quickLogin('petugas')}
                      className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2 text-[11.5px] font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                    >
                      <IconUser size={15} />
                      Petugas
                    </button>
                  </div>

                  <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
                    <IconCheck size={13} className="mt-0.5 shrink-0 text-emerald-600" />
                    Mode demo menyimpan data di browser dan tetap bisa dipakai saat offline.
                  </p>
                </div>
              )}

              <div className="mt-6 border-t border-slate-100 pt-4">
                <p className="text-center text-[11px] leading-relaxed text-slate-400">
                  Butuh bantuan masuk? Hubungi administrator laboratorium sekolah.
                </p>
              </div>
            </section>
          )}

          <div className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                !requiresConnection
                  ? 'bg-amber-500'
                  : online
                    ? 'bg-emerald-500'
                    : 'bg-red-500'
              }`}
              aria-hidden="true"
            />
            {!requiresConnection
              ? 'Mode demo lokal · tanpa server'
              : online
                ? 'Terhubung ke server SISPAS'
                : 'Menunggu koneksi internet'}
          </div>
        </div>
      </main>
    </div>
  );
}
