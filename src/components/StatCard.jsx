export default function StatCard({ title, value, hint }) {
  return (
    <div className="bg-surface border border-main p-4 sm:p-5">
      <p className="text-[15px] text-muted mb-1">{title}</p>
      <p className="text-3xl font-semibold text-main leading-none tabular-nums">{value}</p>
      {hint ? <p className="text-sm text-muted mt-2">{hint}</p> : null}
    </div>
  );
}
