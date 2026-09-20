// src/components/StatCard.jsx
// Kartu statistik untuk dashboard

export default function StatCard({ title, value, icon: Icon, color = 'blue' }) {
  const colors = {
    blue:   'bg-blue-50 text-blue-600',
    green:  'bg-emerald-50 text-emerald-600',
    amber:  'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
    red:    'bg-red-50 text-red-600',
  };

  const bgCls = colors[color] ?? colors.blue;

  return (
    <div className="bg-surface rounded-xl border border-main p-5 shadow-sm flex items-center gap-4 transition hover:shadow-md">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${bgCls}`}>
        <Icon size={24} />
      </div>
      <div>
        <p className="text-xs font-semibold text-muted mb-0.5 uppercase tracking-wide">{title}</p>
        <h4 className="text-2xl font-bold text-main leading-none">{value}</h4>
      </div>
    </div>
  );
}
