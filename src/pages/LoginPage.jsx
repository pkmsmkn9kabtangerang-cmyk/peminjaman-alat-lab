import { useState } from 'react';
import { dbService } from '../services/store';
import Button from '../components/Button';

export default function LoginPage({ onLoginSuccess }) {
  const [email, setEmail] = useState('admin@smk.sch.id');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    const users = dbService.getUsers();
    const found = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!found) {
      setError('Email tidak terdaftar. Gunakan admin@smk.sch.id atau petugas@smk.sch.id');
      return;
    }

    dbService.setCurrentUser(found);
    onLoginSuccess(found);
  };

  const handleQuickLogin = (role) => {
    const users = dbService.getUsers();
    const found = users.find(u => u.role === role);
    if (found) {
      dbService.setCurrentUser(found);
      onLoginSuccess(found);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl border border-main shadow-lg w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center font-bold text-xl mx-auto shadow-md mb-4">
            SB
          </div>
          <h2 className="text-xl font-bold text-main">SIMLAB SMK</h2>
          <p className="text-sm text-muted mt-1">Sistem Peminjaman Alat Lab Berbasis RFID</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Email Akun</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-lg border border-main text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50/50"
              placeholder="email@smk.sch.id"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 rounded-lg border border-main text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50/50"
              placeholder="••••••••"
            />
          </div>

          <Button type="submit" className="w-full justify-center py-2.5">
            Masuk ke Dashboard
          </Button>
        </form>

        <div className="mt-6 pt-6 border-t border-main">
          <p className="text-xs text-center text-muted mb-3">Login Cepat Demo (Pilih Role):</p>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleQuickLogin('admin')}
              className="p-2.5 border border-main rounded-lg text-xs font-medium text-gray-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition"
            >
              Login sebagai Admin
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('petugas')}
              className="p-2.5 border border-main rounded-lg text-xs font-medium text-gray-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition"
            >
              Login sebagai Petugas
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
