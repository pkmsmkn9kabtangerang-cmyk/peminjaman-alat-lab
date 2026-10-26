import { IconInfoCircle } from '@tabler/icons-react';

export default function PageNote({ title = 'Catatan', icon: Icon = IconInfoCircle, children }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-blue-200/70 bg-blue-50/80 p-3.5 shadow-sm sm:gap-3.5 sm:p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-blue-100 bg-white text-blue-600 shadow-sm">
        <Icon size={18} stroke={2} />
      </div>
      <div className="min-w-0 pt-0.5">
        <h4 className="mb-0.5 text-[13px] font-semibold text-blue-900 sm:text-[13.5px]">
          {title}
        </h4>
        <div className="text-[12.5px] font-medium leading-relaxed text-blue-800/90 sm:text-[13px]">
          {children}
        </div>
      </div>
    </div>
  );
}
