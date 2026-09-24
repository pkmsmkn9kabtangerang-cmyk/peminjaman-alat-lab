// src/pages/LoginPage.jsx
// Login split-layout: kiri visual lab SMK, kanan form login

import { useState } from 'react';
import { dbService } from '../services/store';
import logoSmk from '../assets/logo-smk.svg';

const SCHOOL_NAME = import.meta.env.VITE_SCHOOL_NAME ?? 'SMK Negeri';

export default function LoginPage({ onLoginSuccess }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('petugas123');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Trik Autentikasi Supabase dengan Username
    // Saat memakai Supabase asli:
    const fakeEmail = `${username.toLowerCase()}@sekolah.internal`;
    
    // const { data, error } = await supabase.auth.signInWithPassword({
    //   email: fakeEmail,
    //   password: password,
    // });

    // Mode demo: cek dari local store
    const users = dbService.getUsers();
    const found = users.find((u) => u.email.toLowerCase() === fakeEmail);
    
    if (!found) {
      // Fallback untuk akun demo lama jika ada
      const fallback = users.find(u => u.email.toLowerCase() === `${username.toLowerCase()}@smk.sch.id`);
      if (fallback) {
        onLoginSuccess(fallback);
        setLoading(false);
        return;
      }
      setError('Username tidak terdaftar atau password salah.');
      setLoading(false);
      return;
    }

    onLoginSuccess(found);
    setLoading(false);
  };

  const quickLogin = (role) => {
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
            <h2 className="text-2xl font-bold text-main">Selamat datang 👋</h2>
            <p className="text-muted text-sm mt-1">Masuk ke dashboard SIMLAB {SCHOOL_NAME}</p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="username-login" className="block text-xs font-semibold text-muted mb-1.5">Username</label>
              <input
                id="username-login"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                required
                placeholder="admin"
                className="w-full px-4 py-3 rounded-xl border border-main text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>
            <div>
              <label htmlFor="password-login" className="block text-xs font-semibold text-muted mb-1.5">Password</label>
              <input
                id="password-login"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full px-4 py-3 rounded-xl border border-main text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>

            <button
              id="btn-login-submit"
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-60"
            >
              {loading ? 'Memverifikasi...' : 'Masuk ke Dashboard'}
            </button>
          </form>

          {/* Quick Demo */}
          <div className="border-t border-main pt-6">
            <p className="text-xs text-center text-muted mb-3">Login Cepat</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                id="btn-quick-admin"
                type="button"
                onClick={() => quickLogin('admin')}
                className="py-2.5 border border-blue-200 bg-blue-50 rounded-xl text-xs font-semibold text-blue-700 hover:bg-blue-100 transition"
              >
                🔑 Login Admin
              </button>
              <button
                id="btn-quick-petugas"
                type="button"
                onClick={() => quickLogin('petugas')}
                className="py-2.5 border border-gray-200 bg-gray-50 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-100 transition"
              >
                👤 Login Petugas
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
