export default function PageHeader({ title, description, action }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-1">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold text-main tracking-tight">{title}</h1>
        {description && (
          <p className="text-[15px] text-muted mt-1 leading-relaxed max-w-2xl">{description}</p>
        )}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
