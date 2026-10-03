import { IconInfoCircle } from '@tabler/icons-react';

export default function PageNote({ title = 'Catatan', icon: Icon = IconInfoCircle, children }) {
  return (
    <div className="flex items-start gap-3 p-3.5 rounded-2xl text-blue-900 shadow-md border border-black">
      <div className="p-2 bg-blue-100/80 rounded-xl shrink-0 text-blue-700 shadow-sm border border-blue-200/50">
        <Icon size={18} stroke={2.5} />
      </div>
      <div className="pt-0.5">
        <h4 className="text-[13px] font-bold text-blue-900/90 tracking-wide uppercase mb-0.5">
          {title}
        </h4>
        <div className="text-[13px] leading-relaxed text-blue-800/80 font-medium">
          {children}
        </div>
      </div>
    </div>
  );
}
