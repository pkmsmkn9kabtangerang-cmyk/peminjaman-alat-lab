// src/pages/Login.jsx
// Login split-layout: kiri visual lab SMK, kanan form login
// Logic: Supabase Auth jika terkonfigurasi, fallback ke localStorage demo

import { useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { dbService } from '../services/store';
import logoSmk from '../assets/logo-smk.svg';

const SCHOOL_NAME = import.meta.env.VITE_SCHOOL_NAME ?? 'SMK Negeri';

// Validasi form sebelum submit
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

export default function LoginPage({ onLoginSuccess }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors]     = useState({});
  const [globalError, setGlobalError] = useState('');
  const [loading, setLoading]   = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setGlobalError('');

    // Validasi form
    const validationErrors = validateForm(username, password);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setLoading(true);

    try {
      // ── Mode Supabase (production/local dengan supabase) ──
      if (isSupabaseConfigured) {
        // Username bisa berupa email langsung, atau kita cari email-nya dari profiles
        let loginEmail = username.trim();

        // Kalau bukan format email, coba cari email dari profiles berdasarkan username
        if (!loginEmail.includes('@')) {
          const { data: profileData, error: profileErr } = await supabase
            .from('profiles')
            .select('email')
            .eq('username', loginEmail.toLowerCase())
            .maybeSingle();

          if (profileErr) {
            console.error('[Login] profiles lookup error:', profileErr);
          }

          if (profileData?.email) {
            loginEmail = profileData.email;
          } else {
            // Coba fallback: username as email prefix @smk.sch.id
            // tapi ini boleh gagal, biarkan signInWithPassword yang tolak
            setErrors({ username: 'Nama pengguna tidak ditemukan.' });
            setLoading(false);
            return;
          }
        }

        const { data, error } = await supabase.auth.signInWithPassword({
          email: loginEmail,
          password: password,
        });

        if (error) {
          if (
            error.message?.toLowerCase().includes('invalid login') ||
            error.message?.toLowerCase().includes('email not confirmed') ||
            error.message?.toLowerCase().includes('invalid credentials')
          ) {
            setGlobalError('Nama pengguna atau kata sandi salah.');
          } else if (error.message?.toLowerCase().includes('too many requests')) {
            setGlobalError('Terlalu banyak percobaan. Tunggu beberapa menit, lalu coba lagi.');
          } else {
            setGlobalError(error.message ?? 'Login gagal. Silakan coba lagi.');
          }
          setLoading(false);
          return;
        }

        // Ambil profil dari tabel profiles
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, nama_lengkap, email, role') // nanti bisa di tambahin aktif di sini, di samping role
          .eq('id', data.user.id)
          .maybeSingle();

        if (profileError || !profile) {
          setGlobalError('Akun ditemukan, tetapi profil tidak tersedia. Hubungi administrator.');
          await supabase.auth.signOut();
          setLoading(false);
          return;
        }

        // if (!profile.aktif) {
        //   setGlobalError('Akun Anda telah dinonaktifkan. Hubungi administrator.');
        //   await supabase.auth.signOut();
        //   setLoading(false);
        //   return;
        // }

        // Normalisasi nama field (DB pakai nama_lengkap, app pakai nama)
        const userObj = {
          uid: profile.id,
          nama: profile.nama_lengkap || profile.nama || data.user.email,
          email: profile.email || data.user.email,
          role: profile.role,
          // aktif: profile.aktif,
        };

        onLoginSuccess(userObj);
        return;
      }

      // ── Mode Demo / Local (localStorage fallback) ──
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

      // if (!foundUser.aktif) {
      //   setGlobalError('Akun Anda telah dinonaktifkan.');
      //   setLoading(false);
      //   return;
      // }

      // Mode demo: password minimal 6 karakter, tidak dicek isinya
      if (password.length < 6) {
        setErrors({ password: 'Kata sandi salah. (Demo: minimal 6 karakter, contoh: petugas123)' });
        setLoading(false);
        return;
      }

      onLoginSuccess(foundUser);

    } catch (err) {
      console.error('[Login] unexpected error:', err);
      setGlobalError('Terjadi kesalahan koneksi. Periksa jaringan lalu coba lagi.');
    } finally {
      setLoading(false);
    }
  };

  // Quick login hanya tampil di mode demo (localStorage)
  const quickLogin = (role) => {
    if (isSupabaseConfigured) return;
    const found = dbService.getUsers().find((u) => u.role === role);
    if (found) onLoginSuccess(found);
  };

  return (
    <div className="min-h-screen flex">
      {/* ── Panel Kiri: Visual Lab ── */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-blue-700 via-blue-600 to-indigo-700 flex-col justify-between p-12 relative overflow-hidden">
        {/* Background pattern */}
        <div className="absolute inset-0 opacity-10">
          {Array.from({ length: 12 }).map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full border-2 border-white"
              style={{
                width: `${60 + i * 40}px`,
                height: `${60 + i * 40}px`,
                top: `${Math.sin(i) * 30 + 50}%`,
                left: `${Math.cos(i) * 30 + 50}%`,
                transform: 'translate(-50%, -50%)',
              }}
            />
          ))}
        </div>

        {/* Top */}
        <div className="relative flex items-center gap-3">
          <img src={logoSmk} alt="Logo SMK" className="w-12 h-12 filter brightness-0 invert" />
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">SIMLAB</h1>
            <p className="text-blue-200 text-sm">{SCHOOL_NAME}</p>
          </div>
        </div>

        {/* Center */}
        <div className="relative space-y-6">
          <div className="w-20 h-1 bg-white/40 rounded" />
          <h2 className="text-white text-4xl font-bold leading-tight">
            Peminjaman<br />Alat Lab Berbasis<br />RFID
          </h2>
          <p className="text-blue-100 text-base max-w-xs leading-relaxed">
            Monitoring realtime, pencatatan otomatis, dan manajemen alat laboratorium.
          </p>
        </div>

        {/* Bottom stats */}
        <div className="relative grid grid-cols-3 gap-4">
          {isSupabaseConfigured && (
            <div className="col-span-3 flex items-center gap-2 text-blue-200 text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
              
            </div>
          )}
        </div>
      </div>

      {/* ── Panel Kanan: Form Login ── */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 bg-main">
        <div className="w-full max-w-md space-y-8">
          {/* Mobile logo */}
          <div className="lg:hidden text-center">
            <img src={logoSmk} alt="Logo SMK" className="w-12 h-12 mx-auto mb-3" />
          </div>

          <div>
            <h2 className="text-2xl font-bold text-main">Selamat Datang </h2>
            <p className="text-muted text-sm mt-1">Silahkan untuk login terlebih dahulu</p>
            {!isSupabaseConfigured && (
              <p className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg inline-block">
                ⚠️ Mode Demo — data tersimpan lokal di browser
              </p>
            )}
          </div>

          {/* Error global */}
          {globalError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg flex items-start gap-2">
              <span className="text-red-500 mt-0.5 shrink-0">✕</span>
              {globalError}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4" noValidate>
            {/* Username */}
            <div>
              <label htmlFor="username-login" className="block text-sm font-bold text-gray-700 mb-2">
                Nama Pengguna {isSupabaseConfigured ? 'atau Email' : '(Username)'}
              </label>
              <input
                id="username-login"
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (errors.username) setErrors((prev) => ({ ...prev, username: '' }));
                }}
                autoComplete="username"
                required
                placeholder={isSupabaseConfigured ? 'username atau email@sekolah.com' : 'Contoh: admin'}
                className={`w-full px-5 py-4 rounded-xl border text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                  errors.username ? 'border-red-400 bg-red-50' : 'border-gray-300'
                }`}
              />
              {errors.username && (
                <p className="mt-1.5 text-xs text-red-600">{errors.username}</p>
              )}
            </div>

            {/* Password */}
            <div className="mt-5">
              <label htmlFor="password-login" className="block text-sm font-bold text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <input
                  id="password-login"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errors.password) setErrors((prev) => ({ ...prev, password: '' }));
                  }}
                  autoComplete="current-password"
                  required
                  placeholder="Masukkan kata sandi"
                  className={`w-full px-5 py-4 pr-14 rounded-xl border text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition ${
                    errors.password ? 'border-red-400 bg-red-50' : 'border-gray-300'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-sm font-medium"
                  tabIndex={-1}
                >
                  {showPassword ? 'Sembunyikan' : 'Tampilkan'}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-xs text-red-600">{errors.password}</p>
              )}
            </div>

            <button
              id="btn-login-submit"
              type="submit"
              disabled={loading}
              className="w-full py-4 mt-6 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl text-base transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Memverifikasi...
                </>
              ) : 'Masuk ke Dashboard'}
            </button>
          </form>

          {/* Quick Demo — hanya kalau bukan Supabase */}
          {!isSupabaseConfigured && (
            <div className="border-t border-gray-200 pt-6 mt-8">
              <p className="text-sm text-center text-gray-500 mb-4">Masuk Otomatis (Hanya untuk Demo)</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  id="btn-quick-admin"
                  type="button"
                  onClick={() => quickLogin('admin')}
                  className="py-3 border border-blue-200 bg-blue-50 rounded-xl text-sm font-bold text-blue-700 hover:bg-blue-100 transition"
                >
                  Masuk sebagai Admin
                </button>
                <button
                  id="btn-quick-petugas"
                  type="button"
                  onClick={() => quickLogin('petugas')}
                  className="py-3 border border-gray-200 bg-gray-50 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-100 transition"
                >
                  Masuk sebagai Petugas
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
