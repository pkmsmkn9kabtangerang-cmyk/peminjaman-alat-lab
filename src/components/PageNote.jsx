import { IconInfoCircle } from '@tabler/icons-react';

export default function PageNote({ title = 'Catatan', icon: Icon = IconInfoCircle, children }) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-xl bg-blue-50/80 border border-blue-200/60 shadow-sm">
      <div className="p-2 bg-white rounded-lg shrink-0 text-blue-600 shadow-sm border border-blue-100">
        <Icon size={20} stroke={2} />
      </div>
      <div className="pt-0.5">
        <h4 className="text-[14.5px] font-semibold text-blue-900 mb-1">
          {title}
        </h4>
        <div className="text-[14px] leading-relaxed text-blue-800/90 font-medium">
          {children}
        </div>
      </div>
    </div>
  );
}
