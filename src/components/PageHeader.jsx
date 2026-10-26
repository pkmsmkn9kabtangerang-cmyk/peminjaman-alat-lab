export default function PageHeader({ title, description, action }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[20px] font-bold leading-tight tracking-tight text-main sm:text-[22px]">
          {title}
        </h1>
        {description && (
          <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-muted sm:text-[14px]">
            {description}
          </p>
        )}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
