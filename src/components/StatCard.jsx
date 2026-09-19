export default function StatCard({ title, value, icon: Icon, color = 'blue' }) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600'
  };

  return (
    <div className="bg-surface rounded-xl border border-main p-5 flex items-center justify-between shadow-xs">
      <div>
        <p className="text-xs font-medium text-muted">{title}</p>
        <p className="text-2xl font-bold text-main mt-1">{value}</p>
      </div>
      {Icon && (
        <div className={`p-3 rounded-xl ${colorMap[color] || colorMap.blue}`}>
          <Icon size={24} />
        </div>
      )}
    </div>
  );
}
