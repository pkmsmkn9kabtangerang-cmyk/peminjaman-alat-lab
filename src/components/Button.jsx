// src/components/Button.jsx
// Tombol serbaguna berstandar SaaS modern

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  className = '',
  type = 'button',
  disabled = false,
  ...props
}) {
  const base = 'inline-flex items-center justify-center font-semibold transition-all duration-150 select-none focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-45 disabled:cursor-not-allowed disabled:active:scale-100 cursor-pointer active:scale-[0.98] shrink-0';

  const sizes = {
    sm: 'text-xs px-3 py-1.5 h-8 rounded-lg gap-1.5',
    md: 'text-xs sm:text-sm px-3.5 sm:px-4 py-2 h-10 rounded-lg gap-2',
    lg: 'text-sm sm:text-base px-5 py-2.5 h-12 rounded-xl gap-2.5',
  };

  const variants = {
    primary:
      'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-xs shadow-blue-500/20 focus:ring-blue-500',
    secondary:
      'bg-white text-gray-700 border border-gray-300/80 hover:bg-gray-50 hover:text-gray-900 shadow-xs focus:ring-gray-300 hover:border-gray-400',
    danger:
      'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-xs shadow-red-500/20 focus:ring-red-500',
    'danger-soft':
      'bg-red-50/90 hover:bg-red-100 text-red-600 hover:text-red-700 border border-red-200/90 shadow-xs focus:ring-red-500',
    success:
      'bg-gradient-to-r from-emerald-600 to-emerald-700 hover:from-emerald-700 hover:to-emerald-800 text-white shadow-xs shadow-emerald-500/20 focus:ring-emerald-500',
    ghost:
      'bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:ring-gray-300',
  };

  const iconSizes = {
    sm: 14,
    md: 16,
    lg: 18,
  };

  return (
    <button
      type={type}
      disabled={disabled}
      className={`${base} ${sizes[size] || sizes.md} ${variants[variant] || variants.primary} ${className}`}
      {...props}
    >
      {Icon && iconPosition === 'left' && (
        <Icon size={iconSizes[size] || 16} className="shrink-0" />
      )}
      {children}
      {Icon && iconPosition === 'right' && (
        <Icon size={iconSizes[size] || 16} className="shrink-0" />
      )}
    </button>
  );
}

