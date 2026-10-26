const TONES = {
  blue: 'bg-blue-50 text-blue-700 ring-blue-100',
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
  amber: 'bg-amber-50 text-amber-700 ring-amber-100',
  violet: 'bg-violet-50 text-violet-700 ring-violet-100',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
};

export default function StatCard({ title, value, hint, icon: Icon, tone = 'blue' }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-main bg-surface p-4 shadow-sm sm:p-5">
      <span className="absolute inset-y-0 left-0 w-1 bg-[#1E5AAB]/70" aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium leading-snug text-muted sm:text-[12.5px]">{title}</p>
          <p className="mt-1.5 text-[26px] font-bold leading-none tracking-tight text-main tabular-nums sm:text-3xl">
            {value}
          </p>
          {hint ? <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{hint}</p> : null}
        </div>
        {Icon ? (
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ${
              TONES[tone] || TONES.blue
            }`}
            aria-hidden="true"
          >
            <Icon size={18} stroke={1.9} />
          </span>
        ) : null}
      </div>
    </div>
  );
}
