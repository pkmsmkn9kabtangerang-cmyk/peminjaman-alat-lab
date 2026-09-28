export const inputClass =
  'w-full min-h-11 px-3 py-2.5 rounded border border-gray-300 text-[15px] bg-white text-main placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-700/20 focus:border-blue-700 disabled:bg-gray-50 disabled:text-gray-600';

export default function FormField({ label, required, hint, error, htmlFor, children }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={htmlFor} className="block text-[15px] font-medium text-main">
          {label}
          {required ? <span className="text-red-700"> *</span> : null}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-sm text-red-700">{error}</p>
      ) : hint ? (
        <p className="text-sm text-muted leading-relaxed">{hint}</p>
      ) : null}
    </div>
  );
}
