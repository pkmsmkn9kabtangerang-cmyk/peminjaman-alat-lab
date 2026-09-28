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
  const base =
    'inline-flex items-center justify-center font-semibold select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0 border';

  const sizes = {
    sm: 'text-sm px-3 py-2 min-h-9 rounded gap-1.5',
    md: 'text-[15px] px-4 py-2.5 min-h-11 rounded gap-2',
    lg: 'text-base px-5 py-3 min-h-12 rounded gap-2',
  };

  const variants = {
    primary:
      'bg-[#1E5AAB] hover:bg-[#184A8C] text-white border-transparent focus-visible:ring-blue-700',
    secondary:
      'bg-white text-gray-800 border-gray-300 hover:bg-gray-50 focus-visible:ring-gray-400',
    danger:
      'bg-[#C53030] hover:bg-[#9B1C1C] text-white border-transparent focus-visible:ring-red-600',
    'danger-soft':
      'bg-white hover:bg-red-50 text-red-700 border-red-300 focus-visible:ring-red-500',
    success:
      'bg-[#2E7D32] hover:bg-[#246428] text-white border-transparent focus-visible:ring-green-700',
    ghost:
      'bg-transparent text-gray-700 border-transparent hover:bg-gray-100 focus-visible:ring-gray-400',
  };

  const iconSizes = {
    sm: 16,
    md: 18,
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
        <Icon size={iconSizes[size] || 18} className="shrink-0" />
      )}
      {children}
      {Icon && iconPosition === 'right' && (
        <Icon size={iconSizes[size] || 18} className="shrink-0" />
      )}
    </button>
  );
}
