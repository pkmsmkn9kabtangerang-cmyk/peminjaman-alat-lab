
import { useState } from "react";

function App() {
  const [count, setCount] = useState(0);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <section className="mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-6 text-center">
        <div className="mb-6 rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-300">
          🚀 Firebase CI/CD Active
        </div>

        <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
          Peminjaman Barang
        </h1>

        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-slate-400">
          Sistem sederhana untuk mengelola peminjaman barang dengan lebih
          mudah, cepat, dan terorganisir.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            onClick={() => setCount(count + 1)}
            className="rounded-xl bg-white px-6 py-3 font-semibold text-slate-950 transition hover:bg-slate-200"
          >
            Test Interaction
          </button>

          <div className="rounded-xl border border-slate-700 bg-slate-900 px-6 py-3 text-slate-300">
            Klik: {count}x
          </div>
        </div>

        <div className="mt-16 grid w-full gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="text-3xl">📦</div>
            <h2 className="mt-4 font-semibold">Kelola Barang</h2>
            <p className="mt-2 text-sm text-slate-400">
              Catat dan pantau barang dengan mudah.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="text-3xl">📝</div>
            <h2 className="mt-4 font-semibold">Peminjaman</h2>
            <p className="mt-2 text-sm text-slate-400">
              Kelola proses peminjaman secara teratur.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <div className="text-3xl">⚡</div>
            <h2 className="mt-4 font-semibold">Cepat & Simple</h2>
            <p className="mt-2 text-sm text-slate-400">
              Tampilan sederhana dan mudah digunakan.
            </p>
          </div>
        </div>

        <p className="mt-12 text-sm text-slate-500">
          Deployed automatically with GitHub Actions → Firebase Hosting
        </p>
      </section>
    </main>
  );
}

export default App;