import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { showFeedback } from '../lib/feedback';
import Button from '../components/Button';
import FormField, { inputClass } from '../components/FormField';
import { IconKey, IconShieldCheck } from '@tabler/icons-react';

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

export default function SetPassword() {
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [sessionInfo, setSessionInfo] = useState(null);

  const pwStrength = strength(newPw);

  useEffect(() => {
    // We arrive here from a Supabase magic link or recovery link.
    // The session should be available if the token was valid.
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error) {
        showFeedback({ type: 'error', title: 'Sesi tidak valid', message: error.message });
      } else if (session) {
        setSessionInfo(session);
      }
    });

    // Also listen for changes in case the session is resolved later.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setSessionInfo(session);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const validate = () => {
    const errs = {};
    if (!newPw || newPw.length < MIN_PW) errs.newPw = `Password minimal ${MIN_PW} karakter.`;
    if (!confirm) errs.confirm = 'Konfirmasi password wajib diisi.';
    else if (confirm !== newPw) errs.confirm = 'Konfirmasi tidak cocok.';
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    if (!sessionInfo) {
      showFeedback({ type: 'error', title: 'Sesi tidak ditemukan', message: 'Silakan gunakan tautan yang valid dari email Anda.' });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;
      
      showFeedback({ type: 'success', title: 'Password berhasil diatur.', message: 'Anda sekarang dapat menggunakan sistem.' });
      
      // Update 'wajib_ganti_password' and 'is_verified' flags
      await supabase.from('profiles').update({ wajib_ganti_password: false, is_verified: true }).eq('id', sessionInfo.user.id);
      
      // Redirect to dashboard
      window.location.href = '/';
    } catch (err) {
      console.error('[SetPassword] error:', err);
      showFeedback({ type: 'error', title: 'Gagal mengatur password.', message: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-main flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden border border-gray-100">
        <div className="p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="mx-auto w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
              <IconShieldCheck size={28} />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Atur Password Anda</h1>
            <p className="text-gray-500 text-sm">
              {sessionInfo ? `Tentukan password untuk akun ${sessionInfo.user.email}` : 'Menunggu validasi tautan...'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <FormField label="Password Baru" required error={errors.newPw} hint={`Minimal ${MIN_PW} karakter.`}>
              <input
                type={showPw ? 'text' : 'password'}
                value={newPw}
                onChange={(e) => { setNewPw(e.target.value); setErrors(prev => ({ ...prev, newPw: '' })); }}
                className={inputClass}
                placeholder={`Minimal ${MIN_PW} karakter`}
                autoComplete="new-password"
                disabled={!sessionInfo}
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

            <FormField label="Konfirmasi Password" required error={errors.confirm}>
              <input
                type={showPw ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setErrors(prev => ({ ...prev, confirm: '' })); }}
                className={inputClass}
                placeholder="Ulangi password baru"
                autoComplete="new-password"
                disabled={!sessionInfo}
              />
            </FormField>

            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showPw}
                onChange={(e) => setShowPw(e.target.checked)}
                className="rounded accent-blue-600"
                disabled={!sessionInfo}
              />
              Tampilkan password
            </label>

            <div className="pt-2">
              <Button type="submit" className="w-full justify-center h-11" disabled={loading || !sessionInfo}>
                {loading ? 'Menyimpan...' : 'Simpan Password'}
              </Button>
            </div>
            
            {!sessionInfo && (
              <p className="text-center text-xs text-orange-600 mt-4 bg-orange-50 p-3 rounded-lg border border-orange-200">
                Jika form ini terkunci, tautan reset Anda mungkin sudah kedaluwarsa atau tidak valid. Silakan minta tautan baru.
              </p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
