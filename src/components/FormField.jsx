export const inputClass =
  'w-full min-h-11 px-3.5 py-2.5 rounded-lg border border-gray-300 text-[15px] bg-white text-main placeholder:text-gray-400 shadow-sm transition focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700 disabled:bg-gray-50 disabled:text-gray-600';

export default function FormField({ label, required, hint, error, htmlFor, children }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-main">
          {label}
          {required ? <span className="text-red-700"> *</span> : null}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-[12.5px] font-medium leading-relaxed text-red-700">{error}</p>
      ) : hint ? (
        <p className="text-[12px] leading-relaxed text-muted">{hint}</p>
      ) : null}
    </div>
  );
}
