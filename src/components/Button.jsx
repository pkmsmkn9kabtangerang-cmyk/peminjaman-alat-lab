// src/components/Button.jsx
// Tombol serbaguna

export default function Button({ children, variant = 'primary', icon: Icon, className = '', type = 'button', ...props }) {
  const base = 'inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary:   'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800 focus:ring-blue-500',
    secondary: 'bg-white text-gray-700 border border-main hover:bg-gray-50 focus:ring-gray-300',
    danger:    'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    success:   'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500',
  };

  return (
    <button type={type} className={`${base} ${variants[variant]} ${className}`} {...props}>
      {Icon && <Icon size={16} />}
      {children}
    </button>
  );
}
