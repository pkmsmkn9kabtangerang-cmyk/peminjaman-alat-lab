import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { showFeedback, friendlyError } from '../lib/feedback';
import { isOnline, isNetworkError, subscribeNetworkStatus } from '../lib/networkStatus';
import {
  IconAlertCircle,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconKey,
  IconLock,
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
  return s;
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

export default function SetPassword() {
  const [newPw, setNewPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [sessionInfo, setSessionInfo] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [online, setOnline] = useState(() => isOnline());

  const pwStrength = strength(newPw);

  useEffect(() => subscribeNetworkStatus(setOnline), []);

  useEffect(() => {
    // We arrive here from a Supabase magic link or recovery link.
    // The session should be available if the token was valid.
    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (error) {
          const msg = isNetworkError(error)
            ? 'Koneksi internet terputus. Pastikan jaringan Anda tersambung dan coba buka tautan kembali.'
            : friendlyError(error, 'Sesi tidak valid. Silakan minta tautan reset ulang.');
          showFeedback({ type: 'error', title: 'Sesi tidak valid', message: msg });
        } else if (session) {
          setSessionInfo(session);
        }
      })
      .finally(() => setSessionChecked(true));

    // Also listen for changes in case the session is resolved later.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setSessionInfo(session);
        setSessionChecked(true);
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

    if (!isOnline()) {
      showFeedback({ type: 'error', title: 'Tidak ada koneksi', message: 'Koneksi internet Anda terputus. Periksa jaringan dan coba lagi.' });
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw });
      if (error) throw error;

      showFeedback({ type: 'success', title: 'Password berhasil diatur.', message: 'Anda sekarang dapat masuk ke sistem.' });

      // Update 'wajib_ganti_password' and 'is_verified' flags
      await supabase.from('profiles').update({ wajib_ganti_password: false, is_verified: true }).eq('id', sessionInfo.user.id);

      // Redirect to dashboard
      window.location.href = '/';
    } catch (err) {
      console.error('[SetPassword] error:', err);
      const msg = isNetworkError(err)
        ? 'Koneksi internet terputus. Periksa jaringan dan coba lagi.'
        : friendlyError(err, 'Gagal menyimpan password. Silakan coba lagi.');
      showFeedback({ type: 'error', title: 'Gagal mengatur password.', message: msg });
    } finally {
      setLoading(false);
    }
  };

  const sessionValid = Boolean(sessionInfo);
  const sessionFailed = sessionChecked && !sessionInfo;

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[#f4f7fb]">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(30,90,171,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(30,90,171,0.06) 1px, transparent 1px)',
          backgroundSize: '42px 42px',
        }}
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute -left-24 top-16 h-64 w-64 rounded-full bg-blue-300/20 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -right-20 bottom-10 h-72 w-72 rounded-full bg-cyan-300/20 blur-3xl" aria-hidden="true" />

      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center gap-2.5 px-4 py-5 sm:px-6 sm:py-7">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
          <img src={logo} alt="Logo sekolah" className="h-7 w-7 object-contain" />
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-bold leading-tight tracking-tight text-[#12365f]">SISPAS</p>
          <p className="truncate text-[11px] leading-tight text-slate-500">{SCHOOL_NAME}</p>
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-8 pt-2 sm:px-6">
        <div className="w-full max-w-md">
          <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_24px_60px_-34px_rgba(15,45,80,0.35)]">
            <div className="border-b border-slate-100 bg-gradient-to-b from-blue-50/80 to-white px-5 py-6 text-center sm:px-7">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#1E5AAB] text-white shadow-lg shadow-blue-900/20">
                <IconShieldCheck size={26} />
              </span>
              <h1 className="mt-4 text-[22px] font-bold tracking-tight text-[#172033]">Atur Password Anda</h1>
              <p className="mx-auto mt-1.5 max-w-sm text-[13px] leading-relaxed text-slate-500">
                {sessionValid
                  ? 'Buat password baru untuk mengaktifkan akun dan mulai menggunakan sistem.'
                  : 'Kami sedang memeriksa tautan aktivasi yang Anda buka.'}
              </p>

              <span
                className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold ${
                  sessionValid
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : sessionFailed
                      ? 'border-red-200 bg-red-50 text-red-800'
                      : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    sessionValid ? 'bg-emerald-500' : sessionFailed ? 'bg-red-500' : 'bg-amber-500 animate-pulse'
                  }`}
                  aria-hidden="true"
                />
                {sessionValid ? sessionInfo.user.email : sessionFailed ? 'Tautan tidak valid' : 'Memvalidasi tautan...'}
              </span>
            </div>

            <div className="p-5 sm:p-7">
              {!online && (
                <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-[12.5px] leading-relaxed text-amber-900">
                  <IconWifiOff size={17} className="mt-0.5 shrink-0 text-amber-700" />
                  <span>
                    <strong className="font-semibold">Sedang offline.</strong> Menyimpan password memerlukan koneksi internet.
                  </span>
                </div>
              )}

              {sessionFailed && (
                <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3.5 text-[12.5px] leading-relaxed text-red-800">
                  <p className="flex items-center gap-1.5 font-semibold">
                    <IconAlertCircle size={16} className="shrink-0" />
                    Tautan sudah kedaluwarsa atau tidak valid
                  </p>
                  <p className="mt-1 text-red-700">
                    Minta administrator mengirim ulang undangan, lalu buka kembali tautan terbaru dari email Anda.
                  </p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
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
                  <div className="-mt-1">
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

                <label className="flex min-h-10 cursor-pointer select-none items-center gap-2 text-[12.5px] text-slate-600">
                  <input
                    type="checkbox"
                    checked={showPw}
                    onChange={(e) => setShowPw(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 accent-[#1E5AAB]"
                    disabled={!sessionValid}
                  />
                  Tampilkan semua password
                </label>

                <ul className="space-y-1.5 rounded-xl border border-slate-100 bg-slate-50/80 p-3 text-[11.5px] text-slate-600">
                  {[
                    `Minimal ${MIN_PW} karakter`,
                    'Huruf besar dan kecil',
                    'Angka serta simbol',
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2">
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                        <IconCheck size={10} stroke={3} />
                      </span>
                      {item}
                    </li>
                  ))}
                </ul>

                <div className="space-y-2 border-t border-slate-100 pt-4">
                  <button
                    type="submit"
                    disabled={loading || !sessionValid || !online}
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
                        <IconKey size={17} />
                        Simpan password
                      </>
                    )}
                  </button>
                  <a
                    href="/"
                    className="flex min-h-11 w-full items-center justify-center rounded-xl text-[12.5px] font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    Kembali ke halaman masuk
                  </a>
                </div>
              </form>
            </div>
          </section>

          <p className="mt-5 text-center text-[11px] leading-relaxed text-slate-400">
            © {new Date().getFullYear()} SISPAS · {SCHOOL_NAME}
          </p>
        </div>
      </main>
    </div>
  );
}
