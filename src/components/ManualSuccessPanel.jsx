// Panel sukses transaksi manual: tampil menetap agar petugas langsung tahu
// transaksi berhasil dan bisa membuka Riwayat Transaksi.

import Button from './Button';
import { IconCircleCheck, IconHistory, IconX } from '@tabler/icons-react';

export default function ManualSuccessPanel({ message, onViewHistory, onDismiss }) {
  if (!message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 shadow-sm sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white shadow-sm">
          <IconCircleCheck size={23} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-base font-bold leading-snug text-emerald-950">
            Transaksi berhasil dicatat
          </p>
          <p className="mt-1 text-sm leading-relaxed text-emerald-900">{message}</p>
          <p className="mt-1 text-xs font-medium text-emerald-700">
            Data sudah masuk ke Riwayat Transaksi.
          </p>

          <div className="mt-3 flex flex-col gap-2 min-[420px]:flex-row">
            <Button
              size="sm"
              variant="success"
              icon={IconHistory}
              onClick={onViewHistory}
              className="w-full justify-center min-[420px]:w-auto"
            >
              Lihat Riwayat
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={IconX}
              onClick={onDismiss}
              className="w-full justify-center min-[420px]:w-auto"
            >
              Tutup
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
