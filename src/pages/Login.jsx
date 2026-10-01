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

    const users = dbService.getUsers();
    
    // Cari user berdasarkan username atau awal email
    const foundUser = users.find(u => {
      const emailPrefix = u.email.split('@')[0].toLowerCase();
      return emailPrefix === username.toLowerCase() || u.username === username.toLowerCase();
    });

    if (!foundUser) {
      setError('Nama Pengguna tidak terdaftar atau salah.');
      setLoading(false);
      return;
    }

    // Untuk keperluan demo/gaptek, password minimal 6 karakter.
    // Di aplikasi nyata ini akan dicek ke database.
    if (password.length < 6) {
      setError('Password salah. (Contoh: petugas123)');
      setLoading(false);
      return;
    }

    onLoginSuccess(foundUser);
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
              <label htmlFor="username-login" className="block text-sm font-bold text-gray-700 mb-2">Nama Pengguna (Username)</label>
              <input
                id="username-login"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                required
                placeholder="Contoh: admin"
                className="w-full px-5 py-4 rounded-xl border border-gray-300 text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>
            <div className="mt-5">
              <label htmlFor="password-login" className="block text-sm font-bold text-gray-700 mb-2">Kata Sandi (Password)</label>
              <input
                id="password-login"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Masukkan kata sandi"
                className="w-full px-5 py-4 rounded-xl border border-gray-300 text-base bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>

            <button
              id="btn-login-submit"
              type="submit"
              disabled={loading}
              className="w-full py-4 mt-6 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold rounded-xl text-base transition-colors disabled:opacity-60"
            >
              {loading ? 'Memverifikasi...' : 'Masuk ke Dashboard'}
            </button>
          </form>

          {/* Quick Demo */}
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
        </div>
      </div>
    </div>
  );
}
